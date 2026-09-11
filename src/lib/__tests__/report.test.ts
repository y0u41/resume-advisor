import { describe, it, expect } from "vitest";
import { parseReport, parseMatchItems, matchRate, sectionIcon } from "../report/report";

describe("parseReport", () => {
  it("只识别已知章节，忽略正文中的占位符【】", () => {
    const report = [
      "【总分】3 / 10 分",
      "【一句话结论】结论内容",
      "【问题清单】",
      "1. 【公司全称】这里有问题",
    ].join("\n");
    const sections = parseReport(report);
    expect(sections.map((s) => s.title)).toEqual(["总分", "一句话结论", "问题清单"]);
    expect(sections[2].content).toContain("【公司全称】");
  });

  it("正文含【】占位符不会被误切成假章节", () => {
    const report = "【逐条改法】改之前：【公司全称】改成【行业】";
    const sections = parseReport(report);
    expect(sections.length).toBe(1);
    expect(sections[0].title).toBe("逐条改法");
  });

  it("识别新增章节", () => {
    const report = "【AI修改建议】建议A\n【可继续增强的方向】方向B";
    const sections = parseReport(report);
    expect(sections.map((s) => s.title)).toEqual(["AI修改建议", "可继续增强的方向"]);
  });

  it("无章节时返回空数组", () => {
    expect(parseReport("随便一段没有标题的文字")).toEqual([]);
  });
});

describe("parseMatchItems", () => {
  it("解析 markdown 表格行", () => {
    const content = [
      "| 匹配标记 | 要求原文 | 简历对应情况 |",
      "| --- | --- | --- |",
      "| ✅ | 熟悉Java | 简历写了Java |",
      "| ❌ | 熟悉Redis | 简历未提及 |",
    ].join("\n");
    const items = parseMatchItems(content);
    expect(items.length).toBe(2);
    expect(items[0]).toMatchObject({ status: "ok", req: "熟悉Java", detail: "简历写了Java" });
    expect(items[1]).toMatchObject({ status: "miss", req: "熟悉Redis" });
  });

  it("解析管道分隔的普通行", () => {
    const items = parseMatchItems("⚠️ | 3年经验 | 证据不足");
    expect(items[0]).toMatchObject({ status: "partial", req: "3年经验", detail: "证据不足" });
  });

  it("标记与内容连写也能解析", () => {
    const items = parseMatchItems("✅ 熟悉Spring Boot | 技能栏有写");
    expect(items[0]).toMatchObject({ status: "ok", req: "熟悉Spring Boot" });
  });

  it("忽略表头与分隔行", () => {
    const items = parseMatchItems("| 标记 | 要求 | 情况 |\n| --- | --- | --- |");
    expect(items.length).toBe(0);
  });
});

describe("matchRate", () => {
  it("✅=1 分、⚠️=0.5 分", () => {
    const items = [
      { status: "ok", req: "", detail: "" },
      { status: "partial", req: "", detail: "" },
      { status: "miss", req: "", detail: "" },
    ];
    expect(matchRate(items as any)).toBe(50);
  });

  it("空数组为 0", () => {
    expect(matchRate([])).toBe(0);
  });
});

describe("sectionIcon", () => {
  it("返回对应图标", () => {
    expect(sectionIcon("总分")).toBe("🎯");
    expect(sectionIcon("AI修改建议")).toBe("🤖");
  });

  it("未知章节返回默认图标", () => {
    expect(sectionIcon("未知章节")).toBe("📌");
  });
});
