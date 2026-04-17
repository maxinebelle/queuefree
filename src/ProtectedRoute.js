import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

function ProtectedRoute({ allowedRoles, children }) {
  const { currentUser, authLoading } = useAuth();

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          color: "#ffffff",
          fontSize: "18px"
        }}
      >
        Loading...
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (currentUser.is_deleted === true) {
    return <Navigate to="/login" replace />;
  }

  if (
    currentUser.role === "staff" &&
    (currentUser.account_status || "active").toLowerCase() === "inactive"
  ) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(currentUser.role)) {
    if (currentUser.role === "staff") {
      return <Navigate to="/staff" replace />;
    }

    if (currentUser.role === "admin") {
      return <Navigate to="/admin" replace />;
    }

    return <Navigate to="/user" replace />;
  }

  return children;
}

export default ProtectedRoute;