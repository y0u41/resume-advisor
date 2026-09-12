import { Router } from "express";
import db from "../core/db.js";
import { requireAuth } from "../core/auth.js";
import { getQuota } from "../core/quota.js";
import { PRO_PRICE, FREE_DAILY_LIMIT, PRO_DAILY_LIMIT, FREE_PREMIUM_DAILY, PRO_PREMIUM_DAILY, PRO_PAY_QR, PRO_PAY_URL, PRO_PAY_NOTE, planDaysLeft } from "../core/plans.js";

const router = Router();
router.use(requireAuth);

// 当前用量/额度快照（用于「额度即将用完」预警，不消耗额度）
router.get("/quota", (req, res) => {
  res.json(getQuota(req.user));
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 当前套餐 + 价格与额度（PRO 页展示）
router.get("/pro/plan", (req, res) => {
  res.json({
    plan: req.user.plan,
    role: req.user.role,
    email: req.user.email,
    planExpiresAt: req.user.planExpiresAt || null,
    daysLeft: req.user.plan === "pro" ? planDaysLeft(req.user) : null,
    price: PRO_PRICE,
    free: { daily: FREE_DAILY_LIMIT, premiumDaily: FREE_PREMIUM_DAILY },
    pro: { daily: PRO_DAILY_LIMIT, premiumDaily: PRO_PREMIUM_DAILY },
    pay: { qr: PRO_PAY_QR, url: PRO_PAY_URL, note: PRO_PAY_NOTE },
  });
});

// 我的申请状态（最近一条）
router.get("/pro/request", (req, res) => {
  const row = db
    .prepare(
      "SELECT id, status, created_at, handled_at FROM pro_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1"
    )
    .get(req.user.id);
  res.json({ request: row || null });
});

// 提交开通申请（支付接入前由管理员人工批准）
router.post("/pro/request", (req, res) => {
  if (req.user.role === "admin" || req.user.plan === "pro") {
    return res.status(400).json({ error: "你已是不受限的 PRO 账号" });
  }
  const note = String(req.body?.note || "").trim().slice(0, 500);
  const payEmail = String(req.body?.payEmail || "").trim().slice(0, 200);
  if (payEmail && !EMAIL_RE.test(payEmail)) {
    return res.status(400).json({ error: "付款邮箱格式不正确" });
  }
  const pending = db
    .prepare("SELECT id FROM pro_requests WHERE user_id = ? AND status = 'pending'")
    .get(req.user.id);
  if (pending) return res.json({ ok: true, id: pending.id, status: "pending", already: true });

  const info = db
    .prepare("INSERT INTO pro_requests (user_id, note, pay_email) VALUES (?, ?, ?)")
    .run(req.user.id, note, payEmail);
  res.json({ ok: true, id: info.lastInsertRowid, status: "pending" });
});

export default router;
