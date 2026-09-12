import { describe, it, expect, beforeAll, beforeEach } from "vitest";

let usageDistribution, db;

beforeAll(async () => {
  process.env.DB_PATH = ":memory:";
  process.env.FREE_DAILY_LIMIT = "100";
  process.env.QUOTA_WARN_RATIO = "0.8";
  process.env.USAGE_DIST_MIN_SAMPLE = "100";
  process.env.USAGE_TARGET_WARN_PCT = "10";
  ({ usageDistribution } = await import("../core/usage.js"));
  db = (await import("../core/db.js")).default;
});

beforeEach(() => {
  db.prepare("DELETE FROM quota_counters").run();
  db.prepare("DELETE FROM users").run();
});

describe("免费额度校准：用量分布", () => {
  it("分位数（最近秩法）与建议值", () => {
    const ins = db.prepare(
      "INSERT INTO quota_counters (user_id, day, kind, count) VALUES (?, ?, 'total', ?)"
    );
    for (let i = 1; i <= 100; i++) ins.run(i, "2026-01-01", i);

    const d = usageDistribution(0);
    expect(d.userDays).toBe(100);
    expect(d.users).toBe(100);
    expect(d.days).toBe(1);
    expect(d.percentiles.p50).toBe(50);
    expect(d.percentiles.p90).toBe(90);
    expect(d.percentiles.p99).toBe(99);
    expect(d.percentiles.max).toBe(100);
    // 100 个样本里 >= 80 的有 21 个
    expect(d.hitWarn).toBe(21);
    expect(d.hitWarnPct).toBe(21);
    // 建议 = ceil(90 × 1.5) = 135 → 取整到 10 → 140；预警线 = ceil(140 × 0.8) = 112
    expect(d.suggestedLimit).toBe(140);
    expect(d.suggestedWarnAt).toBe(112);
    // 目标法：10% 触发 → 预警线落在 P90=90 → limit = ceil(90/0.8)=113 → 取整 110；预警线 88 → 13%
    expect(d.targetWarnPct).toBe(10);
    expect(d.targetLimit).toBe(110);
    expect(d.targetLimitWarnAt).toBe(88);
    expect(d.targetLimitHitPct).toBe(13);
    expect(d.enoughSamples).toBe(true);
  });

  it("样本不足时标记 enoughSamples=false", () => {
    db.prepare(
      "INSERT INTO quota_counters (user_id, day, kind, count) VALUES (1, '2026-01-01', 'total', 5)"
    ).run();
    const d = usageDistribution(0);
    expect(d.userDays).toBe(1);
    expect(d.enoughSamples).toBe(false);
  });

  it("空数据安全回落", () => {
    const d = usageDistribution(30);
    expect(d.userDays).toBe(0);
    expect(d.percentiles.p90).toBe(0);
    expect(d.hitWarnPct).toBe(0);
    expect(d.enoughSamples).toBe(false);
  });

  it("排除 PRO 用户：PRO 的高用量不参与分位（否则 P90 被抬高、免费额度被高估）", () => {
    const insU = db.prepare(
      "INSERT INTO users (email, password_hash, plan) VALUES (?, 'x', ?)"
    );
    const freeId = insU.run("free@test.local", "free").lastInsertRowid;
    const proId = insU.run("pro@test.local", "pro").lastInsertRowid;
    // PK 是 (user_id, day, kind)：同一用户同一天只能一行，故用不同日期造多天样本
    const ins = db.prepare(
      "INSERT INTO quota_counters (user_id, day, kind, count) VALUES (?, ?, 'total', ?)"
    );
    const day = (i) => `2026-01-${String(i).padStart(2, "0")}`;
    for (let i = 1; i <= 10; i++) ins.run(freeId, day(i), i); // 免费用户 1..10
    for (let i = 1; i <= 10; i++) ins.run(proId, day(i), i * 100); // PRO 用户 100..1000

    const d = usageDistribution(0);
    expect(d.userDays).toBe(10);
    expect(d.users).toBe(1);
    expect(d.proExcluded).toBe(10);
    expect(d.percentiles.max).toBe(10); // 不被 PRO 的 1000 拉高
    expect(d.percentiles.p90).toBe(9);
  });
});
