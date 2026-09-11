import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../auth.js";

const router = Router();
router.use(requireAuth);

// 记录一次下载/导出（由前端在生成文件后调用）
router.post("/downloads", (req, res) => {
  const { kind, title, format } = req.body || {};
  if (!kind || typeof kind !== "string") {
    return res.status(400).json({ code: 1001, error: "缺少 kind" });
  }
  const info = db
    .prepare("INSERT INTO downloads (user_id, kind, title, format) VALUES (?, ?, ?, ?)")
    .run(
      req.user.id,
      String(kind).slice(0, 40),
      String(title || "").slice(0, 200),
      String(format || "").slice(0, 20)
    );
  res.json({ ok: true, id: info.lastInsertRowid });
});

// 下载历史（最近 100 条）
router.get("/downloads", (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, kind, title, format, created_at FROM downloads WHERE user_id = ? ORDER BY id DESC LIMIT 100"
    )
    .all(req.user.id);
  res.json({ downloads: rows });
});

export default router;
