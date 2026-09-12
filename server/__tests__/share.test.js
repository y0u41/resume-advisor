import { describe, it, expect } from "vitest";
import { maskContacts } from "../routes/share.js";

describe("分享：联系方式打码", () => {
  it("手机号中间四位打码", () => {
    expect(maskContacts("手机：18748812367")).toBe("手机：187****2367");
  });

  it("邮箱打码", () => {
    expect(maskContacts("邮箱 t3205502866@126.com")).toBe("邮箱 t***@***.com");
  });

  it("无联系方式时原样返回", () => {
    expect(maskContacts("张三 通信工程 本科")).toBe("张三 通信工程 本科");
  });
});
