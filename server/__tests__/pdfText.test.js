import { describe, it, expect } from "vitest";
import { reconstructPageText } from "../core/pdfText.js";

// 构造一个文字块：str + 坐标（transform[4]=x, [5]=y）+ 宽度
function item(str, x, y, w = 10, h = 10) {
  return { str, transform: [h, 0, 0, h, x, y], width: w, height: h };
}

describe("PDF 阅读顺序重建", () => {
  it("按 y 分行、x 排序，修正文字层乱序", () => {
    // 视觉顺序应为 内容A → 标题 → 内容B，但输入顺序被打乱（标题在最后）
    const items = [item("内容A", 10, 100), item("内容B", 10, 80), item("标题", 10, 90)];
    expect(reconstructPageText(items).split("\n")).toEqual(["内容A", "标题", "内容B"]);
  });

  it("同一行按 x 从左到右，并按间隙补空格", () => {
    const items = [item("男", 200, 100), item("姓名", 10, 100), item("唐明宇", 60, 100)];
    expect(reconstructPageText(items)).toBe("姓名 唐明宇 男");
  });

  it("忽略空白块与空数组", () => {
    expect(reconstructPageText([])).toBe("");
    expect(reconstructPageText([item("  ", 0, 0), item("甲", 0, 10)])).toBe("甲");
  });

  it("z-index 型乱序（标题被画到最后）也能恢复", () => {
    // 模拟：正文两行在前、标题在文字层最后，但标题 y 在中间
    const items = [item("第一段", 10, 100), item("第二段", 10, 80), item("小节标题", 10, 90)];
    const lines = reconstructPageText(items).split("\n");
    expect(lines[1]).toBe("小节标题");
  });
});
