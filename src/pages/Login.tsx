import { useEffect, useState } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import Logo from "../components/Logo";
import ThemeToggle from "../components/ThemeToggle";
import { guestEvaluateStream, fetchGuestQuota, type GuestQuota } from "../lib/api";

const GUEST_PREVIEW = 800;

const STATS = [
  { num: "9", label: "大报告模块" },
  { num: "4", label: "维客观评分" },
  { num: "6", label: "大求职功能" },
  { num: "2", label: "套专业模板" },
];

const FEATURES = [
  { title: "岗位匹配对照", desc: "逐条 ✅ / ⚠️ / ❌ 标注岗位要求，一眼看清差在哪" },
  { title: "逐条改法", desc: "每个问题配「改之前 → 改之后」，直接照抄" },
  { title: "客观评分 + AI 报告", desc: "算法给出可复现的分数，AI 给出专业点评" },
  { title: "求职全流程", desc: "评估 · 多岗对比 · 改简历 · 模拟面试 · 方向推荐" },
];

function DemoPreview() {
  return (
    <div className="demo-card">
      <div className="demo-score-col">
        <div className="demo-label">应聘岗位</div>
        <div className="demo-job">Java 后端开发工程师</div>

        <div className="score-badge score-mid">
          6<small>/ 10</small>
        </div>

        <div className="demo-match-label">
          <span>岗位匹配度</span>
          <span>55%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: "55%", animation: "none" }} />
        </div>
      </div>

      <div className="demo-items">
        <div className="match-item ok">
          <span className="match-icon">✅</span>
          <div className="match-body">
            <div className="match-req">熟悉 Spring Boot</div>
            <div className="match-detail">技能栏已明确列出</div>
          </div>
        </div>
        <div className="match-item partial">
          <span className="match-icon">⚠️</span>
          <div className="match-body">
            <div className="match-req">3 年以上经验</div>
            <div className="match-detail">时间线存在矛盾，需说明</div>
          </div>
        </div>
        <div className="match-item miss">
          <span className="match-icon">❌</span>
          <div className="match-body">
            <div className="match-req">熟悉 Redis</div>
            <div className="match-detail">简历未提及</div>
          </div>
        </div>
      </div>

      <div className="demo-fix">
        <div className="demo-fix-label">逐条改法</div>
        <div className="demo-fix-row">
          <span className="demo-before">负责写接口</span>
          <span className="demo-arrow">→</span>
          <span className="demo-after">
            负责订单模块后端开发，基于 Spring Boot 搭建接口 30+ 个，日均调用 50 万次
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 游客免注册试用
  const [quota, setQuota] = useState<GuestQuota | null>(null);
  const [guestResume, setGuestResume] = useState("");
  const [guestJob, setGuestJob] = useState("");
  const [guestStudent, setGuestStudent] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestText, setGuestText] = useState("");
  const [guestResult, setGuestResult] = useState<any>(null);
  const [guestError, setGuestError] = useState("");

  useEffect(() => {
    fetchGuestQuota().then(setQuota).catch(() => {});
  }, []);

  const handleGuestTry = async () => {
    setGuestError("");
    if (!guestResume.trim() || !guestJob.trim()) {
      setGuestError("请填写简历全文和应聘岗位");
      return;
    }
    setGuestLoading(true);
    setGuestText("");
    setGuestResult(null);
    try {
      await guestEvaluateStream(
        {
          resume: guestResume.trim(),
          jobTitle: guestJob.trim(),
          jobDescription: "",
          candidateType: guestStudent ? "student" : "general",
        },
        (t) => setGuestText(t),
        (data) => {
          setGuestResult(data);
          setGuestText(data.report || "");
          setQuota((q) =>
            q ? { ...q, remaining: Math.max(0, q.remaining - 1), used: q.used + 1 } : q
          );
        },
        (msg) => setGuestError(msg)
      );
    } catch (e: any) {
      setGuestError(e.message || "试用失败");
    } finally {
      setGuestLoading(false);
    }
  };

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("请填写账号和密码");
      return;
    }
    if (mode === "register") {
      if (password.length < 6) {
        setError("密码至少 6 位");
        return;
      }
      if (password !== confirm) {
        setError("两次输入的密码不一致");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password);
      }
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.message || "操作失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing">
      <div className="landing-topbar">
        <ThemeToggle />
      </div>

      <section className="landing-showcase">
        <div className="brand landing-brand">
          <Logo size={40} />
          <h1>简历参谋</h1>
        </div>

        <h2 className="landing-headline">用 HR 的视角，把简历改到能拿到面试</h2>
        <p className="landing-sub">
          贴上简历和目标岗位，几十秒得到评分、逐条对照与可照抄的改法。
        </p>

        <div className="landing-stats">
          {STATS.map((s) => (
            <div key={s.label} className="stat">
              <span className="stat-num">{s.num}</span>
              <span className="stat-label">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="landing-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature-card">
              <b>{f.title}</b>
              <span>{f.desc}</span>
            </div>
          ))}
        </div>

        <p className="landing-trust">
          隐私优先：数据保存在自有服务器，可随时删除记录或一键注销账号。
        </p>

        <div className="demo-preview">
          <div className="demo-preview-title">效果预览</div>
          <DemoPreview />
        </div>
      </section>

      <section className="landing-auth">
        <div className="card auth-card">
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${mode === "register" ? "active" : ""}`}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              注册
            </button>
            <button
              type="button"
              className={`auth-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              登录
            </button>
          </div>

          <p className="auth-lead">
            {mode === "register" ? "免费注册，立即体验完整评估流程" : "欢迎回来，继续优化你的简历"}
          </p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>{mode === "login" ? "邮箱 / 账号" : "邮箱"}</label>
              <input
                type="text"
                placeholder={mode === "login" ? "邮箱或用户名" : "you@example.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label>密码</label>
              <input
                type="password"
                placeholder="至少 6 位"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>

            {mode === "register" && (
              <div className="form-group">
                <label>确认密码</label>
                <input
                  type="password"
                  placeholder="再输入一次密码"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            )}

            {error && <p className="auth-error">{error}</p>}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: "100%", padding: "14px 24px", fontSize: "1rem" }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" /> 请稍候...
                </>
              ) : mode === "login" ? (
                "登录"
              ) : (
                "免费注册"
              )}
            </button>
          </form>

          {mode === "register" && (
            <p className="auth-consent">
              注册即表示同意我们依据
              <Link to="/privacy" target="_blank" rel="noreferrer">
                《隐私政策》
              </Link>
              处理你的信息；评估时简历内容会发送给所选 AI 模型服务商。
            </p>
          )}

          <p className="auth-foot">
            {mode === "register" ? "已有账号？" : "还没有账号？"}
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setMode(mode === "register" ? "login" : "register");
                setError("");
              }}
            >
              {mode === "register" ? "去登录" : "去注册"}
            </button>
          </p>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="section-title" style={{ fontSize: "1rem" }}>
            <span className="section-icon">🚀</span>
            免费试用一次（无需注册）
          </h2>

          {quota && quota.remaining <= 0 && !guestResult ? (
            <p className="hint">
              本机今日的免费试用次数已用完。<strong>注册后可无限使用完整功能</strong>。
            </p>
          ) : (
            <>
              <div className="form-group">
                <label>简历全文</label>
                <textarea
                  rows={5}
                  placeholder="粘贴简历全文..."
                  value={guestResume}
                  onChange={(e) => setGuestResume(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>应聘岗位</label>
                <input
                  type="text"
                  placeholder="例如：新媒体运营"
                  value={guestJob}
                  onChange={(e) => setGuestJob(e.target.value)}
                />
              </div>
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={guestStudent}
                  onChange={(e) => setGuestStudent(e.target.checked)}
                />
                <span>我是应届生 / 暂无工作经历</span>
              </label>
              {guestError && <p className="auth-error">{guestError}</p>}
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: "100%" }}
                disabled={guestLoading}
                onClick={handleGuestTry}
              >
                {guestLoading ? (
                  <>
                    <span className="spinner" /> 评估中...
                  </>
                ) : (
                  "免费试用"
                )}
              </button>
            </>
          )}

          {guestText && (
            <div style={{ marginTop: 12 }}>
              <div className="report">{guestText.slice(0, GUEST_PREVIEW)}</div>
              {(guestResult?.truncated || guestText.length > GUEST_PREVIEW) && (
                <p className="hint" style={{ marginTop: 8 }}>
                  ……以上为预览（报告共约 {guestResult?.totalLength || guestText.length} 字）。
                  <strong>注册后解锁完整报告、下载与历史记录</strong>。
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
