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

## 贯穿性机制（跨模块）

- **后台任务**：`src/lib/tasks.tsx` 的 `TaskProvider` 位于路由之上，所有长任务（评估/对比/面试/推荐）在其中后台运行，切换页面不中断；`src/components/TaskDock.tsx` 提供悬浮任务栏。
- **统一响应信封**：所有 JSON 响应为 `{ code, message, requestId, ... }`，错误码见 [`docs/error-codes.md`](../error-codes.md)。
- **确定性客观分**：`server/scoring/`（词典驱动），与 LLM 报告并存。
- **结构化简历 Schema**：`shared/resumeSchema.js`（前后端共用）。
- **并发/缓存/额度**：`server/queue.js`、`server/store.js`、`server/quota.js`。
