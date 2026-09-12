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
18. **分享报告**：`server/routes/share.js` 提供免登录的 `GET /api/share/:token`（只读、带水印、可选**隐藏联系方式**与**隐藏姓名**「首字+**」）；生成 / 取消用 `POST`/`DELETE /api/evaluations/:id/share`。**简历原文默认不分享**（需显式 `includeResume`）；token 默认 **30 天过期**（`SHARE_TTL_DAYS`）；分享页与接口均带 **`X-Robots-Tag: noindex`**。分享路由同样必须在 `evaluateRoutes` 之前挂载。
19. **最小埋点**：`server/core/events.js`（`logEvent`/`hasEventToday`/`eventCounts`）+ `events` 表；白名单事件 `register / first_evaluate / report_read / followup / download / return_7d`，以及**漏斗关键** `guest_trial`（游客试用，user_id 为空）与 `register_from_guest`（试用后注册，前端带 `source=guest`）。服务端在注册 / 首次评估 / 7 日回访 / 游客试用时记录，前端经 `POST /api/events` 上报（非白名单忽略），管理员 `GET /api/admin/events` 查看。
20. **ATS 可解析性检测**：`server/scoring/ats.js` 的 `checkAts(resumeText)` 做确定性结构检查（姓名首行 / 联系方式 / 邮箱 / 板块标题 / 日期格式 / 要点符号），作为 `objective.ats` 返回并在结果页展示。改动需同步 `server/__tests__/scoring.test.js`。
21. **反馈与投票**：`feedback` 表 + `POST /api/feedback`（登录、每天限流，`kind=vote|feedback`）；结果页底部「这份报告有帮助吗？」投票 + 反馈输入；管理员 `GET /api/admin/feedback` 查看。
22. **成本看板**：`llm_usage` 表 + `server/core/usage.js`（AsyncLocalStorage 采集；`withUsageContext` 标记功能/用户，LLM 层自动记录 token）。管理员 `GET /api/admin/usage` 查看（按功能/模型/用户聚合 + 估算成本；单价可用 `LLM_PRICE_JSON` 覆盖）。流式请求已开启 `stream_options.include_usage`。
23. **后台任务持久化**：客户端把任务元数据落 `localStorage`（`src/lib/tasks.tsx`，刷新后恢复；运行中的标记为中断）。服务端所有流式任务在客户端断开后**不中止 LLM**（用 `safeWrite` 守卫写入）；**evaluate / compare / interview / directions 的结果都会落库**（`evaluations` 表），刷新后可在历史记录/结果页回看。
24. **生产环境注意**：① `TRUST_PROXY`——**默认 0（直连，不信任 X-Forwarded-For）**，反代后必须显式设 1，否则要么游客限流按代理 IP 串味（=1 但无代理时客户端可伪造 `X-Forwarded-For` 刷试用、转化数据失真）；② **游客关键词与注册路径必须一致**：`guest.js` 用同一 `getJdKeywords(jd, signal, { isStudent })`（不得硬编码 `isStudent: false`），且 `guest_trial` 埋点须在关键词抽取**之前**记录，避免额外 LLM 调用中断导致漏斗分母偏小；③ **Caddy 不要对 SSE 压缩**（会缓冲，见 `deploy/Caddyfile`）；④ 静态资源 `/assets/` 长缓存、`index.html` 不缓存；⑤ 500 不向客户端泄露内部错误；⑥ `pdfjs-dist` 依赖 `Promise.withResolvers`，已在 `core/pdfText.js` 加 Node 20 兼容 polyfill。
25. **注销彻底性**：`server/jobs/purge.js` 的 `tablesWithUserId()` 通过 `PRAGMA table_info` **自动发现**所有含 `user_id` 列的表（新增表无需登记、不会漏；如需排除加入 `EXCLUDED`）。`server/__tests__/purge.test.js` 覆盖「新增含 user_id 的表自动被清理」，并有**新表登记防呆测试**：每张表必须被分类——含 `user_id` → 自动清理，否则**显式登记进 `NON_USER_TABLES` 白名单**；新增表（即使列名叫 `uid`/`owner_id`）未分类会让测试失败、强制开发者做决定。`startPurgeJob` 同时执行 `runCleanup`（清理过期 `guest_trials` 2 天、`jd_keywords` 90 天）。前端渲染用户内容走 `dangerouslySetInnerHTML` 时必须先转义（见 `resumeTemplate.ts` 的 `escapeHtml` / `safePhoto`）。
26. **套餐与额度（免费/PRO）**：`users.plan`（`free`|`pro`）+ `role=admin` **不受限、不计数**。分层配置在 `server/core/plans.js`（`FREE_DAILY_LIMIT=100`、`PRO_DAILY_LIMIT=500`、`FREE/PRO_PREMIUM_DAILY`、`PREMIUM_MODELS`、`defaultModelFor`）；计数在 `server/core/quota.js` 的 `quota_counters(user_id, day, kind)`（`total`/`premium`/`ocr`），入口 `consumeQuota(user, { isPremium, isOcr })`。**免费档默认走免费的 GLM-Flash（成本≈0）、游客 `GUEST_LIMIT=3`**；高级模型单独走 premium 额度。管理员后台 `POST /api/admin/users/:id/plan` 手动切换（支付接入前过渡）。定价依据与成本测算见 `docs/定价与额度.md`。
27. **岗位关键词库（数据资产 / SEO）**：`jd_keywords` 表沉淀 `job_title + keywords + hits`（`getJdKeywords(jd, signal, override, jobTitle)` 第 4 参传岗位名；命中缓存 `hits+1`）。`server/core/keywordLibrary.js` 按 `CATEGORIES` 归类 + `cleanKeyword` 清洗 + `buildLibrary` 聚合（**只统计有 `job_title` 的行**）。公开 `GET /api/keywords[/:slug]`；**SEO 页必须服务端渲染**（SPA 不被索引）：`/keywords`、`/keywords/:slug`、`/robots.txt`、`/sitemap.xml` 由 `server/seo/keywordPages.js` 输出，在静态兜底**之前**挂载；绝对链接用 `SITE_URL`。**冷启动保护**：分类需 `jdCount ≥ KEYWORDS_MIN_JD(5)` 且关键词数 `≥ KEYWORDS_MIN_KEYWORDS(10)` 才 `publishable`；全站需 `totalJds ≥ KEYWORDS_MIN_TOTAL_JD(20)` 才 `siteReady`。未达标页 `noindex` + 「正在积累」+ CTA、不进 sitemap、索引页不链它（避免薄内容页拉低权重）。发布页带**社会证明**「📊 基于 N 份真实 JD 提炼」。前端入口用原生 `<a href="/keywords">`，**不能**用 SPA `<Link>`（会被 `*` 兜底重定向回首页）。
28. **报告解析降级率（ADR-0007 量化触发器）**：`src/pages/Result.tsx` 每次查看报告记 `report_parse`，`parseReport` 返回 0 小节（退化为纯文本）时额外记 `report_parse_fallback`（两个事件须在 `EVENT_NAMES` 白名单）。`server/core/parseHealth.js` 计算近 N 天降级率；`GET /api/admin/parse-health` + 后台「报告解析健康度」卡片展示。**触发条件：样本 ≥ 200 且降级率 > 5%**（`PARSE_WINDOW_DAYS`/`PARSE_DEGRADE_THRESHOLD`/`PARSE_MIN_SAMPLES` 可覆盖）→ 才启用预留的「尾部机器可读块」方案。改阈值需同步 `docs/adr/0007-report-format-stays-text.md`。
29. **升级 PRO 入口（支付接入前）**：用户端 `/pro`（`src/pages/Pro.tsx`：套餐对比 + ¥9.9 + **收款码/外链支付** + 「付款后填邮箱」表单）；`GET /api/pro/plan`（价格/额度/**支付配置**）、`GET|POST /api/pro/request`（查/提交申请，同用户仅一条 `pending`，可带 `payEmail`）。支付配置走环境变量：`PRO_PAY_QR`（收款码图片）/ `PRO_PAY_URL`（有赞/爱发电外链）/ `PRO_PAY_NOTE`（均未配置时提示"提交申请、管理员联系收款"）。管理员 `GET /api/admin/pro-requests`（含**付款邮箱**列）+ `POST /api/admin/pro-requests/:id`（`action=approve|reject`，**approve 即把用户 `plan` 设为 `pro`**），后台有「PRO 开通申请」卡片。入口：`UserBar`「升级 PRO」+ 额度报错文案（`quotaMessage`）+ 额度预警条（`QuotaBanner`）都指向该页。**铁律：任何"升级/开通/额度"文案都必须能落到 `/pro`，否则就是死胡同。** `pro_requests` 含 `user_id`，由 purge 自动清理。支付网关等有真实付费用户再接。
30. **额度预警（把售卖前置）**：`GET /api/quota`（`server/core/quota.js` 的只读 `getQuota`，不消耗）+ `src/components/QuotaBanner.tsx`：用量 **≥ 80%** 时在顶部温和提示并链到 `/pro`（可按天 dismiss，`localStorage`），任务完成数变化后自动刷新。管理员/PRO 不显示。新接口记得加进 `server/index.js` 的 `API_PREFIXES`（否则被网关拦成 1004 接口不存在）。
31. **游客转化实验（A/B）**：`server/core/experiments.js` 按 IP **稳定分桶**（`sha256(salt:ip)[0]%2`，`salt` 分 `limit`/`preview` 两因素独立）。`GUEST_AB_LIMITS=3,5` / `GUEST_AB_PREVIEW=800,1500` 开启对照，未配置即单组（`GUEST_LIMIT`/`GUEST_PREVIEW_CHARS`）。`guest_trial` 与 `register_from_guest` 事件都带 `{limit,preview}` 变体（注册时按**同一 IP** 再算一次分桶）→ 可算分组转化率。管理员 `GET /api/admin/guest-experiment?days=` + 后台「游客转化实验」卡片。见 `docs/features/游客转化实验.md`。
    - **两个必须写在卡片上的免责声明**（否则会被数据误导）：① 归因依赖浏览器 `localStorage.guest_trialed`，换设备/清缓存后注册会**漏计** → 转化率被**低估**（保守方向）；② 两因素独立分桶，样本小时**交互效应互相污染**。`GUEST_AB_MIN_SAMPLE`（默认 100）为单组阈值，低于它返回 `enoughSamples=false` 且每组 `enough=false`，卡片顶部提示「样本量不足，仅供参考」。
32. **PRO 是按月的，不是一次性置位**：`users.plan_expires_at`（NULL=永久，仅手动授予用）。**唯一判定入口** `server/core/plans.js` 的 `normalizePlan(user)`——`plan='pro'` 且已过期即返回 `free`；额度/默认模型/前端展示全部经它，所以**过期即时生效、无需定时任务**。`server/core/auth.js` 的 `getUserFromToken` 做**懒落库**（过期 PRO 改回 free，每账号一次）。写入有效期只走两处：`POST /api/admin/pro-requests/:id`（approve）与 `POST /api/admin/users/:id/plan`——都用 `datetime(?, proPeriodModifier())`，**未过期的 PRO 再次开通 = 顺延**（`PRO_PERIOD_MONTHS`，默认 1）。新增任何"写 `plan`"的代码都必须同时写 `plan_expires_at`，否则又会漏钱。
33. **免费额度是"数据驱动"的，不是拍脑袋**：额度定太高（如 100/天），`QuotaBanner` 的 `QUOTA_WARN_RATIO`（默认 0.8）预警线就永远够不到，**升级提示形同虚设**。用 `server/core/usage.js` 的 `usageDistribution(days)`（后台「免费额度校准」卡片 / `GET /api/admin/usage-distribution`）看 per-user-per-day 用量分布来调 `FREE_DAILY_LIMIT`。给**两个**建议值：① 启发式 `P90×1.5`；② **目标法**（更稳，优先用）：让约 `USAGE_TARGET_WARN_PCT`(默认 10)% 的重用户触发 → `ceil(P(100-target)/warnRatio)`——因为 `P90×1.5` 的预警线在 `1.2×P90`，分布平时可能 **0% 触发**（实测踩过）。样本 < `USAGE_DIST_MIN_SAMPLE`（默认 100 用户×天）时**不要改**，卡片提示"仅供参考"。统计**只含免费档**（`LEFT JOIN users` 排除 `plan='pro'`；PRO 的 500/天会抬高 P90 → 免费额度被高估，校正方向正好相反）。`QuotaBanner` 阈值来自 `GET /api/quota` 的 `warnAt`，**不要在前端写死**。
34. **额度"先扣后用"，失败必须退还**：`consumeQuota` 在 LLM 调用**之前**扣额度，所以评估/生成失败（网络、模型故障、空结果、中断）时**必须退还**，否则会出现"评估失败了，次数却少了"——最伤付费意愿的一类体验。统一做法：路由内 `const isPremium = isPremiumModel(effectiveModel(override)); let consumed = false; let success = false;`，成功产出并落库后置 `success = true`，在 `finally` 里 `if (consumed && !success) refundQuota(req.user, { isPremium })`（**`finally` 覆盖所有提前 return**；`refundQuota` 内部对管理员跳过、且不会退成负数）。若 `consumeQuota` 在 `acquire()` 之前（如 `/interview`、`/directions`），`acquire` 的 catch 里也要退还（用幂等的 `refundOnce()`）。`/compare` 是"用成功才扣"（每岗 LLM 成功后再 `consumeQuota`），无需退还。新增任何 `consumeQuota` 调用点都必须配对退还逻辑，并在 `__tests__/quota.test.js` 覆盖。
35. **改数据库表结构的唯一方式**：往 `server/core/db.js` 的 **`MIGRATIONS` 数组尾部**追加 `{ v: 上一个 v + 1, up: ... }`，启动时按 `PRAGMA user_version` 顺序回放、只跑未执行的。**不要修改历史迁移**（已上线的库不会重放它），**不要**在数组外写裸 `CREATE TABLE` / `ALTER TABLE`。新增列用 `columnExists(table, col)` 守卫（对老库幂等）。老库兼容：已有库（含全部列）跑 migrate 时守卫全跳过、`user_version` 从 0 一次性推进到最新，数据完好——无需探测当前版本的逻辑。迁移同步执行（better-sqlite3 同步），不要 async。见 `__tests__/migrations.test.js`。

36. **简历模板（Builder）**：`src/lib/resume/resumeTemplate.ts` 提供 6 种「视觉模板」——`single`/`sidebar`（走 `style` 内容顺序，字符串排版）+ 4 套移植自 resume-workshop（MIT）的结构化模板（`clean-01`/`timeline-02`/`mono-line-03`/`blue-split-04`，各自固定章节顺序）。结构化模板经 `src/lib/resume/render.ts`（受限 Mustache：仅 `{{path}}`/`{{#each}}`/`{{#if}}`，默认 HTML 转义、未知路径渲染为空）+ `templates/*.ts` 渲染；数据由 `workshopRender.ts` 把扁平表单「首行 ｜ 分隔字段 + 后续行要点」解析成结构化条目（教育首行=学校｜专业｜学历｜起止，其余行进 `extra` 且用 `white-space: pre-line` 显示）。**模板 CSS 只加在 `App.css` 的 `.rtpl-*` 作用域下**（预览与 PDF 共用同一份 HTML，PDF 走 html2canvas；故不得用 `@page`/`body` 等全局样式，照片仅接受 `data:image/*`）。

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
