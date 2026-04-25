import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink,
  Navigate
} from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import ProtectedRoute from "./ProtectedRoute";
import Login from "./Login";
import Signup from "./Signup";
import UserDashboard from "./UserDashboard";
import StaffDashboard from "./StaffDashboard";
import AdminDashboard from "./AdminDashboard";

function AppShell() {
  const { currentUser, logout, authLoading } = useAuth();

  const navStyle = ({ isActive }) => ({
    textDecoration: "none",
    padding: "10px 15px",
    borderRadius: "13px",
    fontWeight: "800",
    fontSize: "13px",
    color: isActive ? "#ffffff" : "#cbd5e1",
    background: isActive
      ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
      : "rgba(255,255,255,0.05)",
    border: isActive
      ? "1px solid rgba(96,165,250,0.28)"
      : "1px solid rgba(255,255,255,0.08)",
    boxShadow: isActive ? "0 10px 20px rgba(37,99,235,0.22)" : "none",
    backdropFilter: "blur(8px)",
    whiteSpace: "nowrap"
  });

  const shellStyles = `
    .qf-shell-root {
      min-height: 100vh;
      width: 100%;
      margin: 0;
      padding: 0;
      background:
        radial-gradient(circle at top left, rgba(37,99,235,0.16), transparent 20%),
        radial-gradient(circle at bottom right, rgba(13,148,136,0.14), transparent 18%),
        linear-gradient(180deg, #08111f 0%, #0b1220 45%, #111827 100%);
      font-family: Inter, Arial, sans-serif;
      box-sizing: border-box;
      overflow-x: hidden;
    }

    .qf-shell-header {
      width: 100%;
      background: rgba(15, 23, 42, 0.78);
      border-bottom: 1px solid rgba(148,163,184,0.12);
      box-shadow: 0 14px 34px rgba(0,0,0,0.18);
      backdrop-filter: blur(14px);
      box-sizing: border-box;
      position: relative;
      z-index: 100;
    }

    .qf-shell-header-inner {
      width: 100%;
      padding: 18px 24px;
      box-sizing: border-box;
    }

    .qf-shell-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 18px;
      flex-wrap: wrap;
    }

    .qf-shell-brand-block {
      min-width: 0;
    }

    .qf-shell-mini {
      margin: 0;
      font-size: 11px;
      letter-spacing: 0.08em;
      color: #93c5fd;
      text-transform: uppercase;
      font-weight: 900;
    }

    .qf-shell-title {
      margin: 6px 0 0 0;
      font-size: 28px;
      color: #ffffff;
      font-weight: 900;
      line-height: 1.1;
      word-break: break-word;
    }

    .qf-shell-nav {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
    }

    .qf-shell-role-chip {
      padding: 10px 14px;
      border-radius: 13px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      color: #cbd5e1;
      font-size: 13px;
      font-weight: 800;
      white-space: nowrap;
    }

    .qf-shell-logout-btn {
      padding: 10px 15px;
      border-radius: 13px;
      border: 1px solid rgba(239,68,68,0.25);
      background: rgba(239,68,68,0.14);
      color: #fecaca;
      font-weight: 800;
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
    }

    .qf-shell-content {
      width: 100%;
      padding: 14px;
      box-sizing: border-box;
    }

    .qf-shell-loading {
      min-height: 100vh;
      width: 100%;
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      background:
        radial-gradient(circle at top left, rgba(37,99,235,0.16), transparent 20%),
        radial-gradient(circle at bottom right, rgba(13,148,136,0.14), transparent 18%),
        linear-gradient(180deg, #08111f 0%, #0b1220 45%, #111827 100%);
      color: #ffffff;
      font-family: Inter, Arial, sans-serif;
      font-size: 18px;
      font-weight: 800;
      box-sizing: border-box;
    }

    @media (max-width: 768px) {
      .qf-shell-header-inner {
        padding: 14px 14px;
      }

      .qf-shell-header-row {
        align-items: flex-start;
      }

      .qf-shell-title {
        font-size: 22px;
      }

      .qf-shell-nav {
        width: 100%;
        justify-content: flex-start;
      }

      .qf-shell-content {
        padding: 10px;
      }
    }

    @media (max-width: 480px) {
      .qf-shell-title {
        font-size: 19px;
      }

      .qf-shell-nav {
        gap: 8px;
      }

      .qf-shell-role-chip,
      .qf-shell-logout-btn {
        font-size: 12px;
        padding: 9px 12px;
      }
    }
  `;

  if (authLoading) {
    return (
      <>
        <style>{shellStyles}</style>
        <div className="qf-shell-loading">Loading...</div>
      </>
    );
  }

  return (
    <Router>
      <style>{shellStyles}</style>

      <div className="qf-shell-root">
        <header className="qf-shell-header">
          <div className="qf-shell-header-inner">
            <div className="qf-shell-header-row">
              <div className="qf-shell-brand-block">
                <p className="qf-shell-mini">QueueFree • UCLM</p>
                <h1 className="qf-shell-title">
                  Campus Queue Management System
                </h1>
              </div>

              {currentUser ? (
                <div className="qf-shell-nav">
                  {currentUser.role === "user" && (
                    <NavLink to="/user" style={navStyle}>
                      User Dashboard
                    </NavLink>
                  )}

                  {currentUser.role === "staff" && (
                    <NavLink to="/staff" style={navStyle}>
                      Staff Dashboard
                    </NavLink>
                  )}

                  {currentUser.role === "admin" && (
                    <NavLink to="/admin" style={navStyle}>
                      Admin Dashboard
                    </NavLink>
                  )}

                  <div className="qf-shell-role-chip">
                    {String(currentUser.role || "user").toUpperCase()}
                  </div>

                  <button
                    type="button"
                    onClick={logout}
                    className="qf-shell-logout-btn"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div className="qf-shell-nav">
                  <NavLink to="/login" style={navStyle}>
                    Login
                  </NavLink>

                  <NavLink to="/signup" style={navStyle}>
                    Signup
                  </NavLink>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="qf-shell-content">
          <Routes>
            <Route
              path="/"
              element={
                currentUser ? (
                  currentUser.role === "admin" ? (
                    <Navigate to="/admin" replace />
                  ) : currentUser.role === "staff" ? (
                    <Navigate to="/staff" replace />
                  ) : (
                    <Navigate to="/user" replace />
                  )
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />

            <Route
              path="/login"
              element={
                currentUser ? (
                  currentUser.role === "admin" ? (
                    <Navigate to="/admin" replace />
                  ) : currentUser.role === "staff" ? (
                    <Navigate to="/staff" replace />
                  ) : (
                    <Navigate to="/user" replace />
                  )
                ) : (
                  <Login />
                )
              }
            />

            <Route
              path="/signup"
              element={
                currentUser ? (
                  currentUser.role === "admin" ? (
                    <Navigate to="/admin" replace />
                  ) : currentUser.role === "staff" ? (
                    <Navigate to="/staff" replace />
                  ) : (
                    <Navigate to="/user" replace />
                  )
                ) : (
                  <Signup />
                )
              }
            />

            <Route
              path="/user"
              element={
                <ProtectedRoute allowedRoles={["user"]}>
                  <UserDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/staff"
              element={
                <ProtectedRoute allowedRoles={["staff"]}>
                  <StaffDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;