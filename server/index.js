import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { requestId, envelope } from "./http/envelope.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "127.0.0.1";

// 统一请求 ID 与响应信封（渐进式，向后兼容）
app.use(requestId);
app.use(envelope);

// 安全响应头（关闭 upgrade-insecure-requests 与 COEP，避免本地 http 场景出问题）
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

// CORS 白名单（默认仅本地前端）
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // 同源/无 Origin（curl、服务端）放行；白名单内放行；其余不设 CORS 头
      // （不抛错，否则会波及同源带 crossorigin 的资源请求）
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
  })
);

app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

// 请求日志
if (process.env.LOG_REQUESTS !== "false") {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      console.log(
        `${new Date().toISOString()} req=${req.id} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`
      );
    });
    next();
  });
}

// 速率限制
const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "请求过于频繁，请稍后再试" },
});
const heavyLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "操作过于频繁，请稍后再试" },
});
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "尝试过于频繁，请稍后再试" },
});

app.use("/api", generalLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/evaluate", heavyLimiter);
app.use("/api/fetch-url", heavyLimiter);
app.use("/api/parse-file", heavyLimiter);

// 健康检查（供冒烟/验收与探活使用）
app.get("/api/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// 未知 /api 路径直接 404，避免被后续鉴权中间件误判为 401。
// 新增 API 前缀时需同步补充此列表。
const API_PREFIXES = [
  "/auth",
  "/models",
  "/evaluate",
  "/compare",
  "/followup",
  "/interview",
  "/directions",
  "/evaluations",
  "/parse-file",
  "/fetch-url",
  "/admin",
  "/account",
  "/downloads",
  "/resume",
  "/health",
];
app.use("/api", (req, res, next) => {
  const known = API_PREFIXES.some((p) => req.path === p || req.path.startsWith(`${p}/`));
  if (known) return next();
  res.status(404).json({ error: "接口不存在" });
});

import authRoutes from "./routes/auth.js";
import evaluateRoutes from "./routes/evaluate.js";
import parseRoutes from "./routes/parse.js";
import fetchRoutes from "./routes/fetch.js";
import adminRoutes from "./routes/admin.js";
import accountRoutes from "./routes/account.js";
import downloadsRoutes from "./routes/downloads.js";
import { getProviderInfo } from "./llm/llm.js";
import { startPurgeJob } from "./jobs/purge.js";
app.use("/api", authRoutes);
app.use("/api", evaluateRoutes);
app.use("/api", parseRoutes);
app.use("/api", fetchRoutes);
app.use("/api", adminRoutes);
app.use("/api", accountRoutes);
app.use("/api", downloadsRoutes);

// 未匹配的 API 返回 JSON 404，避免被前端静态兜底吞掉
app.use("/api", (req, res) => {
  res.status(404).json({ error: "接口不存在" });
});

// 生产模式：服务前端静态文件（仅当已构建时）
const distPath = path.join(__dirname, "..", "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("/{*path}", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// 统一错误处理（含 multer 文件过大等）
app.use((err, req, res, next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "文件过大，最大支持 10MB" });
  }
  if (err?.name === "MulterError") {
    return res.status(400).json({ error: "文件上传失败：" + err.message });
  }
  if (err?.message === "不允许的来源") {
    return res.status(403).json({ code: 6002, error: "不允许的来源" });
  }
  console.error("未处理错误:", err);
  res.status(500).json({ error: err?.message || "服务器内部错误" });
});

app.listen(PORT, HOST, () => {
  console.log(`服务器运行在 http://${HOST}:${PORT}`);
  startPurgeJob();
  try {
    const { provider, baseUrl, model } = getProviderInfo();
    console.log(`LLM 提供商 = ${provider}`);
    console.log(`LLM 地址 = ${baseUrl}`);
    console.log(`LLM 模型 = ${model}`);
  } catch (err) {
    console.error("LLM 配置错误:", err.message);
  }
});
