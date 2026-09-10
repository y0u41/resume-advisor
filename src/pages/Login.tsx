import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"login" | "register">("login");
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
    <div className="container login-container">
      <div className="header">
        <h1>简历评估助手</h1>
        <p>贴简历 + 说岗位 → 得分 + 挑刺 + 改法</p>
      </div>

      <div className="card">
        <div className="auth-tabs">
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
        </div>

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
      </div>
    </div>
  );
}
