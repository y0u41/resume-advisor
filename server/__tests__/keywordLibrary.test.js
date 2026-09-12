import { describe, it, expect, beforeAll } from "vitest";

let cleanKeyword, categoryOf, buildLibrary, db;

beforeAll(async () => {
  process.env.DB_PATH = ":memory:";
  ({ cleanKeyword, categoryOf, buildLibrary } = await import("../core/keywordLibrary.js"));
  db = (await import("../core/db.js")).default;
  db.prepare("DELETE FROM jd_keywords").run();
  const ins = db.prepare(
    "INSERT INTO jd_keywords (hash, keywords, job_title, hits) VALUES (?, ?, ?, 1)"
  );
  ins.run(
    "h1",
    JSON.stringify(["React", "TypeScript", "react", "  前端工程化 ", "其他", "沟通能力"]),
    "高级前端开发工程师"
  );
  ins.run("h2", JSON.stringify(["Vue", "React", "CSS"]), "web前端");
  ins.run("h3", JSON.stringify(["Java", "Spring", "MySQL", "1"]), "Java 后端开发");
  ins.run("h4", JSON.stringify(["用户增长", "社群运营", "数据分析"]), "新媒体运营");
});

describe("岗位关键词库", () => {
  it("清洗：去首尾空白、去纯数字/过短、去泛词", () => {
    expect(cleanKeyword("  React  ")).toBe("React");
    expect(cleanKeyword("1")).toBe("");
    expect(cleanKeyword("其他")).toBe("");
    expect(cleanKeyword("—")).toBe("");
    expect(cleanKeyword("沟通能力")).toBe("沟通能力");
  });

  it("归类：按岗位名映射到大类", () => {
    expect(categoryOf("高级前端开发工程师").slug).toBe("frontend");
    expect(categoryOf("Java 后端开发").slug).toBe("backend");
    expect(categoryOf("新媒体运营").slug).toBe("operations");
    expect(categoryOf("未知岗位XYZ").slug).toBe("other");
  });

  it("聚合：跨 JD 统计词频，大小写合并，泛词被剔除", () => {
    const lib = buildLibrary();
    expect(lib.totalJds).toBe(4);
    const fe = lib.categories.find((c) => c.slug === "frontend");
    expect(fe.jdCount).toBe(2);
    const react = fe.keywords.find((k) => k.word.toLowerCase() === "react");
    expect(react.count).toBe(2);
    expect(fe.keywords.some((k) => k.word === "其他")).toBe(false);
    const be = lib.categories.find((c) => c.slug === "backend");
    expect(be.keywords.some((k) => k.word === "1")).toBe(false);
  });

  it("冷启动：数据不足时全站/分类均标记为不可发布", () => {
    const lib = buildLibrary();
    expect(lib.siteReady).toBe(false);
    for (const c of lib.categories) expect(c.publishable).toBe(false);
    expect(lib.thresholds.minTotalJd).toBeGreaterThan(0);
  });
});
