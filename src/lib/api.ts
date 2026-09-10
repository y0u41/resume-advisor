export interface EvalPayload {
  resume: string;
  jobTitle: string;
  jobDescription: string;
  jobUrl?: string;
}

export interface EvalResult {
  id?: number;
  score: number | null;
  report: string;
}

export async function streamEvaluate(
  payload: EvalPayload,
  onChunk: (textSoFar: string) => void,
  onDone: (result: EvalResult) => void,
  onError: (message: string) => void,
  signal?: AbortSignal
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/evaluate?stream=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") return;
    onError(err?.message || "网络请求失败");
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
    onError(msg);
    return;
  }

  if (!res.body) {
    onError("服务器未返回数据流");
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
          onError(data.error);
          return;
        }
        if (data.done) {
          onDone({ id: data.id, score: data.score ?? null, report: data.report ?? fullText });
          return;
        }
        if (data.chunk) {
          fullText += data.chunk;
          onChunk(fullText);
        }
      }
    }
  } catch (err: any) {
    if (err?.name === "AbortError") return;
    onError(err?.message || "数据流中断");
    return;
  }

  onDone({ score: null, report: fullText });
}
