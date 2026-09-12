import { Router } from "express";
import db from "../core/db.js";
import { requireAuth, requireAdmin } from "../core/auth.js";
import { getUsage, DAILY_LIMIT } from "../core/quota.js";
import { eventCounts, recentEvents } from "../core/events.js";

const router = Router();

// 仅 /admin/* 需要登录且为管理员（路径限定，避免拦截其它 /api 路由）
router.use("/admin", requireAuth, requireAdmin);

router.get("/admin/users", (req, res) => {
  const users = db
    .prepare("SELECT id, email, username, role, created_at FROM users ORDER BY id")
    .all();

  const enriched = users.map((u) => ({
    ...u,
    todayUsage: getUsage(u.id),
    evaluations: db
      .prepare("SELECT COUNT(*) c FROM evaluations WHERE user_id = ?")
      .get(u.id).c,
  }));

  res.json({ users: enriched, dailyLimit: DAILY_LIMIT });
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

export default router;
