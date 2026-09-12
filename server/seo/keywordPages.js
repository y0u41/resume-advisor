// 岗位关键词库的「服务端渲染」SEO 页面。
// 前端是 SPA（客户端渲染），搜索引擎难以索引，故这些公开页直接由服务端输出完整 HTML。
import { CATEGORIES } from "../core/keywordLibrary.js";

const SITE_NAME = "简历参谋";
const SITE_TAGLINE = "贴简历 + 说岗位，AI 给评分、挑问题、给改法";
const BASE_URL = (process.env.SITE_URL || "").replace(/\/+$/, "");

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function abs(path) {
  return BASE_URL ? `${BASE_URL}${path}` : path;
}

const CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#fbfbfc;color:#18181b;font:15px/1.75 "Microsoft YaHei","PingFang SC",-apple-system,BlinkMacSystemFont,sans-serif}
a{color:#18181b}
.wrap{max-width:880px;margin:0 auto;padding:28px 20px 64px}
header.site{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.logo{font-weight:800;font-size:18px;text-decoration:none}
.cta{display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:9px 16px;border-radius:999px;font-size:14px;font-weight:600}
h1{font-size:26px;line-height:1.3;margin:22px 0 8px}
h2{font-size:17px;margin:26px 0 10px}
.lead{color:#52525b;margin:0 0 6px}
.meta{color:#a1a1aa;font-size:13px;margin-top:6px}
.cats{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin:18px 0}
.cat{border:1px solid #e4e4e7;border-radius:14px;padding:14px 16px;background:#fff;text-decoration:none;display:block}
.cat:hover{border-color:#a1a1aa}
.cat b{display:block;font-size:15px;margin-bottom:4px}
.cat span{color:#71717a;font-size:13px}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
.tag{border:1px solid #e4e4e7;background:#fff;border-radius:999px;padding:5px 12px;font-size:13px;text-decoration:none}
.tag em{color:#a1a1aa;font-style:normal;margin-left:6px;font-size:12px}
.crumb{font-size:13px;color:#71717a;margin-top:18px}
footer.site{margin-top:36px;padding-top:18px;border-top:1px solid #e4e4e7;color:#71717a;font-size:13px}
`;

function page({ title, description, canonical, jsonLd, body }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="robots" content="index,follow" />
${canonical ? `<link rel="canonical" href="${esc(canonical)}" />` : ""}
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${esc(SITE_NAME)}" />
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="site">
<a class="logo" href="/">📄 ${esc(SITE_NAME)}</a>
<a class="cta" href="/">免费评估我的简历 →</a>
</header>
${body}
<footer class="site">
<p>${esc(SITE_TAGLINE)}。</p>
<p>本页关键词来自真实岗位 JD 的聚合统计，持续更新，不包含任何个人隐私信息。</p>
</footer>
</div>
</body>
</html>`;
}

function tags(list, slug) {
  return list
    .map(
      (k) =>
        `<a class="tag" href="${esc(abs(`/keywords/${slug}`))}" title="${esc(k.word)}">${esc(
          k.word
        )}<em>${k.count}</em></a>`
    )
    .join("");
}

export function renderKeywordsIndex(lib) {
  const title = `岗位关键词库 · 各行业 JD 高频技能关键词 | ${SITE_NAME}`;
  const description = `汇总真实招聘 JD 的高频技能与要求关键词，覆盖${lib.categories
    .map((c) => c.label)
    .slice(0, 6)
    .join("、")}等 ${lib.categories.length} 个方向，共 ${lib.totalKeywords} 个关键词。`;
  const cats = lib.categories
    .map(
      (c) =>
        `<a class="cat" href="${esc(abs(`/keywords/${c.slug}`))}"><b>${esc(
          c.label
        )}</b><span>${c.jdCount} 份 JD · ${c.keywords.length} 个关键词</span></a>`
    )
    .join("");

  const body = `
<h1>岗位关键词库</h1>
<p class="lead">各行业真实 JD 里最常出现的关键词——写简历、改简历、准备面试时对照查漏补缺。</p>
<p class="meta">共 ${lib.totalJds} 份 JD · ${lib.totalKeywords} 个关键词${
    lib.updatedAt ? ` · 更新于 ${esc(String(lib.updatedAt).slice(0, 10))}` : ""
  }</p>

<h2>按岗位方向浏览</h2>
<div class="cats">${cats}</div>

<h2>全站高频关键词</h2>
<div class="tags">${lib.topKeywords
    .slice(0, 60)
    .map((k) => `<span class="tag">${esc(k.word)}<em>${k.count}</em></span>`)
    .join("")}</div>
`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: abs("/keywords"),
    hasPart: lib.categories.map((c) => ({
      "@type": "ItemList",
      name: `${c.label} 高频关键词`,
      url: abs(`/keywords/${c.slug}`),
      numberOfItems: c.keywords.length,
    })),
  };

  return page({ title, description, canonical: abs("/keywords"), jsonLd, body });
}

export function renderCategoryPage(cat) {
  const title = `${cat.label} 岗位高频关键词（${cat.jdCount} 份 JD 汇总）| ${SITE_NAME}`;
  const description = `${cat.label}方向真实 JD 里最常出现的关键词，共 ${cat.keywords.length} 个：${cat.keywords
    .slice(0, 10)
    .map((k) => k.word)
    .join("、")}。写简历时对照补齐。`;

  const others = CATEGORIES.filter((c) => c.slug !== cat.slug && c.slug !== "other")
    .slice(0, 12)
    .map((c) => `<a class="tag" href="${esc(abs(`/keywords/${c.slug}`))}">${esc(c.label)}</a>`)
    .join("");

  const body = `
<p class="crumb"><a href="${esc(abs("/keywords"))}">岗位关键词库</a> › ${esc(cat.label)}</p>
<h1>${esc(cat.label)} 岗位高频关键词</h1>
<p class="lead">来自 ${cat.jdCount} 份真实 JD 的聚合统计（括号内为出现该词的 JD 数）。</p>

<div class="tags">${tags(cat.keywords, cat.slug)}</div>

<h2>其他岗位方向</h2>
<div class="tags">${others}</div>

<h2>怎么用</h2>
<p class="lead">把上面的关键词和你自己的简历逐条对照：出现在关键词里、简历却没写的，往往是投递这类岗位最该补的点。拿不准就<a href="/">把简历贴进来评估一次</a>，会给出逐条对照与改法。</p>
`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${cat.label} 岗位高频关键词`,
    description,
    url: abs(`/keywords/${cat.slug}`),
    numberOfItems: cat.keywords.length,
    itemListElement: cat.keywords.slice(0, 50).map((k, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: k.word,
    })),
  };

  return page({ title, description, canonical: abs(`/keywords/${cat.slug}`), jsonLd, body });
}

export function renderNotFound() {
  const body = `<h1>页面不存在</h1><p class="lead"><a href="/keywords">返回岗位关键词库</a> 或 <a href="/">去评估简历</a>。</p>`;
  return page({
    title: `页面不存在 | ${SITE_NAME}`,
    description: "页面不存在",
    canonical: "",
    jsonLd: null,
    body,
  });
}

export function renderRobots() {
  return `User-agent: *
Allow: /keywords
Allow: /$
Disallow: /api/
Disallow: /admin
Disallow: /share/
Disallow: /history
Disallow: /account

Sitemap: ${abs("/sitemap.xml")}
`;
}

export function renderSitemap(lib) {
  const urls = [
    { loc: abs("/keywords"), priority: "0.8" },
    ...lib.categories.map((c) => ({ loc: abs(`/keywords/${c.slug}`), priority: "0.7" })),
    { loc: abs("/"), priority: "1.0" },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${esc(u.loc)}</loc><changefreq>daily</changefreq><priority>${u.priority}</priority></url>`
  )
  .join("\n")}
</urlset>
`;
}
