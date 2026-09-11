import { describe, it, expect } from "vitest";
import { getPersonName, getPersonKey } from "../core/person.js";

describe("getPersonName", () => {
  it("取首个非空行作为姓名", () => {
    expect(getPersonName("\n\n张三\nJava开发")).toBe("张三");
  });

  it("空简历返回未命名", () => {
    expect(getPersonName("")).toBe("未命名");
    expect(getPersonName("   \n  ")).toBe("未命名");
  });

  it("超长姓名会截断", () => {
    expect(getPersonName("A".repeat(100)).length).toBe(30);
  });
});

describe("getPersonKey", () => {
  it("相同姓名得到相同 key（即使正文不同）", () => {
    expect(getPersonKey("张三\n版本A")).toBe(getPersonKey("张三\n版本B"));
  });

  it("不同姓名得到不同 key", () => {
    expect(getPersonKey("张三")).not.toBe(getPersonKey("李四"));
  });

  it("大小写/空格不影响", () => {
    expect(getPersonKey("Alice")).toBe(getPersonKey("  alice  "));
  });
});
