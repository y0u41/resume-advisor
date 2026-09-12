import { Router } from "express";
import db from "../core/db.js";
import { requireAuth, requireAdmin } from "../core/auth.js";
import { getUsage } from "../core/quota.js";
import { normalizePlan, dailyLimitFor, PRO_PRICE, isPlanExpired, planDaysLeft, proPeriodModifier } from "../core/plans.js";
import { eventCounts, recentEvents } from "../core/events.js";
import { parseHealth } from "../core/parseHealth.js";
import { guestExperimentStats } from "../core/experiments.js";
import { usageSummary } from "../core/usage.js";

const router = Router();

// 仅 /admin/* 需要登录且为管理员（路径限定，避免拦截其它 /api 路由）
router.use("/admin", requireAuth, requireAdmin);

router.get("/admin/users", (req, res) => {
  const users = db
    .prepare("SELECT id, email, username, role, plan, plan_expires_at, created_at FROM users ORDER BY id")
    .all();

  const enriched = users.map((u) => {
    const plan = normalizePlan(u);
    const limit = dailyLimitFor(plan);
    const expired = u.role !== "admin" && u.plan === "pro" && isPlanExpired(u);
    return {
      ...u,
      plan,
      planExpiresAt: u.plan_expires_at || null,
      expired,
      daysLeft: plan === "pro" && !expired ? planDaysLeft(u) : null,
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
  const cur = db
    .prepare("SELECT id, plan, plan_expires_at FROM users WHERE id = ?")
    .get(req.params.id);
  if (!cur) return res.status(404).json({ error: "用户不存在" });

  if (plan === "pro") {
    // 未过期的 PRO 再开通 = 续费，从原到期日顺延；否则从现在起算
    const base =
      cur.plan === "pro" && cur.plan_expires_at && !isPlanExpired(cur) ? cur.plan_expires_at : "now";
    db.prepare("UPDATE users SET plan = 'pro', plan_expires_at = datetime(?, ?) WHERE id = ?").run(
      base,
      proPeriodModifier(),
      cur.id
    );
  } else {
    db.prepare("UPDATE users SET plan = 'free', plan_expires_at = NULL WHERE id = ?").run(cur.id);
  }
  const after = db.prepare("SELECT plan, plan_expires_at FROM users WHERE id = ?").get(cur.id);
  res.json({
    ok: true,
    id: cur.id,
    plan: normalizePlan(after),
    planExpiresAt: after.plan_expires_at || null,
  });
});

// 埋点概览（管理员）：各事件计数 + 最近事件
router.get("/admin/events", (req, res) => {
  res.json({ counts: eventCounts(), recent: recentEvents(50) });
});

// 报告解析健康度（ADR-0007 量化触发器）：解析降级率 + 是否达到启用机器可读块的条件
router.get("/admin/parse-health", (req, res) => {
  res.json(parseHealth(Number(req.query.days)));
});

// 游客转化实验：按试用次数 / 预览长度分组的 试用→注册 转化率；?days=1/7/0
router.get("/admin/guest-experiment", (req, res) => {
  const days = [1, 7].includes(Number(req.query.days)) ? Number(req.query.days) : 0;
  res.json(guestExperimentStats(days));
});

// PRO 开通申请（管理员）：待处理优先
router.get("/admin/pro-requests", (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.user_id, r.note, r.pay_email, r.status, r.created_at, r.handled_at,
              u.email, u.username, u.plan, u.plan_expires_at
       FROM pro_requests r LEFT JOIN users u ON u.id = r.user_id
       ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.id DESC LIMIT 200`
    )
    .all();
  res.json({ requests: rows });
});

// 批准（并开通 PRO）或驳回
router.post("/admin/pro-requests/:id", (req, res) => {
  const action = req.body?.action;
  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ error: "action 只能是 approve 或 reject" });
  }
  const row = db.prepare("SELECT id, user_id FROM pro_requests WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "申请不存在" });

  const tx = db.transaction(() => {
    if (action === "approve") {
      // 开通 = 写入到期时间（未过期则顺延一个月），到期后 normalizePlan 自动回落 free
      const u = db
        .prepare("SELECT plan, plan_expires_at FROM users WHERE id = ?")
        .get(row.user_id);
      const base =
        u && u.plan === "pro" && u.plan_expires_at && !isPlanExpired(u) ? u.plan_expires_at : "now";
      db.prepare("UPDATE users SET plan = 'pro', plan_expires_at = datetime(?, ?) WHERE id = ?").run(
        base,
        proPeriodModifier(),
        row.user_id
      );
    }
    db.prepare(
      "UPDATE pro_requests SET status = ?, handled_at = datetime('now') WHERE id = ?"
    ).run(action === "approve" ? "approved" : "rejected", row.id);
  });
  tx();
  res.json({
    ok: true,
    id: Number(row.id),
    status: action === "approve" ? "approved" : "rejected",
  });
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
