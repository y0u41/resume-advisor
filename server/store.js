import db from "./db.js";
import { getPersonKey, getPersonName } from "./person.js";

// 同一个人最多保留的提交次数
export const MAX_PER_PERSON = 12;

const insertStmt = db.prepare(
  `INSERT INTO evaluations
    (user_id, resume, job_title, job_description, score, report, job_url, person_key, person_name)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    row.personName
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
  jobUrl = ""
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
  });
}
