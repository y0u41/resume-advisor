import { Router } from "express";
import { ResumeContentSchema } from "../../shared/resumeSchema.js";
import { listProviders, defaultModel } from "../core/models.js";
import { requireAuth } from "../core/auth.js";

// 模型目录 + 结构化简历校验（与评估流程无直接耦合，独立成路由）
const router = Router();
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

export default router;
