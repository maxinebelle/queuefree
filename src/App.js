import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink,
  Navigate,
  useLocation,
  useNavigate
} from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import ProtectedRoute from "./ProtectedRoute";
import AuthLanding from "./AuthLanding";
import Login from "./Login";
import Signup from "./Signup";
import UserDashboard from "./UserDashboard";
import StaffDashboard from "./StaffDashboard";
import AdminDashboard from "./AdminDashboard";

function AppShellContent() {
  const { currentUser, logout, authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isAuthPage =
    location.pathname === "/" ||
    location.pathname === "/login" ||
    location.pathname === "/signup";

  const shouldShowSidebarButton = currentUser && !isAuthPage;

  const getDashboardPath = () => {
    if (!currentUser) return "/";
    if (currentUser.role === "admin") return "/admin";
    if (currentUser.role === "staff") return "/staff";
    return "/user";
  };

  const handleBrandClick = () => {
    navigate(currentUser ? getDashboardPath() : "/");
  };

  const handleBrandKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleBrandClick();
    }
  };

  const openDashboardSidebar = () => {
    window.dispatchEvent(new Event("queuefree-open-sidebar"));
  };

  const navStyle = ({ isActive }) => ({
    textDecoration: "none",
    padding: "10px 14px",
    borderRadius: "14px",
    fontWeight: "850",
    fontSize: "13px",
    color: isActive ? "#ffffff" : "#cbd5e1",
    background: isActive
      ? "linear-gradient(135deg, #2ea8ff 0%, #2563eb 100%)"
      : "rgba(255,255,255,0.045)",
    border: isActive
      ? "1px solid rgba(96,165,250,0.38)"
      : "1px solid rgba(255,255,255,0.08)",
    boxShadow: isActive ? "0 12px 24px rgba(46,168,255,0.22)" : "none",
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
        radial-gradient(circle at top left, rgba(46,168,255,0.16), transparent 22%),
        radial-gradient(circle at bottom right, rgba(20,184,166,0.12), transparent 22%),
        linear-gradient(180deg, #02060d 0%, #030812 42%, #02050a 100%);
      font-family: Inter, Arial, sans-serif;
      box-sizing: border-box;
      overflow-x: hidden;
    }

    .qf-shell-root *,
    .qf-shell-root *::before,
    .qf-shell-root *::after {
      box-sizing: border-box;
    }

    .qf-shell-header {
      width: 100%;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018)),
        rgba(5, 10, 18, 0.94);
      border-bottom: 1px solid rgba(148,163,184,0.12);
      box-shadow: 0 14px 34px rgba(0,0,0,0.18);
      backdrop-filter: blur(14px);
      box-sizing: border-box;
      position: relative;
      z-index: 100;
    }

    .qf-shell-header-inner {
      width: 100%;
      padding: 12px 16px;
      box-sizing: border-box;
    }

    .qf-shell-header-row {
      width: 100%;
      min-height: 54px;
      display: grid;
      grid-template-columns: auto minmax(280px, 1fr) auto;
      align-items: center;
      gap: 16px;
    }

    .qf-shell-header-row.no-sidebar-button {
      grid-template-columns: minmax(280px, 1fr) auto;
    }

    .qf-shell-menu-placeholder {
      width: 46px;
      height: 46px;
      min-width: 46px;
    }

    .qf-shell-menu-btn {
      width: 46px;
      height: 46px;
      min-width: 46px;
      border: 1px solid rgba(46,168,255,0.32);
      border-radius: 16px;
      background:
        linear-gradient(180deg, rgba(46,168,255,0.20), rgba(46,168,255,0.07)),
        rgba(8, 15, 28, 0.96);
      box-shadow:
        0 12px 24px rgba(0,0,0,0.28),
        inset 0 1px 0 rgba(255,255,255,0.06);
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 5px;
      cursor: pointer;
      transition: 0.2s ease;
    }

    .qf-shell-menu-btn:hover {
      transform: translateY(-1px);
      border-color: rgba(46,168,255,0.58);
      box-shadow:
        0 14px 30px rgba(46,168,255,0.16),
        inset 0 1px 0 rgba(255,255,255,0.06);
    }

    .qf-shell-menu-btn span {
      width: 20px;
      height: 2px;
      border-radius: 999px;
      background: #ffffff;
      display: block;
    }

    .qf-shell-brand-center {
      min-width: 0;
      justify-self: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      text-align: left;
      cursor: pointer;
      border-radius: 18px;
      padding: 4px 8px;
      transition: 0.2s ease;
      outline: none;
    }

    .qf-shell-brand-center:hover {
      background: rgba(255,255,255,0.035);
    }

    .qf-shell-brand-center:focus-visible {
      box-shadow: 0 0 0 3px rgba(46,168,255,0.24);
    }

    .qf-shell-header-row.no-sidebar-button .qf-shell-brand-center {
      justify-self: center;
    }

    .qf-shell-logo {
      width: 46px;
      height: 46px;
      min-width: 46px;
      object-fit: contain;
      filter: brightness(0) saturate(100%) invert(100%);
      opacity: 0.96;
    }

    .qf-shell-brand-text {
      min-width: 0;
    }

    .qf-shell-mini {
      margin: 0;
      font-size: 11px;
      letter-spacing: 0.12em;
      color: #93c5fd;
      text-transform: uppercase;
      font-weight: 950;
      line-height: 1.2;
    }

    .qf-shell-title {
      margin: 4px 0 0 0;
      font-size: 23px;
      color: #ffffff;
      font-weight: 950;
      line-height: 1.1;
      word-break: break-word;
      letter-spacing: -0.02em;
    }

    .qf-shell-nav {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      min-width: 0;
    }

    .qf-shell-role-chip {
      padding: 10px 14px;
      border-radius: 14px;
      background: rgba(255,255,255,0.045);
      border: 1px solid rgba(255,255,255,0.08);
      color: #cbd5e1;
      font-size: 13px;
      font-weight: 850;
      white-space: nowrap;
    }

    .qf-shell-logout-btn {
      padding: 10px 14px;
      border-radius: 14px;
      border: 1px solid rgba(239,68,68,0.28);
      background: rgba(239,68,68,0.14);
      color: #fecaca;
      font-weight: 850;
      font-size: 13px;
      cursor: pointer;
      white-space: nowrap;
      transition: transform 0.2s ease, background 0.2s ease;
    }

    .qf-shell-logout-btn:hover {
      transform: translateY(-1px);
      background: rgba(239,68,68,0.20);
    }

    .qf-shell-content {
      width: 100%;
      padding: 0;
      box-sizing: border-box;
      overflow-x: hidden;
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
        radial-gradient(circle at top left, rgba(46,168,255,0.16), transparent 22%),
        radial-gradient(circle at bottom right, rgba(20,184,166,0.12), transparent 22%),
        linear-gradient(180deg, #02060d 0%, #030812 42%, #02050a 100%);
      color: #ffffff;
      font-family: Inter, Arial, sans-serif;
      font-size: 18px;
      font-weight: 850;
      box-sizing: border-box;
    }

    @media (max-width: 980px) {
      .qf-shell-header-row {
        grid-template-columns: auto 1fr;
        grid-template-areas:
          "menu brand"
          "nav nav";
        align-items: center;
      }

      .qf-shell-header-row.no-sidebar-button {
        grid-template-columns: 1fr;
        grid-template-areas:
          "brand"
          "nav";
      }

      .qf-shell-menu-btn {
        grid-area: menu;
      }

      .qf-shell-brand-center {
        grid-area: brand;
        justify-self: start;
      }

      .qf-shell-header-row.no-sidebar-button .qf-shell-brand-center {
        justify-self: center;
      }

      .qf-shell-nav {
        grid-area: nav;
        width: 100%;
        justify-content: flex-start;
      }

      .qf-shell-header-row.no-sidebar-button .qf-shell-nav {
        justify-content: center;
      }
    }

    @media (max-width: 768px) {
      .qf-shell-header-inner {
        padding: 10px 12px;
      }

      .qf-shell-menu-btn {
        width: 42px;
        height: 42px;
        min-width: 42px;
        border-radius: 14px;
      }

      .qf-shell-logo {
        width: 40px;
        height: 40px;
        min-width: 40px;
      }

      .qf-shell-title {
        font-size: 19px;
      }

      .qf-shell-nav {
        gap: 8px;
      }
    }

    @media (max-width: 480px) {
      .qf-shell-brand-center {
        gap: 9px;
        padding: 3px 5px;
      }

      .qf-shell-mini {
        font-size: 9px;
      }

      .qf-shell-title {
        font-size: 16px;
      }

      .qf-shell-role-chip,
      .qf-shell-logout-btn {
        font-size: 12px;
        padding: 9px 11px;
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
    <>
      <style>{shellStyles}</style>

      <div className="qf-shell-root">
        <header className="qf-shell-header">
          <div className="qf-shell-header-inner">
            <div
              className={`qf-shell-header-row ${
                shouldShowSidebarButton ? "" : "no-sidebar-button"
              }`}
            >
              {shouldShowSidebarButton && (
                <button
                  type="button"
                  className="qf-shell-menu-btn"
                  onClick={openDashboardSidebar}
                  aria-label="Open sidebar menu"
                >
                  <span></span>
                  <span></span>
                  <span></span>
                </button>
              )}

              <div
                className="qf-shell-brand-center"
                onClick={handleBrandClick}
                onKeyDown={handleBrandKeyDown}
                role="button"
                tabIndex={0}
                title={
                  currentUser
                    ? "Go to your QueueFree dashboard"
                    : "Go to QueueFree landing page"
                }
              >
                <img
                  src="/queuefree-logo.png"
                  alt="QueueFree Logo"
                  className="qf-shell-logo"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />

                <div className="qf-shell-brand-text">
                  <p className="qf-shell-mini">QueueFree • UCLM</p>
                  <h1 className="qf-shell-title">
                    Campus Queue Management System
                  </h1>
                </div>
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
                  <Navigate to={getDashboardPath()} replace />
                ) : (
                  <AuthLanding />
                )
              }
            />

            <Route
              path="/login"
              element={
                currentUser ? (
                  <Navigate to={getDashboardPath()} replace />
                ) : (
                  <Login />
                )
              }
            />

            <Route
              path="/signup"
              element={
                currentUser ? (
                  <Navigate to={getDashboardPath()} replace />
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
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppShellContent />
      </Router>
    </AuthProvider>
  );
}

export default App;