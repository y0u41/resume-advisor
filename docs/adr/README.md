# 架构决策记录（ADR）

本目录记录简历参谋的关键技术决策。格式：**背景 → 决策 → 后果**。

| 编号 | 决策 |
|------|------|
| [0001](./0001-deterministic-scoring.md) | 引入确定性评分引擎，与 LLM 报告并存 |
| [0002](./0002-structured-resume-schema.md) | 引入结构化简历 Schema（Zod，单一事实来源） |
| [0003](./0003-api-envelope-and-error-codes.md) | 统一 API 响应信封与错误码目录 |
| [0004](./0004-account-deletion-cooling-period.md) | 账号注销采用 7 天冷静期 + 定时物理删除 |
| [0005](./0005-download-history.md) | 记录下载/导出历史 |
| [0006](./0006-optimistic-concurrency.md) | 评估记录更新采用乐观并发（revision） |
| [0007](./0007-report-format-stays-text.md) | 报告保持文本格式，暂不做 JSON 结构化输出 |
| [0008](./0008-quota-charged-on-success.md) | 额度按「成功后计费 + 失败自动退还」，`withQuota` 为唯一入口 |

> 参考来源：resume-workshop 的相关设计（MIT License）经裁剪后移植。
