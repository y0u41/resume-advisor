import { Router } from "express";
import crypto from "crypto";
import db from "../core/db.js";
import { requireAuth } from "../core/auth.js";
import { normalizePlan, dailyLimitFor } from "../core/plans.js";
import { getUsage } from "../core/quota.js";
import { getPersonKey, getPersonName } from "../core/person.js";
import { MAX_RESUME, MAX_JD } from "./evaluateHelpers.js";

// 历史记录管理：列表 / 详情 / 编辑 / 删除 / 收藏 / 分享
const router = Router();
router.use(requireAuth);

router.get("/evaluations", (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, job_title, score, person_name, person_key, favorite, created_at
       FROM evaluations WHERE user_id = ? ORDER BY favorite DESC, id DESC LIMIT 300`
    )
    .all(req.user.id);
  const plan = normalizePlan(req.user);
  const limit = dailyLimitFor(plan);
  res.json({
    records: rows,
    usage: { used: getUsage(req.user.id), limit: Number.isFinite(limit) ? limit : -1, plan },
  });
});

router.get("/evaluations/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM evaluations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "记录不存在" });
  if (row.objective_json) {
    try {
      row.objective = JSON.parse(row.objective_json);
    } catch {
      row.objective = null;
    }
  }
  // 改进轨迹：同一人（person_key）上一次的分数与差值
  if (row.person_key) {
    const prev = db
      .prepare(
        `SELECT score FROM evaluations
         WHERE user_id = ? AND person_key = ? AND id < ? AND score IS NOT NULL
         ORDER BY id DESC LIMIT 1`
      )
      .get(row.user_id, row.person_key, row.id);
    row.previousScore = prev?.score ?? null;
    row.scoreDelta =
      prev && row.score != null ? Math.round((row.score - prev.score) * 10) / 10 : null;
  } else {
    row.previousScore = null;
    row.scoreDelta = null;
  }
  res.json(row);
});

router.put("/evaluations/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM evaluations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "记录不存在" });

  // 乐观并发：客户端带 revision 时校验，不匹配则返回 409
  const clientRevision = Number(req.body?.revision);
  if (Number.isInteger(clientRevision) && clientRevision !== row.revision) {
    return res.status(409).json({
      code: 1005,
      error: "记录已被修改，请刷新后重试",
      details: { currentRevision: row.revision },
    });
  }

  const { report, score, resume, job_title, job_description, job_url } = req.body || {};

  const next = {
    report: typeof report === "string" ? report : row.report,
    score: score === undefined || score === null ? row.score : score,
    resume: typeof resume === "string" ? resume : row.resume,
    job_title: typeof job_title === "string" ? job_title : row.job_title,
    job_description:
      typeof job_description === "string" ? job_description : row.job_description,
    job_url: typeof job_url === "string" ? job_url : row.job_url,
  };

  if (next.resume.length > MAX_RESUME || next.job_description.length > MAX_JD) {
    return res.status(400).json({ error: "内容过长" });
  }

  let personKey = row.person_key;
  let personName = row.person_name;
  if (typeof resume === "string" && resume !== row.resume) {
    personKey = getPersonKey(resume);
    personName = getPersonName(resume);
  }

  db.prepare(
    `UPDATE evaluations
     SET report = ?, score = ?, resume = ?, job_title = ?, job_description = ?,
         job_url = ?, person_key = ?, person_name = ?, revision = revision + 1
     WHERE id = ? AND user_id = ? AND revision = ?`
  ).run(
    next.report,
    next.score,
    next.resume,
    next.job_title,
    next.job_description,
    next.job_url,
    personKey,
    personName,
    req.params.id,
    req.user.id,
    row.revision
  );

  const updated = db
    .prepare("SELECT * FROM evaluations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  res.json(updated);
});

router.delete("/evaluations/:id", (req, res) => {
  db.prepare("DELETE FROM evaluations WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.user.id
  );
  res.json({ ok: true });
});

// 收藏 / 取消收藏（收藏的记录不会被自动清理）
router.put("/evaluations/:id/favorite", (req, res) => {
  const favorite = req.body?.favorite ? 1 : 0;
  const info = db
    .prepare("UPDATE evaluations SET favorite = ? WHERE id = ? AND user_id = ?")
    .run(favorite, req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: "记录不存在" });
  res.json({ ok: true, favorite: !!favorite });
});

// 生成 / 更新只读分享链接
router.post("/evaluations/:id/share", (req, res) => {
  const row = db
    .prepare("SELECT * FROM evaluations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "记录不存在" });
  const hideContact = req.body?.hideContact ? 1 : 0;
  // 简历原文默认不分享，需显式勾选（避免过度暴露教育/项目经历）
  const includeResume = req.body?.includeResume ? 1 : 0;
  const hideName = req.body?.hideName ? 1 : 0;
  const ttlDays = Number(process.env.SHARE_TTL_DAYS || 30);
  const token = row.share_token || crypto.randomBytes(12).toString("hex");
  db.prepare(
    `UPDATE evaluations
     SET share_token = ?, share_hide_contact = ?, share_include_resume = ?, share_hide_name = ?,
         share_expires_at = datetime('now', ?)
     WHERE id = ? AND user_id = ?`
  ).run(token, hideContact, includeResume, hideName, `+${ttlDays} days`, req.params.id, req.user.id);

  const expiresAt = db
    .prepare("SELECT share_expires_at FROM evaluations WHERE id = ?")
    .get(req.params.id)?.share_expires_at;
  res.json({
    ok: true,
    token,
    hideContact: !!hideContact,
    includeResume: !!includeResume,
    hideName: !!hideName,
    expiresAt,
  });
});

// 取消分享
router.delete("/evaluations/:id/share", (req, res) => {
  const info = db
    .prepare("UPDATE evaluations SET share_token = NULL WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: "记录不存在" });
  res.json({ ok: true });
});

export default router;
