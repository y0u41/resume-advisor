import crypto from "crypto";
import db from "../core/db.js";
import { logEvent } from "../core/events.js";
import { listProviders, defaultModel } from "../core/models.js";
import { callLLM, callLLMStream, getProviderInfo } from "../llm/llm.js";
import { defaultModelFor } from "../core/plans.js";
import { saveEvaluation } from "../core/store.js";

export const MAX_RESUME = 40000;
export const MAX_JD = 40000;
export const MAX_TITLE = 200;
export const MAX_URL = 2000;

export function computeCacheKey(resume, jobTitle, jobDescription, override) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        resume,
        jobTitle,
        jobDescription,
        provider: override?.provider || "",
        model: override?.model || "",
        student: override?.isStudent ? 1 : 0,
      })
    )
    .digest("hex")
    .slice(0, 32);
}

// 解析请求中的 provider/model 与候选人类型；未指定则按套餐选默认模型
export function resolveOverride(body, plan = "free") {
  const isStudent = body?.candidateType === "student" || body?.isStudent === true;
  const provider = body?.provider;
  if (!provider) {
    const fallback = defaultModelFor(plan);
    return fallback
      ? { provider: fallback.provider, model: fallback.model, isStudent }
      : { isStudent };
  }
  const group = listProviders().find((p) => p.provider === provider);
  if (!group) return { isStudent };
  const model =
    body?.model && group.models.some((m) => m.id === body.model)
      ? body.model
      : defaultModel(provider);
  return { provider, model, isStudent };
}

// 本次请求实际使用的模型（用于判断是否高级模型）
export function effectiveModel(override) {
  try {
    return getProviderInfo(override).model || "";
  } catch {
    return "";
  }
}

export function extractScore(report) {
  const match = report.match(/【总分】\s*(\d+(?:\.\d+)?)\s*\/\s*10/);
  return match ? parseFloat(match[1]) : null;
}

// 从报告里统计岗位匹配度（✅=1 分、⚠️=0.5 分）
export function computeMatchRate(report) {
  const ok = (report.match(/✅/g) || []).length;
  const partial = (report.match(/⚠/g) || []).length;
  const miss = (report.match(/❌/g) || []).length;
  const total = ok + partial + miss;
  if (!total) return null;
  return Math.round(((ok + partial * 0.5) / total) * 100);
}

export function extractConclusion(report) {
  const m = report.match(/【一句话结论】\s*([\s\S]*?)(?=\s*【|$)/);
  return m ? m[1].trim().slice(0, 120) : "";
}

export function validateInput({ resume, jobTitle, jobDescription, jobUrl }) {
  if (!resume || !jobTitle) return "请提供简历全文和应聘岗位";
  if (typeof resume !== "string" || typeof jobTitle !== "string") return "参数类型错误";
  if (resume.length > MAX_RESUME) return `简历过长（上限 ${MAX_RESUME} 字）`;
  if (jobTitle.length > MAX_TITLE) return `岗位名称过长（上限 ${MAX_TITLE} 字）`;
  if (jobDescription && jobDescription.length > MAX_JD) return `JD 过长（上限 ${MAX_JD} 字）`;
  if (jobUrl && jobUrl.length > MAX_URL) return `链接过长`;
  return null;
}

// 首次评估埋点
export function maybeLogFirstEvaluate(userId) {
  try {
    const count = db.prepare("SELECT COUNT(*) c FROM evaluations WHERE user_id = ?").get(userId).c;
    if (count === 1) logEvent(userId, "first_evaluate");
  } catch {
    // 忽略
  }
}

// 落库 + 首次评估埋点（各评估路由共用，避免 10 个位置参数在 5 处重复）
export function saveReport(userId, { resume, jobTitle, jobDescription, score, report, jobUrl, cacheKey, candidateType, objectiveJson }) {
  const id = saveEvaluation(
    userId,
    resume,
    jobTitle,
    jobDescription,
    score,
    report,
    jobUrl || "",
    cacheKey || null,
    candidateType,
    objectiveJson || null
  );
  maybeLogFirstEvaluate(userId);
  return id;
}

// 流式生成报告；流式无内容（停滞/为空）时回退非流式，保证有结果。返回完整文本。
export async function streamReportWithFallback({ resume, jobTitle, jobDescription, override, signal, onChunk }) {
  let fullText = "";
  try {
    await callLLMStream(
      resume,
      jobTitle,
      jobDescription,
      (chunk) => {
        fullText += chunk;
        onChunk(chunk);
      },
      signal,
      override
    );
  } catch (error) {
    if (signal.aborted) throw error;
    console.warn("流式评估失败，回退非流式:", error.message);
  }
  if (!fullText.trim() && !signal.aborted) {
    const report = await callLLM(resume, jobTitle, jobDescription, signal, override);
    fullText = report;
    onChunk(report);
  }
  return fullText;
}
