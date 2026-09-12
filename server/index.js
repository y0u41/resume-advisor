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

// 反向代理（如 Caddy/Nginx）后必须信任代理，否则 req.ip 全是代理地址，
// 会导致游客限流/速率限制全局串味（第二个游客当天即被判「试用次数已用完」）。
// 默认 0（不信任）：当前生产为 3001 端口**直连**，若信任一层，客户端可伪造
// X-Forwarded-For 无限刷游客试用 → 转化数据（guest_trial→注册）直接失真。
// 部署到反向代理之后时，必须在 .env 显式设 TRUST_PROXY=1。
const TRUST_PROXY = Number(process.env.TRUST_PROXY ?? 0);
app.set("trust proxy", TRUST_PROXY);
if (process.env.TRUST_PROXY === undefined) {
  console.warn(
    "[安全] 未设置 TRUST_PROXY，按直连处理（不信任 X-Forwarded-For）。若部署在反向代理后，请设 TRUST_PROXY=1。"
  );
}

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
const guestLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "操作过于频繁，请稍后再试" },
});

app.use("/api", generalLimiter);
app.use("/api/auth", authLimiter);
app.use("/api/evaluate", heavyLimiter);
app.use("/api/fetch-url", heavyLimiter);
app.use("/api/parse-file", heavyLimiter);
app.use("/api/guest", guestLimiter);

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
  "/guest",
  "/share",
  "/events",
  "/feedback",
  "/keywords",
  "/pro",
  "/quota",
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
import guestRoutes from "./routes/guest.js";
import shareRoutes from "./routes/share.js";
import eventsRoutes from "./routes/events.js";
import feedbackRoutes from "./routes/feedback.js";
import keywordsRoutes from "./routes/keywords.js";
import proRoutes from "./routes/pro.js";
import { getProviderInfo } from "./llm/llm.js";
import { startPurgeJob } from "./jobs/purge.js";
app.use("/api", authRoutes);
// 游客/分享/关键词库路由需在 evaluateRoutes（含全局 requireAuth）之前挂载，否则会被拦成 401
app.use("/api", guestRoutes);
app.use("/api", shareRoutes);
app.use("/api", keywordsRoutes);
app.use("/api", proRoutes);
app.use("/api", evaluateRoutes);
app.use("/api", parseRoutes);
app.use("/api", fetchRoutes);
app.use("/api", adminRoutes);
app.use("/api", accountRoutes);
app.use("/api", downloadsRoutes);
app.use("/api", eventsRoutes);
app.use("/api", feedbackRoutes);

// 未匹配的 API 返回 JSON 404，避免被前端静态兜底吞掉
app.use("/api", (req, res) => {
  res.status(404).json({ error: "接口不存在" });
});

// 公开 SEO 页（服务端渲染，便于搜索引擎索引；SPA 是客户端渲染）
import { buildLibrary } from "./core/keywordLibrary.js";
import {
  renderKeywordsIndex,
  renderCategoryPage,
  renderNotFound,
  renderRobots,
  renderSitemap,
} from "./seo/keywordPages.js";

app.get("/keywords", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.type("html").send(renderKeywordsIndex(buildLibrary()));
});
app.get("/keywords/:slug", (req, res) => {
  const lib = buildLibrary();
  const cat = lib.categories.find((c) => c.slug === req.params.slug);
  if (!cat) return res.status(404).type("html").send(renderNotFound());
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.type("html").send(renderCategoryPage(cat, lib));
});
app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(renderRobots());
});
app.get("/sitemap.xml", (req, res) => {
  res.type("application/xml").send(renderSitemap(buildLibrary()));
});

// 生产模式：服务前端静态文件（仅当已构建时）
const distPath = path.join(__dirname, "..", "dist");
if (fs.existsSync(distPath)) {
  app.use(
    express.static(distPath, {
      setHeaders(res, filePath) {
        // Vite 产物：/assets/ 下的文件名带哈希 → 可长缓存；其余（index.html 等）不缓存
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    })
  );
  app.get("/{*path}", (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    // 分享页不参与搜索引擎索引
    if (req.path.startsWith("/share/")) res.setHeader("X-Robots-Tag", "noindex, nofollow");
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
  // 请求体解析失败等客户端错误：按原状态码返回（如 JSON 格式错误 → 400，而不是 500）
  const status = err?.statusCode || err?.status;
  if (status && status >= 400 && status < 500) {
    return res
      .status(status)
      .json({ code: 1001, error: status === 413 ? "请求体过大" : "请求格式错误" });
  }
  console.error("未处理错误:", err);
  // 不向客户端泄露内部错误细节
  res.status(500).json({ error: "服务器内部错误，请稍后重试" });
});

app.listen(PORT, HOST, () => {
  console.log(`服务器运行在 http://${HOST}:${PORT}`);
  if (process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "true") {
    console.warn(
      "[安全] 生产环境建议启用 HTTPS 并设置 COOKIE_SECURE=true（简历属敏感个人信息，明文 HTTP 存在泄露风险）"
    );
  }
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
