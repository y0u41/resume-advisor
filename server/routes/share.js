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

// 姓名打码（保留首字，固定用 ** 结尾，不泄露长度）
function maskName(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  return n.slice(0, 1) + "**";
}

// 将文本中的姓名替换为打码形式
function maskNameIn(text, name) {
  const n = String(name || "").trim();
  if (!n) return text;
  return String(text || "").split(n).join(maskName(n));
}

// 只读分享（公开，无需登录）
router.get("/share/:token", (req, res) => {
  // 分享内容不参与搜索引擎索引
  res.setHeader("X-Robots-Tag", "noindex, nofollow");

  const token = String(req.params.token || "").trim();
  if (!token) return res.status(404).json({ code: 1004, error: "分享不存在" });

  const row = db.prepare("SELECT * FROM evaluations WHERE share_token = ?").get(token);
  if (!row) return res.status(404).json({ code: 1004, error: "分享不存在或已取消" });

  // 过期检查（默认 30 天）
  if (row.share_expires_at) {
    const expired = db
      .prepare("SELECT (? <= datetime('now')) AS e")
      .get(row.share_expires_at).e;
    if (expired) return res.status(404).json({ code: 1004, error: "分享链接已过期" });
  }

  let report = row.report || "";
  if (row.share_hide_contact) report = maskContacts(report);

  // 简历原文默认不分享，仅在显式勾选时返回（并视配置打码）
  let resume;
  if (row.share_include_resume) {
    resume = row.share_hide_contact ? maskContacts(row.resume || "") : row.resume || "";
  }

  // 隐藏姓名（保留首字），并同步打码报告/原文中出现的姓名
  let personName = row.person_name || "";
  if (row.share_hide_name && personName) {
    report = maskNameIn(report, row.person_name);
    if (resume) resume = maskNameIn(resume, row.person_name);
    personName = maskName(row.person_name);
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
    person_name: personName,
    created_at: row.created_at,
    hideContact: !!row.share_hide_contact,
    includeResume: !!row.share_include_resume,
    hideName: !!row.share_hide_name,
    expiresAt: row.share_expires_at || null,
  });
});

export default router;
