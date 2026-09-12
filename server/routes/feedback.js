import { Router } from "express";
import rateLimit from "express-rate-limit";
import db from "../core/db.js";
import { requireAuth } from "../core/auth.js";

const router = Router();

// 每人每天最多提交次数（防刷）
const feedbackLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: Number(process.env.FEEDBACK_DAILY || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 1007, error: "提交过于频繁，请明天再试" },
});

// 提交反馈 / 投票
router.post("/feedback", requireAuth, feedbackLimiter, (req, res) => {
  const { kind, rating, content, context } = req.body || {};
  if (!kind || typeof kind !== "string") {
    return res.status(400).json({ code: 1001, error: "缺少反馈类型" });
  }
  db.prepare(
    "INSERT INTO feedback (user_id, kind, rating, content, context) VALUES (?, ?, ?, ?, ?)"
  ).run(
    req.user.id,
    String(kind).slice(0, 20),
    String(rating || "").slice(0, 40),
    String(content || "").slice(0, 1000),
    String(context || "").slice(0, 100)
  );
  res.json({ ok: true });
});

export default router;
