import {
  SYSTEM_PROMPT,
  buildEvaluatePrompt,
  FOLLOWUP_SYSTEM_PROMPT,
  buildFollowupPrompt,
  INTERVIEW_SYSTEM_PROMPT,
  buildInterviewPrompt,
  DIRECTIONS_SYSTEM_PROMPT,
  buildDirectionsPrompt,
} from "./prompt.js";

const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 180000);
const STREAM_IDLE_MS = Number(process.env.LLM_STREAM_IDLE_MS || 60000);
const LLM_MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES || 2);

function getConfig(override) {
  const provider = (override?.provider || process.env.LLM_PROVIDER || "").trim().toLowerCase();

  // 多提供商模式：LLM_PROVIDER=deepseek / bigmodel ...
  if (provider) {
    const prefix = provider.toUpperCase();
    const apiKey = process.env[`${prefix}_API_KEY`];
    const baseUrl = process.env[`${prefix}_BASE_URL`];
    const model = override?.model || process.env[`${prefix}_MODEL`];
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
  const model = override?.model || process.env.LLM_MODEL || "deepseek-v4-flash";
  if (!apiKey) {
    throw new Error("未配置 LLM_API_KEY，请在 .env 文件中设置");
  }
  return { provider: "default", apiKey, baseUrl: baseUrl.replace(/\/+$/, ""), model };
}

export function getProviderInfo(override) {
  const { provider, baseUrl, model } = getConfig(override);
  return { provider, baseUrl, model };
}

function buildMessages(resume, jobTitle, jobDescription, options = {}) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildEvaluatePrompt(resume, jobTitle, jobDescription, options) },
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

// 可重试的错误：限流、服务端错误、超时、网络问题
function isRetryable(error) {
  const msg = error?.message || "";
  return (
    /\((429|500|502|503|504)\)/.test(msg) ||
    /超时|timeout|ECONNRESET|fetch failed|network|socket/i.test(msg)
  );
}

async function withRetry(fn, retries = LLM_MAX_RETRIES) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isRetryable(error)) throw error;
      console.warn(`LLM 调用失败，${attempt + 1}/${retries} 次重试...（${error.message.slice(0, 80)}）`);
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function callLLM(resume, jobTitle, jobDescription, externalSignal, override) {
  const { apiKey, baseUrl, model } = getConfig(override);

  const attempt = async () => {
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
          messages: buildMessages(resume, jobTitle, jobDescription, override),
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
  };

  return withRetry(attempt);
}

export async function callLLMStream(resume, jobTitle, jobDescription, onChunk, externalSignal, override) {
  const { apiKey, baseUrl, model } = getConfig(override);

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
        messages: buildMessages(resume, jobTitle, jobDescription, override),
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

export async function extractJobInfo(rawText, externalSignal, override) {
  const { apiKey, baseUrl, model } = getConfig(override);

  const attempt = async () => {
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
  };

  return withRetry(attempt, 1);
}

// 继续追问（流式）：基于简历 + 岗位 + 已有报告回答用户的追问
export async function followUpStream(params, onChunk, externalSignal, override) {
  const { apiKey, baseUrl, model } = getConfig(override);

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
        messages: [
          { role: "system", content: FOLLOWUP_SYSTEM_PROMPT },
          { role: "user", content: buildFollowupPrompt(params) },
        ],
        temperature: 0.4,
        max_tokens: 4096,
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

// 模拟面试准备（流式）
export async function interviewStream(params, onChunk, externalSignal, override) {
  const { apiKey, baseUrl, model } = getConfig(override);

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
        messages: [
          { role: "system", content: INTERVIEW_SYSTEM_PROMPT },
          { role: "user", content: buildInterviewPrompt(params) },
        ],
        temperature: 0.5,
        max_tokens: 6000,
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

// 岗位方向推荐（流式）
export async function directionsStream(params, onChunk, externalSignal, override) {
  const { apiKey, baseUrl, model } = getConfig(override);

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
        messages: [
          { role: "system", content: DIRECTIONS_SYSTEM_PROMPT },
          { role: "user", content: buildDirectionsPrompt(params) },
        ],
        temperature: 0.5,
        max_tokens: 3000,
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

const OCR_SYSTEM_PROMPT = `你是一个 OCR 助手。请准确提取图片中的全部文字，并保持原有结构（分节标题、换行、项目符号、时间线等）。只输出提取到的文字，不要添加任何解释、评论或额外说明。如果图片不是文档，就提取其中所有可读的文字。`;

// 图片 OCR：把一张图片（data URL）交给视觉模型，返回识别出的文字
export async function ocrImage(dataUrl, externalSignal, override) {
  const { apiKey, baseUrl, model } = getConfig(override);
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
          { role: "system", content: OCR_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "请提取这张图片里的全部文字。" },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 4096,
      }),
    });

    await assertOk(response);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("OCR 未返回内容");
    return content.trim();
  } finally {
    cleanup();
  }
}
