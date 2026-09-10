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
      <span className="user-email" title={user.email}>
        {user.username || user.email}
        {user.role === "admin" && <span className="role-badge admin">管理员</span>}
      </span>
      <ThemeToggle />
      <button type="button" className="btn-link" onClick={handleLogout}>
        退出
      </button>
    </div>
  );
}
