import { Router } from "express";
import crypto from "crypto";
import db from "../core/db.js";
import { callLLM, callLLMStream, followUpStream, interviewStream, directionsStream, getProviderInfo } from "../llm/llm.js";
import { evaluateResume } from "../scoring/index.js";
import { getJdKeywords } from "../core/jdKeywords.js";
import { logEvent } from "../core/events.js";
import { withUsageContext } from "../core/usage.js";
import { parseResumeContent, contentToText, ResumeContentSchema } from "../../shared/resumeSchema.js";
import { listProviders, defaultModel } from "../core/models.js";
import { saveEvaluation, findCachedEvaluation } from "../core/store.js";
import { getPersonKey, getPersonName } from "../core/person.js";
import { requireAuth } from "../core/auth.js";
import { consumeQuota, getUsage, quotaMessage } from "../core/quota.js";
import { normalizePlan, dailyLimitFor, defaultModelFor, isPremiumModel } from "../core/plans.js";
import { acquire } from "../core/queue.js";

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

// 标记本次请求的「功能」，供 LLM 用量采集
const FEATURE_BY_PATH = {
  "/evaluate": "evaluate",
  "/compare": "compare",
  "/followup": "followup",
  "/interview": "interview",
  "/directions": "directions",
};
router.use((req, res, next) =>
  withUsageContext({ userId: req.user?.id, feature: FEATURE_BY_PATH[req.path] || "evaluate" }, next)
);

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

// 校验结构化简历（结构化 Schema：写严读宽）
router.post("/resume/validate", (req, res) => {
  const result = ResumeContentSchema.safeParse(req.body?.resumeContent);
  if (result.success) {
    return res.json({ ok: true, content: result.data, errors: [] });
  }
  res.json({
    ok: false,
    errors: (result.error?.issues || []).map((i) => ({ path: i.path, message: i.message })),
  });
});

// 解析请求中的 provider/model 与候选人类型；未指定则按套餐选默认模型
function resolveOverride(body, plan = "free") {
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
function effectiveModel(override) {
  try {
    return getProviderInfo(override).model || "";
  } catch {
    return "";
  }
}

const MAX_RESUME = 40000;
const MAX_JD = 40000;
const MAX_TITLE = 200;
const MAX_URL = 2000;

function extractScore(report) {
  const match = report.match(/【总分】\s*(\d+(?:\.\d+)?)\s*\/\s*10/);
  return match ? parseFloat(match[1]) : null;
}

// 从报告里统计岗位匹配度（✅=1 分、⚠️=0.5 分）
function computeMatchRate(report) {
  const ok = (report.match(/✅/g) || []).length;
  const partial = (report.match(/⚠/g) || []).length;
  const miss = (report.match(/❌/g) || []).length;
  const total = ok + partial + miss;
  if (!total) return null;
  return Math.round(((ok + partial * 0.5) / total) * 100);
}

function extractConclusion(report) {
  const m = report.match(/【一句话结论】\s*([\s\S]*?)(?=\s*【|$)/);
  return m ? m[1].trim().slice(0, 120) : "";
}

function validateInput({ resume, jobTitle, jobDescription, jobUrl }) {  if (!resume || !jobTitle) return "请提供简历全文和应聘岗位";
  if (typeof resume !== "string" || typeof jobTitle !== "string") return "参数类型错误";
  if (resume.length > MAX_RESUME) return `简历过长（上限 ${MAX_RESUME} 字）`;
  if (jobTitle.length > MAX_TITLE) return `岗位名称过长（上限 ${MAX_TITLE} 字）`;
  if (jobDescription && jobDescription.length > MAX_JD) return `JD 过长（上限 ${MAX_JD} 字）`;
  if (jobUrl && jobUrl.length > MAX_URL) return `链接过长`;
  return null;
}

// 首次评估埋点
function maybeLogFirstEvaluate(userId) {
  try {
    const count = db.prepare("SELECT COUNT(*) c FROM evaluations WHERE user_id = ?").get(userId).c;
    if (count === 1) logEvent(userId, "first_evaluate");
  } catch {
    // 忽略
  }
}

router.post("/evaluate", async (req, res) => {
  let { resume, jobTitle, jobDescription, jobUrl, resumeContent } = req.body || {};

  // 可选：接受结构化简历（结构化 Schema），校验后转为纯文本参与评估
  if (resumeContent) {
    try {
      resume = contentToText(parseResumeContent(resumeContent));
    } catch (error) {
      return res.status(400).json({ error: "结构化简历格式错误：" + error.message });
    }
  }

  const invalid = validateInput({ resume, jobTitle, jobDescription, jobUrl });
  if (invalid) {
    return res.status(400).json({ error: invalid });
  }

  const override = resolveOverride(req.body, normalizePlan(req.user));
  const stream = req.query.stream === "true";
  const cacheKey = computeCacheKey(resume, jobTitle, jobDescription || "", override);

  // 缓存命中：直接返回，不消耗额度、不占用并发、也不做关键词抽取
  if (CACHE_ENABLED) {
    const cached = findCachedEvaluation(req.user.id, cacheKey, CACHE_TTL_HOURS);
    if (cached) {
      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.write(`data: ${JSON.stringify({ chunk: cached.report, done: false })}\n\n`);
        res.write(
          `data: ${JSON.stringify({ chunk: "", done: true, id: cached.id, score: cached.score, report: cached.report, objective: cached.objective_json ? JSON.parse(cached.objective_json) : null, revision: cached.revision, cached: true })}\n\n`
        );
        res.end();
      } else {
        res.json({
          id: cached.id,
          score: cached.score,
          report: cached.report,
          objective: cached.objective_json ? JSON.parse(cached.objective_json) : null,
          revision: cached.revision,
          cached: true,
        });
      }
      return;
    }
  }

  // 客户端断开（刷新/关闭）时不中止 LLM：让评估在服务端跑完并落库，刷新后可在历史记录查看
  const controller = new AbortController();
  let clientClosed = false;
  res.on("close", () => {
    clientClosed = true;
  });
  const safeWrite = (line) => {
    if (clientClosed || res.writableEnded) return;
    try {
      res.write(line);
    } catch {
      // 连接已关闭，忽略
    }
  };

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
  }

  // 获取并发槽位，超出则排队
  let release;
  try {
    release = await acquire((position) => {
      if (stream) safeWrite(`data: ${JSON.stringify({ queued: true, position })}\n\n`);
    });
  } catch (error) {
    if (stream) {
      safeWrite(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
      res.end();
    } else {
      res.status(503).json({ error: error.message });
    }
    return;
  }

  try {
    const quota = consumeQuota(req.user, { isPremium: isPremiumModel(effectiveModel(override)) });
    if (!quota.allowed) {
      const msg = quotaMessage(quota);
      if (stream) {
        safeWrite(`data: ${JSON.stringify({ error: msg, done: true })}\n\n`);
        res.end();
      } else {
        res.status(429).json({ code: 3001, error: msg });
      }
      return;
    }

    // 客观分：仅在缓存未命中、真正要评估时计算；放在并发槽位内，避免绕过队列。
    // 关键词优先用 LLM 抽取（覆盖任意行业、按 JD 哈希缓存），匹配仍是确定性可解释的。
    const jdKeywords = jobDescription
      ? await getJdKeywords(jobDescription, controller.signal, override, jobTitle)
      : [];
    const objective = evaluateResume(resume, { jdText: jobDescription || "", jdKeywords });
    const objectiveJson = JSON.stringify(objective);

    if (stream) {
      let fullText = "";

      try {
        await callLLMStream(
          resume,
          jobTitle,
          jobDescription || "",
          (chunk) => {
            fullText += chunk;
            safeWrite(`data: ${JSON.stringify({ chunk, done: false })}\n\n`);
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
          safeWrite(`data: ${JSON.stringify({ chunk: report, done: false })}\n\n`);
        } catch (error) {
          if (controller.signal.aborted) {
            if (!res.writableEnded) res.end();
            return;
          }
          safeWrite(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
          res.end();
          return;
        }
      }

      if (controller.signal.aborted) {
        if (!res.writableEnded) res.end();
        return;
      }

      if (!fullText.trim()) {
        safeWrite(`data: ${JSON.stringify({ error: "评估结果为空，请重试", done: true })}\n\n`);
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
        override.isStudent ? "student" : "general",
        objectiveJson
      );

      maybeLogFirstEvaluate(req.user.id);

      safeWrite(
        `data: ${JSON.stringify({ chunk: "", done: true, id, score, report: fullText, objective, revision: 1 })}\n\n`
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
        override.isStudent ? "student" : "general",
        objectiveJson
      );

      maybeLogFirstEvaluate(req.user.id);
      res.json({ id, score, report, objective, revision: 1 });
    }
  } catch (error) {
    if (controller.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }
    console.error("评估失败:", error);
    if (stream) {
      safeWrite(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: error.message });
    }
  } finally {
    if (release) release();
  }
});

// 多岗位对比：一份简历同时对比多个 JD
router.post("/compare", async (req, res) => {
  const { resume, jobs } = req.body || {};

  if (!resume || typeof resume !== "string") {
    return res.status(400).json({ error: "请提供简历全文" });
  }
  if (!Array.isArray(jobs) || jobs.length < 2) {
    return res.status(400).json({ error: "请至少提供 2 个岗位进行对比" });
  }
  if (jobs.length > 4) {
    return res.status(400).json({ error: "最多同时对比 4 个岗位" });
  }
  for (const j of jobs) {
    if (!j || typeof j.title !== "string" || !j.title.trim()) {
      return res.status(400).json({ error: "每个岗位都要填写岗位名称" });
    }
  }

  const override = resolveOverride(req.body, normalizePlan(req.user));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const controller = new AbortController();
  let clientClosed = false;
  res.on("close", () => {
    clientClosed = true;
  });
  const safeWrite = (line) => {
    if (clientClosed || res.writableEnded) return;
    try {
      res.write(line);
    } catch {
      // 连接已关闭，忽略
    }
  };

  const plan = normalizePlan(req.user);
  const limit = dailyLimitFor(plan);
  const used = getUsage(req.user.id);
  if (plan !== "admin" && used + jobs.length > limit) {
    safeWrite(
      `data: ${JSON.stringify({
        error: `今日额度不足（需 ${jobs.length} 次，剩余 ${Math.max(0, limit - used)} 次）`,
        done: true,
      })}\n\n`
    );
    res.end();
    return;
  }

  let release;
  try {
    release = await acquire((position) => {
      safeWrite(`data: ${JSON.stringify({ queued: true, position })}\n\n`);
    });
  } catch (error) {
    safeWrite(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
    res.end();
    return;
  }

  try {
    const results = [];
    for (let i = 0; i < jobs.length; i++) {
      if (controller.signal.aborted) {
        if (!res.writableEnded) res.end();
        return;
      }
      const job = jobs[i];
      safeWrite(
        `data: ${JSON.stringify({ progress: { index: i, total: jobs.length, title: job.title } })}\n\n`
      );

      const report = await callLLM(resume, job.title, job.jd || "", controller.signal, override);
      const score = extractScore(report);
      const conclusion = extractConclusion(report);

      // 客观分（与结果页一致）：关键词优先 LLM 抽取，匹配度采用算法口径
      const jdKeywords = job.jd
        ? await getJdKeywords(job.jd, controller.signal, override, job.title)
        : [];
      const objective = evaluateResume(resume, { jdText: job.jd || "", jdKeywords });
      const matchRate =
        objective.matchRate != null ? Math.round(objective.matchRate * 100) : computeMatchRate(report);

      consumeQuota(req.user, { isPremium: isPremiumModel(effectiveModel(override)) });

      const id = saveEvaluation(
        req.user.id,
        resume,
        job.title,
        job.jd || "",
        score,
        report,
        "",
        computeCacheKey(resume, job.title, job.jd || "", override),
        override.isStudent ? "student" : "general",
        JSON.stringify(objective)
      );

      results.push({ id, title: job.title, score, matchRate, conclusion });
    }

    if (controller.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }

    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    safeWrite(`data: ${JSON.stringify({ done: true, results })}\n\n`);
    res.end();
  } catch (error) {
    if (controller.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }
    console.error("对比失败:", error);
    safeWrite(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
    res.end();
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

  const override = resolveOverride(req.body, normalizePlan(req.user));

  const controller = new AbortController();
  let clientClosed = false;
  res.on("close", () => {
    clientClosed = true;
  });
  const safeWrite = (line) => {
    if (clientClosed || res.writableEnded) return;
    try {
      res.write(line);
    } catch {
      // 连接已关闭，忽略
    }
  };

  let release;
  try {
    release = await acquire((position) => {
      safeWrite(`data: ${JSON.stringify({ queued: true, position })}\n\n`);
    });
  } catch (error) {
    safeWrite(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
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
          safeWrite(`data: ${JSON.stringify({ chunk, done: false })}\n\n`);
        },
        controller.signal,
        override
      );
    } catch (error) {
      if (controller.signal.aborted) {
        if (!res.writableEnded) res.end();
        return;
      }
      safeWrite(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
      res.end();
      return;
    }

    if (controller.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }

    safeWrite(`data: ${JSON.stringify({ chunk: "", done: true, answer: fullText })}\n\n`);
    res.end();
  } catch (error) {
    console.error("追问失败:", error);
    if (!res.writableEnded) {
      safeWrite(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
      res.end();
    }
  } finally {
    if (release) release();
  }
});

// 模拟面试准备（流式）
router.post("/interview", async (req, res) => {
  const { resume, jobTitle, jobDescription } = req.body || {};

  if (!resume || !jobTitle) {
    return res.status(400).json({ error: "请提供简历和应聘岗位" });
  }
  if (resume.length > MAX_RESUME) {
    return res.status(400).json({ error: `简历过长（上限 ${MAX_RESUME} 字）` });
  }

  const override = resolveOverride(req.body, normalizePlan(req.user));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const controller = new AbortController();
  let clientClosed = false;
  res.on("close", () => {
    clientClosed = true;
  });
  const safeWrite = (line) => {
    if (clientClosed || res.writableEnded) return;
    try {
      res.write(line);
    } catch {
      // 连接已关闭，忽略
    }
  };

  const quota = consumeQuota(req.user, { isPremium: isPremiumModel(effectiveModel(override)) });
  if (!quota.allowed) {
    safeWrite(`data: ${JSON.stringify({ error: quotaMessage(quota), done: true })}\n\n`);
    res.end();
    return;
  }

  let release;
  try {
    release = await acquire((position) => {
      safeWrite(`data: ${JSON.stringify({ queued: true, position })}\n\n`);
    });
  } catch (error) {
    safeWrite(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
    res.end();
    return;
  }

  try {
    let fullText = "";
    await interviewStream(
      {
        resume,
        jobTitle,
        jobDescription: jobDescription || "",
        isStudent: override.isStudent,
      },
      (chunk) => {
        fullText += chunk;
        safeWrite(`data: ${JSON.stringify({ chunk, done: false })}\n\n`);
      },
      controller.signal,
      override
    );

    if (controller.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }

    // 流式偶发返回空（限流/超时/模型异常）时，明确报错而不是发空的「成功」
    if (!fullText.trim()) {
      safeWrite(`data: ${JSON.stringify({ error: "生成结果为空，请重试", done: true })}\n\n`);
      res.end();
      return;
    }

    // 落库，断线后也可在历史/结果页回看（与主评估一致）
    const id = saveEvaluation(
      req.user.id,
      resume,
      jobTitle,
      jobDescription || "",
      null,
      fullText,
      "",
      null,
      override.isStudent ? "student" : "general",
      null
    );
    safeWrite(`data: ${JSON.stringify({ chunk: "", done: true, id, text: fullText })}\n\n`);
    res.end();
  } catch (error) {
    if (controller.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }
    console.error("面试准备失败:", error);
    safeWrite(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
    res.end();
  } finally {
    if (release) release();
  }
});

// 岗位方向推荐（流式）
router.post("/directions", async (req, res) => {
  const { resume } = req.body || {};

  if (!resume || typeof resume !== "string") {
    return res.status(400).json({ error: "请提供简历全文" });
  }
  if (resume.length > MAX_RESUME) {
    return res.status(400).json({ error: `简历过长（上限 ${MAX_RESUME} 字）` });
  }

  const override = resolveOverride(req.body, normalizePlan(req.user));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const controller = new AbortController();
  let clientClosed = false;
  res.on("close", () => {
    clientClosed = true;
  });
  const safeWrite = (line) => {
    if (clientClosed || res.writableEnded) return;
    try {
      res.write(line);
    } catch {
      // 连接已关闭，忽略
    }
  };

  const quota = consumeQuota(req.user, { isPremium: isPremiumModel(effectiveModel(override)) });
  if (!quota.allowed) {
    safeWrite(`data: ${JSON.stringify({ error: quotaMessage(quota), done: true })}\n\n`);
    res.end();
    return;
  }

  let release;
  try {
    release = await acquire((position) => {
      safeWrite(`data: ${JSON.stringify({ queued: true, position })}\n\n`);
    });
  } catch (error) {
    safeWrite(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
    res.end();
    return;
  }

  try {
    let fullText = "";
    await directionsStream(
      { resume, isStudent: override.isStudent },
      (chunk) => {
        fullText += chunk;
        safeWrite(`data: ${JSON.stringify({ chunk, done: false })}\n\n`);
      },
      controller.signal,
      override
    );

    if (controller.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }

    // 流式偶发返回空（限流/超时/模型异常）时，明确报错而不是发空的「成功」
    if (!fullText.trim()) {
      safeWrite(`data: ${JSON.stringify({ error: "生成结果为空，请重试", done: true })}\n\n`);
      res.end();
      return;
    }

    // 落库，断线后也可在历史/结果页回看（与主评估一致）
    const id = saveEvaluation(
      req.user.id,
      resume,
      "岗位方向推荐",
      "",
      null,
      fullText,
      "",
      null,
      override.isStudent ? "student" : "general",
      null
    );
    safeWrite(`data: ${JSON.stringify({ chunk: "", done: true, id, text: fullText })}\n\n`);
    res.end();
  } catch (error) {
    if (controller.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }
    console.error("方向推荐失败:", error);
    safeWrite(`data: ${JSON.stringify({ error: error.message, done: true })}\n\n`);
    res.end();
  } finally {
    if (release) release();
  }
});

router.get("/evaluations", (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, job_title, score, person_name, person_key, favorite, created_at
       FROM evaluations WHERE user_id = ? ORDER BY favorite DESC, id DESC LIMIT 300`
    )
    .all(req.user.id);
  const plan = normalizePlan(req.user);
  const limit = dailyLimitFor(plan);
  res.json({
    records: rows,
    usage: { used: getUsage(req.user.id), limit: Number.isFinite(limit) ? limit : -1, plan },
  });
});

router.get("/evaluations/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM evaluations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "记录不存在" });
  if (row.objective_json) {
    try {
      row.objective = JSON.parse(row.objective_json);
    } catch {
      row.objective = null;
    }
  }
  // 改进轨迹：同一人（person_key）上一次的分数与差值
  if (row.person_key) {
    const prev = db
      .prepare(
        `SELECT score FROM evaluations
         WHERE user_id = ? AND person_key = ? AND id < ? AND score IS NOT NULL
         ORDER BY id DESC LIMIT 1`
      )
      .get(row.user_id, row.person_key, row.id);
    row.previousScore = prev?.score ?? null;
    row.scoreDelta =
      prev && row.score != null ? Math.round((row.score - prev.score) * 10) / 10 : null;
  } else {
    row.previousScore = null;
    row.scoreDelta = null;
  }
  res.json(row);
});

router.put("/evaluations/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM evaluations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "记录不存在" });

  // 乐观并发：客户端带 revision 时校验，不匹配则返回 409
  const clientRevision = Number(req.body?.revision);
  if (Number.isInteger(clientRevision) && clientRevision !== row.revision) {
    return res.status(409).json({
      code: 1005,
      error: "记录已被修改，请刷新后重试",
      details: { currentRevision: row.revision },
    });
  }

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
         job_url = ?, person_key = ?, person_name = ?, revision = revision + 1
     WHERE id = ? AND user_id = ? AND revision = ?`
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
    req.user.id,
    row.revision
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

// 收藏 / 取消收藏（收藏的记录不会被自动清理）
router.put("/evaluations/:id/favorite", (req, res) => {
  const favorite = req.body?.favorite ? 1 : 0;
  const info = db
    .prepare("UPDATE evaluations SET favorite = ? WHERE id = ? AND user_id = ?")
    .run(favorite, req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: "记录不存在" });
  res.json({ ok: true, favorite: !!favorite });
});

// 生成 / 更新只读分享链接
router.post("/evaluations/:id/share", (req, res) => {
  const row = db
    .prepare("SELECT * FROM evaluations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "记录不存在" });
  const hideContact = req.body?.hideContact ? 1 : 0;
  // 简历原文默认不分享，需显式勾选（避免过度暴露教育/项目经历）
  const includeResume = req.body?.includeResume ? 1 : 0;
  const hideName = req.body?.hideName ? 1 : 0;
  const ttlDays = Number(process.env.SHARE_TTL_DAYS || 30);
  const token = row.share_token || crypto.randomBytes(12).toString("hex");
  db.prepare(
    `UPDATE evaluations
     SET share_token = ?, share_hide_contact = ?, share_include_resume = ?, share_hide_name = ?,
         share_expires_at = datetime('now', ?)
     WHERE id = ? AND user_id = ?`
  ).run(token, hideContact, includeResume, hideName, `+${ttlDays} days`, req.params.id, req.user.id);

  const expiresAt = db
    .prepare("SELECT share_expires_at FROM evaluations WHERE id = ?")
    .get(req.params.id)?.share_expires_at;
  res.json({
    ok: true,
    token,
    hideContact: !!hideContact,
    includeResume: !!includeResume,
    hideName: !!hideName,
    expiresAt,
  });
});

// 取消分享
router.delete("/evaluations/:id/share", (req, res) => {
  const info = db
    .prepare("UPDATE evaluations SET share_token = NULL WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: "记录不存在" });
  res.json({ ok: true });
});

export default router;
