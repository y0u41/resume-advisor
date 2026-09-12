# AGENTS.md — AI 代理工作指令

> 本文件面向在本仓库工作的 AI 编码代理（opencode / Cursor / Cline 等）。
> 项目：简历参谋（resume-evaluator）

## 1. 项目速览

- **是什么**：面向求职者（尤其应届生）的简历评估工具。贴简历 + 岗位 → 结构化评分报告 + 改法 + 岗位匹配，并覆盖「评估 → 多岗对比 → 改简历 → 面试准备」闭环。
- **形态**：单仓库。前端 React 19 + TS + Vite；后端 Express 5 + better-sqlite3；LLM 走 OpenAI 兼容接口（DeepSeek / 智谱 GLM）。
- **语言**：代码注释与产品文案用中文；提交信息用中文。

## 2. 常用命令

```bash
npm run dev         # 开发：前端 5173 + 后端 3001（concurrently）
npm run build       # 构建前端到 dist/
npm start           # 生产运行（Express 托管 dist/）
npm test            # 单元测试（vitest run）
npm run acceptance  # 黑盒端到端验收（真实 HTTP + 临时库，无需 LLM Key）
npm run typecheck   # TypeScript 类型检查
npm run create-admin -- <用户名> <密码>   # 创建/重置管理员
```

**完成任何改动后必须运行**：`npm run typecheck` + `npm test`（如改动前端构建相关，再跑 `npm run build`）。

## 3. 目录与职责

```
server/index.js       入口：helmet/CORS/限流/日志/路由挂载/静态托管/错误处理
server/core/          db / auth / quota / queue / store / person / models（领域与基础服务）
server/llm/           llm.js（调用层）/ prompt.js（人设与提示词）
server/http/          响应信封 + 错误码目录
server/routes/        auth / evaluate / parse / fetch / admin / account / downloads
server/scoring/       确定性评分引擎（词典驱动，客观分）
server/jobs/purge.js  注销账号到期清理
shared/               结构化简历 Schema（前后端共用，单一事实来源）
src/pages/            页面    src/components/  组件
src/lib/              api / auth / tasks + ui/（toast/theme/models）+ resume/（模板/Schema/示例）+ report/（报告/下载）
public/               PWA 资源（manifest / sw.js / theme-init.js）
docs/                 文档 + docs/adr + docs/features（按功能分类）
```

## 4. 关键约定与陷阱（重要）

1. **不要提交 `.env`**：密钥只放 `.env`（已在 `.gitignore`）。`data/` 含用户隐私，同样不要提交。
2. **报告格式即产品契约**：`server/llm/prompt.js` 里的 `【】` 小节与 `|` 对照行格式，必须与 `src/lib/report/report.ts` 的解析逻辑保持一致。改一处要同步另一处。
3. **CSP 限制**：`server/index.js` 的 CSP 为 `script-src 'self'`，**禁止内联 `<script>`**。需要首屏脚本时用 `public/theme-init.js` 这类外置文件。
4. **不要给构建产物加 `crossorigin`**：生产白屏曾因此发生。`vite.config.ts` 中有 `remove-crossorigin` 插件，勿删。
5. **原生 / 重型依赖延迟加载**：`pdf-parse`、`mammoth`、`word-extractor` 用动态 `import()`，否则服务器启动可能段错误。新增同类库请遵循。
6. **Node 版本用 20 LTS**：`better-sqlite3` 在更高版本可能编译失败。
7. **服务端 `.env` 中 `COOKIE_SECURE` 与协议匹配**：HTTP 部署用 `false`，启用 HTTPS 后改 `true`。
8. **OCR 依赖视觉模型**：`server/core/models.js` 的 `VISION_MODELS` / `getVisionOverride()`；未配置视觉模型时应返回明确错误而非静默失败。
9. **统一响应信封**：所有 JSON 响应经 `server/http/envelope.js` 自动包裹（`code/message/requestId`），错误保留 `error` 字段兼容；新增业务错误请用 `docs/error-codes.md` 中的码。
10. **未知 `/api` 路径 404**：`server/index.js` 的 `API_PREFIXES` 网关会拦截未知前缀——**新增 API 前缀时必须同步补充该列表**。
11. **结构化简历契约**：`shared/resumeSchema.js` 是单一事实来源，改字段要同步 `resumeSchema.d.ts` 与 `src/lib/resume/resumeSchema.ts`；写严读宽、未知字段丢弃。
12. **乐观并发**：更新评估记录用 `revision`，冲突返回 409 + `details.currentRevision`；不要绕过该检查直接 UPDATE。
13. **PDF 阅读顺序**：`server/core/pdfText.js` 用 pdfjs 按坐标重建「视觉阅读顺序」，修正设计型 PDF（z-index/position/transform）导致的文字层乱序；文本型 PDF 走此路径，图片型 PDF 走 OCR。改动需同步 `server/__tests__/pdfText.test.js`。
14. **推理模型的思考链**：DeepSeek 等推理模型会先流式输出 `reasoning_content`（思维链），可能耗尽 `max_tokens` 导致正文 `content` 为空（偶发）。`server/llm/llm.js` 默认对 DeepSeek 注入 `thinking: { type: "disabled" }` 关闭思考（`LLM_THINKING=enabled` 可恢复）；新增 LLM 调用务必带上 `...thinkingParam(baseUrl)`，并注意区分 `delta.content` 与 `delta.reasoning_content`。
15. **客观分的行业覆盖**：确定性评分的关键词**优先由 LLM 从 JD 抽取**（`extractJdKeywords` + `core/jdKeywords.js` 按 JD 哈希缓存），再走确定性匹配，以覆盖非技术岗；抽取失败回退内置词典。匹配算法本身不发起网络请求（见 ADR-0001 更新）。
16. **游客试用**：`server/routes/guest.js` 提供免登录的 `/api/guest/evaluate`（按 IP 限流 `GUEST_LIMIT`、结果打码 `GUEST_PREVIEW_CHARS`、不落库）。**该路由必须在 `evaluateRoutes`（含全局 `requireAuth`）之前挂载**，否则会被拦成 401。
17. **改进轨迹与保留策略**：同一人（`person_key`）最多保留 `MAX_PER_PERSON`（30）条；清理时**跳过 `favorite=1` 与最高分记录**。结果页趋势由 `GET /evaluations/:id` 返回的 `previousScore`/`scoreDelta` 计算；收藏切换用 `PUT /evaluations/:id/favorite`。
18. **分享报告**：`server/routes/share.js` 提供免登录的 `GET /api/share/:token`（只读、带水印、可选联系方式打码）；生成 / 取消用 `POST`/`DELETE /api/evaluations/:id/share`。分享路由同样必须在 `evaluateRoutes` 之前挂载。
19. **最小埋点**：`server/core/events.js`（`logEvent`/`hasEventToday`/`eventCounts`）+ `events` 表；白名单 6 事件 `register / first_evaluate / report_read / followup / download / return_7d`。服务端在注册 / 首次评估 / 7 日回访时记录，前端经 `POST /api/events` 上报（非白名单忽略），管理员 `GET /api/admin/events` 查看。
20. **ATS 可解析性检测**：`server/scoring/ats.js` 的 `checkAts(resumeText)` 做确定性结构检查（姓名首行 / 联系方式 / 邮箱 / 板块标题 / 日期格式 / 要点符号），作为 `objective.ats` 返回并在结果页展示。改动需同步 `server/__tests__/scoring.test.js`。

## 5. 数据与接口约定

- 除注册/登录外**所有 `/api/*` 需登录**（`requireAuth`）；管理员接口加 `requireAdmin`。
- 数据按 `user_id` 隔离；新增表/字段时在 `server/core/db.js` 用 `PRAGMA table_info` 做兼容迁移。
- 评估类接口为 SSE 流式；失败要回退非流式且**不保存空报告**。
- 链接抓取（`routes/fetch.js`）**必须保留 SSRF 防护**（拒绝内网/回环/链路本地，校验重定向）。

## 6. 部署

- 服务器：腾讯云轻量，Ubuntu 24.04，Node 20，pm2，代码在 `/opt/git/resume-evaluator`，进程名 `resume-evaluator`。
- 线上地址：`http://<服务器公网IP>:3001`（以实际部署为准）。
- 升级流程：`git pull && npm ci && npm run build && pm2 restart resume-evaluator`。
- 详细步骤见 `DEPLOY.md`；文档见 `docs/`。

## 7. 安全红线

- 绝不硬编码 / 提交 API Key 或密码。
- 不改动 `AUTH_SECRET`、限流、SSRF 防护等安全逻辑，除非任务明确要求。
- 未获明确指示，**不要执行 `git commit` / `git push`**。

## 8. 测试

- 现有：`server/__tests__/`（auth / person / queue / quota / store）、`src/lib/__tests__/`（report / resumeTemplate）。
- 新增业务逻辑时补对应单元测试；测试可用 `DB_PATH=:memory:` 隔离。
- 真实文件解析（尤其**图片型 PDF / 图片**）改动后，建议用真实样本手工验证一次。
