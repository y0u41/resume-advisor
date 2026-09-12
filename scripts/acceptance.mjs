// 黑盒端到端验收：真实 HTTP + 临时库 + 随机端口，无需常驻服务、无需 LLM Key。
// 运行：npm run acceptance
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

const PORT = 3100 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;
const DB_PATH = path.join(os.tmpdir(), `resume-accept-${crypto.randomUUID()}.db`);

let passed = 0;
let failed = 0;

function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    console.log(`  \u2717 ${name}  ${extra}`);
  }
}

const server = spawn(process.execPath, ["server/index.js"], {
  cwd: path.resolve("."),
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: "127.0.0.1",
    DB_PATH,
    AUTH_SECRET: "acceptance-secret",
    LOG_REQUESTS: "false",
    REGISTRATION_OPEN: "true",
    COOKIE_SECURE: "false",
    DEEPSEEK_API_KEY: "dummy",
    DEEPSEEK_BASE_URL: "http://127.0.0.1:9",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch {
      // 尚未启动
    }
    await sleep(200);
  }
  return false;
}

function cookieFrom(res) {
  const set = res.headers.get("set-cookie") || "";
  const m = set.match(/token=[^;]+/);
  return m ? m[0] : "";
}

function jsonHeaders(cookie) {
  const h = { "Content-Type": "application/json" };
  if (cookie) h.Cookie = cookie;
  return h;
}

async function main() {
  const up = await waitForServer();
  check("服务器启动 /api/health", up);
  if (!up) {
    console.log(serverLog);
    server.kill();
    process.exit(1);
  }

  // 1. 404 信封 + requestId
  const r404 = await fetch(`${BASE}/api/definitely-not-exist`);
  const b404 = await r404.json();
  check("404 信封 code=1004 + requestId", r404.status === 404 && b404.code === 1004 && !!b404.requestId, JSON.stringify(b404));
  check("响应头 X-Request-Id", !!r404.headers.get("x-request-id"));

  // 2. 注册
  const email = `accept_${Date.now()}@example.com`;
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password: "secret123" }),
  });
  const regB = await reg.json();
  const cookie = cookieFrom(reg);
  check("注册成功 + 信封 code=0", reg.status === 200 && regB.code === 0 && !!regB.user, JSON.stringify(regB));
  check("注册下发 Cookie", !!cookie);

  // 3. 重复注册
  const dup = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password: "secret123" }),
  });
  check("重复注册 code=2002", dup.status === 409 && (await dup.json()).code === 2002);

  // 4. 错误密码
  const bad = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ account: email, password: "wrong-password" }),
  });
  check("错误密码 code=2001", bad.status === 401 && (await bad.json()).code === 2001);

  // 5. me / models
  const me = await (await fetch(`${BASE}/api/auth/me`, { headers: { Cookie: cookie } })).json();
  check("/auth/me 返回用户", me.user?.email === email);
  const models = await (await fetch(`${BASE}/api/models`, { headers: { Cookie: cookie } })).json();
  check("/api/models 返回 providers", Array.isArray(models.providers));

  // 6. 结构化简历校验
  const okV = await (
    await fetch(`${BASE}/api/resume/validate`, {
      method: "POST",
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ resumeContent: { basics: { name: "张三" } } }),
    })
  ).json();
  check("结构化校验：合法", okV.ok === true && okV.content?.basics?.name === "张三");
  const badV = await (
    await fetch(`${BASE}/api/resume/validate`, {
      method: "POST",
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ resumeContent: { basics: {} } }),
    })
  ).json();
  check("结构化校验：缺姓名报错", badV.ok === false && badV.errors?.length > 0);

  // 7. 下载历史
  await fetch(`${BASE}/api/downloads`, {
    method: "POST",
    headers: jsonHeaders(cookie),
    body: JSON.stringify({ kind: "report", title: "测试岗位", format: "pdf" }),
  });
  const dls = await (await fetch(`${BASE}/api/downloads`, { headers: { Cookie: cookie } })).json();
  check("下载记录写入/读取", dls.downloads?.length === 1 && dls.downloads[0].title === "测试岗位");

  // 8. 账号注销流程
  const del = await (await fetch(`${BASE}/api/account/delete`, { method: "POST", headers: { Cookie: cookie } })).json();
  check("申请注销返回冷静期", !!del.pendingDeletion?.purgeAfter);
  const st = await (await fetch(`${BASE}/api/account/status`, { headers: { Cookie: cookie } })).json();
  check("注销状态可查", !!st.pendingDeletion);
  const cancel = await (await fetch(`${BASE}/api/account/cancel-delete`, { method: "POST", headers: { Cookie: cookie } })).json();
  check("撤销注销", cancel.pendingDeletion === null);

  // 9. 未认证
  const unauth = await fetch(`${BASE}/api/models`);
  check("未认证 code=1002", unauth.status === 401 && (await unauth.json()).code === 1002);

  // 10. 游客试用额度（免登录）
  const gq = await fetch(`${BASE}/api/guest/quota`);
  const gqB = await gq.json();
  check(
    "游客额度接口可用（免登录）",
    gq.status === 200 && gqB.code === 0 && typeof gqB.remaining === "number"
  );

  console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
  server.kill();
  try {
    fs.unlinkSync(DB_PATH);
  } catch {
    // 忽略
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  console.log(serverLog);
  server.kill();
  process.exit(1);
});
