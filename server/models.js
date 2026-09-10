// 内置模型目录；可用 <PROVIDER>_MODELS=id1,id2 覆盖
const CATALOG = {
  deepseek: {
    label: "DeepSeek",
    models: [
      { id: "deepseek-v4-flash", label: "V4 Flash（快 / 省）" },
      { id: "deepseek-v4-pro", label: "V4 Pro（更强）" },
      { id: "deepseek-v4-flash-vision-exp", label: "V4 Flash Vision（实验）" },
    ],
  },
  bigmodel: {
    label: "智谱 GLM",
    models: [
      { id: "glm-4.7-flash", label: "GLM-4.7-Flash（免费）" },
      { id: "glm-4.5-flash", label: "GLM-4.5-Flash（免费）" },
      { id: "glm-4.6", label: "GLM-4.6（强）" },
      { id: "glm-5.3", label: "GLM-5.3（旗舰）" },
      { id: "glm-5.3-flash", label: "GLM-5.3-Flash（多模态）" },
    ],
  },
};

function isConfigured(name) {
  const prefix = name.toUpperCase();
  return Boolean(
    process.env[`${prefix}_API_KEY`] && process.env[`${prefix}_BASE_URL`]
  );
}

function modelsFor(name) {
  const override = process.env[`${name.toUpperCase()}_MODELS`];
  if (override) {
    return override
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((id) => ({ id, label: id }));
  }
  return CATALOG[name]?.models || [];
}

// 返回已配置且含模型的提供商分组
export function listProviders() {
  return Object.keys(CATALOG)
    .filter(isConfigured)
    .map((name) => ({
      provider: name,
      label: CATALOG[name].label,
      models: modelsFor(name),
    }))
    .filter((p) => p.models.length > 0);
}

export function isModelAllowed(provider, model) {
  const group = listProviders().find((p) => p.provider === provider);
  if (!group) return false;
  return group.models.some((m) => m.id === model);
}

export function defaultModel(provider) {
  const envModel = process.env[`${provider.toUpperCase()}_MODEL`];
  if (envModel && isModelAllowed(provider, envModel)) return envModel;
  return modelsFor(provider)[0]?.id;
}
