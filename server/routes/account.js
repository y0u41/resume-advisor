import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

// 冷静期天数（到期后由定时任务物理删除）
export const COOLING_DAYS = Number(process.env.DELETE_COOLING_DAYS || 7);

// 查询当前账号的注销状态
router.get("/account/status", (req, res) => {
  res.json({ pendingDeletion: req.user.pendingDeletion || null, coolingDays: COOLING_DAYS });
});

// 申请注销：进入冷静期（不立即删除，期间可撤销）
router.post("/account/delete", (req, res) => {
  db.prepare(
    "UPDATE users SET deleted_at = datetime('now'), purge_after = datetime('now', ?) WHERE id = ?"
  ).run(`+${COOLING_DAYS} days`, req.user.id);

  const row = db.prepare("SELECT purge_after FROM users WHERE id = ?").get(req.user.id);
  res.json({ ok: true, pendingDeletion: { purgeAfter: row.purge_after }, coolingDays: COOLING_DAYS });
});

// 撤销注销
router.post("/account/cancel-delete", (req, res) => {
  db.prepare("UPDATE users SET deleted_at = NULL, purge_after = NULL WHERE id = ?").run(req.user.id);
  res.json({ ok: true, pendingDeletion: null });
});

export default router;
