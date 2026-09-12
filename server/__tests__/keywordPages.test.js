import { describe, it, expect } from "vitest";
import {
  renderKeywordsIndex,
  renderCategoryPage,
  renderSitemap,
} from "../seo/keywordPages.js";

function makeLib({ totalJds, categories }) {
  return {
    updatedAt: "2026-09-12",
    totalJds,
    totalKeywords: categories.reduce((n, c) => n + c.keywords.length, 0),
    siteReady: totalJds >= 20,
    thresholds: { minJd: 5, minKeywords: 10, minTotalJd: 20 },
    categories,
    topKeywords: [],
  };
}

const pub = {
  slug: "frontend",
  label: "前端开发",
  jdCount: 12,
  keywords: [{ word: "React", count: 3 }],
  publishable: true,
};
const thin = {
  slug: "backend",
  label: "后端开发",
  jdCount: 1,
  keywords: [{ word: "Java", count: 1 }],
  publishable: false,
};

describe("岗位关键词库 SEO（冷启动保护）", () => {
  it("全站数据不足：索引页 noindex、无分类链接", () => {
    const html = renderKeywordsIndex(makeLib({ totalJds: 3, categories: [thin] }));
    expect(html).toContain("noindex");
    expect(html).toContain("正在积累");
    expect(html).not.toContain('href="/keywords/backend"');
  });

  it("数据足够：索引页 index、只链可发布分类", () => {
    const html = renderKeywordsIndex(makeLib({ totalJds: 30, categories: [pub, thin] }));
    expect(html).toContain('content="index,follow"');
    expect(html).toContain('href="/keywords/frontend"');
    expect(html).not.toContain('href="/keywords/backend"');
    expect(html).toContain("另有 1 个方向");
  });

  it("未达门槛的分类页：noindex + 积累中", () => {
    const html = renderCategoryPage(thin, makeLib({ totalJds: 30, categories: [pub, thin] }));
    expect(html).toContain("noindex");
    expect(html).toContain("正在积累");
    expect(html).not.toContain('class="tags"');
  });

  it("达门槛的分类页：index + 关键词标签", () => {
    const html = renderCategoryPage(pub, makeLib({ totalJds: 30, categories: [pub, thin] }));
    expect(html).toContain('content="index,follow"');
    expect(html).toContain("React");
  });

  it("sitemap：数据不足不含 /keywords；足够时只含可发布分类", () => {
    const notReady = renderSitemap(makeLib({ totalJds: 3, categories: [thin] }));
    expect(notReady).not.toContain("/keywords</loc>");
    const ready = renderSitemap(makeLib({ totalJds: 30, categories: [pub, thin] }));
    expect(ready).toContain("/keywords</loc>");
    expect(ready).toContain("/keywords/frontend</loc>");
    expect(ready).not.toContain("/keywords/backend</loc>");
  });
});
