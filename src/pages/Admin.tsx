import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import UserBar from "../components/UserBar";
import Logo from "../components/Logo";
import Nav from "../components/Nav";
import { useAuth } from "../lib/auth";

interface AdminUser {
  id: number;
  email: string;
  username: string | null;
  role: string;
  created_at: string;
  todayUsage: number;
  evaluations: number;
}

interface UsageRow {
  feature?: string;
  model?: string;
  user_id?: number | null;
  email?: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
}

interface UsageSummary {
  totals: {
    calls: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost: number;
  };
  byFeature: UsageRow[];
  byModel: UsageRow[];
  byUser: UsageRow[];
}

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [dailyLimit, setDailyLimit] = useState<number | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== "admin") {
      setLoading(false);
      return;
    }
    fetch("/api/admin/users")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "加载失败");
        return d;
      })
      .then((d) => {
        setUsers(d.users);
        setDailyLimit(d.dailyLimit);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    fetch("/api/admin/usage")
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => {});
  }, [user]);

  if (user && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container">
      <div className="header">
        <UserBar />
        <div className="brand">
          <Logo size={36} />
          <h1>用户管理</h1>
        </div>
        <Nav>
          <Link to="/admin">用户管理</Link>
        </Nav>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-overlay">
            <span className="spinner" style={{ color: "var(--primary)" }} />
            加载中...
          </div>
        ) : error ? (
          <div className="empty">
            <p>{error}</p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>账号</th>
                <th>角色</th>
                <th>今日用量</th>
                <th>累计评估</th>
                <th>注册时间</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>
                    <div className="admin-account">{u.username || u.email}</div>
                    {u.username && <div className="admin-sub">{u.email}</div>}
                  </td>
                  <td>
                    <span className={`role-badge ${u.role === "admin" ? "admin" : ""}`}>
                      {u.role === "admin" ? "管理员" : "普通用户"}
                    </span>
                  </td>
                  <td>
                    {u.todayUsage} / {dailyLimit ?? "-"}
                  </td>
                  <td>{u.evaluations}</td>
                  <td>{new Date(u.created_at).toLocaleString("zh-CN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {usage && (
        <div className="card">
          <h2 className="section-title">
            <span className="section-icon">💰</span>
            成本看板
          </h2>
          <p className="hint" style={{ marginBottom: 10 }}>
            累计 {usage.totals.calls} 次调用 · 输入 {usage.totals.prompt_tokens} / 输出{" "}
            {usage.totals.completion_tokens} tokens · 估算成本 ¥{usage.totals.cost}
          </p>

          <h3 style={{ fontSize: "0.9rem", margin: "8px 0 6px" }}>按功能</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>功能</th>
                <th>调用</th>
                <th>tokens</th>
                <th>估算成本(¥)</th>
              </tr>
            </thead>
            <tbody>
              {usage.byFeature.map((f) => (
                <tr key={f.feature}>
                  <td>{f.feature}</td>
                  <td>{f.calls}</td>
                  <td>{f.total_tokens}</td>
                  <td>{f.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ fontSize: "0.9rem", margin: "12px 0 6px" }}>按用户</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>用户</th>
                <th>调用</th>
                <th>tokens</th>
                <th>估算成本(¥)</th>
              </tr>
            </thead>
            <tbody>
              {usage.byUser.map((u, i) => (
                <tr key={i}>
                  <td>{u.email || u.user_id || "游客"}</td>
                  <td>{u.calls}</td>
                  <td>{u.total_tokens}</td>
                  <td>{u.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 8 }}>
            成本为按单价估算；单价可用后端环境变量 `LLM_PRICE_JSON` 覆盖（默认内置示例价）。
          </p>
        </div>
      )}
    </div>
  );
}
