import { SYSTEM_PROMPT, buildEvaluatePrompt } from "./prompt.js";

const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 120000);

function getConfig() {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.LLM_MODEL || "gpt-4o";
  if (!apiKey) {
    throw new Error("未配置 LLM_API_KEY，请在 .env 文件中设置");
  }
  return { apiKey, baseUrl, model };
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

export async function callLLM(resume, jobTitle, jobDescription, externalSignal) {
  const { apiKey, baseUrl, model } = getConfig();
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

export async function callLLMStream(resume, jobTitle, jobDescription, onChunk, externalSignal) {
  const { apiKey, baseUrl, model } = getConfig();
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
        stream: true,
      }),
    });

    await assertOk(response);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

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
    cleanup();
  }
}
