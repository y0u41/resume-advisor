import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import ThemeToggle from "./ThemeToggle";

export default function UserBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="user-bar">
      {user.role === "admin" && (
        <Link to="/admin" className="btn-link">
          用户管理
        </Link>
      )}
      {user.role !== "admin" && user.plan !== "pro" && (
        <Link to="/pro" className="btn-link">
          升级 PRO
        </Link>
      )}
      <span className="user-email" title={user.email}>
        {user.username || user.email}
        {user.role === "admin" ? (
          <span className="role-badge admin">管理员</span>
        ) : user.plan === "pro" ? (
          <span className="role-badge pro">PRO</span>
        ) : null}
      </span>
      <ThemeToggle />
      <button type="button" className="btn-link" onClick={handleLogout}>
        退出
      </button>
    </div>
  );
}
