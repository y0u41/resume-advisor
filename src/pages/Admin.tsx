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
  day?: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
}

interface UsageSummary {
  rangeDays: number;
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
  byDay: UsageRow[];
}

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [dailyLimit, setDailyLimit] = useState<number | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [usageDays, setUsageDays] = useState(0);
  const [events, setEvents] = useState<{ name: string; count: number }[]>([]);
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
    fetch("/api/admin/events")
      .then((r) => r.json())
      .then((d) => setEvents(d.counts || []))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    fetch(`/api/admin/usage?days=${usageDays}`)
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => {});
  }, [user, usageDays]);

  const countOf = (name: string) => events.find((e) => e.name === name)?.count || 0;
  const trials = countOf("guest_trial");
  const fromGuest = countOf("register_from_guest");
  const convRate = trials ? Math.round((fromGuest / trials) * 100) : 0;

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

      {events.length > 0 && (
        <div className="card">
          <h2 className="section-title">
            <span className="section-icon">🔻</span>
            转化漏斗
          </h2>
          <p className="hint">
            游客试用 <strong>{trials}</strong> → 试用后注册 <strong>{fromGuest}</strong> → 转化率{" "}
            <strong>{convRate}%</strong>
          </p>
          <div className="progress-track" style={{ marginTop: 8 }}>
            <div
              className="progress-fill"
              style={{ ["--target-width" as string]: `${convRate}%` }}
            />
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            注册总数 {countOf("register")} · 首次评估 {countOf("first_evaluate")} · 下载{" "}
            {countOf("download")} · 追问 {countOf("followup")} · 老用户回访 {countOf("return_7d")}
          </p>
          <p className="hint" style={{ marginTop: 4 }}>
            注：「老用户回访」= 注册满 7 天的老用户当日登录，并非 cohort 留存。
          </p>
        </div>
      )}

      {usage && (
        <div className="card">
          <h2 className="section-title">
            <span className="section-icon">💰</span>
            成本看板
          </h2>
          <div className="chips" style={{ marginBottom: 10 }}>
            {[
              { d: 0, label: "全部" },
              { d: 1, label: "今日" },
              { d: 7, label: "近 7 天" },
            ].map((x) => (
              <button
                key={x.d}
                type="button"
                className="chip"
                style={
                  usageDays === x.d
                    ? { borderColor: "var(--primary)", color: "var(--primary)" }
                    : undefined
                }
                onClick={() => setUsageDays(x.d)}
              >
                {x.label}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginBottom: 10 }}>
            {usageDays === 0 ? "全部" : usageDays === 1 ? "今日" : "近 7 天"}：{usage.totals.calls}{" "}
            次调用 · 输入 {usage.totals.prompt_tokens} / 输出 {usage.totals.completion_tokens}{" "}
            tokens · 估算成本 ¥{usage.totals.cost}
          </p>

          {usage.byDay.length > 0 && (
            <>
              <h3 style={{ fontSize: "0.9rem", margin: "8px 0 6px" }}>按天趋势</h3>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>调用</th>
                    <th>tokens</th>
                    <th>估算成本(¥)</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.byDay.map((d) => (
                    <tr key={d.day}>
                      <td>{d.day}</td>
                      <td>{d.calls}</td>
                      <td>{d.total_tokens}</td>
                      <td>{d.cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

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
