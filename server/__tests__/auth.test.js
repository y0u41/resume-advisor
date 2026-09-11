import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../core/auth.js";

describe("密码加密", () => {
  it("同一密码每次哈希结果不同（含随机盐）", () => {
    expect(hashPassword("secret123")).not.toBe(hashPassword("secret123"));
  });

  it("正确密码校验通过", () => {
    const stored = hashPassword("secret123");
    expect(verifyPassword("secret123", stored)).toBe(true);
  });

  it("错误密码校验失败", () => {
    const stored = hashPassword("secret123");
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("非法存储值返回 false", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "garbage")).toBe(false);
  });
});
