import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./lib/auth";
import { ToastProvider } from "./lib/toast";
import Home from "./pages/Home";
import Result from "./pages/Result";
import History from "./pages/History";
import Login from "./pages/Login";
import Admin from "./pages/Admin";
import Privacy from "./pages/Privacy";
import Builder from "./pages/Builder";
import Compare from "./pages/Compare";
import Interview from "./pages/Interview";
import Directions from "./pages/Directions";

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="container">
        <div className="loading-overlay">
          <span className="spinner" style={{ color: "var(--primary)" }} />
          加载中...
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route
            path="/"
            element={
              <Protected>
                <Home />
              </Protected>
            }
          />
          <Route
            path="/result/:id"
            element={
              <Protected>
                <Result />
              </Protected>
            }
          />
          <Route
            path="/history"
            element={
              <Protected>
                <History />
              </Protected>
            }
          />
          <Route
            path="/builder"
            element={
              <Protected>
                <Builder />
              </Protected>
            }
          />
          <Route
            path="/compare"
            element={
              <Protected>
                <Compare />
              </Protected>
            }
          />
          <Route
            path="/interview"
            element={
              <Protected>
                <Interview />
              </Protected>
            }
          />
          <Route
            path="/directions"
            element={
              <Protected>
                <Directions />
              </Protected>
            }
          />
          <Route
            path="/admin"
            element={
              <Protected>
                <Admin />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
