import { Router } from "express";
import crypto from "crypto";
import db from "../db.js";
import { callLLM, callLLMStream, followUpStream } from "../llm.js";
import { listProviders, defaultModel } from "../models.js";
import { saveEvaluation, findCachedEvaluation } from "../store.js";
import { getPersonKey, getPersonName } from "../person.js";
import { requireAuth } from "../auth.js";
import { consumeQuota, getUsage, DAILY_LIMIT } from "../quota.js";
import { acquire } from "../queue.js";

const router = Router();

const CACHE_ENABLED = process.env.CACHE_ENABLED !== "false";
const CACHE_TTL_HOURS = Number(process.env.CACHE_TTL_HOURS || 24);

function computeCacheKey(resume, jobTitle, jobDescription, override) {
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

// 所有评估相关接口都需要登录
router.use(requireAuth);

// 已配置的提供商与可选模型
router.get("/models", (req, res) => {
  const providers = listProviders();
  const preferred = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
  const pref = providers.find((p) => p.provider === preferred) || providers[0];
  const def = pref
    ? { provider: pref.provider, model: defaultModel(pref.provider) || pref.models[0].id }
    : null;
  res.json({ providers, default: def });
});

// 解析请求中的 provider/model 与候选人类型，非法则回退默认
function resolveOverride(body) {
  const isStudent = body?.candidateType === "student" || body?.isStudent === true;
  const provider = body?.provider;
  const group = provider ? listProviders().find((p) => p.provider === provider) : null;
  if (!group) return { isStudent };
  const model =
    body?.model && group.models.some((m) => m.id === body.model)
      ? body.model
      : defaultModel(provider);
  return { provider, model, isStudent };
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
  const { resume, jobTitle, jobDescription, jobUrl } = req.body || {};

  const invalid = validateInput({ resume, jobTitle, jobDescription, jobUrl });
  if (invalid) {
    return res.status(400).json({ error: invalid });
  }

  const override = resolveOverride(req.body);
  const stream = req.query.stream === "true";
  const cacheKey = computeCacheKey(resume, jobTitle, jobDescription || "", override);

  // 缓存命中：直接返回，不消耗额度、不占用并发
  if (CACHE_ENABLED) {
    const cached = findCachedEvaluation(req.user.id, cacheKey, CACHE_TTL_HOURS);
    if (cached) {
      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.write(`data: ${JSON.stringify({ chunk: cached.report, done: false })}\n\n`);
        res.write(
          `data: ${JSON.stringify({ chunk: "", done: true, id: cached.id, score: cached.score, report: cached.report, cached: true })}\n\n`
        );
        res.end();
      } else {
        res.json({ id: cached.id, score: cached.score, report: cached.report, cached: true });
      }
      return;
    }
  }

  // 客户端断开时中止上游 LLM 请求
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort(new Error("客户端已断开"));
  });

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
  }

  // 获取并发槽位，超出则排队
  let release;
  try {
    release = await acquire((position) => {
      if (stream) res.write(`data: ${JSON.stringify({ queued: true, position })}\n\n`);
    });
  } catch (error) {
    if (stream) {
      res.write(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
      res.end();
    } else {
      res.status(503).json({ error: error.message });
    }
    return;
  }

  try {
    const quota = consumeQuota(req.user.id);
    if (!quota.allowed) {
      const msg = `今日评估次数已用完（${quota.used}/${quota.limit}），请明天再试`;
      if (stream) {
        res.write(`data: ${JSON.stringify({ error: msg, done: true })}\n\n`);
        res.end();
      } else {
        res.status(429).json({ error: msg });
      }
      return;
    }

    if (stream) {
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
          override
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
            override
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
        jobUrl || "",
        cacheKey,
        override.isStudent ? "student" : "general"
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
        override
      );
      const score = extractScore(report);
      const id = saveEvaluation(
        req.user.id,
        resume,
        jobTitle,
        jobDescription || "",
        score,
        report,
        jobUrl || "",
        cacheKey,
        override.isStudent ? "student" : "general"
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
  } finally {
    if (release) release();
  }
});

// 继续追问（流式）：基于简历 + 岗位 + 报告回答
router.post("/followup", async (req, res) => {
  const { resume, jobTitle, jobDescription, report, question } = req.body || {};

  if (!resume || !jobTitle) return res.status(400).json({ error: "缺少简历或岗位" });
  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "请输入你的问题" });
  }
  if (question.length > 1000) return res.status(400).json({ error: "问题过长（上限 1000 字）" });

  const override = resolveOverride(req.body);

  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort(new Error("客户端已断开"));
  });

  let release;
  try {
    release = await acquire((position) => {
      res.write(`data: ${JSON.stringify({ queued: true, position })}\n\n`);
    });
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
    res.end();
    return;
  }

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullText = "";
    try {
      await followUpStream(
        {
          resume,
          jobTitle,
          jobDescription: jobDescription || "",
          report: report || "",
          question,
          isStudent: override.isStudent,
        },
        (chunk) => {
          fullText += chunk;
          res.write(`data: ${JSON.stringify({ chunk, done: false })}\n\n`);
        },
        controller.signal,
        override
      );
    } catch (error) {
      if (controller.signal.aborted) {
        if (!res.writableEnded) res.end();
        return;
      }
      res.write(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
      res.end();
      return;
    }

    if (controller.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }

    res.write(`data: ${JSON.stringify({ chunk: "", done: true, answer: fullText })}\n\n`);
    res.end();
  } catch (error) {
    console.error("追问失败:", error);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
      res.end();
    }
  } finally {
    if (release) release();
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
