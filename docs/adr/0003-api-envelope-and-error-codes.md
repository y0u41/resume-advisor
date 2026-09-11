# ADR-0003：统一 API 响应信封与错误码目录

## 背景

各接口返回结构不一致，错误只有 `{ error }` 字符串，缺少可追踪的请求 ID 与稳定错误码。

## 决策

- 采用**中间件拦截器**（`server/http/envelope.js`）统一包裹 `res.json`，无需逐个接口改造。
- 成功：`{ code: 0, message: "ok", requestId, ...原字段 }`。
- 失败：`{ code, message, requestId, error: <同 message>, ...原字段 }`。
- 每个请求生成 `requestId`（`X-Request-Id` 响应头 + 日志 `req=<id>`）。
- 错误码目录：`server/http/errors.js` + `docs/error-codes.md`；接口可用 `code` 覆盖默认映射。
- **渐进式、向后兼容**：保留原有字段（含 `error`），旧前端零改动。

## 后果

- 优点：契约统一、可追踪、可扩展；迁移无破坏。
- 代价：过渡期响应同时含 `code/message/error`，略显冗余。
- 例外：SSE 流式接口（`/api/evaluate?stream=true` 等）不走信封，错误以 `data: { error }` 事件下发。
- 附带修复：未知 `/api` 路径此前被鉴权中间件误判为 401，现由 API 前缀网关直接返回 404。
