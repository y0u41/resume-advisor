import { describe, it, expect, beforeAll, beforeEach } from "vitest";

let withQuota, getUsage, getPremiumUsage, db;

beforeAll(async () => {
  process.env.DB_PATH = ":memory:";
  process.env.FREE_DAILY_LIMIT = "3";
  process.env.FREE_PREMIUM_DAILY = "1";
  ({ withQuota, getUsage, getPremiumUsage } = await import("../core/quota.js"));
  db = (await import("../core/db.js")).default;
});

beforeEach(() => {
  db.prepare("DELETE FROM quota_counters").run();
});

const free = { id: 1, role: "user", plan: "free" };
const admin = { id: 3, role: "admin", plan: "free" };

describe("withQuota：成功后计费 / 失败自动退还（唯一计费入口）", () => {
  it("work 成功 → 计费 total +1，并返回 work 的结果", async () => {
    const { result, quota } = await withQuota(free, {}, async () => ({ report: "ok" }));
    expect(result.report).toBe("ok");
    expect(quota.allowed).toBe(true);
    expect(getUsage(1)).toBe(1);
  });

  it("work 抛错 → 自动退还，计数不变（LLM 故障不该扣次数）", async () => {
    await expect(
      withQuota(free, {}, async () => {
        throw new Error("LLM 挂了");
      })
    ).rejects.toThrow("LLM 挂了");
    expect(getUsage(1)).toBe(0);
  });

  it("isPremium：成功时 total + premium 各 +1；失败时两者都退还", async () => {
    await withQuota(free, { isPremium: true }, async () => "ok");
    expect(getUsage(1)).toBe(1);
    expect(getPremiumUsage(1)).toBe(1);

    // 换一个用户，避免免费档 premium 尝鲜额度（1）已用尽导致 3001
    const free2 = { id: 2, role: "user", plan: "free" };
    await expect(
      withQuota(free2, { isPremium: true }, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(getUsage(2)).toBe(0);
    expect(getPremiumUsage(2)).toBe(0);
  });

  it("连续失败 3 次 → 计数仍为 0（MAX 防负数）", async () => {
    for (let i = 0; i < 3; i++) {
      await expect(
        withQuota(free, {}, async () => {
          throw new Error("boom");
        })
      ).rejects.toThrow("boom");
    }
    expect(getUsage(1)).toBe(0);
  });

  it("额度不足 → 抛 code=3001，且不执行 work", async () => {
    for (let i = 0; i < 3; i++) await withQuota(free, {}, async () => "ok");
    let ran = false;
    await expect(
      withQuota(free, {}, async () => {
        ran = true;
        return "ok";
      })
    ).rejects.toMatchObject({ code: 3001 });
    expect(ran).toBe(false);
    expect(getUsage(1)).toBe(3);
  });

  it("管理员不受限、不计数", async () => {
    for (let i = 0; i < 10; i++) await withQuota(admin, {}, async () => "ok");
    expect(getUsage(3)).toBe(0);
  });
});
