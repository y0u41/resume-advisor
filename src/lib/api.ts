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
  objective?: import("./report/report").ObjectiveScore | null;
  revision?: number;
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
  onProgress?: (data: any) => void;
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
    if (res.status === 401) {
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      return;
    }
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
        if (data.progress) {
          handlers.onProgress?.(data.progress);
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
        onDone({
          id: data.id,
          score: data.score ?? null,
          report: data.report ?? fullText,
          objective: data.objective ?? null,
          revision: data.revision ?? 1,
        }),
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

export interface CompareJob {
  title: string;
  jd: string;
}

export interface CompareResult {
  id: number;
  title: string;
  score: number | null;
  matchRate: number | null;
  conclusion: string;
}

export function compareStream(
  payload: {
    resume: string;
    jobs: CompareJob[];
    provider?: string;
    model?: string;
    candidateType?: string;
  },
  handlers: {
    onProgress?: (p: { index: number; total: number; title: string }) => void;
    onDone: (results: CompareResult[]) => void;
    onError: (message: string) => void;
    onQueued?: (position: number) => void;
  }
): Promise<void> {
  return postStream("/api/compare", payload, {
    onChunk: () => {},
    onQueued: handlers.onQueued,
    onProgress: handlers.onProgress,
    onError: handlers.onError,
    onDone: (data) => handlers.onDone(data.results || []),
  });
}

export function interviewStream(
  payload: {
    resume: string;
    jobTitle: string;
    jobDescription: string;
    provider?: string;
    model?: string;
    candidateType?: string;
  },
  onChunk: (textSoFar: string) => void,
  onDone: (text: string) => void,
  onError: (message: string) => void,
  onQueued?: (position: number) => void
): Promise<void> {
  return postStream("/api/interview", payload, {
    onChunk,
    onQueued,
    onError,
    onDone: (data, fullText) => onDone(data.text ?? fullText),
  });
}

export function directionsStream(
  payload: {
    resume: string;
    provider?: string;
    model?: string;
    candidateType?: string;
  },
  onChunk: (textSoFar: string) => void,
  onDone: (text: string) => void,
  onError: (message: string) => void,
  onQueued?: (position: number) => void
): Promise<void> {
  return postStream("/api/directions", payload, {
    onChunk,
    onQueued,
    onError,
    onDone: (data, fullText) => onDone(data.text ?? fullText),
  });
}

// 记录一次下载/导出（失败不影响下载本身）
export async function recordDownload(
  kind: string,
  title: string,
  format: string
): Promise<void> {
  try {
    await fetch("/api/downloads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, title, format }),
    });
  } catch {
    // 忽略
  }
}

// ===== 分享（只读链接）=====
export async function shareEvaluation(
  id: number,
  hideContact: boolean
): Promise<{ token: string; hideContact: boolean }> {
  const res = await fetch(`/api/evaluations/${id}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hideContact }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "生成分享链接失败");
  return data;
}

export async function unshareEvaluation(id: number): Promise<void> {
  try {
    await fetch(`/api/evaluations/${id}/share`, { method: "DELETE" });
  } catch {
    // 忽略
  }
}

export async function fetchShared(token: string): Promise<any> {
  const res = await fetch(`/api/share/${encodeURIComponent(token)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "分享不存在或已取消");
  return data;
}
// ===== 游客试用（免注册）=====
export interface GuestQuota {
  used: number;
  limit: number;
  remaining: number;
}

export async function fetchGuestQuota(): Promise<GuestQuota> {
  try {
    const r = await fetch("/api/guest/quota");
    if (!r.ok) throw new Error();
    return await r.json();
  } catch {
    return { used: 0, limit: 1, remaining: 1 };
  }
}

export function guestEvaluateStream(
  payload: { resume: string; jobTitle: string; jobDescription: string },
  onChunk: (textSoFar: string) => void,
  onDone: (data: any) => void,
  onError: (message: string) => void,
  signal?: AbortSignal
): Promise<void> {
  return postStream(
    "/api/guest/evaluate",
    payload,
    {
      onChunk,
      onError,
      onDone: (data, fullText) => onDone({ ...data, report: data.report ?? fullText }),
    },
    signal
  );
}
