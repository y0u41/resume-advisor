import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  streamEvaluate,
  compareStream,
  interviewStream,
  directionsStream,
  type EvalPayload,
  type EvalResult,
  type CompareResult,
  type CompareJob,
} from "./api";
import { useToast } from "./ui/toast";

// 应用级后台任务：任务在 Provider（位于路由之上）中运行，
// 因此切换页面 / 功能不会中断；支持多个任务并行。
export type TaskKind = "evaluate" | "compare" | "interview" | "directions";
export type TaskStatus = "running" | "done" | "error";

export interface Task {
  id: string;
  kind: TaskKind;
  title: string;
  status: TaskStatus;
  /** 流式文本 / 进度描述 */
  text: string;
  error?: string;
  /** 评估完成后的数据库记录 id */
  resultId?: number;
  /** 完成后的结构化结果（compare 为数组，interview/directions 为文本） */
  result?: any;
  createdAt: number;
  finishedAt?: number;
}

interface InterviewPayload {
  resume: string;
  jobTitle: string;
  jobDescription: string;
  provider?: string;
  model?: string;
  candidateType?: string;
}

interface DirectionsPayload {
  resume: string;
  provider?: string;
  model?: string;
  candidateType?: string;
}

interface TaskContextValue {
  tasks: Task[];
  get: (id: string) => Task | undefined;
  /** 该类型最近的一个任务（用于页面重挂载后恢复显示） */
  latestOf: (kind: TaskKind) => Task | undefined;
  dismiss: (id: string) => void;
  startEvaluate: (payload: EvalPayload, title: string) => string;
  startCompare: (
    payload: { resume: string; jobs: CompareJob[]; provider?: string; model?: string; candidateType?: string },
    title: string
  ) => string;
  startInterview: (payload: InterviewPayload, title: string) => string;
  startDirections: (payload: DirectionsPayload, title: string) => string;
}

const TaskContext = createContext<TaskContextValue | null>(null);

const STORAGE_KEY = "resume_tasks_v1";

// 从 localStorage 恢复任务：刷新后，运行中的任务已无法继续 → 标记为中断
function loadStoredTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((t: Task) =>
      t.status === "running"
        ? {
            ...t,
            status: "error",
            error: "页面刷新后本地不再进行；任务可能已在后台完成，去「历史记录」查看",
          }
        : t
    );
  } catch {
    return [];
  }
}

// 只持久化元数据，避免 localStorage 过大
function persistTasks(tasks: Task[]) {
  try {
    const slim = tasks.slice(0, 10).map((t) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      status: t.status,
      resultId: t.resultId,
      error: t.error,
      createdAt: t.createdAt,
      finishedAt: t.finishedAt,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch {
    // 忽略
  }
}

let seq = 0;
function newId() {
  seq += 1;
  return `task_${Date.now().toString(36)}_${seq}`;
}

export function TaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>(() => loadStoredTasks());
  const toast = useToast();

  useEffect(() => {
    persistTasks(tasks);
  }, [tasks]);

  const update = useCallback(
    (id: string, patch: Partial<Task> | ((t: Task) => Partial<Task>)) => {
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t))
      );
    },
    []
  );

  const add = useCallback((t: Task) => setTasks((prev) => [t, ...prev]), []);
  const dismiss = useCallback((id: string) => setTasks((prev) => prev.filter((t) => t.id !== id)), []);

  const get = useCallback((id: string) => tasks.find((t) => t.id === id), [tasks]);
  const latestOf = useCallback((kind: TaskKind) => tasks.find((t) => t.kind === kind), [tasks]);

  const startEvaluate = useCallback(
    (payload: EvalPayload, title: string) => {
      const id = newId();
      add({ id, kind: "evaluate", title, status: "running", text: "", createdAt: Date.now() });
      streamEvaluate(
        payload,
        (text) => update(id, { text }),
        (result: EvalResult) => {
          update(id, {
            status: "done",
            text: result.report || "",
            resultId: result.id,
            result,
            finishedAt: Date.now(),
          });
          toast(`「${title}」评估完成`, "success");
        },
        (msg) => {
          update(id, { status: "error", error: msg, finishedAt: Date.now() });
          toast(`「${title}」评估失败：${msg}`, "error");
        },
        (pos) => update(id, { text: `（排队中，前面还有 ${pos} 位，请稍候…）` })
      );
      return id;
    },
    [add, update, toast]
  );

  const startCompare = useCallback(
    (payload: { resume: string; jobs: CompareJob[]; provider?: string; model?: string; candidateType?: string }, title: string) => {
      const id = newId();
      add({ id, kind: "compare", title, status: "running", text: "对比中…", createdAt: Date.now() });
      compareStream(payload, {
        onProgress: (p) => update(id, { text: `正在对比 ${p.index + 1}/${p.total}：${p.title}` }),
        onDone: (results: CompareResult[]) => {
          update(id, { status: "done", result: results, finishedAt: Date.now() });
          toast(`「${title}」对比完成`, "success");
        },
        onError: (msg) => {
          update(id, { status: "error", error: msg, finishedAt: Date.now() });
          toast(`「${title}」对比失败：${msg}`, "error");
        },
        onQueued: (pos) => update(id, { text: `（排队中，前面还有 ${pos} 位…）` }),
      });
      return id;
    },
    [add, update, toast]
  );

  const startInterview = useCallback(
    (payload: InterviewPayload, title: string) => {
      const id = newId();
      add({ id, kind: "interview", title, status: "running", text: "", createdAt: Date.now() });
      interviewStream(
        payload,
        (text) => update(id, { text }),
        (text, evalId) => {
          if (!text || !text.trim()) {
            update(id, { status: "error", error: "生成结果为空，请重试", finishedAt: Date.now() });
            toast(`「${title}」生成结果为空，请重试`, "error");
            return;
          }
          update(id, { status: "done", text, result: text, resultId: evalId, finishedAt: Date.now() });
          toast(`「${title}」面试题已生成`, "success");
        },
        (msg) => {
          update(id, { status: "error", error: msg, finishedAt: Date.now() });
          toast(`「${title}」生成失败：${msg}`, "error");
        },
        (pos) => update(id, { text: `（排队中，前面还有 ${pos} 位…）` })
      );
      return id;
    },
    [add, update, toast]
  );

  const startDirections = useCallback(
    (payload: DirectionsPayload, title: string) => {
      const id = newId();
      add({ id, kind: "directions", title, status: "running", text: "", createdAt: Date.now() });
      directionsStream(
        payload,
        (text) => update(id, { text }),
        (text, evalId) => {
          if (!text || !text.trim()) {
            update(id, { status: "error", error: "生成结果为空，请重试", finishedAt: Date.now() });
            toast(`「${title}」生成结果为空，请重试`, "error");
            return;
          }
          update(id, { status: "done", text, result: text, resultId: evalId, finishedAt: Date.now() });
          toast(`「${title}」方向推荐已生成`, "success");
        },
        (msg) => {
          update(id, { status: "error", error: msg, finishedAt: Date.now() });
          toast(`「${title}」生成失败：${msg}`, "error");
        },
        (pos) => update(id, { text: `（排队中，前面还有 ${pos} 位…）` })
      );
      return id;
    },
    [add, update, toast]
  );

  return (
    <TaskContext.Provider
      value={{ tasks, get, latestOf, dismiss, startEvaluate, startCompare, startInterview, startDirections }}
    >
      {children}
    </TaskContext.Provider>
  );
}

export function useTasks() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error("useTasks 必须在 TaskProvider 内使用");
  return ctx;
}
