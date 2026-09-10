import "dotenv/config";
import db from "../db.js";
import { hashPassword } from "../auth.js";

const username = (process.argv[2] || process.env.ADMIN_USERNAME || "").trim().toLowerCase();
const password = process.argv[3] || process.env.ADMIN_PASSWORD || "";

if (!username || !password) {
  console.error("用法: npm run create-admin -- <用户名> <密码>");
  process.exit(1);
}
if (password.length < 6) {
  console.error("密码至少 6 位");
  process.exit(1);
}

const email = `${username}@admin.local`;
const hash = hashPassword(password);

const existing = db.prepare("SELECT id FROM users WHERE lower(username) = ?").get(username);

if (existing) {
  db.prepare("UPDATE users SET password_hash = ?, role = 'admin', username = ? WHERE id = ?").run(
    hash,
    username,
    existing.id
  );
  console.log(`已更新管理员账号: ${username}`);
} else {
  const info = db
    .prepare(
      "INSERT INTO users (email, username, password_hash, role) VALUES (?, ?, ?, 'admin')"
    )
    .run(email, username, hash);
  console.log(`已创建管理员账号: ${username} (id=${info.lastInsertRowid})`);
}

console.log("现在可以用该用户名 + 密码登录。");
