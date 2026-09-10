import { SYSTEM_PROMPT, buildEvaluatePrompt } from "./prompt.js";

const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 120000);
const STREAM_IDLE_MS = Number(process.env.LLM_STREAM_IDLE_MS || 45000);

function getConfig(providerOverride) {
  const provider = (providerOverride || process.env.LLM_PROVIDER || "").trim().toLowerCase();

  // 多提供商模式：LLM_PROVIDER=deepseek / bigmodel ...
  if (provider) {
    const prefix = provider.toUpperCase();
    const apiKey = process.env[`${prefix}_API_KEY`];
    const baseUrl = process.env[`${prefix}_BASE_URL`];
    const model = process.env[`${prefix}_MODEL`];
    if (!apiKey || !baseUrl || !model) {
      throw new Error(
        `未正确配置模型提供商「${provider}」：请在 .env 设置 ${prefix}_API_KEY / ${prefix}_BASE_URL / ${prefix}_MODEL`
      );
    }
    return { provider, apiKey, baseUrl: baseUrl.replace(/\/+$/, ""), model };
  }

  // 兼容旧配置
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || "https://api.deepseek.com";
  const model = process.env.LLM_MODEL || "deepseek-v4-flash";
  if (!apiKey) {
    throw new Error("未配置 LLM_API_KEY，请在 .env 文件中设置");
  }
  return { provider: "default", apiKey, baseUrl: baseUrl.replace(/\/+$/, ""), model };
}

// 列出已配置（有 Key）的提供商
const KNOWN_PROVIDERS = ["deepseek", "bigmodel"];
export function listProviders() {
  return KNOWN_PROVIDERS.map((name) => {
    const prefix = name.toUpperCase();
    const apiKey = process.env[`${prefix}_API_KEY`];
    const baseUrl = process.env[`${prefix}_BASE_URL`];
    const model = process.env[`${prefix}_MODEL`];
    return apiKey && baseUrl && model ? { provider: name, model } : null;
  }).filter(Boolean);
}

export function getProviderInfo(providerOverride) {
  const { provider, baseUrl, model } = getConfig(providerOverride);
  return { provider, baseUrl, model };
}

function buildMessages(resume, jobTitle, jobDescription) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildEvaluatePrompt(resume, jobTitle, jobDescription) },
  ];
}

function withTimeout(externalSignal, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("LLM 请求超时")), ms);
  const onAbort = () => controller.abort(externalSignal.reason);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener("abort", onAbort);
    },
  };
}

async function assertOk(response) {
  if (response.ok) return;
  const error = await response.text().catch(() => "");
  throw new Error(`LLM API 调用失败 (${response.status}): ${error.slice(0, 500)}`);
}

export async function callLLM(resume, jobTitle, jobDescription, externalSignal, providerOverride) {
  const { apiKey, baseUrl, model } = getConfig(providerOverride);
  const { signal, cleanup } = withTimeout(externalSignal, LLM_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: buildMessages(resume, jobTitle, jobDescription),
        temperature: 0.3,
        max_tokens: 8192,
      }),
    });

    await assertOk(response);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("LLM 返回格式异常：未找到回复内容");
    }
    return content;
  } finally {
    cleanup();
  }
}

export async function callLLMStream(resume, jobTitle, jobDescription, onChunk, externalSignal, providerOverride) {
  const { apiKey, baseUrl, model } = getConfig(providerOverride);

  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(new Error("LLM 请求超时")), LLM_TIMEOUT_MS);
  let idleTimer = null;
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(new Error("LLM 流式响应停滞")), STREAM_IDLE_MS);
  };
  const onAbort = () => controller.abort(externalSignal.reason);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    resetIdle();
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: buildMessages(resume, jobTitle, jobDescription),
        temperature: 0.3,
        max_tokens: 8192,
        stream: true,
      }),
    });

    await assertOk(response);
    resetIdle();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdle();

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onChunk(content);
          }
        } catch {
          // 忽略不完整/非 JSON 的行
        }
      }
    }

    return fullText;
  } finally {
    clearTimeout(totalTimer);
    if (idleTimer) clearTimeout(idleTimer);
    if (externalSignal) externalSignal.removeEventListener("abort", onAbort);
  }
}

const JD_EXTRACT_PROMPT = `你是一个招聘信息抽取助手。用户会给你一段从招聘网页抓取来的文本，里面混杂了大量无关内容（网站导航、推荐职位、广告、页脚、评论、版权信息、无关链接等）。

请只提取该招聘岗位的核心信息，忽略一切无关内容。按下面的结构输出，没有的项直接省略，不要保留空标题：

【岗位名称】
【公司名称】
【薪资待遇】
【工作地点】
【经验要求】
【学历要求】
【岗位职责】
（逐条列出）
【任职要求】
（逐条列出）
【加分项】
【福利待遇】

要求：
- 只保留原文中真实出现的信息，严禁编造
- 删除导航、推荐、广告、评论、页脚、版权等噪声内容
- 条目化、简洁，不要大段照抄无关文字
- 如果文本不是招聘信息，就提炼其中最像岗位要求的部分`;

export async function extractJobInfo(rawText, externalSignal, providerOverride) {
  const { apiKey, baseUrl, model } = getConfig(providerOverride);
  const { signal, cleanup } = withTimeout(externalSignal, LLM_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: JD_EXTRACT_PROMPT },
          { role: "user", content: rawText },
        ],
        temperature: 0.1,
        max_tokens: 2500,
      }),
    });

    await assertOk(response);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("LLM 未返回有效内容");
    }
    return content.trim();
  } finally {
    cleanup();
  }
}
