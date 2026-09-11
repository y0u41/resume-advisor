import { useParams, Navigate, Link } from "react-router-dom";
import { useTasks } from "../lib/tasks";
import UserBar from "../components/UserBar";
import Nav from "../components/Nav";
import Logo from "../components/Logo";

// 展示后台运行中的评估任务；完成后自动跳转到正式结果页
export default function TaskRunner() {
  const { taskId } = useParams();
  const { get } = useTasks();
  const task = taskId ? get(taskId) : undefined;

  if (!task) {
    return (
      <div className="container">
        <div className="card empty">
          <p>任务不存在或已被清理</p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  if (task.status === "done" && task.resultId != null) {
    return <Navigate to={`/result/${task.resultId}`} replace />;
  }

  return (
    <div className="container">
      <div className="header">
        <UserBar />
        <div className="brand">
          <Logo size={36} />
          <h1>{task.title || "评估"}</h1>
        </div>
        <Nav />
      </div>

      <div className="card">
        {task.status === "running" ? (
          <>
            <div className="loading-overlay" style={{ marginBottom: 10 }}>
              <span className="spinner" style={{ color: "var(--primary)" }} />
              评估进行中…
            </div>
            <p className="hint">任务在后台运行，你可以自由切换到其他页面，进度不会中断。</p>
          </>
        ) : (
          <p className="auth-error">评估失败：{task.error || "未知错误"}</p>
        )}

        {task.text ? (
          <div className="report streaming-cursor" style={{ marginTop: 16 }}>
            {task.text}
          </div>
        ) : (
          task.status === "running" && (
            <div className="skeleton-lines" style={{ marginTop: 16 }}>
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
            </div>
          )
        )}
      </div>
    </div>
  );
}
