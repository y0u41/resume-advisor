import db from "./db.js";
import { getPersonKey, getPersonName } from "./person.js";

// 同一个人最多保留的提交次数
export const MAX_PER_PERSON = 12;

const insertStmt = db.prepare(
  `INSERT INTO evaluations
    (user_id, resume, job_title, job_description, score, report, job_url, person_key, person_name, cache_key, candidate_type, objective_json)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const pruneStmt = db.prepare(
  `DELETE FROM evaluations
   WHERE user_id = ? AND person_key = ?
     AND id NOT IN (
       SELECT id FROM evaluations
       WHERE user_id = ? AND person_key = ?
       ORDER BY id DESC LIMIT ?
     )`
);

const saveTx = db.transaction((row) => {
  const info = insertStmt.run(
    row.userId,
    row.resume,
    row.jobTitle,
    row.jobDescription,
    row.score,
    row.report,
    row.jobUrl,
    row.personKey,
    row.personName,
    row.cacheKey,
    row.candidateType || "general",
    row.objectiveJson || null
  );
  pruneStmt.run(row.userId, row.personKey, row.userId, row.personKey, MAX_PER_PERSON);
  return info.lastInsertRowid;
});

export function saveEvaluation(
  userId,
  resume,
  jobTitle,
  jobDescription,
  score,
  report,
  jobUrl = "",
  cacheKey = null,
  candidateType = "general",
  objectiveJson = null
) {
  return saveTx({
    userId,
    resume,
    jobTitle,
    jobDescription,
    score,
    report,
    jobUrl: jobUrl || "",
    personKey: getPersonKey(resume),
    personName: getPersonName(resume),
    cacheKey,
    candidateType,
    objectiveJson,
  });
}

// 查找该用户近期相同输入的评估结果（缓存命中）
export function findCachedEvaluation(userId, cacheKey, ttlHours) {
  if (!cacheKey) return null;
  return db
    .prepare(
      `SELECT * FROM evaluations
       WHERE user_id = ? AND cache_key = ? AND created_at >= datetime('now', ?)
       ORDER BY id DESC LIMIT 1`
    )
    .get(userId, cacheKey, `-${ttlHours} hours`);
}
