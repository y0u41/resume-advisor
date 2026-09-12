import { Router } from "express";
import { userMessage } from "../http/userMessages.js";
import * as cheerio from "cheerio";
import dns from "dns/promises";
import net from "net";
import { extractJobInfo } from "../llm/llm.js";
import { requireAuth } from "../core/auth.js";

const router = Router();
router.use(requireAuth);

const MAX_LEN = 20000;
const EXTRACT_MAX_LEN = 6000;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 15000;

// 常见噪声元素：导航、页脚、广告、推荐、评论等
const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "header",
  "footer",
  "nav",
  "form",
  "button",
  "aside",
  '[class*="sidebar"]',
  '[class*="recommend"]',
  '[class*="related"]',
  '[class*="comment"]',
  '[class*="breadcrumb"]',
  '[class*="copyright"]',
  '[class*="footer"]',
  '[class*="advert"]',
  '[class*="banner"]',
  '[class*="popup"]',
  '[class*="modal"]',
  '[class*="hot-job"]',
  '[class*="hotjob"]',
  '[class*="guess"]',
].join(",");

function isPrivateIPv4(ip) {
  const [a, b] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(ip) {
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("fc") || v.startsWith("fd")) return true;
  if (v.startsWith("fe80")) return true;
  if (v.startsWith("ff")) return true;
  if (v.startsWith("::ffff:")) {
    const v4 = v.slice(7);
    if (net.isIPv4(v4)) return isPrivateIPv4(v4);
  }
  return false;
}

async function assertPublicUrl(urlStr) {
  let u;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error("无效的网址");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("仅支持 http/https 网址");
  }

  const host = u.hostname;
  let addresses;
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    addresses = (await dns.lookup(host, { all: true })).map((a) => a.address);
  }

  for (const addr of addresses) {
    if (net.isIPv4(addr) && isPrivateIPv4(addr)) throw new Error("禁止访问内网地址");
    if (net.isIPv6(addr) && isPrivateIPv6(addr)) throw new Error("禁止访问内网地址");
  }
}

async function fetchWithValidation(startUrl, signal) {
  let current = startUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertPublicUrl(current);
    const resp = await fetch(current, {
      signal,
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      const location = resp.headers.get("location");
      if (!location) throw new Error("重定向缺少目标地址");
      current = new URL(location, current).toString();
      continue;
    }

    return { resp, finalUrl: current };
  }
  throw new Error("重定向次数过多");
}

function pickContentRoot($) {
  const candidates = [
    "main",
    "article",
    '[class*="job-detail"]',
    '[class*="jobdetail"]',
    '[class*="job-desc"]',
    '[class*="jobdesc"]',
    '[class*="job-content"]',
    '[class*="jobcontent"]',
    '[class*="jobDescription"]',
    '[class*="position-detail"]',
    '[class*="positiondetail"]',
    '[id*="job-detail"]',
    '[id*="jobDetail"]',
  ];

  let best = null;
  let bestLen = 0;
  for (const sel of candidates) {
    $(sel).each((_, el) => {
      const len = $(el).text().trim().length;
      if (len > bestLen) {
        bestLen = len;
        best = el;
      }
    });
  }
  if (best && bestLen > 200) return $(best);
  return $("body");
}

function extractReadableText(html) {
  const $ = cheerio.load(html);
  $(NOISE_SELECTORS).remove();

  const title = $("title").text().trim();
  const root = pickContentRoot($);

  let text = root.text();
  text = text
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();

  if (text.length > MAX_LEN) text = text.slice(0, MAX_LEN);
  return { title, text };
}

// 去除表情符号/控制字符等噪声，降低触发内容审核的概率
function sanitizeForLLM(text) {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}]/gu, " ")
    .replace(/[\u{2600}-\u{27BF}]/gu, " ")
    .replace(/[\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, " ")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

router.post("/fetch-url", async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "请提供有效的 http/https 网址" });
  }

  const reqController = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) reqController.abort();
  });

  // 1) 抓取网页（15 秒超时）
  const fetchController = new AbortController();
  const timer = setTimeout(() => fetchController.abort(), FETCH_TIMEOUT_MS);
  let html = "";
  let finalUrl = url;

  try {
    const { resp, finalUrl: fu } = await fetchWithValidation(url, fetchController.signal);
    finalUrl = fu;
    if (!resp.ok) {
      return res.status(502).json({ error: `目标网页返回 ${resp.status}，请手动复制内容` });
    }
    html = await resp.text();
  } catch (error) {
    const msg = error.name === "AbortError" ? "请求超时" : userMessage(error);
    return res.status(400).json({ error: "抓取失败：" + msg + "，请手动复制内容" });
  } finally {
    clearTimeout(timer);
  }

  // 2) 清洗为可读文本
  const { title, text } = extractReadableText(html);
  if (!text) {
    return res
      .status(422)
      .json({ error: "未能从该网页提取到文字（可能是动态加载或需要登录），请手动复制" });
  }

  // 3) 智能提取岗位重点信息（失败则回退为原始文本）
  let jd = "";
  if (process.env.JD_EXTRACT !== "false") {
    const extractInput = sanitizeForLLM(text).slice(0, EXTRACT_MAX_LEN);
    try {
      jd = await extractJobInfo(extractInput, reqController.signal);
    } catch (error) {
      // 若因内容审核失败，用更短的片段再试一次
      if (/Risk/i.test(error.message)) {
        try {
          jd = await extractJobInfo(extractInput.slice(0, 2000), reqController.signal);
        } catch (e2) {
          console.warn("JD 智能提取失败，回退原始文本:", e2.message);
        }
      } else {
        console.warn("JD 智能提取失败，回退原始文本:", error.message);
      }
    }
  }

  if (reqController.signal.aborted) return;

  const finalText = jd || text;
  res.json({
    title,
    text: finalText,
    rawLength: text.length,
    length: finalText.length,
    extracted: Boolean(jd),
    url: finalUrl,
  });
});

export default router;
