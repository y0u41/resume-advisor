import { Router } from "express";
import db from "../db.js";
import { callLLM, callLLMStream, listProviders } from "../llm.js";
import { saveEvaluation } from "../store.js";
import { getPersonKey, getPersonName } from "../person.js";
import { requireAuth } from "../auth.js";
import { consumeQuota, getUsage, DAILY_LIMIT } from "../quota.js";

const router = Router();

// 所有评估相关接口都需要登录
router.use(requireAuth);

// 已配置的模型提供商列表
router.get("/models", (req, res) => {
  const providers = listProviders();
  const preferred = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
  const def = providers.some((p) => p.provider === preferred)
    ? preferred
    : providers[0]?.provider || null;
  res.json({ providers, default: def });
});

function resolveProvider(requested) {
  const providers = listProviders();
  if (!providers.length) return undefined;
  if (requested && providers.some((p) => p.provider === requested)) return requested;
  return undefined;
}

const MAX_RESUME = 40000;
const MAX_JD = 40000;
const MAX_TITLE = 200;
const MAX_URL = 2000;

function extractScore(report) {
  const match = report.match(/【总分】\s*(\d+(?:\.\d+)?)\s*\/\s*10/);
  return match ? parseFloat(match[1]) : null;
}

function validateInput({ resume, jobTitle, jobDescription, jobUrl }) {
  if (!resume || !jobTitle) return "请提供简历全文和应聘岗位";
  if (typeof resume !== "string" || typeof jobTitle !== "string") return "参数类型错误";
  if (resume.length > MAX_RESUME) return `简历过长（上限 ${MAX_RESUME} 字）`;
  if (jobTitle.length > MAX_TITLE) return `岗位名称过长（上限 ${MAX_TITLE} 字）`;
  if (jobDescription && jobDescription.length > MAX_JD) return `JD 过长（上限 ${MAX_JD} 字）`;
  if (jobUrl && jobUrl.length > MAX_URL) return `链接过长`;
  return null;
}

router.post("/evaluate", async (req, res) => {
  const { resume, jobTitle, jobDescription, jobUrl, provider } = req.body || {};

  const invalid = validateInput({ resume, jobTitle, jobDescription, jobUrl });
  if (invalid) {
    return res.status(400).json({ error: invalid });
  }

  const chosenProvider = resolveProvider(provider);

  const quota = consumeQuota(req.user.id);
  if (!quota.allowed) {
    return res.status(429).json({
      error: `今日评估次数已用完（${quota.used}/${quota.limit}），请明天再试`,
    });
  }

  const stream = req.query.stream === "true";

  // 客户端断开时中止上游 LLM 请求
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort(new Error("客户端已断开"));
  });

  try {
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let fullText = "";

      try {
        await callLLMStream(
          resume,
          jobTitle,
          jobDescription || "",
          (chunk) => {
            fullText += chunk;
            res.write(`data: ${JSON.stringify({ chunk, done: false })}\n\n`);
          },
          controller.signal,
          chosenProvider
        );
      } catch (error) {
        if (controller.signal.aborted) {
          if (!res.writableEnded) res.end();
          return;
        }
        console.warn("流式评估失败，回退非流式:", error.message);
      }

      // 流式无内容（停滞/为空）时回退非流式，保证有结果
      if (!fullText.trim() && !controller.signal.aborted) {
        try {
          const report = await callLLM(
            resume,
            jobTitle,
            jobDescription || "",
            controller.signal,
            chosenProvider
          );
          fullText = report;
          res.write(`data: ${JSON.stringify({ chunk: report, done: false })}\n\n`);
        } catch (error) {
          if (controller.signal.aborted) {
            if (!res.writableEnded) res.end();
            return;
          }
          res.write(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
          res.end();
          return;
        }
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
      const id = saveEvaluation(
        req.user.id,
        resume,
        jobTitle,
        jobDescription || "",
        score,
        fullText,
        jobUrl || ""
      );

      res.write(
        `data: ${JSON.stringify({ chunk: "", done: true, id, score, report: fullText })}\n\n`
      );
      res.end();
    } else {
      const report = await callLLM(
        resume,
        jobTitle,
        jobDescription || "",
        controller.signal,
        chosenProvider
      );
      const score = extractScore(report);
      const id = saveEvaluation(
        req.user.id,
        resume,
        jobTitle,
        jobDescription || "",
        score,
        report,
        jobUrl || ""
      );

      res.json({ id, score, report });
    }
  } catch (error) {
    if (controller.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }
    console.error("评估失败:", error);
    if (stream) {
      res.write(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

router.get("/evaluations", (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, job_title, score, person_name, person_key, created_at
       FROM evaluations WHERE user_id = ? ORDER BY id DESC LIMIT 300`
    )
    .all(req.user.id);
  res.json({ records: rows, usage: { used: getUsage(req.user.id), limit: DAILY_LIMIT } });
});

router.get("/evaluations/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM evaluations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "记录不存在" });
  res.json(row);
});

router.put("/evaluations/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM evaluations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "记录不存在" });

  const { report, score, resume, job_title, job_description, job_url } = req.body || {};

  const next = {
    report: typeof report === "string" ? report : row.report,
    score: score === undefined || score === null ? row.score : score,
    resume: typeof resume === "string" ? resume : row.resume,
    job_title: typeof job_title === "string" ? job_title : row.job_title,
    job_description:
      typeof job_description === "string" ? job_description : row.job_description,
    job_url: typeof job_url === "string" ? job_url : row.job_url,
  };

  if (next.resume.length > MAX_RESUME || next.job_description.length > MAX_JD) {
    return res.status(400).json({ error: "内容过长" });
  }

  let personKey = row.person_key;
  let personName = row.person_name;
  if (typeof resume === "string" && resume !== row.resume) {
    personKey = getPersonKey(resume);
    personName = getPersonName(resume);
  }

  db.prepare(
    `UPDATE evaluations
     SET report = ?, score = ?, resume = ?, job_title = ?, job_description = ?,
         job_url = ?, person_key = ?, person_name = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    next.report,
    next.score,
    next.resume,
    next.job_title,
    next.job_description,
    next.job_url,
    personKey,
    personName,
    req.params.id,
    req.user.id
  );

  const updated = db
    .prepare("SELECT * FROM evaluations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  res.json(updated);
});

router.delete("/evaluations/:id", (req, res) => {
  db.prepare("DELETE FROM evaluations WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.user.id
  );
  res.json({ ok: true });
});

export default router;
