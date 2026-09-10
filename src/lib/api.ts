export interface EvalPayload {
  resume: string;
  jobTitle: string;
  jobDescription: string;
  jobUrl?: string;
  provider?: string;
  model?: string;
  candidateType?: string;
}

export interface EvalResult {
  id?: number;
  score: number | null;
  report: string;
}

export interface FollowupPayload {
  resume: string;
  jobTitle: string;
  jobDescription: string;
  report: string;
  question: string;
  provider?: string;
  model?: string;
  candidateType?: string;
}

interface Handlers {
  onChunk: (textSoFar: string) => void;
  onDone: (data: any, fullText: string) => void;
  onError: (message: string) => void;
  onQueued?: (position: number) => void;
}

async function postStream(
  url: string,
  payload: unknown,
  handlers: Handlers,
  signal?: AbortSignal
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") return;
    handlers.onError(err?.message || "网络请求失败");
    return;
  }

  if (!res.ok) {
    let msg = `请求失败 (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      // 忽略非 JSON 响应
    }
    handlers.onError(msg);
    return;
  }

  if (!res.body) {
    handlers.onError("服务器未返回数据流");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let data: any;
        try {
          data = JSON.parse(line.slice(6));
        } catch {
          continue;
        }

        if (data.error) {
          handlers.onError(data.error);
          return;
        }
        if (data.queued) {
          handlers.onQueued?.(data.position ?? 0);
          continue;
        }
        if (data.done) {
          handlers.onDone(data, fullText);
          return;
        }
        if (data.chunk) {
          fullText += data.chunk;
          handlers.onChunk(fullText);
        }
      }
    }
  } catch (err: any) {
    if (err?.name === "AbortError") return;
    handlers.onError(err?.message || "数据流中断");
    return;
  }

  handlers.onDone({}, fullText);
}

export function streamEvaluate(
  payload: EvalPayload,
  onChunk: (textSoFar: string) => void,
  onDone: (result: EvalResult) => void,
  onError: (message: string) => void,
  onQueued?: (position: number) => void,
  signal?: AbortSignal
): Promise<void> {
  return postStream(
    "/api/evaluate?stream=true",
    payload,
    {
      onChunk,
      onQueued,
      onError,
      onDone: (data, fullText) =>
        onDone({ id: data.id, score: data.score ?? null, report: data.report ?? fullText }),
    },
    signal
  );
}

export function followUpStream(
  payload: FollowupPayload,
  onChunk: (textSoFar: string) => void,
  onDone: (answer: string) => void,
  onError: (message: string) => void,
  onQueued?: (position: number) => void,
  signal?: AbortSignal
): Promise<void> {
  return postStream(
    "/api/followup",
    payload,
    {
      onChunk,
      onQueued,
      onError,
      onDone: (data, fullText) => onDone(data.answer ?? fullText),
    },
    signal
  );
}
