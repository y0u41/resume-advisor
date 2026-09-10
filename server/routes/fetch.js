import { Router } from "express";
import * as cheerio from "cheerio";
import dns from "dns/promises";
import net from "net";

const router = Router();

const MAX_LEN = 20000;
const MAX_REDIRECTS = 5;

function isPrivateIPv4(ip) {
  const [a, b] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true; // 组播/保留
  return false;
}

function isPrivateIPv6(ip) {
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // fc00::/7
  if (v.startsWith("fe80")) return true; // 链路本地
  if (v.startsWith("ff")) return true; // 组播
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

router.post("/fetch-url", async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "请提供有效的 http/https 网址" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const { resp, finalUrl } = await fetchWithValidation(url, controller.signal);

    if (!resp.ok) {
      return res.status(502).json({ error: `目标网页返回 ${resp.status}，请手动复制内容` });
    }

    const html = await resp.text();
    const $ = cheerio.load(html);
    $("script, style, noscript, iframe, svg, header, footer, nav, form, button").remove();

    const title = $("title").text().trim();
    let text = $("body").text();
    text = text
      .replace(/[ \t\u00a0]+/g, " ")
      .replace(/\n\s*\n\s*\n+/g, "\n\n")
      .trim();

    if (text.length > MAX_LEN) text = text.slice(0, MAX_LEN);

    if (!text) {
      return res
        .status(422)
        .json({ error: "未能从该网页提取到文字（可能是动态加载或需要登录），请手动复制" });
    }

    res.json({ title, text, length: text.length, url: finalUrl });
  } catch (error) {
    const msg = error.name === "AbortError" ? "请求超时" : error.message;
    res.status(400).json({ error: "抓取失败：" + msg + "，请手动复制内容" });
  } finally {
    clearTimeout(timer);
  }
});

export default router;
