import { Router } from "express";
import { callLLM, followUpStream, interviewStream, directionsStream } from "../llm/llm.js";
import { evaluateResume } from "../scoring/index.js";
import { getJdKeywords } from "../core/jdKeywords.js";
import { withUsageContext } from "../core/usage.js";
import { parseResumeContent, contentToText } from "../../shared/resumeSchema.js";
import { findCachedEvaluation } from "../core/store.js";
import { requireAuth } from "../core/auth.js";
import { withQuota, hasQuotaFor, getUsage } from "../core/quota.js";
import { normalizePlan, dailyLimitFor, isPremiumModel } from "../core/plans.js";
import { acquire } from "../core/queue.js";
import { userMessage } from "../http/userMessages.js";
import { createSseConn } from "../http/stream.js";
import {
  computeCacheKey,
  resolveOverride,
  effectiveModel,
  extractScore,
  computeMatchRate,
  extractConclusion,
  validateInput,
  saveReport,
  streamReportWithFallback,
  MAX_RESUME,
} from "./evaluateHelpers.js";

const router = Router();

const CACHE_ENABLED = process.env.CACHE_ENABLED !== "false";
const CACHE_TTL_HOURS = Number(process.env.CACHE_TTL_HOURS || 24);

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

  // 客户端断开（刷新/关闭）时不中止 LLM：让评估在服务端跑完并落库，刷新后可在历史记录查看
  const controller = new AbortController();
  const conn = createSseConn(res);
  if (stream) conn.start();

  // 缓存命中：直接返回，不消耗额度、不占用并发、也不做关键词抽取
  if (CACHE_ENABLED) {
    const cached = findCachedEvaluation(req.user.id, cacheKey, CACHE_TTL_HOURS);
    if (cached) {
      const payload = {
        id: cached.id,
        score: cached.score,
        report: cached.report,
        objective: cached.objective_json ? JSON.parse(cached.objective_json) : null,
        revision: cached.revision,
        cached: true,
      };
      if (stream) {
        conn.write({ chunk: cached.report, done: false });
        conn.write({ chunk: "", done: true, ...payload });
        conn.end();
      } else {
        res.json(payload);
      }
      return;
    }
  }

  // 获取并发槽位，超出则排队
  let release;
  try {
    release = await acquire((position) => {
      if (stream) conn.write({ queued: true, position });
    });
  } catch (error) {
    if (stream) conn.error(userMessage(error));
    else res.status(503).json({ error: userMessage(error) });
    return;
  }

  const isPremium = isPremiumModel(effectiveModel(override));

  try {
    // 计费唯一入口：把「关键词抽取 + 客观分 + LLM 生成 + 落库」整段包进 work，
    // 任一环节失败都会自动退还额度（见 core/quota.js 的 withQuota）。
    const { result } = await withQuota(req.user, { isPremium }, async () => {
      // 客观分：仅在缓存未命中、真正要评估时计算；放在并发槽位内，避免绕过队列。
      // 关键词优先用 LLM 抽取（覆盖任意行业、按 JD 哈希缓存），匹配仍是确定性可解释的。
      const jdKeywords = jobDescription
        ? await getJdKeywords(jobDescription, controller.signal, override, jobTitle)
        : [];
      const objective = evaluateResume(resume, { jdText: jobDescription || "", jdKeywords });
      const objectiveJson = JSON.stringify(objective);

      if (stream) {
        const fullText = await streamReportWithFallback({
          resume,
          jobTitle,
          jobDescription: jobDescription || "",
          override,
          signal: controller.signal,
          onChunk: (chunk) => conn.write({ chunk, done: false }),
        });
        if (!fullText.trim()) throw new Error("评估结果为空，请重试");

        const score = extractScore(fullText);
        const id = saveReport(req.user.id, {
          resume,
          jobTitle,
          jobDescription: jobDescription || "",
          score,
          report: fullText,
          jobUrl,
          cacheKey,
          candidateType: override.isStudent ? "student" : "general",
          objectiveJson,
        });
        return { id, score, report: fullText, objective };
      }

      const report = await callLLM(resume, jobTitle, jobDescription || "", controller.signal, override);
      const score = extractScore(report);
      const id = saveReport(req.user.id, {
        resume,
        jobTitle,
        jobDescription: jobDescription || "",
        score,
        report,
        jobUrl,
        cacheKey,
        candidateType: override.isStudent ? "student" : "general",
        objectiveJson,
      });
      return { id, score, report, objective };
    });

    if (stream) {
      conn.write({ chunk: "", done: true, id: result.id, score: result.score, report: result.report, objective: result.objective, revision: 1 });
      conn.end();
    } else {
      res.json({
        id: result.id,
        score: result.score,
        report: result.report,
        objective: result.objective,
        revision: 1,
      });
    }
  } catch (error) {
    if (controller.signal.aborted) {
      conn.end();
      return;
    }
    if (error.code === 3001) {
      if (stream) conn.error(userMessage(error));
      else res.status(429).json({ code: 3001, error: userMessage(error) });
      return;
    }
    console.error("评估失败:", error);
    if (stream) conn.error(userMessage(error));
    else res.status(500).json({ error: userMessage(error) });
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

  const controller = new AbortController();
  const conn = createSseConn(res);
  conn.start();

  // 提前反馈（不消耗）：额度不够跑完 N 个岗位时直接告知，避免跑到一半才失败
  if (!hasQuotaFor(req.user, jobs.length)) {
    const limit = dailyLimitFor(normalizePlan(req.user));
    const used = getUsage(req.user.id);
    conn.error(`今日额度不足（需 ${jobs.length} 次，剩余 ${Math.max(0, limit - used)} 次）`);
    return;
  }

  const release = await conn.queue();
  if (!release) return;

  const isPremium = isPremiumModel(effectiveModel(override));
  try {
    const results = [];
    for (let i = 0; i < jobs.length; i++) {
      if (controller.signal.aborted) {
        conn.end();
        return;
      }
      const job = jobs[i];
      conn.write({ progress: { index: i, total: jobs.length, title: job.title } });

      // 每个岗位单独计费：该岗 LLM 成功并落库后才计费，失败自动退还
      const { result } = await withQuota(req.user, { isPremium }, async () => {
        const report = await callLLM(resume, job.title, job.jd || "", controller.signal, override);
        const score = extractScore(report);
        const conclusion = extractConclusion(report);

        // 客观分（与结果页一致）：关键词优先 LLM 抽取，匹配度采用算法口径
        const jdKeywords = job.jd
          ? await getJdKeywords(job.jd, controller.signal, override, job.title)
          : [];
        const objective = evaluateResume(resume, { jdText: job.jd || "", jdKeywords });
        const matchRate =
          objective.matchRate != null
            ? Math.round(objective.matchRate * 100)
            : computeMatchRate(report);

        const id = saveReport(req.user.id, {
          resume,
          jobTitle: job.title,
          jobDescription: job.jd || "",
          score,
          report,
          cacheKey: computeCacheKey(resume, job.title, job.jd || "", override),
          candidateType: override.isStudent ? "student" : "general",
          objectiveJson: JSON.stringify(objective),
        });
        return { id, title: job.title, score, matchRate, conclusion };
      });

      results.push(result);
    }

    if (controller.signal.aborted) {
      conn.end();
      return;
    }

    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    conn.write({ done: true, results });
    conn.end();
  } catch (error) {
    if (controller.signal.aborted) {
      conn.end();
      return;
    }
    console.error("对比失败:", error);
    conn.error(userMessage(error));
  } finally {
    release();
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
  const conn = createSseConn(res);
  conn.start();

  const release = await conn.queue();
  if (!release) return;

  const isPremium = isPremiumModel(effectiveModel(override));
  try {
    // 追问计入每日额度（与评估一致：失败自动退还）
    const { result } = await withQuota(req.user, { isPremium }, async () => {
      let fullText = "";
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
          conn.write({ chunk, done: false });
        },
        controller.signal,
        override
      );
      return { answer: fullText };
    });

    if (controller.signal.aborted) {
      conn.end();
      return;
    }

    conn.write({ chunk: "", done: true, answer: result.answer });
    conn.end();
  } catch (error) {
    if (controller.signal.aborted) {
      conn.end();
      return;
    }
    if (error.code !== 3001) console.error("追问失败:", error);
    conn.error(userMessage(error));
  } finally {
    release();
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

  const controller = new AbortController();
  const conn = createSseConn(res);
  conn.start();

  const release = await conn.queue();
  if (!release) return;

  const isPremium = isPremiumModel(effectiveModel(override));
  try {
    // 计费唯一入口：生成成功并落库后才计费，失败/空结果自动退还
    const { result } = await withQuota(req.user, { isPremium }, async () => {
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
          conn.write({ chunk, done: false });
        },
        controller.signal,
        override
      );

      // 流式偶发返回空（限流/超时/模型异常）时，明确报错而不是发空的「成功」
      if (!fullText.trim()) throw new Error("生成结果为空，请重试");

      // 落库，断线后也可在历史/结果页回看（与主评估一致）
      const id = saveReport(req.user.id, {
        resume,
        jobTitle,
        jobDescription: jobDescription || "",
        score: null,
        report: fullText,
        candidateType: override.isStudent ? "student" : "general",
      });
      return { id, text: fullText };
    });

    if (controller.signal.aborted) {
      conn.end();
      return;
    }

    conn.write({ chunk: "", done: true, id: result.id, text: result.text });
    conn.end();
  } catch (error) {
    if (controller.signal.aborted) {
      conn.end();
      return;
    }
    if (error.code !== 3001) console.error("面试准备失败:", error);
    conn.error(userMessage(error));
  } finally {
    release();
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

  const controller = new AbortController();
  const conn = createSseConn(res);
  conn.start();

  const release = await conn.queue();
  if (!release) return;

  const isPremium = isPremiumModel(effectiveModel(override));
  try {
    // 计费唯一入口：生成成功并落库后才计费，失败/空结果自动退还
    const { result } = await withQuota(req.user, { isPremium }, async () => {
      let fullText = "";
      await directionsStream(
        { resume, isStudent: override.isStudent },
        (chunk) => {
          fullText += chunk;
          conn.write({ chunk, done: false });
        },
        controller.signal,
        override
      );

      // 流式偶发返回空（限流/超时/模型异常）时，明确报错而不是发空的「成功」
      if (!fullText.trim()) throw new Error("生成结果为空，请重试");

      // 落库，断线后也可在历史/结果页回看（与主评估一致）
      const id = saveReport(req.user.id, {
        resume,
        jobTitle: "岗位方向推荐",
        jobDescription: "",
        score: null,
        report: fullText,
        candidateType: override.isStudent ? "student" : "general",
      });
      return { id, text: fullText };
    });

    if (controller.signal.aborted) {
      conn.end();
      return;
    }

    conn.write({ chunk: "", done: true, id: result.id, text: result.text });
    conn.end();
  } catch (error) {
    if (controller.signal.aborted) {
      conn.end();
      return;
    }
    if (error.code !== 3001) console.error("方向推荐失败:", error);
    conn.error(userMessage(error));
  } finally {
    release();
  }
});

export default router;
