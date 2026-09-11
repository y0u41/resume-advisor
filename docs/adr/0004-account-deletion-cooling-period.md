# ADR-0004：账号注销采用 7 天冷静期 + 定时物理删除

## 背景

隐私合规要求用户可注销并删除数据；直接删除不可恢复，易造成误操作。

## 决策

- `users` 增加 `deleted_at` / `purge_after`。
- `POST /api/account/delete`：写入 `purge_after = now + 7 天`（`DELETE_COOLING_DAYS` 可配），进入冷静期。
- 冷静期内可 `POST /api/account/cancel-delete` 撤销；`/auth/me` 返回 `pendingDeletion`，前端展示横幅。
- 定时任务 `server/jobs/purge.js`：启动时 + 每 6 小时，物理删除 `purge_after <= now` 的账号及其 `evaluations` / `usage_log`。
- 登录时若冷静期已过但清理未执行，按「已注销」拒绝。

## 后果

- 优点：可撤销、合规、清理自动化。
- 代价：注销非即时，需依赖定时任务（单实例进程内定时器；多实例需外部调度）。
- 隐私政策文案同步更新（可自助注销）。
