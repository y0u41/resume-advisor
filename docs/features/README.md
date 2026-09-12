# 功能文档索引

> 项目：简历参谋（resume-advisor） ｜ 按功能模块分类，每类一份。
> 说明：本目录面向「功能怎么用、怎么实现」，需求/设计/决策见上级 `docs/` 与 `docs/adr/`。

| # | 模块 | 文档 | 入口 |
|---|------|------|------|
| 1 | 评估简历 | [评估简历.md](./评估简历.md) | `/`（首页） |
| 2 | 简历模板 | [简历模板.md](./简历模板.md) | `/builder` |
| 3 | 多岗位对比 | [多岗位对比.md](./多岗位对比.md) | `/compare` |
| 4 | 模拟面试 | [模拟面试.md](./模拟面试.md) | `/interview` |
| 5 | 岗位推荐 | [岗位推荐.md](./岗位推荐.md) | `/directions` |
| 6 | 历史记录 | [历史记录.md](./历史记录.md) | `/history` |
| 7 | 岗位关键词库 | [岗位关键词库.md](./岗位关键词库.md) | `/keywords`（服务端渲染公开页） |
| 8 | 升级 PRO | [升级PRO.md](./升级PRO.md) | `/pro` |
| 9 | 游客转化实验 | [游客转化实验.md](./游客转化实验.md) | 管理员后台卡片 |

## 贯穿性机制（跨模块）

- **后台任务**：`src/lib/tasks.tsx` 的 `TaskProvider` 位于路由之上，所有长任务（评估/对比/面试/推荐）在其中后台运行，切换页面不中断；`src/components/TaskDock.tsx` 提供悬浮任务栏。
- **统一响应信封**：所有 JSON 响应为 `{ code, message, requestId, ... }`，错误码见 [`docs/error-codes.md`](../error-codes.md)。
- **确定性客观分**：`server/scoring/`（关键词优先由 LLM 从 JD 抽取、按 JD 哈希缓存，再走确定性匹配），与 LLM 报告并存。
- **结构化简历 Schema**：`shared/resumeSchema.js`（前后端共用）。
- **并发/缓存/额度**：`server/core/queue.js`、`server/core/store.js`、`server/core/quota.js`。
- **游客试用**：未登录也可按 IP 试用（`server/routes/guest.js`，结果打码、不落库）；注册后解锁完整报告 / 下载 / 历史。
- **岗位关键词库（数据资产）**：评估时沉淀的 JD 关键词（`jd_keywords`）聚合为公开的「岗位关键词库」，服务端渲染 SEO 页 `/keywords`、`/keywords/:slug` + `robots.txt`/`sitemap.xml`，见 [岗位关键词库.md](./岗位关键词库.md)。
- **分享报告**：`POST /api/evaluations/:id/share` 生成只读链接；公开页 `/share/:token`（带水印、可选隐藏联系方式）。**简历原文默认不分享**、token 默认 30 天过期、`noindex`。
- **最小埋点**：`events` 表 + 事件（注册 / 首次评估 / 报告读完 / 追问 / 下载 / 7 日回访 / **游客试用 / 试用后注册**），管理员 `GET /api/admin/events` 查看。
- **反馈与投票**：`POST /api/feedback`（结果页「有帮助吗」投票 + 文字反馈），管理员 `GET /api/admin/feedback` 查看。
- **成本看板**：`llm_usage` 表自动记录每次 LLM 调用的 token，管理员 `GET /api/admin/usage` 按功能/模型/用户聚合 + 估算成本。
- **任务持久化**：任务元数据存 `localStorage`（刷新后恢复）；评估在服务端断开后仍跑完并落库，刷新不丢。
