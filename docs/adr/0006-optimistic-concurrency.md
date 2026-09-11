# ADR-0006：评估记录更新采用乐观并发（revision）

## 背景

评估记录可被编辑保存。多标签/多端同时编辑时，后保存者会静默覆盖先保存者（丢失更新）。

## 决策

- `evaluations` 增加 `revision`（整数，默认 1）。
- 客户端保存时携带 `revision`。
- 服务端：`UPDATE ... SET revision = revision + 1 WHERE id = ? AND user_id = ? AND revision = ?`；未命中则返回 `409` + `{ code: 1005, details: { currentRevision } }`。
- 客户端不带 `revision` 时退化为「后写覆盖」（兼容旧客户端），但 revision 仍递增。
- 前端收到 409 时自动拉取最新版本并提示用户重新编辑。

## 后果

- 优点：防止静默覆盖，冲突可感知。
- 代价：客户端需维护 revision；冲突时用户需重新编辑。
