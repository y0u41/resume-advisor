import crypto from "crypto";

// 用简历的首个非空行（通常是姓名）作为“同一个人”的标识；
// 这样即使正文被修改，只要姓名不变，仍归为同一个人。
export function getPersonName(resume) {
  const firstLine = (resume || "")
    .split("\n")
    .map((s) => s.trim())
    .find(Boolean);
  if (firstLine) return firstLine.slice(0, 30);

  const compact = (resume || "").replace(/\s+/g, " ").trim();
  return compact.slice(0, 30) || "未命名";
}

export function getPersonKey(resume) {
  const name = getPersonName(resume).toLowerCase();
  return crypto.createHash("sha256").update(name).digest("hex").slice(0, 16);
}
