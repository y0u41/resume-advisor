import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import Logo from "../components/Logo";
import ThemeToggle from "../components/ThemeToggle";

const FEATURES = [
  { icon: "🎯", title: "十分制评分", desc: "一句话说清为什么是这个分" },
  { icon: "✅", title: "岗位匹配对照", desc: "逐条 ✅ / ⚠️ / ❌，一眼看清短板" },
  { icon: "✏️", title: "逐条改法", desc: "「改之前 → 改之后」直接照抄" },
  { icon: "🤖", title: "AI 修改建议", desc: "按优先级的动作 + 优化示范" },
  { icon: "🚀", title: "可继续增强的方向", desc: "技能 / 经历 / 加分项补强" },
  { icon: "📄", title: "多种导入", desc: "粘贴、上传 PDF/Word、链接抓取" },
  { icon: "⬇️", title: "多格式导出", desc: "PDF / Word / TXT / Markdown" },
  { icon: "🔀", title: "多模型可选", desc: "DeepSeek / 智谱 GLM 自由切换" },
];

function DemoPreview() {
  return (
    <div className="demo-card">
      <div className="demo-head">
        <div>
          <div className="demo-label">应聘岗位</div>
          <div className="demo-job">Java 后端开发工程师</div>
        </div>
        <div className="score-badge score-mid">
          6<small>/ 10</small>
        </div>
      </div>

      <div className="demo-match">
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
        <div className="demo-fix-label">✏️ 逐条改法</div>
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
          <Logo size={54} />
          <h1>简历评估助手</h1>
        </div>
        <p className="landing-tagline">贴简历 + 说岗位 → 得分 + 挑刺 + 改法</p>
        <p className="landing-sub">
          像一位挑剔又靠谱的资深 HR，几十秒帮你把简历改到能拿到面试。
        </p>

        <ul className="features">
          {FEATURES.map((f) => (
            <li key={f.title} className="feature">
              <span className="feature-ico">{f.icon}</span>
              <div className="feature-text">
                <b>{f.title}</b>
                <span>{f.desc}</span>
              </div>
            </li>
          ))}
        </ul>

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
                "注册并登录"
              )}
            </button>
          </form>

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
      </section>
    </div>
  );
}
