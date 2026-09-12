import { describe, it, expect } from "vitest";
import { normalizePlan, isPlanExpired, planDaysLeft, proPeriodModifier } from "../core/plans.js";

// SQLite datetime('now') 风格（UTC，"YYYY-MM-DD HH:MM:SS"）
const sqlite = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
const future = sqlite(Date.now() + 10 * 86400000);
const past = sqlite(Date.now() - 86400000);

describe("套餐有效期（PRO 到期自动回落）", () => {
  it("admin 永远是 admin，与 plan / 有效期无关", () => {
    expect(normalizePlan({ role: "admin", plan: "free" })).toBe("admin");
    expect(normalizePlan({ role: "admin", plan: "pro", plan_expires_at: past })).toBe("admin");
  });

  it("PRO 未过期 = pro", () => {
    expect(normalizePlan({ role: "user", plan: "pro", plan_expires_at: future })).toBe("pro");
  });

  it("PRO 已过期 = free（这就是漏钱的那个洞）", () => {
    expect(normalizePlan({ role: "user", plan: "pro", plan_expires_at: past })).toBe("free");
  });

  it("PRO 无到期时间 = 永久 pro（管理员手动授予）", () => {
    expect(normalizePlan({ role: "user", plan: "pro", plan_expires_at: null })).toBe("pro");
  });

  it("free 永远 free，空用户安全回落", () => {
    expect(normalizePlan({ role: "user", plan: "free" })).toBe("free");
    expect(normalizePlan(null)).toBe("free");
    expect(normalizePlan({})).toBe("free");
  });

  it("isPlanExpired / planDaysLeft", () => {
    expect(isPlanExpired({ plan: "pro", plan_expires_at: past })).toBe(true);
    expect(isPlanExpired({ plan: "pro", plan_expires_at: future })).toBe(false);
    expect(isPlanExpired({ plan: "pro", plan_expires_at: null })).toBe(false);
    expect(isPlanExpired({ plan: "free", plan_expires_at: past })).toBe(false);

    expect(planDaysLeft({ plan: "pro", plan_expires_at: future })).toBeGreaterThan(0);
    expect(planDaysLeft({ plan: "pro", plan_expires_at: null })).toBe(null);
    expect(planDaysLeft({ plan: "free" })).toBe(null);
  });

  it("兼容 camelCase（req.user 形态）", () => {
    expect(normalizePlan({ role: "user", plan: "pro", planExpiresAt: past })).toBe("free");
    expect(planDaysLeft({ plan: "pro", planExpiresAt: future })).toBeGreaterThan(0);
  });

  it("proPeriodModifier 形如 '+1 month'", () => {
    expect(proPeriodModifier()).toMatch(/^\+\d+ month$/);
  });
});
