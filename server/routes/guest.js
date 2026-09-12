import { Router } from "express";
import db from "../core/db.js";
import { callLLM, callLLMStream } from "../llm/llm.js";
import { evaluateResume } from "../scoring/index.js";
import { getJdKeywords } from "../core/jdKeywords.js";
import { withUsageContext } from "../core/usage.js";
import { logEvent } from "../core/events.js";

const router = Router();

// 游客请求的 LLM 用量统一标记为 guest_evaluate
router.use((req, res, next) =>
  withUsageContext({ userId: null, feature: "guest_evaluate" }, next)
);

// 游客每天可免注册试用的次数（默认 1 次）
const GUEST_LIMIT = Number(process.env.GUEST_LIMIT || 1);
// 游客可见的报告字符数（超出部分打码，注册后解锁）
const GUEST_PREVIEW_CHARS = Number(process.env.GUEST_PREVIEW_CHARS || 800);

const MAX_RESUME = 40000;
const MAX_TITLE = 200;
const MAX_JD = 40000;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getGuestUsed(ip) {
  const row = db
    .prepare("SELECT count FROM guest_trials WHERE ip = ? AND day = ?")
    .get(ip, today());
  return row?.count || 0;
}

function consumeGuestQuota(ip) {
  const used = getGuestUsed(ip);
  if (used >= GUEST_LIMIT) return { allowed: false, used, limit: GUEST_LIMIT };
  db.prepare(
    `INSERT INTO guest_trials (ip, day, count) VALUES (?, ?, 1)
     ON CONFLICT(ip, day) DO UPDATE SET count = count + 1`
  ).run(ip, today());
  return { allowed: true, used: used + 1, limit: GUEST_LIMIT };
}

// 未产出任何内容即断开（如移动端刷新）时，退还本次额度，避免白白消耗唯一一次试用
function refundGuestQuota(ip) {
  try {
    db.prepare(
      "UPDATE guest_trials SET count = MAX(count - 1, 0) WHERE ip = ? AND day = ?"
    ).run(ip, today());
  } catch {
    // 忽略
  }
}

// 剩余试用次数（前端展示）
router.get("/guest/quota", (req, res) => {
  const used = getGuestUsed(req.ip);
  res.json({ used, limit: GUEST_LIMIT, remaining: Math.max(0, GUEST_LIMIT - used) });
});

function extractScore(report) {
  const match = report.match(/【总分】\s*(\d+(?:\.\d+)?)\s*\/\s*10/);
  return match ? parseFloat(match[1]) : null;
}

// 游客试用评估：无需登录，按 IP 限流，结果打码预览、不落库
router.post("/guest/evaluate", async (req, res) => {
  const { resume, jobTitle, jobDescription, candidateType } = req.body || {};
  const isStudent = candidateType === "student";

  if (!resume || !jobTitle || typeof resume !== "string" || typeof jobTitle !== "string") {
    return res.status(400).json({ code: 1001, error: "请提供简历全文和应聘岗位" });
  }
  if (resume.length > MAX_RESUME) return res.status(400).json({ code: 1006, error: "简历过长" });
  if (jobTitle.length > MAX_TITLE) return res.status(400).json({ code: 1006, error: "岗位名称过长" });
  if (jobDescription && jobDescription.length > MAX_JD)
    return res.status(400).json({ code: 1006, error: "JD 过长" });

  const quota = consumeGuestQuota(req.ip);
  if (!quota.allowed) {
    return res.status(429).json({
      code: 3001,
      error: "免费试用次数已用完，注册后可无限使用完整功能",
    });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const controller = new AbortController();
  let completed = false;
  let anyOutput = false;
  res.on("close", () => {
    // 未完成且未产出任何内容 → 退还额度（移动端刷新很常见）
    if (!completed && !anyOutput) refundGuestQuota(req.ip);
    if (!res.writableEnded) controller.abort(new Error("客户端已断开"));
  });

  try {
    let fullText = "";
    try {
      await callLLMStream(
        resume,
        jobTitle,
        jobDescription || "",
        (chunk) => {
          fullText += chunk;
          anyOutput = true;
          res.write(`data: ${JSON.stringify({ chunk, done: false })}\n\n`);
        },
        controller.signal,
        { isStudent }
      );
    } catch (error) {
      if (!controller.signal.aborted) console.warn("游客流式评估失败，回退非流式:", error.message);
    }

    if (!fullText.trim() && !controller.signal.aborted) {
      fullText = await callLLM(resume, jobTitle, jobDescription || "", controller.signal, {
        isStudent,
      });
    }

    if (controller.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }
    if (!fullText.trim()) {
      res.write(`data: ${JSON.stringify({ error: "评估结果为空，请重试", done: true })}\n\n`);
      res.end();
      return;
    }

    const score = extractScore(fullText);
    // 漏斗关键事件：游客试用（user_id 为空，用于统计试用→注册转化）。
    // 必须在关键词抽取之前记录——抽取是额外 LLM 调用，若此处断开/失败会丢事件，
    // 导致转化率分母偏小、数据失真。
    logEvent(null, "guest_trial", { student: isStudent ? 1 : 0 });
    // 与注册用户完全一致：关键词优先用 LLM 从 JD 抽取（按 JD 哈希缓存），
    // 并传入同一 override（含应届生模式）；否则非技术岗会回退到技术词典、
    // 给出误导性的低客观分（首因效应），使游客与注册后的结果不一致。
    const jdKeywords = jobDescription
      ? await getJdKeywords(jobDescription, controller.signal, { isStudent })
      : [];
    const objective = evaluateResume(resume, { jdText: jobDescription || "", jdKeywords });
    const preview = fullText.slice(0, GUEST_PREVIEW_CHARS);
    completed = true;

    res.write(
      `data: ${JSON.stringify({
        chunk: "",
        done: true,
        guest: true,
        score,
        objective,
        report: preview,
        truncated: fullText.length > GUEST_PREVIEW_CHARS,
        totalLength: fullText.length,
      })}\n\n`
    );
    res.end();
  } catch (error) {
    if (controller.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }
    console.error("游客评估失败:", error);
    res.write(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
    res.end();
  }
});

export default router;
