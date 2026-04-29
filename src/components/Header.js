import React from "react";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { useAuth } from "./AuthContext";

function Header() {
  const { currentUser } = useAuth();

  const role = String(currentUser?.role || "user").toLowerCase();

  const roleLabel =
    role === "admin" ? "ADMIN" : role === "staff" ? "STAFF" : "USER";

  const dashboardLabel =
    role === "admin"
      ? "Admin Dashboard"
      : role === "staff"
      ? "Staff Dashboard"
      : "User Dashboard";

  const theme =
    role === "admin"
      ? {
          main: "#8b5cf6",
          second: "#6d28d9",
          glow: "rgba(139, 92, 246, 0.28)"
        }
      : role === "staff"
      ? {
          main: "#14b8a6",
          second: "#0f766e",
          glow: "rgba(20, 184, 166, 0.28)"
        }
      : {
          main: "#2ea8ff",
          second: "#2563eb",
          glow: "rgba(46, 168, 255, 0.28)"
        };

  const handleOpenSidebar = () => {
    window.dispatchEvent(new Event("queuefree-open-sidebar"));
  };

  const handleLogout = async () => {
    const confirmLogout = window.confirm("Are you sure you want to log out?");
    if (!confirmLogout) return;

    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
      alert("Failed to log out. Please try again.");
    }
  };

  return (
    <header
      style={{
        width: "100%",
        minHeight: "78px",
        padding: "12px 18px",
        background:
          "linear-gradient(180deg, rgba(5, 10, 18, 0.98), rgba(3, 7, 15, 0.96))",
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: "0 14px 34px rgba(0, 0, 0, 0.34)",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: "16px",
        position: "sticky",
        top: 0,
        zIndex: 1200,
        boxSizing: "border-box"
      }}
    >
      <button
        type="button"
        onClick={handleOpenSidebar}
        aria-label="Open menu"
        style={{
          width: "46px",
          height: "46px",
          minWidth: "46px",
          borderRadius: "15px",
          border: `1px solid ${theme.main}66`,
          background:
            "linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.02))",
          boxShadow: `0 12px 24px ${theme.glow}`,
          display: "inline-flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: "5px",
          cursor: "pointer"
        }}
      >
        <span
          style={{
            width: "20px",
            height: "2px",
            borderRadius: "999px",
            background: "#ffffff",
            display: "block"
          }}
        ></span>
        <span
          style={{
            width: "20px",
            height: "2px",
            borderRadius: "999px",
            background: "#ffffff",
            display: "block"
          }}
        ></span>
        <span
          style={{
            width: "20px",
            height: "2px",
            borderRadius: "999px",
            background: "#ffffff",
            display: "block"
          }}
        ></span>
      </button>

      <div
        style={{
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px"
        }}
      >
        <div
          style={{
            width: "44px",
            height: "44px",
            minWidth: "44px",
            borderRadius: "50%",
            background:
              "linear-gradient(135deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04))",
            border: "1px solid rgba(255, 255, 255, 0.14)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 12px 26px ${theme.glow}`
          }}
        >
          <span
            style={{
              fontSize: "23px",
              lineHeight: 1
            }}
          >
            👥
          </span>
        </div>

        <div
          style={{
            minWidth: 0
          }}
        >
          <div
            style={{
              color: "#7dd3fc",
              fontSize: "11px",
              fontWeight: 950,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              lineHeight: 1.2
            }}
          >
            QueueFree • UCLM
          </div>

          <div
            style={{
              color: "#ffffff",
              fontSize: "24px",
              fontWeight: 950,
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}
          >
            Campus Queue Management System
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "10px",
          minWidth: 0
        }}
      >
        <div
          style={{
            minHeight: "42px",
            padding: "0 16px",
            borderRadius: "14px",
            background: `linear-gradient(135deg, ${theme.main} 0%, ${theme.second} 100%)`,
            color: "#ffffff",
            fontSize: "13px",
            fontWeight: 950,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 12px 26px ${theme.glow}`,
            whiteSpace: "nowrap"
          }}
        >
          {dashboardLabel}
        </div>

        <div
          style={{
            minHeight: "42px",
            padding: "0 16px",
            borderRadius: "14px",
            background: "rgba(255, 255, 255, 0.055)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            color: "#ffffff",
            fontSize: "12px",
            fontWeight: 950,
            letterSpacing: "0.08em",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            whiteSpace: "nowrap"
          }}
        >
          {roleLabel}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            minHeight: "42px",
            padding: "0 16px",
            borderRadius: "14px",
            border: "1px solid rgba(248, 113, 113, 0.32)",
            background:
              "linear-gradient(135deg, rgba(127, 29, 29, 0.72), rgba(69, 10, 10, 0.84))",
            color: "#fecaca",
            fontSize: "13px",
            fontWeight: 950,
            cursor: "pointer",
            boxShadow: "0 12px 24px rgba(239, 68, 68, 0.14)",
            whiteSpace: "nowrap"
          }}
        >
          Logout
        </button>
      </div>
    </header>
  );
}

export default Header;