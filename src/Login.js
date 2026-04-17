import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";

function Login() {
  const navigate = useNavigate();
  const { login, logout } = useAuth();

  const [selectedRole, setSelectedRole] = useState("user");

  const [roleForms, setRoleForms] = useState({
    user: {
      email: "",
      password: ""
    },
    staff: {
      email: "",
      password: ""
    },
    admin: {
      email: "",
      password: ""
    }
  });

  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const activeForm = useMemo(() => {
    return roleForms[selectedRole] || { email: "", password: "" };
  }, [roleForms, selectedRole]);

  const updateActiveField = (field, value) => {
    setRoleForms((prev) => ({
      ...prev,
      [selectedRole]: {
        ...prev[selectedRole],
        [field]: value
      }
    }));
  };

  const getRoleTabName = (role) => {
    if (role === "admin") return "Admin";
    if (role === "staff") return "Staff";
    return "User";
  };

  const validateForm = () => {
    const trimmedEmail = activeForm.email.trim().toLowerCase();
    const trimmedPassword = activeForm.password.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!trimmedEmail && !trimmedPassword) {
      setFormError("Please enter your email address and password.");
      return false;
    }

    if (!trimmedEmail) {
      setFormError("Please enter your email address.");
      return false;
    }

    if (!emailPattern.test(trimmedEmail)) {
      setFormError("Please enter a valid email address.");
      return false;
    }

    if (!trimmedPassword) {
      setFormError("Please enter your password.");
      return false;
    }

    return true;
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!validateForm()) return;

    try {
      setLoading(true);

      const trimmedEmail = activeForm.email.trim().toLowerCase();
      const trimmedPassword = activeForm.password.trim();

      const userCredential = await login(trimmedEmail, trimmedPassword);
      const firebaseUser = userCredential.user;

      const userRef = doc(db, "users", firebaseUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await logout();
        setFormError("User profile not found in the database.");
        return;
      }

      const userData = userSnap.data();
      const actualRole = (userData.role || "user").toLowerCase().trim();
      const accountStatus = (userData.account_status || "active").toLowerCase().trim();
      const isDeleted = userData.is_deleted === true;

      if (isDeleted) {
        await logout();
        setFormError("This account has been archived and can no longer access the system.");
        return;
      }

      if (actualRole === "staff" && accountStatus !== "active") {
        await logout();
        setFormError("This staff account is inactive. Please contact the admin.");
        return;
      }

      if (selectedRole !== actualRole) {
        await logout();
        setFormError(
          `This account belongs to the ${getRoleTabName(actualRole)} tab. Please use the correct login tab.`
        );
        return;
      }

      setFormSuccess("Login successful.");

      if (actualRole === "admin") {
        navigate("/admin", { replace: true });
      } else if (actualRole === "staff") {
        navigate("/staff", { replace: true });
      } else {
        navigate("/user", { replace: true });
      }
    } catch (error) {
      console.error("Login error:", error);

      if (
        error.code === "auth/invalid-credential" ||
        error.code === "auth/wrong-password"
      ) {
        setFormError("Incorrect email or password.");
      } else if (error.code === "auth/user-not-found") {
        setFormError("No account was found for this email address.");
      } else if (error.code === "auth/invalid-email") {
        setFormError("Please enter a valid email address.");
      } else if (error.code === "auth/too-many-requests") {
        setFormError("Too many failed attempts. Please try again later.");
      } else {
        setFormError("Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const roleButtonStyle = (roleKey) => ({
    flex: 1,
    height: "46px",
    borderRadius: "999px",
    border: "none",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "700",
    transition: "all 0.2s ease",
    background:
      selectedRole === roleKey
        ? roleKey === "admin"
          ? "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)"
          : roleKey === "staff"
          ? "linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)"
          : "linear-gradient(135deg, #2ea8ff 0%, #2563eb 100%)"
        : "transparent",
    color: selectedRole === roleKey ? "#ffffff" : "#cbd5e1",
    boxShadow: selectedRole === roleKey ? "0 10px 24px rgba(37,99,235,0.18)" : "none"
  });

  return (
    <div
      style={{
        width: "100%",
        minHeight: "calc(100vh - 170px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        boxSizing: "border-box"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "560px",
          borderRadius: "30px",
          padding: "34px 30px",
          boxSizing: "border-box",
          background:
            "radial-gradient(circle at top center, rgba(46,168,255,0.16), transparent 26%), linear-gradient(180deg, rgba(4,10,20,0.94) 0%, rgba(3,8,16,0.98) 100%)",
          border: "1px solid rgba(148,163,184,0.14)",
          boxShadow: "0 28px 60px rgba(0,0,0,0.34)",
          backdropFilter: "blur(16px)"
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px 16px",
              borderRadius: "999px",
              background: "rgba(37,99,235,0.12)",
              border: "1px solid rgba(96,165,250,0.18)",
              color: "#bfdbfe",
              fontSize: "12px",
              fontWeight: "800",
              letterSpacing: "0.08em",
              textTransform: "uppercase"
            }}
          >
            QueueFree Login
          </div>

          <h2
            style={{
              margin: "18px 0 10px 0",
              color: "#ffffff",
              fontSize: "clamp(36px, 5vw, 56px)",
              fontWeight: "900",
              lineHeight: "1.04"
            }}
          >
            Welcome Back
          </h2>

          <p
            style={{
              margin: 0,
              color: "#cbd5e1",
              fontSize: "16px",
              lineHeight: "1.8",
              maxWidth: "380px",
              marginInline: "auto"
            }}
          >
            Sign in to continue to your QueueFree dashboard.
          </p>
        </div>

        <form onSubmit={handleLogin} noValidate>
          <div
            style={{
              display: "flex",
              gap: "8px",
              padding: "6px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              marginBottom: "22px"
            }}
          >
            <button
              type="button"
              style={roleButtonStyle("user")}
              onClick={() => {
                setSelectedRole("user");
                setFormError("");
                setFormSuccess("");
              }}
            >
              User
            </button>

            <button
              type="button"
              style={roleButtonStyle("staff")}
              onClick={() => {
                setSelectedRole("staff");
                setFormError("");
                setFormSuccess("");
              }}
            >
              Staff
            </button>

            <button
              type="button"
              style={roleButtonStyle("admin")}
              onClick={() => {
                setSelectedRole("admin");
                setFormError("");
                setFormSuccess("");
              }}
            >
              Admin
            </button>
          </div>

          <div style={{ display: "grid", gap: "16px" }}>
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: "700"
                }}
              >
                Email
              </label>

              <input
                type="text"
                value={activeForm.email}
                onChange={(e) => updateActiveField("email", e.target.value)}
                placeholder={`Enter your ${getRoleTabName(selectedRole).toLowerCase()} email`}
                style={{
                  width: "100%",
                  height: "56px",
                  padding: "0 18px",
                  borderRadius: "16px",
                  border: "1px solid rgba(148,163,184,0.16)",
                  background: "rgba(15,23,42,0.82)",
                  color: "#ffffff",
                  fontSize: "15px",
                  outline: "none",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: "700"
                }}
              >
                Password
              </label>

              <input
                type="password"
                value={activeForm.password}
                onChange={(e) => updateActiveField("password", e.target.value)}
                placeholder={`Enter your ${getRoleTabName(selectedRole).toLowerCase()} password`}
                style={{
                  width: "100%",
                  height: "56px",
                  padding: "0 18px",
                  borderRadius: "16px",
                  border: "1px solid rgba(148,163,184,0.16)",
                  background: "rgba(15,23,42,0.82)",
                  color: "#ffffff",
                  fontSize: "15px",
                  outline: "none",
                  boxSizing: "border-box"
                }}
              />
            </div>
          </div>

          {formError && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px 14px",
                borderRadius: "14px",
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.18)",
                color: "#fecaca",
                fontSize: "14px",
                fontWeight: "600"
              }}
            >
              {formError}
            </div>
          )}

          {formSuccess && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px 14px",
                borderRadius: "14px",
                background: "rgba(34,197,94,0.12)",
                border: "1px solid rgba(34,197,94,0.18)",
                color: "#bbf7d0",
                fontSize: "14px",
                fontWeight: "600"
              }}
            >
              {formSuccess}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              height: "56px",
              marginTop: "22px",
              border: "none",
              borderRadius: "999px",
              background:
                selectedRole === "admin"
                  ? "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)"
                  : selectedRole === "staff"
                  ? "linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)"
                  : "linear-gradient(135deg, #2ea8ff 0%, #2563eb 100%)",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: "800",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 14px 30px rgba(37,99,235,0.26)",
              opacity: loading ? 0.75 : 1
            }}
          >
            {loading ? "Signing In..." : "Sign In"}
          </button>

          <div
            style={{
              marginTop: "22px",
              paddingTop: "20px",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              textAlign: "center",
              color: "#cbd5e1",
              fontSize: "14px"
            }}
          >
            Don’t have an account?{" "}
            <span
              onClick={() => navigate("/signup")}
              style={{
                color: "#60a5fa",
                fontWeight: "800",
                cursor: "pointer"
              }}
            >
              Create Account
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;