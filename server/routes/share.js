import { Router } from "express";
import db from "../core/db.js";

const router = Router();

// 联系方式打码（手机号 / 邮箱）
export function maskContacts(text) {
  return String(text || "")
    .replace(/1[3-9]\d{9}/g, (m) => `${m.slice(0, 3)}****${m.slice(-4)}`)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, (m) => {
      const [name, domain = ""] = m.split("@");
      return `${name.slice(0, 1)}***@${domain.replace(/^[^.]+/, "***")}`;
    });
}

// 只读分享（公开，无需登录）
router.get("/share/:token", (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) return res.status(404).json({ code: 1004, error: "分享不存在" });

  const row = db.prepare("SELECT * FROM evaluations WHERE share_token = ?").get(token);
  if (!row) return res.status(404).json({ code: 1004, error: "分享不存在或已取消" });

  let report = row.report || "";
  let resume = row.resume || "";
  if (row.share_hide_contact) {
    report = maskContacts(report);
    resume = maskContacts(resume);
  }

  let objective = null;
  if (row.objective_json) {
    try {
      objective = JSON.parse(row.objective_json);
    } catch {
      objective = null;
    }
  }

  res.json({
    job_title: row.job_title,
    score: row.score,
    report,
    resume,
    objective,
    person_name: row.person_name,
    created_at: row.created_at,
    hideContact: !!row.share_hide_contact,
  });
});

export default router;
