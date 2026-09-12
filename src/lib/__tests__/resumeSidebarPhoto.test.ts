import { describe, it, expect } from "vitest";
import { resumeToHtml, SAMPLE_RESUME } from "../resume/resumeTemplate";

const PHOTO = "data:image/png;base64,AAAA";

describe("左右分栏模板的照片位置", () => {
  it("照片位于姓名/求职意向右侧的 rmain-head 内，且不再出现在左栏", () => {
    const html = resumeToHtml({ ...SAMPLE_RESUME, photo: PHOTO }, "classic", "sidebar");
    const head = html.slice(html.indexOf("rmain-head"), html.indexOf("rsec"));
    expect(head).toContain("rphoto-head");
    expect(head).toContain("求职意向");
    expect(html).not.toContain("rphoto-side");
  });

  it("未上传照片时不输出图片", () => {
    const html = resumeToHtml({ ...SAMPLE_RESUME, photo: "" }, "classic", "sidebar");
    expect(html).not.toContain("rphoto-head");
    expect(html).not.toContain("<img");
  });

  it("非 data:image 的照片被忽略", () => {
    const html = resumeToHtml(
      { ...SAMPLE_RESUME, photo: "https://evil.example/x.png" },
      "classic",
      "sidebar"
    );
    expect(html).not.toContain("rphoto-head");
  });
});
