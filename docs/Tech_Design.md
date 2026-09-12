# 技术设计文档（Tech Design）

> 项目：简历参谋（resume-evaluator）
> 版本：v1.0 ｜ 整理日期：2026-09-11

## 1. 总体架构

单仓库、前后端分离开发、生产环境同源部署：

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  浏览器（React 19 SPA）      │  HTTP  │  Express 5 API（Node.js 20）  │
│  Vite 构建 → dist/          │ ─────► │  /api/*                      │
│  PWA / 深色模式 / 移动端     │  SSE   │  鉴权 / 限流 / 队列 / 缓存    │
└─────────────────────────────┘        └───────┬──────────────┬───────┘
                                               │              │
                                        ┌──────▼──────┐ ┌─────▼──────────┐
                                        │ SQLite      │ │ LLM 提供商      │
                                        │ better-sqlite3│ │ DeepSeek / 智谱 │
                                        └─────────────┘ └────────────────┘
```

- **开发模式**：前端 Vite（5173）+ 后端 Node（3001），CORS 白名单放行本地前端。
- **生产模式**：`vite build` 产出 `dist/`，Express 静态托管并做 SPA 兜底，同源无 CORS 问题。

## 2. 技术栈与选型理由

| 层 | 选型 | 理由 |
|----|------|------|
| 前端 | React 19 + TypeScript + Vite | 组件化、类型安全、构建快 |
| 路由 | react-router-dom 7 | 标准 SPA 路由 |
| 后端 | Express 5 | 轻量、生态成熟 |
| 数据库 | better-sqlite3（WAL） | 零运维、单文件、同步 API、适合中小规模 |
| 鉴权 | jsonwebtoken + cookie-parser | JWT 存 httpOnly Cookie |
| 文件解析 | pdf-parse / mammoth / word-extractor | 覆盖 PDF / DOCX / DOC |
| 网页抓取 | cheerio | 服务端 DOM 解析、提取正文 |
| 导出 | jspdf + html2canvas + docx | PDF（图片式）/ Word |
| 进程守护 | pm2 | 开机自启、日志、重启 |
| 反代 | Caddy（可选） | 自动 HTTPS |

## 3. 目录结构

```
server/                       后端
  index.js                    入口：安全中间件、限流、路由挂载、静态托管、错误处理、API 前缀网关
  core/                       领域与基础服务
    db.js                     SQLite 初始化 + 迁移
    auth.js                   密码哈希、JWT、Cookie、requireAuth / requireAdmin
    quota.js / queue.js       每日额度 / 并发队列
    store.js / person.js      评估保存（每人保留 12 条）/ 人物标识
    models.js                 模型目录 + 视觉模型选择（getVisionOverride）
    pdfText.js                PDF 按坐标重建「视觉阅读顺序」
  llm/                        llm.js（调用层）/ prompt.js（人设与提示词）
  http/                       envelope.js（响应信封）/ errors.js（错误码）
  routes/                     auth / evaluate / parse / fetch / admin / account / downloads
  scoring/                    确定性评分引擎（词典驱动，客观分）
  jobs/purge.js               注销账号到期清理
  scripts/create-admin.js     创建 / 重置管理员
  __tests__/                  单元测试（auth/person/queue/quota/store/scoring/envelope/pdfText）
src/                          前端
  pages/                      Login / Home / Result / TaskRunner / History / Admin / Builder /
                              Compare / Interview / Directions / Privacy
  components/                 FileUpload / UrlFetch / UserBar / ModelSelect / Logo / ThemeToggle /
                              Nav / TaskDock / AccountDangerZone
  lib/                        api.ts / auth.tsx / tasks.tsx（后台任务）
    ui/                       toast / theme / models
    resume/                   resumeTemplate / resumeSchema / sample
    report/                   report / download
    __tests__/                report / resumeTemplate / resumeSchema 测试
shared/                       结构化简历 Schema（前后端共用，单一事实来源）
public/                       PWA（manifest / sw.js / 图标 / theme-init.js）
deploy/                       Caddyfile、env.production.example
docs/                         文档集 + docs/adr（决策记录）+ docs/features（按功能分类）
ecosystem.config.cjs          pm2 配置
```

## 4. 数据模型（SQLite）

### users
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| email | TEXT UNIQUE | 普通用户登录账号 |
| username | TEXT | 管理员登录账号（唯一，可空） |
| role | TEXT | `user` / `admin` |
| password_hash | TEXT | scrypt / 加盐哈希 |
| deleted_at / purge_after | DATETIME | 注销冷静期（到期由定时任务物理删除） |
| created_at | DATETIME | |

### evaluations
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER | 数据隔离键 |
| resume / job_title / job_description | TEXT | 输入 |
| score | REAL | LLM 总分 |
| report | TEXT | 报告全文 |
| objective_json | TEXT | 确定性客观分（JSON） |
| revision | INTEGER | 乐观并发版本号（默认 1） |
| job_url | TEXT | 岗位链接 |
| person_key / person_name | TEXT | 人物识别（历史分组） |
| cache_key | TEXT | 结果缓存键 |
| candidate_type | TEXT | `general` / `student` |
| created_at | DATETIME | |

### downloads
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER | 归属用户 |
| kind / title / format | TEXT | 类型（report/resume）/ 标题 / 格式 |
| created_at | DATETIME | |

### usage_log
| 字段 | 类型 | 说明 |
|------|------|------|
| user_id + day | PK | 每人每天一行 |
| count | INTEGER | 当日用量 |

- 建索引：`person_key`、`user_id`、`(user_id, cache_key)`、`downloads(user_id)`。
- `db.js` 启动时用 `PRAGMA table_info` 检测并 `ALTER TABLE` 补字段，兼容旧库平滑升级。

## 5. API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册（首个用户继承遗留数据） |
| POST | `/api/auth/login` | 登录（邮箱或用户名） |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 当前用户 |
| GET | `/api/models` | 已配置的提供商 + 可选模型 |
| POST | `/api/evaluate` | 评估（SSE 流式） |
| POST | `/api/compare` | 多岗位对比 |
| POST | `/api/followup` | 继续追问（流式） |
| POST | `/api/interview` | 模拟面试（流式） |
| POST | `/api/directions` | 岗位方向推荐（流式） |
| GET | `/api/evaluations` | 历史列表（按人分组） |
| GET/PUT/DELETE | `/api/evaluations/:id` | 详情 / 修改 / 删除 |
| POST | `/api/parse-file` | 文件解析（PDF 顺序重建 / OCR） |
| POST | `/api/fetch-url` | 链接抓取 + 岗位信息抽取 |
| POST | `/api/resume/validate` | 结构化简历校验（写严读宽） |
| POST/GET | `/api/downloads` | 记录 / 读取下载历史 |
| GET | `/api/account/status` | 注销状态（含冷静期到期时间） |
| POST | `/api/account/delete` | 申请注销（进入 7 天冷静期） |
| POST | `/api/account/cancel-delete` | 撤销注销 |
| GET | `/api/admin/users` | 用户管理（管理员） |
| GET | `/api/health` | 健康检查 |

> 所有 JSON 响应经统一信封 `{ code, message, requestId, ... }` 包裹（见 §14）；SSE 流式接口以 `data: { chunk | error | queued | done }` 事件下发。

## 6. LLM 调用层（`server/llm/llm.js`）

- **多提供商**：`getConfig(override)` 按 `<PROVIDER>_API_KEY / _BASE_URL / _MODEL` 读取；支持请求级 `override` 临时切换模型。
- **调用形态**：非流式 `callLLM`、流式 `callLLMStream`、追问 `followUpStream`、面试 `interviewStream`、方向 `directionsStream`、OCR `ocrImage`、岗位抽取 `extractJobInfo`。
- **超时**：总超时 `LLM_TIMEOUT_MS`；流式另设"停滞超时" `LLM_STREAM_IDLE_MS`，无数据超时后**自动回退非流式**。
- **重试**：`LLM_MAX_RETRIES`，对限流 / 5xx / 超时可重试（`isRetryable`）。
- **温度适配**：智谱 `temperature` 区间为 (0,1)，不支持 0，已做适配。
- **OCR**：`ocrImage(dataUrl, signal, override)` 以 `image_url` 内容发起视觉模型请求，`temperature: 0`，专用 OCR 系统提示词，只回文字。
- **推理模型思考链**：DeepSeek 等推理模型会先流式输出 `reasoning_content`（思维链），可能耗尽 `max_tokens` 使正文 `content` 为空。`thinkingParam(baseUrl)` 默认对 DeepSeek 注入 `thinking: { type: "disabled" }`（`LLM_THINKING=enabled` 可恢复）；6 处文本生成请求统一注入，OCR 视觉请求跳过。流式解析只取 `delta.content`。
- **PDF 阅读顺序**：`server/core/pdfText.js` 用 `pdfjs-dist` 取文字块坐标，按 y 分行、x 排序重建视觉顺序（`parse.js` 文本型 PDF 走此路径，失败回退 `pdf-parse`；图片型走 OCR）。

## 7. 提示词设计（`server/llm/prompt.js`）

- `SYSTEM_PROMPT`：资深招聘官人设 + 工作流程 + 评分规则 + **固定 9 节输出格式** + 追问规则 + "永远中文 / 禁止编造"。
- `buildEvaluatePrompt`：拼接岗位、JD、应届生说明、简历全文。
- `FOLLOWUP_*` / `INTERVIEW_*` / `DIRECTIONS_*`：各自的系统提示词 + 输入构造函数。
- 关键约束：**报告必须引用简历原话作为证据**；禁止编造用户未写过的经历、数字、证书。

## 8. 鉴权与安全

- **密码**：加盐哈希存储。
- **登录态**：JWT 写入 httpOnly Cookie；`AUTH_SECRET` 签名，`AUTH_TOKEN_TTL` 控制有效期；生产设 `COOKIE_SECURE=true`。
- **中间件**：`requireAuth`（除注册/登录外全部接口）、`requireAdmin`。
- **限流**：全局 120/min；`/api/evaluate`、`/api/fetch-url`、`/api/parse-file` 30/min；`/api/auth` 20/min。
- **SSRF 防护**（`fetch.js`）：拒绝内网 / 回环 / 链路本地地址，校验重定向目标（最多 5 跳），15s 超时。
- **安全响应头**：helmet，自定义 CSP（`script-src 'self'`、允许内联样式、`img-src data: blob:`），关闭 `upgrade-insecure-requests`、COEP、COOP、CORP。
- **额度**：每人每日评估上限（默认 30）。

## 9. 并发、缓存与稳定性

- **并发队列**（`queue.js`）：`MAX_CONCURRENCY`（默认 5）同时执行，超出进入等待队列 `MAX_QUEUE`（默认 50），满则拒绝。
- **结果缓存**：`computeCacheKey(resume, jobTitle, jd, override)`；命中且未过期直接返回（`CACHE_TTL_HOURS`）。
- **失败回退**：流式停滞 → 回退非流式；失败不保存空报告。
- **请求日志**：`LOG_REQUESTS` 输出方法 / 路径 / 状态 / 耗时。

## 10. 前端设计

- **路由**（`App.tsx`）：`/login`、`/privacy` 公开；`/`、`/result/:id`、`/result/task/:taskId`、`/history`、`/builder`、`/compare`、`/interview`、`/directions`、`/admin` 受保护（`Protected` 包裹）。
- **鉴权上下文**：`AuthProvider` 提供用户态；401 时自动跳登录页。
- **后台任务**：`lib/tasks.tsx` 的 `TaskProvider` 位于路由之上，长任务在其中运行（切换页面不中断、可并行）；`components/TaskDock.tsx` 悬浮展示，`pages/TaskRunner.tsx` 展示运行中进度，完成后自动跳结果页。
- **报告渲染**：`lib/report/report.ts` 按 `【】` 解析 9 节；`parseMatchItems` 解析 `|` 对照行并识别 ✅/⚠️/❌；`matchRate` 计算匹配度；`reportToHtml` 生成导出用 HTML。
- **模板**：`lib/resume/resumeTemplate.ts` 生成简历 HTML（预览与 PDF 共用样式）；`lib/resume/resumeSchema.ts` 做扁平表单 ↔ 结构化校验。
- **PWA**：`manifest.webmanifest` + `sw.js`；`theme-init.js` 外置主题脚本（规避 CSP 内联限制）。

## 11. 部署架构

```
用户 → (Caddy :443 自动 HTTPS，可选) → Node/Express :3001 → SQLite(data/app.db)
                                            ↑ pm2 守护 + 开机自启
```

- `npm run build` → `pm2 start ecosystem.config.cjs` → `pm2 save && pm2 startup`。
- 国内服务器：域名需 **ICP 备案**，未备案时用 `IP:端口`（部署示例：`http://<服务器公网IP>:3001`）。
- 香港服务器：免备案，可当天上 HTTPS。

## 12. 关键技术决策与权衡

| 决策 | 取舍 |
|------|------|
| SQLite 而非 Postgres | 零运维、单文件易备份；换取并发上限（中小规模足够） |
| 同源生产部署 | 规避 CORS；代价是前端须先 build |
| 延迟加载原生库（`pdf-parse` / `mammoth` / `word-extractor`） | 避免启动时段错误；代价是首次解析略慢 |
| 外置 `theme-init.js` | 适配严格 CSP；代价是多一个静态文件 |
| 报告用固定文本格式（`【】` + `|`） | 简单、模型易遵循；代价是格式偏差需前端降级 |
| OCR 走视觉模型 | 无需本地 OCR 依赖；代价是消耗 token、仅支持已配置的视觉模型 |
| 确定性评分引擎（`server/scoring/`） | 可复现、可解释、零外部依赖；代价是启发式维度与 LLM 判断可能不一致（故两者并存互补） |
| 结构化简历 Schema（Zod，`shared/`） | 契约明确、校验集中；代价是前后端以 `.js` + `.d.ts` 共用、新增依赖 |
| 统一响应信封（中间件拦截 `res.json`） | 一处生效、向后兼容；代价是过渡期响应略冗余 |
| 后台任务（Provider 位于路由之上） | 切换页面不中断、可并行；代价是内存态，刷新即丢 |
| PDF 按坐标重建阅读顺序 | 通用修复设计型 PDF 乱序；代价是引入 `pdfjs-dist`、首次解析略慢 |
| 默认关闭推理模型思考链 | 避免正文为空、更快；代价是可能牺牲部分推理质量（`LLM_THINKING=enabled` 可恢复） |

## 13. 规模触发器（出现任一信号即启动迁移，在此之前不要提前优化）

| 组件 | 触发信号（任一） | 迁移方向 | 预估工作量 |
|---|---|---|---|
| SQLite (WAL) | 日评估 > 500 次/天；或需要部署第二个实例 | Postgres（表结构基本通用，改连接层与 SQL 方言） | 2-3 天 |
| 内存并发队列 (MAX_CONCURRENCY=5, MAX_QUEUE=50) | 部署第二实例；或排队等待成为常态（waiting > 10 分钟均值） | Redis + BullMQ | 2 天 |
| 游客 IP 限流 / A/B IP 分桶 | 部署第二实例 | Redis 计数器（分桶改用 userId 或 Cookie） | 1 天 |
| events/llm_usage 聚合查询变慢 | admin 页加载 > 2s | 预聚合日表（SQLite 内即可做，不必换库） | 半天 |

> **这些数字是拍脑袋的保守值**，第一次真实接近时先实测再决定。

## 14. 已知技术债 / 改进方向

- **架构迁移的触发信号见第 13 节「规模触发器」**：SQLite、内存队列、IP 限流的迁移条件都已量化，未触发前不提前优化。
- PDF 导出为图片式（文字不可选中），可研究可编辑 PDF 方案。
- 报告解析对模型格式依赖较强，可引入 JSON Schema / 结构化输出。
- 无 HTTPS（受限于备案），可换香港服务器或补备案。
- 缓存键与人物识别为轻量实现，重名 / 相似简历可能误合并。
- PDF 阅读顺序按 y/x 单栏重建，复杂**双栏**版面可进一步做列切分。
- 后台任务：客户端已把元数据持久化到 `localStorage`；运行中的任务在刷新后不会于客户端继续，但服务端会跑完并落库，可在历史查看。

## 15. 近期新增模块（2026-09-11 / 09-12）

- **确定性评分引擎**（`server/scoring/`）：词典驱动，`matchRate = Σ(w·hit)/Σw` + 四维评分，输出 `objective` 与 LLM 报告并存（ADR-0001）。
- **结构化简历 Schema**（`shared/resumeSchema.js` + `.d.ts`）：Zod 定义，写严读宽、未知字段丢弃，前后端共用（ADR-0002）。
- **统一响应信封 + 错误码**（`server/http/`）：`{ code, message, requestId, ... }`，目录见 `docs/error-codes.md`（ADR-0003）。
- **账号注销**（`routes/account.js` + `jobs/purge.js`）：7 天冷静期，到期物理删除（ADR-0004）。
- **下载历史**（`routes/downloads.js`）（ADR-0005）。
- **乐观并发**（`evaluations.revision`）：PUT 冲突返回 409 + `currentRevision`（ADR-0006）。
- **后台任务**（`src/lib/tasks.tsx`）：跨页面、可并行。
- **PDF 阅读顺序重建**（`server/core/pdfText.js`）。
- **推理模型思考链处理**（`server/llm/llm.js` 的 `thinkingParam`）。
- **文档与开源**：`docs/features/`（六类）、`docs/adr/`（六篇）、MIT `LICENSE`、独立仓库 `github.com/y0u41/resume-advisor`。
