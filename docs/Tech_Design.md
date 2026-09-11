# 技术设计文档（Tech Design）

> 项目：简历评估助手（resume-evaluator）
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
  index.js                    入口：安全中间件、限流、路由挂载、静态托管、错误处理
  db.js                       SQLite 初始化 + 迁移（users / evaluations / usage_log）
  auth.js                     密码哈希、JWT 签发、Cookie、requireAuth / requireAdmin
  quota.js                    每人每日额度
  queue.js                    评估并发队列
  models.js                   模型目录 + 视觉模型选择（getVisionOverride）
  store.js                    评估保存 + 每人保留 12 条 + 缓存查询
  person.js                   人物标识提取（首个非空行）
  llm.js                      LLM 调用层（多提供商、超时、重试、流式、OCR、抽取）
  prompt.js                   人设与提示词（评估 / 追问 / 面试 / 方向）
  routes/
    auth.js                   注册 / 登录 / 登出 / me
    evaluate.js               评估 / 对比 / 追问 / 面试 / 方向 / 历史 CRUD / models
    parse.js                  文件解析 + OCR
    fetch.js                  链接抓取 + SSRF 防护 + 岗位信息抽取
    admin.js                  用户管理
  scripts/create-admin.js     创建 / 重置管理员
  __tests__/                  单元测试（auth / person / queue / quota / store）
src/                          前端
  pages/                      Login / Home / Result / History / Admin / Builder /
                              Compare / Interview / Directions / Privacy
  components/                 FileUpload / UrlFetch / UserBar / ModelSelect / Logo /
                              ThemeToggle / Nav
  lib/                        auth / api / models / download / report /
                              resumeTemplate / sample / toast / theme
  lib/__tests__/              report / resumeTemplate 测试
public/                       PWA（manifest / sw.js / 图标 / theme-init.js）
deploy/                       Caddyfile、env.production.example
docs/                         本文档集
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
| created_at | DATETIME | |

### evaluations
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER | 数据隔离键 |
| resume / job_title / job_description | TEXT | 输入 |
| score | REAL | 总分 |
| report | TEXT | 报告全文 |
| job_url | TEXT | 岗位链接 |
| person_key / person_name | TEXT | 人物识别（历史分组） |
| cache_key | TEXT | 结果缓存键 |
| candidate_type | TEXT | `general` / `student` |
| created_at | DATETIME | |

### usage_log
| 字段 | 类型 | 说明 |
|------|------|------|
| user_id + day | PK | 每人每天一行 |
| count | INTEGER | 当日用量 |

- 建索引：`person_key`、`user_id`、`(user_id, cache_key)`。
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
| POST | `/api/parse-file` | 文件解析（含 OCR） |
| POST | `/api/fetch-url` | 链接抓取 + 岗位信息抽取 |
| GET | `/api/admin/users` | 用户管理（管理员） |

## 6. LLM 调用层（`server/llm.js`）

- **多提供商**：`getConfig(override)` 按 `<PROVIDER>_API_KEY / _BASE_URL / _MODEL` 读取；支持请求级 `override` 临时切换模型。
- **调用形态**：非流式 `callLLM`、流式 `callLLMStream`、追问 `followUpStream`、面试 `interviewStream`、方向 `directionsStream`、OCR `ocrImage`、岗位抽取 `extractJobInfo`。
- **超时**：总超时 `LLM_TIMEOUT_MS`；流式另设"停滞超时" `LLM_STREAM_IDLE_MS`，无数据超时后**自动回退非流式**。
- **重试**：`LLM_MAX_RETRIES`，对限流 / 5xx / 超时可重试（`isRetryable`）。
- **温度适配**：智谱 `temperature` 区间为 (0,1)，不支持 0，已做适配。
- **OCR**：`ocrImage(dataUrl, signal, override)` 以 `image_url` 内容发起视觉模型请求，`temperature: 0`，专用 OCR 系统提示词，只回文字。

## 7. 提示词设计（`server/prompt.js`）

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

- **路由**（`App.tsx`）：`/login`、`/privacy` 公开；`/`、`/result/:id`、`/history`、`/builder`、`/compare`、`/interview`、`/directions`、`/admin` 受保护（`Protected` 包裹）。
- **鉴权上下文**：`AuthProvider` 提供用户态；401 时自动跳登录页。
- **报告渲染**：`lib/report.ts` 按 `【】` 解析 9 节；`parseMatchItems` 解析 `|` 对照行并识别 ✅/⚠️/❌；`matchRate` 计算匹配度；`reportToHtml` 生成导出用 HTML。
- **模板**：`lib/resumeTemplate.ts` 生成简历 HTML（预览与 PDF 共用样式）。
- **PWA**：`manifest.webmanifest` + `sw.js`；`theme-init.js` 外置主题脚本（规避 CSP 内联限制）。

## 11. 部署架构

```
用户 → (Caddy :443 自动 HTTPS，可选) → Node/Express :3001 → SQLite(data/app.db)
                                            ↑ pm2 守护 + 开机自启
```

- `npm run build` → `pm2 start ecosystem.config.cjs` → `pm2 save && pm2 startup`。
- 国内服务器：域名需 **ICP 备案**，未备案时用 `IP:端口`（本项目当前部署于 `http://119.27.181.86:3001`）。
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

## 13. 已知技术债 / 改进方向

- PDF 导出为图片式（文字不可选中），可研究可编辑 PDF 方案。
- 报告解析对模型格式依赖较强，可引入 JSON Schema / 结构化输出。
- 无 HTTPS（受限于备案），可换香港服务器或补备案。
- 缓存键与人物识别为轻量实现，重名 / 相似简历可能误合并。
