import { describe, it, expect, beforeAll, beforeEach } from "vitest";

let runPurge, tablesWithUserId, db;

const USER_TABLES = [
  "evaluations",
  "usage_log",
  "quota_counters",
  "downloads",
  "events",
  "llm_usage",
  "feedback",
  "pro_requests",
];

beforeAll(async () => {
  process.env.DB_PATH = ":memory:";
  ({ runPurge, tablesWithUserId } = await import("../jobs/purge.js"));
  db = (await import("../core/db.js")).default;
});

beforeEach(() => {
  for (const t of [...USER_TABLES, "users"]) db.prepare(`DELETE FROM ${t}`).run();
});

function makeDueUser(email) {
  return db
    .prepare(
      "INSERT INTO users (email, password_hash, purge_after) VALUES (?, ?, datetime('now','-1 day'))"
    )
    .run(email, "x").lastInsertRowid;
}

describe("注销清理（自动发现含 user_id 的表）", () => {
  it("清理清单包含 quota_counters，且排除 users / 无 user_id 的表", () => {
    const tables = tablesWithUserId();
    expect(tables).toContain("quota_counters");
    expect(tables).toContain("evaluations");
    expect(tables).toContain("events");
    expect(tables).not.toContain("users");
    expect(tables).not.toContain("jd_keywords");
    expect(tables).not.toContain("guest_trials");
  });

  it("到期注销会清空该用户在全部含 user_id 表里的数据", () => {
    const uid = makeDueUser("del@example.com");
    db.prepare("INSERT INTO evaluations (user_id, resume, job_title) VALUES (?, 'r', 't')").run(uid);
    db.prepare("INSERT INTO downloads (user_id, kind) VALUES (?, 'resume')").run(uid);
    db.prepare("INSERT INTO events (user_id, name) VALUES (?, 'register')").run(uid);
    db.prepare(
      "INSERT INTO quota_counters (user_id, day, kind, count) VALUES (?, date('now'), 'total', 3)"
    ).run(uid);
    db.prepare("INSERT INTO llm_usage (user_id, feature) VALUES (?, 'evaluate')").run(uid);
    db.prepare("INSERT INTO feedback (user_id, kind) VALUES (?, 'vote')").run(uid);
    db.prepare("INSERT INTO usage_log (user_id, day, count) VALUES (?, date('now'), 1)").run(uid);
    db.prepare("INSERT INTO pro_requests (user_id, note) VALUES (?, 'x')").run(uid);

    const r = runPurge();
    expect(r.purged).toBe(1);
    expect(db.prepare("SELECT COUNT(*) c FROM users WHERE id = ?").get(uid).c).toBe(0);
    for (const t of USER_TABLES) {
      expect(db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE user_id = ?`).get(uid).c).toBe(0);
    }
  });

  it("新增含 user_id 的表无需改代码即会被清理", () => {
    db.exec("CREATE TABLE IF NOT EXISTS _new_userdata (id INTEGER PRIMARY KEY, user_id INTEGER)");
    expect(tablesWithUserId()).toContain("_new_userdata");
    const uid = makeDueUser("del2@example.com");
    db.prepare("INSERT INTO _new_userdata (user_id) VALUES (?)").run(uid);
    runPurge();
    expect(db.prepare("SELECT COUNT(*) c FROM _new_userdata WHERE user_id = ?").get(uid).c).toBe(0);
    db.exec("DROP TABLE _new_userdata");
  });
});

// 「新表登记」防呆：每张表都必须被明确分类，否则本测试失败、强制开发者做决定。
//   ① 含 user_id → 由 tablesWithUserId() 自动清理；
//   ② 否则必须显式登记进 NON_USER_TABLES（并注明为何不含用户数据）。
// 这样即使新表用了 uid / owner_id / email 等别的列名，也不会悄悄漏掉注销清理。
const NON_USER_TABLES = new Set([
  "users", // 账号主表：由 delUser 单独删除
  "jd_keywords", // 共享 JD 关键词缓存：不含用户信息
  "guest_trials", // 游客额度：按 IP 计数，由 runCleanup 过期清理
]);

describe("新表登记防呆", () => {
  it("每张表都被分类：含 user_id 自动清理，否则必须显式登记", () => {
    const all = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => r.name);
    const purged = new Set(tablesWithUserId());
    const unclassified = all.filter((t) => !purged.has(t) && !NON_USER_TABLES.has(t));
    expect(unclassified).toEqual([]);
  });

  it("白名单表确实不含 user_id（防止误登记掩盖问题）", () => {
    for (const t of NON_USER_TABLES) {
      const cols = db.prepare(`PRAGMA table_info("${t}")`).all().map((c) => c.name);
      expect(cols.includes("user_id")).toBe(false);
    }
  });
});
