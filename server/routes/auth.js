import { Router } from "express";
import db from "../db.js";
import {
  hashPassword,
  verifyPassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} from "../auth.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

router.post("/auth/register", (req, res) => {
  if (process.env.REGISTRATION_OPEN === "false") {
    return res.status(403).json({ error: "当前未开放注册" });
  }

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "请填写邮箱和密码" });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "邮箱格式不正确" });
  if (String(password).length < MIN_PASSWORD) {
    return res.status(400).json({ error: `密码至少 ${MIN_PASSWORD} 位` });
  }

  const normalized = email.trim().toLowerCase();
  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(normalized);
  if (exists) return res.status(409).json({ error: "该邮箱已注册" });

  const info = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run(normalized, hashPassword(String(password)));

  // 首个注册用户继承升级前遗留的本地数据（user_id 为空的历史评估）
  const userCount = db.prepare("SELECT COUNT(*) c FROM users").get().c;
  if (userCount === 1) {
    db.prepare("UPDATE evaluations SET user_id = ? WHERE user_id IS NULL").run(
      info.lastInsertRowid
    );
  }

  const user = { id: info.lastInsertRowid, email: normalized };
  setAuthCookie(res, signToken(user));
  res.json({ user });
});

router.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "请填写邮箱和密码" });

  const normalized = email.trim().toLowerCase();
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(normalized);
  if (!row || !verifyPassword(String(password), row.password_hash)) {
    return res.status(401).json({ error: "邮箱或密码错误" });
  }

  setAuthCookie(res, signToken(row));
  res.json({ user: { id: row.id, email: row.email } });
});

router.post("/auth/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get("/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
