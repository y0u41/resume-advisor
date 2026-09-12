import crypto from "crypto";
import jwt from "jsonwebtoken";
import db from "./db.js";
import { normalizePlan, isPlanExpired } from "./plans.js";

const AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.AUTH_SECRET) {
  console.warn(
    "[auth] 未设置 AUTH_SECRET，已使用临时密钥（服务重启后登录会失效）。生产环境请在 .env 配置。"
  );
}

const TOKEN_TTL = process.env.AUTH_TOKEN_TTL || "7d";
const COOKIE_NAME = "token";
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === test.length && crypto.timingSafeEqual(expected, test);
}

export function signToken(user) {
  return jwt.sign({ uid: user.id, email: user.email }, AUTH_SECRET, { expiresIn: TOKEN_TTL });
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    path: "/",
  };
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

export function getUserFromToken(token) {
  try {
    const payload = jwt.verify(token, AUTH_SECRET);
    const row = db
      .prepare(
        "SELECT id, email, username, role, plan, plan_expires_at, created_at, deleted_at, purge_after FROM users WHERE id = ?"
      )
      .get(payload.uid);
    if (!row) return null;
    // 懒回收：PRO 已过期 → 落库回 free（每账号只写一次，之后 plan 已是 free）
    if (row.role !== "admin" && isPlanExpired(row)) {
      try {
        db.prepare(
          "UPDATE users SET plan = 'free', plan_expires_at = NULL WHERE id = ? AND plan = 'pro'"
        ).run(row.id);
        row.plan = "free";
        row.plan_expires_at = null;
      } catch {
        // 回收失败不影响本次请求，normalizePlan 仍会按 free 处理
      }
    }
    const plan = normalizePlan(row);
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      role: row.role,
      plan,
      planExpiresAt: plan === "pro" && row.role !== "admin" ? row.plan_expires_at || null : null,
      created_at: row.created_at,
      pendingDeletion: row.deleted_at ? { purgeAfter: row.purge_after } : null,
    };
  } catch {
    return null;
  }
}

// 按邮箱或用户名查找用户（大小写不敏感）
export function findUserByAccount(account) {
  const value = String(account || "").trim().toLowerCase();
  if (!value) return null;
  return db
    .prepare(
      "SELECT * FROM users WHERE lower(email) = ? OR lower(username) = ? LIMIT 1"
    )
    .get(value, value);
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const user = token ? getUserFromToken(token) : null;
  if (!user) return res.status(401).json({ error: "请先登录" });
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "需要管理员权限" });
  }
  next();
}
