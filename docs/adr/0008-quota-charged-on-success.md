# ADR-0008：额度按「成功后计费 + 失败自动退还」

## 背景

"消耗用户额度"这一行为，在改造前有四条路径、四种不一致的实现（全在 `server/routes/evaluate.js`）：

| 路由 | 扣费时机 | 问题 |
|---|---|---|
| `POST /evaluate` | LLM 调用**之前** | LLM 失败时额度照扣，无退还 |
| `POST /compare` | 每个岗位 LLM 成功**之后** | 与其它路径口径不一致；预检查与逐岗计数有并发竞态 |
| `POST /interview` | `acquire` 排队**之前** | 排队失败（503）时额度已扣，白扣 |
| `POST /directions` | `acquire` 排队**之前** | 同上 |
| `POST /followup` | **完全不计费** | 携带全文简历+完整报告的 LLM 调用，可无限刷 |

注册用户没有任何退款机制。模型故障日会出现"评估失败了，次数却少了"的集中投诉——这是最伤付费意愿的一类体验。

## 决策

**统一为「成功后计费 + 失败自动退还」，并以 `server/core/quota.js` 的 `withQuota()` 作为唯一计费入口。**

- 路由层**不再直接调用** `consumeQuota`（`grep -rn "consumeQuota" server/routes/` 应无结果）。
- `withQuota(user, { isPremium, isOcr }, work)`：
  1. 先 `consumeQuota`（**先扣**）；额度不足时抛 `code=3001` 的错误，由路由层转成 429 / 流式 `error` 事件。
  2. `await work()`：把「关键词抽取 + 客观分 + LLM 生成 + 落库」整段视为一次工作单元。
  3. `work()` 抛错 → `refundQuota`（**后退**）并重新抛出；成功 → 保留额度，返回 `{ result, quota }`。
- `followup` 纳入计费（行为变更）。

选择"先扣后退"而非"成功后扣"的理由：改动最小、与既有 `consumeQuota` 校验逻辑一致，
且能把"额度不足"在**开始生成前**就挡掉（否则要跑完 LLM 才发现超限）。两者都能保证失败不扣，
但**必须全局统一**——这里统一为 `withQuota`。

## 语义细节

- **失败即退**：网络错误、模型故障、**空结果**、排队失败、异常，一律退还。
- **客户端主动断开不退**：服务端会继续跑完并落库（既有决策，见 `evaluate.js` 的 `res.on("close")` 只标记 `clientClosed` 而不 `abort`），
  用户能在历史/结果页拿到结果，因此计费是公平的。
- **缓存命中不计费**：`/evaluate` 的缓存分支在 `acquire` 之前直接返回，保持原样。
- **管理员不计数**：`consumeQuota` 对 `admin` 直接放行不 `incr`；`refundQuota` 的 `UPDATE` 命中 0 行，天然 no-op（无特判）。
- **不会退成负数**：`MAX(count - 1, 0)`，与游客路径的 `refundGuestQuota` 同模式。
- **多岗对比**：每个岗位单独 `withQuota`（该岗成功才计费）；开跑前的整包预检查保留
  （`hasQuotaFor(user, n)`，只读、不消耗），给用户"额度不够跑不了 N 个"的提前反馈。

## 后果

- 计费口径单一、可预测；模型故障不再"白扣"，显著降低投诉与退款诉求。
- `/followup` 开始消耗每日总额度，需在 `docs/features/评估简历.md` 中写明。
- 游客路径（`server/routes/guest.js` 的 `guest_trials` 表 + `refundGuestQuota`）**保持独立**，不在本决策收拢范围。
- 新增任何计费点都必须走 `withQuota`，并在 `server/__tests__/refund.test.js` 覆盖。
