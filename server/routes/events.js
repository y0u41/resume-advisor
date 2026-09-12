import { Router } from "express";
import { requireAuth } from "../core/auth.js";
import { logEvent, EVENT_NAMES } from "../core/events.js";

const router = Router();

// 前端上报事件（报告读完 / 追问 / 下载等）
router.post("/events", requireAuth, (req, res) => {
  const { name, meta } = req.body || {};
  if (!name || typeof name !== "string") {
    return res.status(400).json({ code: 1001, error: "缺少事件名" });
  }
  // 仅接受白名单事件，避免脏数据
  if (!EVENT_NAMES.includes(name)) {
    return res.json({ ok: true, ignored: true });
  }
  logEvent(req.user.id, name, meta);
  res.json({ ok: true });
});

export default router;
