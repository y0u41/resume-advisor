import { Router } from "express";
import db from "../core/db.js";
import { requireAuth, requireAdmin } from "../core/auth.js";
import { getUsage } from "../core/quota.js";
import { normalizePlan, dailyLimitFor, PRO_PRICE } from "../core/plans.js";
import { eventCounts, recentEvents } from "../core/events.js";
import { usageSummary } from "../core/usage.js";

const router = Router();

// 仅 /admin/* 需要登录且为管理员（路径限定，避免拦截其它 /api 路由）
router.use("/admin", requireAuth, requireAdmin);

router.get("/admin/users", (req, res) => {
  const users = db
    .prepare("SELECT id, email, username, role, plan, created_at FROM users ORDER BY id")
    .all();

  const enriched = users.map((u) => {
    const plan = normalizePlan(u);
    const limit = dailyLimitFor(plan);
    return {
      ...u,
      plan,
      todayUsage: getUsage(u.id),
      dailyLimit: Number.isFinite(limit) ? limit : -1,
      evaluations: db
        .prepare("SELECT COUNT(*) c FROM evaluations WHERE user_id = ?")
        .get(u.id).c,
    };
  });

  res.json({ users: enriched, proPrice: PRO_PRICE });
});

// 设置套餐（支付接入前由管理员手动调整；admin 账号本身不受额度限制）
router.post("/admin/users/:id/plan", (req, res) => {
  const plan = req.body?.plan;
  if (!["free", "pro"].includes(plan)) {
    return res.status(400).json({ error: "plan 只能是 free 或 pro" });
  }
  const info = db.prepare("UPDATE users SET plan = ? WHERE id = ?").run(plan, req.params.id);
  if (!info.changes) return res.status(404).json({ error: "用户不存在" });
  res.json({ ok: true, id: Number(req.params.id), plan });
});

// 埋点概览（管理员）：各事件计数 + 最近事件
router.get("/admin/events", (req, res) => {
  res.json({ counts: eventCounts(), recent: recentEvents(50) });
});

// 反馈与投票（管理员）
router.get("/admin/feedback", (req, res) => {
  const recent = db
    .prepare(
      "SELECT id, user_id, kind, rating, content, context, created_at FROM feedback ORDER BY id DESC LIMIT 100"
    )
    .all();
  const votes = db
    .prepare("SELECT rating, COUNT(*) AS count FROM feedback WHERE kind = 'vote' GROUP BY rating")
    .all();
  res.json({ recent, votes });
});

// 成本看板（管理员）：token 消耗与估算成本；?days=1(今日)/7(近7天)/0(全部)
router.get("/admin/usage", (req, res) => {
  const days = [1, 7].includes(Number(req.query.days)) ? Number(req.query.days) : 0;
  res.json(usageSummary(days));
});

export default router;
