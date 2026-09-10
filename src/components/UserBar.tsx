import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

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
      <span className="user-email" title={user.email}>
        {user.email}
      </span>
      <button type="button" className="btn-link" onClick={handleLogout}>
        退出
      </button>
    </div>
  );
}
