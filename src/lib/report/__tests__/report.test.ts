import { describe, it, expect } from "vitest";
import {
  parseReport,
  parseMatchItems,
  sectionIcon,
  matchRate,
  KNOWN_SECTIONS,
} from "../report";

// 一份「标准 9 节」报告（按 server/llm/prompt.js 的固定格式）
const FULL = `【总分】7 / 10 分

【一句话结论】
简历整体不错，但项目经历需要更量化。

【岗位匹配对照】
✅ | React | 有 3 年项目经验
⚠️ | TypeScript | 有使用但未深入
❌ | 性能优化 | 简历未提及

【三大优点】
1. 项目经验丰富
2. 技术栈与岗位匹配

【问题清单】
1. 缺少量化数据

【逐条改法】
1. 把「提升了性能」改为「首屏加载从 3s 降到 1.2s」

【AI修改建议】
补充量化指标与团队协作描述。

【关键词补齐】
React、TypeScript、性能优化

【可继续增强的方向】
①技能学习 ②项目补强 ③加分项`;

describe("parseReport：分节解析", () => {
  it("样本1 完整 9 节 → 9 节，标题与顺序与 KNOWN_SECTIONS 一致", () => {
    const s = parseReport(FULL);
    expect(s.length).toBe(9);
    expect(s.map((x) => x.title)).toEqual(KNOWN_SECTIONS);
  });

  it("样本2 内容切分正确：不含下一节标题，且保留本节文字", () => {
    const s = parseReport(FULL);
    const conclusion = s.find((x) => x.title === "一句话结论");
    expect(conclusion?.content).toContain("项目经历需要更量化");
    expect(conclusion?.content).not.toContain("岗位匹配对照");
    const score = s.find((x) => x.title === "总分");
    expect(score?.content).toContain("7 / 10");
  });

  it("样本3 缺节：只给 3 节 → 解析出 3 节（降级但可用）", () => {
    const s = parseReport("【总分】6 / 10\n【一句话结论】还行\n【问题清单】1. 无量化");
    expect(s.map((x) => x.title)).toEqual(["总分", "一句话结论", "问题清单"]);
  });

  it("样本4 标题带空格【 总分 】→ 仍识别为「总分」", () => {
    const s = parseReport("【 总分 】8 / 10\n【 一句话结论 】不错");
    expect(s.map((x) => x.title)).toEqual(["总分", "一句话结论"]);
  });

  it("样本5 标题带附加说明【总分（满分10）】→ 归一为「总分」", () => {
    const s = parseReport("【总分（满分 10 分）】9 / 10");
    expect(s[0].title).toBe("总分");
    expect(s[0].content).toContain("9 / 10");
  });

  it("样本6 标题漂移【结论】→ 归一为「一句话结论」", () => {
    const s = parseReport("【结论】整体尚可");
    expect(s[0].title).toBe("一句话结论");
  });

  it("样本7 纯文本无【】→ 0 节（完全降级，不抛错）", () => {
    expect(() => parseReport("这是一份没有任何分节标记的纯文本报告。")).not.toThrow();
    expect(parseReport("这是一份没有任何分节标记的纯文本报告。")).toEqual([]);
  });

  it("样本8 空字符串 → 0 节，不抛错", () => {
    expect(parseReport("")).toEqual([]);
  });

  it("样本9 只有未知节【优化后示范】→ 0 节（未匹配已知节）", () => {
    expect(parseReport("【优化后示范】张三 前端工程师")).toEqual([]);
  });

  it("样本10 未知节夹在中间 → 被并入前一节内容（记录当前行为）", () => {
    const s = parseReport("【AI修改建议】补充量化。\n\n【优化后示范】张三\n技能：React");
    expect(s.length).toBe(1);
    expect(s[0].title).toBe("AI修改建议");
    expect(s[0].content).toContain("优化后示范");
    expect(s[0].content).toContain("技能：React");
  });

  it("样本11 超长报告（重复 9 节）→ 节数正确且不抛错", () => {
    const long = Array.from({ length: 20 }, () => FULL).join("\n\n");
    const s = parseReport(long);
    expect(s.length).toBeGreaterThanOrEqual(9);
    expect(() => parseReport(long)).not.toThrow();
  });

  it("样本12 正文含【】但非节标题 → 不误判为节", () => {
    const s = parseReport("【总分】7 / 10\n说明里写了【重点】两个字");
    expect(s.length).toBe(1);
    expect(s[0].content).toContain("【重点】");
  });
});

describe("parseMatchItems：岗位匹配行解析", () => {
  it("样本13 三种状态 + 三段式 → 3 项，字段正确", () => {
    const items = parseMatchItems("✅ | React | 有 3 年经验\n⚠️ | TypeScript | 未深入\n❌ | 性能优化 | 未提及");
    expect(items).toEqual([
      { status: "ok", req: "React", detail: "有 3 年经验" },
      { status: "partial", req: "TypeScript", detail: "未深入" },
      { status: "miss", req: "性能优化", detail: "未提及" },
    ]);
  });

  it("样本14 表头与分隔线被跳过", () => {
    const items = parseMatchItems("| 状态 | 要求 | 说明 |\n|---|---|---|\n✅ | React | 有");
    expect(items.length).toBe(1);
    expect(items[0].req).toBe("React");
  });

  it("样本15 无状态标记的行被跳过", () => {
    expect(parseMatchItems("React | 有\n这只是普通文字")).toEqual([]);
  });

  it("样本16 前导 - / * / • 被剥离", () => {
    const items = parseMatchItems("- ✅ | A | x\n* ⚠️ | B | y\n• ❌ | C | z");
    expect(items.map((i) => i.status)).toEqual(["ok", "partial", "miss"]);
  });

  it("样本17 多列 detail 合并为空格分隔", () => {
    const items = parseMatchItems("✅ | 经验年限 | 3 年 | 满足要求");
    expect(items[0]).toEqual({ status: "ok", req: "经验年限", detail: "3 年 满足要求" });
  });

  it("样本18 缺 | 只有状态与文字 → req 取文字，detail 为空", () => {
    const items = parseMatchItems("✅ React 经验丰富");
    expect(items[0].status).toBe("ok");
    expect(items[0].req).toBe("React 经验丰富");
    expect(items[0].detail).toBe("");
  });
});

describe("matchRate / sectionIcon", () => {
  it("样本19 matchRate：全 ok=100、全 miss=0、空=0、混合=50", () => {
    expect(matchRate(parseMatchItems("✅ | a\n✅ | b"))).toBe(100);
    expect(matchRate(parseMatchItems("❌ | a\n❌ | b"))).toBe(0);
    expect(matchRate([])).toBe(0);
    expect(matchRate(parseMatchItems("✅ | a\n⚠️ | b\n❌ | c"))).toBe(50);
  });

  it("样本20 sectionIcon：已知节有专属图标，未知节回退 📌", () => {
    expect(sectionIcon("总分")).toBe("🎯");
    expect(sectionIcon("一句话结论")).toBe("💡");
    expect(sectionIcon("可继续增强的方向")).toBe("🚀");
    expect(sectionIcon("未知节")).toBe("📌");
  });
});
