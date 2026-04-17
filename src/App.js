import React from "react";
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from "react-router-dom";
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
    padding: "12px 18px",
    borderRadius: "14px",
    fontWeight: "700",
    fontSize: "14px",
    color: isActive ? "#ffffff" : "#cbd5e1",
    background: isActive
      ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
      : "rgba(255,255,255,0.05)",
    border: isActive
      ? "1px solid rgba(96,165,250,0.25)"
      : "1px solid rgba(255,255,255,0.08)",
    boxShadow: isActive ? "0 10px 20px rgba(37,99,235,0.22)" : "none",
    backdropFilter: "blur(8px)"
  });

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          width: "100%",
          margin: 0,
          padding: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background:
            "radial-gradient(circle at top left, rgba(37,99,235,0.16), transparent 20%), radial-gradient(circle at bottom right, rgba(13,148,136,0.14), transparent 18%), linear-gradient(180deg, #08111f 0%, #0b1220 45%, #111827 100%)",
          color: "#ffffff",
          fontFamily: "Inter, Arial, sans-serif",
          fontSize: "18px",
          fontWeight: "700"
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <Router>
      <div
        style={{
          minHeight: "100vh",
          width: "100%",
          margin: 0,
          padding: 0,
          background:
            "radial-gradient(circle at top left, rgba(37,99,235,0.16), transparent 20%), radial-gradient(circle at bottom right, rgba(13,148,136,0.14), transparent 18%), linear-gradient(180deg, #08111f 0%, #0b1220 45%, #111827 100%)",
          fontFamily: "Inter, Arial, sans-serif",
          boxSizing: "border-box",
          overflowX: "hidden"
        }}
      >
        <div
          style={{
            width: "100%",
            background: "rgba(15, 23, 42, 0.72)",
            borderBottom: "1px solid rgba(148,163,184,0.12)",
            boxShadow: "0 18px 36px rgba(0,0,0,0.18)",
            backdropFilter: "blur(14px)",
            boxSizing: "border-box"
          }}
        >
          <div
            style={{
              width: "100%",
              padding: "22px 26px",
              boxSizing: "border-box"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "20px",
                flexWrap: "wrap"
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "12px",
                    letterSpacing: "0.08em",
                    color: "#93c5fd",
                    textTransform: "uppercase"
                  }}
                >
                  QueueFree • UCLM
                </p>
                <h1
                  style={{
                    margin: "8px 0 0 0",
                    fontSize: "30px",
                    color: "#ffffff",
                    fontWeight: "800"
                  }}
                >
                  Campus Queue Management System
                </h1>
              </div>

              {currentUser ? (
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                    alignItems: "center"
                  }}
                >
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

                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: "14px",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "#cbd5e1",
                      fontSize: "14px",
                      fontWeight: "700"
                    }}
                  >
                    {currentUser.role.toUpperCase()}
                  </div>

                  <button
                    onClick={logout}
                    style={{
                      padding: "12px 18px",
                      borderRadius: "14px",
                      border: "1px solid rgba(239,68,68,0.25)",
                      background: "rgba(239,68,68,0.14)",
                      color: "#fecaca",
                      fontWeight: "700",
                      fontSize: "14px",
                      cursor: "pointer"
                    }}
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
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
        </div>

        <div
          style={{
            width: "100%",
            padding: "20px",
            boxSizing: "border-box"
          }}
        >
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
        </div>
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