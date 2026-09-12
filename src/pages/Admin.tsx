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
  plan: string;
  created_at: string;
  todayUsage: number;
  dailyLimit: number;
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

interface ParseHealth {
  windowDays: number;
  parses: number;
  fallbacks: number;
  rate: number;
  threshold: number;
  minSamples: number;
  enoughSamples: boolean;
  shouldEnableMachineBlock: boolean;
}

interface ProRequest {
  id: number;
  user_id: number;
  note: string;
  pay_email: string | null;
  status: string;
  created_at: string;
  handled_at: string | null;
  email: string | null;
  username: string | null;
  plan: string | null;
}

interface ExperimentGroup {
  value: number;
  trials: number;
  registers: number;
  rate: number;
}

interface GuestExperiment {
  days: number;
  active: boolean;
  config: { limits: number[] | null; preview: number[] | null };
  byLimit: ExperimentGroup[];
  byPreview: ExperimentGroup[];
}

export default function Admin() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [proPrice, setProPrice] = useState<number | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [usageDays, setUsageDays] = useState(0);
  const [events, setEvents] = useState<{ name: string; count: number }[]>([]);
  const [parseHealth, setParseHealth] = useState<ParseHealth | null>(null);
  const [proRequests, setProRequests] = useState<ProRequest[]>([]);
  const [experiment, setExperiment] = useState<GuestExperiment | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    const r = await fetch("/api/admin/users");
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "加载失败");
    setUsers(d.users);
    setProPrice(d.proPrice);
  };

  const setPlan = async (id: number, plan: string) => {
    try {
      const r = await fetch(`/api/admin/users/${id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "设置失败");
      await loadUsers();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const loadProRequests = () =>
    fetch("/api/admin/pro-requests")
      .then((r) => r.json())
      .then((d) => setProRequests(d.requests || []))
      .catch(() => {});

  const handleProRequest = async (id: number, action: "approve" | "reject") => {
    try {
      const r = await fetch(`/api/admin/pro-requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "操作失败");
      await loadUsers();
      await loadProRequests();
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (user?.role !== "admin") {
      setLoading(false);
      return;
    }
    loadUsers()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    fetch("/api/admin/events")
      .then((r) => r.json())
      .then((d) => setEvents(d.counts || []))
      .catch(() => {});
    fetch("/api/admin/parse-health")
      .then((r) => r.json())
      .then(setParseHealth)
      .catch(() => {});
    loadProRequests();
    fetch("/api/admin/guest-experiment")
      .then((r) => r.json())
      .then(setExperiment)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                <th>套餐</th>
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
                    {u.role === "admin" ? (
                      <span className="role-badge admin">不限</span>
                    ) : (
                      <button
                        type="button"
                        className={`chip ${u.plan === "pro" ? "chip-active" : ""}`}
                        onClick={() => setPlan(u.id, u.plan === "pro" ? "free" : "pro")}
                        title="点击切换 免费 / PRO"
                      >
                        {u.plan === "pro" ? "PRO" : "免费"}
                      </button>
                    )}
                  </td>
                  <td>
                    {u.todayUsage} / {u.dailyLimit === -1 ? "不限" : u.dailyLimit}
                  </td>
                  <td>{u.evaluations}</td>
                  <td>{new Date(u.created_at).toLocaleString("zh-CN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="hint" style={{ marginTop: 10 }}>
          点击「套餐」可切换 免费 / PRO（PRO ¥{proPrice ?? 9.9}/月）。免费：100 次/天、高级模型尝鲜 5
          次/天；PRO：500 次/天、高级模型 30 次/天。管理员账号不受额度限制。
        </p>
      </div>

      {proRequests.length > 0 && (
        <div className="card">
          <h2 className="section-title">
            <span className="section-icon">⭐</span>
            PRO 开通申请
          </h2>
          <p className="hint" style={{ marginBottom: 10 }}>
            申请 {proRequests.length} · 已开通{" "}
            {proRequests.filter((r) => r.status === "approved").length} · 开通率{" "}
            <strong>
              {proRequests.length
                ? Math.round(
                    (proRequests.filter((r) => r.status === "approved").length /
                      proRequests.length) *
                      100
                  )
                : 0}
              %
            </strong>
          </p>
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>用户</th>
                <th>付款邮箱</th>
                <th>备注</th>
                <th>状态</th>
                <th>申请时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {proRequests.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.username || r.email || r.user_id}</td>
                  <td>{r.pay_email || "—"}</td>
                  <td>{r.note || "—"}</td>
                  <td>
                    {r.status === "pending"
                      ? "待处理"
                      : r.status === "approved"
                        ? "已开通"
                        : "已驳回"}
                  </td>
                  <td>{new Date(r.created_at).toLocaleString("zh-CN")}</td>
                  <td>
                    {r.status === "pending" ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => handleProRequest(r.id, "approve")}
                        >
                          开通
                        </button>{" "}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleProRequest(r.id, "reject")}
                        >
                          驳回
                        </button>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

      {parseHealth && (
        <div className="card">
          <h2 className="section-title">
            <span className="section-icon">🧩</span>
            报告解析健康度
          </h2>
          <p className="hint">
            近 {parseHealth.windowDays} 天：解析 {parseHealth.parses} 次 · 降级（退化为纯文本）{" "}
            {parseHealth.fallbacks} 次 · 降级率{" "}
            <strong>{(parseHealth.rate * 100).toFixed(1)}%</strong>
          </p>
          <p className="hint" style={{ marginTop: 4 }}>
            触发条件（ADR-0007）：样本 ≥ {parseHealth.minSamples} 且降级率 &gt;{" "}
            {(parseHealth.threshold * 100).toFixed(0)}%
            {parseHealth.shouldEnableMachineBlock ? (
              <strong style={{ color: "var(--danger)" }}>
                {" "}
                —— 已达标，建议启用「尾部机器可读块」
              </strong>
            ) : (
              <span>
                {" "}
                —— 未达标，继续纯文本（{parseHealth.enoughSamples ? "样本已足" : "样本不足"}）
              </span>
            )}
          </p>
        </div>
      )}

      {experiment && experiment.byLimit.length + experiment.byPreview.length > 0 && (
        <div className="card">
          <h2 className="section-title">
            <span className="section-icon">🧪</span>
            游客转化实验
          </h2>
          {!experiment.active && (
            <p className="hint">
              实验未开启（当前为单组）。设置 `GUEST_AB_LIMITS` / `GUEST_AB_PREVIEW` 后可跑对照。
            </p>
          )}
          <h3 style={{ fontSize: "0.9rem", margin: "8px 0 6px" }}>按试用次数</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>组（次/天）</th>
                <th>试用</th>
                <th>注册</th>
                <th>转化率</th>
              </tr>
            </thead>
            <tbody>
              {experiment.byLimit.map((g) => (
                <tr key={g.value}>
                  <td>{g.value}</td>
                  <td>{g.trials}</td>
                  <td>{g.registers}</td>
                  <td>{g.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ fontSize: "0.9rem", margin: "12px 0 6px" }}>按预览长度</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>组（字）</th>
                <th>试用</th>
                <th>注册</th>
                <th>转化率</th>
              </tr>
            </thead>
            <tbody>
              {experiment.byPreview.map((g) => (
                <tr key={g.value}>
                  <td>{g.value}</td>
                  <td>{g.trials}</td>
                  <td>{g.registers}</td>
                  <td>{g.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 8 }}>
            转化率 = 试用后注册 / 游客试用。样本少时波动大，建议每组 ≥ 100 试用再下结论。
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
