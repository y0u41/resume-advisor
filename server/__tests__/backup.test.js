import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

let runBackup;
let dir;

beforeAll(async () => {
  process.env.DB_PATH = ":memory:";
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-test-"));
  process.env.BACKUP_DIR = dir;
  process.env.BACKUP_KEEP = "3";
  ({ runBackup } = await import("../jobs/backup.js"));
});

afterAll(() => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // 忽略
  }
});

describe("SQLite 在线备份", () => {
  it("首次备份生成 app-YYYY-MM-DD.db 且非空", async () => {
    const file = await runBackup();
    expect(fs.existsSync(file)).toBe(true);
    expect(path.basename(file)).toMatch(/^app-\d{4}-\d{2}-\d{2}\.db$/);
    expect(fs.statSync(file).size).toBeGreaterThan(0);
  });

  it("当天再次调用返回同一路径（不重复备份）", async () => {
    const a = await runBackup();
    const b = await runBackup();
    expect(b).toBe(a);
  });

  it("保留策略：只保留最近 BACKUP_KEEP 份", async () => {
    for (let i = 1; i <= 10; i++) {
      fs.writeFileSync(path.join(dir, `app-2020-01-${String(i).padStart(2, "0")}.db`), "x");
    }
    await runBackup();
    const files = fs.readdirSync(dir).filter((f) => f.startsWith("app-") && f.endsWith(".db"));
    expect(files.length).toBe(3);
  });
});
