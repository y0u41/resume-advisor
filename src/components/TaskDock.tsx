import { useNavigate } from "react-router-dom";
import { useTasks, type Task } from "../lib/tasks";

const KIND_LABEL: Record<string, string> = {
  evaluate: "评估",
  compare: "多岗对比",
  interview: "模拟面试",
  directions: "方向推荐",
};

const KIND_ROUTE: Record<string, string> = {
  evaluate: "/",
  compare: "/compare",
  interview: "/interview",
  directions: "/directions",
};

// 悬浮任务栏：展示后台运行/最近完成的任务，切换页面也不中断
export default function TaskDock() {
  const { tasks, dismiss } = useTasks();
  const navigate = useNavigate();

  if (tasks.length === 0) return null;
  const visible = tasks.slice(0, 4);

  const open = (t: Task) => {
    if (t.kind === "evaluate" && t.resultId != null) {
      navigate(`/result/${t.resultId}`);
      dismiss(t.id);
      return;
    }
    // 断线恢复的任务：引导去历史记录
    if (t.status === "error" && t.kind === "evaluate") {
      navigate("/history");
      dismiss(t.id);
      return;
    }
    navigate(KIND_ROUTE[t.kind] || "/");
  };

  return (
    <div className="task-dock">
      {visible.map((t) => (
        <div key={t.id} className={`task-pill task-${t.status}`}>
          <span className="task-pill-dot" />
          <button type="button" className="task-pill-body" onClick={() => open(t)}>
            <b>
              {KIND_LABEL[t.kind] || "任务"} · {t.title}
            </b>
            <span>
              {t.status === "running"
                ? "后台进行中…"
                : t.status === "done"
                  ? "已完成 · 点击查看"
                  : t.error || "失败"}
            </span>
          </button>
          <button type="button" className="task-pill-close" onClick={() => dismiss(t.id)} title="关闭">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
