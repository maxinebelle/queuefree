import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

function Signup() {
  const navigate = useNavigate();
  const { signup, logout } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [studentNo, setStudentNo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [laneChoice, setLaneChoice] = useState("Regular");
  const [priorityType, setPriorityType] = useState("PWD");
  const [priorityProofFileName, setPriorityProofFileName] = useState("");
  const [priorityProofData, setPriorityProofData] = useState("");

  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const isPriority = laneChoice === "Priority";

  const readFileAsDataURL = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const validateForm = () => {
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedStudentNo = studentNo.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    const trimmedConfirmPassword = confirmPassword.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !trimmedFirstName &&
      !trimmedLastName &&
      !trimmedStudentNo &&
      !trimmedEmail &&
      !trimmedPassword &&
      !trimmedConfirmPassword
    ) {
      setFormError("Please complete the signup form.");
      return false;
    }

    if (!trimmedFirstName) {
      setFormError("Please enter your first name.");
      return false;
    }

    if (!trimmedLastName) {
      setFormError("Please enter your last name.");
      return false;
    }

    if (!trimmedStudentNo) {
      setFormError("Please enter your student number.");
      return false;
    }

    if (!/^\d+$/.test(trimmedStudentNo)) {
      setFormError("Student number must contain digits only.");
      return false;
    }

    if (trimmedStudentNo.length < 6) {
      setFormError("Student number must be at least 6 digits.");
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

    if (trimmedEmail === "ucadmin@gmail.com") {
      setFormError("This signup form is not for admin accounts.");
      return false;
    }

    if (trimmedEmail === "ucstaff@gmail.com") {
      setFormError("This signup form is not for staff accounts.");
      return false;
    }

    if (trimmedEmail.includes("staff")) {
      setFormError("Staff accounts must be created by the admin.");
      return false;
    }

    if (!trimmedPassword) {
      setFormError("Please enter your password.");
      return false;
    }

    if (trimmedPassword.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return false;
    }

    if (!trimmedConfirmPassword) {
      setFormError("Please confirm your password.");
      return false;
    }

    if (trimmedPassword !== trimmedConfirmPassword) {
      setFormError("Password and confirm password do not match.");
      return false;
    }

    if (isPriority && !priorityType.trim()) {
      setFormError("Please select your priority type.");
      return false;
    }

    if (isPriority && !priorityProofData) {
      setFormError("Priority lane applicants must upload proof for verification.");
      return false;
    }

    return true;
  };

  const handlePriorityProofChange = async (e) => {
    try {
      setFormError("");
      const file = e.target.files?.[0];

      if (!file) {
        setPriorityProofFileName("");
        setPriorityProofData("");
        return;
      }

      const allowedTypes = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];

      if (!allowedTypes.includes(file.type)) {
        setFormError("Only JPG, PNG, or PDF files are allowed for priority proof.");
        e.target.value = "";
        return;
      }

      if (file.size > 2 * 1024 * 1024) {
        setFormError("Priority proof file must be 2MB or below.");
        e.target.value = "";
        return;
      }

      const fileData = await readFileAsDataURL(file);
      setPriorityProofFileName(file.name);
      setPriorityProofData(fileData);
    } catch (error) {
      console.error("Priority proof read error:", error);
      setFormError("Failed to read priority proof file.");
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (loading) return;
    if (!validateForm()) return;

    try {
      setLoading(true);

      await signup({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        password: password.trim(),
        studentNo: studentNo.trim(),
        isPriority,
        priorityType: isPriority ? priorityType : "Regular",
        priorityProofFileName,
        priorityProofData
      });

      await logout();

      setFormSuccess(
        isPriority
          ? "Account created. Your priority request is pending verification. Redirecting to login..."
          : "Account created successfully. Redirecting to login..."
      );

      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1500);
    } catch (error) {
      console.error("Signup error:", error);

      if (error.code === "auth/email-already-in-use") {
        setFormError("This email is already registered.");
      } else if (error.code === "auth/invalid-email") {
        setFormError("Please enter a valid email address.");
      } else if (error.code === "auth/weak-password") {
        setFormError("Password is too weak. Please use at least 6 characters.");
      } else {
        setFormError("Signup failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const laneButtonStyle = (value) => ({
    flex: 1,
    minWidth: "180px",
    height: "46px",
    borderRadius: "999px",
    border: "none",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "700",
    transition: "all 0.2s ease",
    background:
      laneChoice === value
        ? value === "Priority"
          ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
          : "linear-gradient(135deg, #2ea8ff 0%, #2563eb 100%)"
        : "rgba(255,255,255,0.04)",
    color: "#ffffff",
    boxShadow:
      laneChoice === value
        ? value === "Priority"
          ? "0 10px 24px rgba(245,158,11,0.22)"
          : "0 10px 24px rgba(37,99,235,0.18)"
        : "none"
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
          maxWidth: "720px",
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
            QueueFree Signup
          </div>

          <h2
            style={{
              margin: "18px 0 10px 0",
              color: "#ffffff",
              fontSize: "clamp(34px, 5vw, 54px)",
              fontWeight: "900",
              lineHeight: "1.04"
            }}
          >
            Create Your Account
          </h2>

          <p
            style={{
              margin: 0,
              color: "#cbd5e1",
              fontSize: "16px",
              lineHeight: "1.8",
              maxWidth: "420px",
              marginInline: "auto"
            }}
          >
            Register as a QueueFree user for UCLM queue access.
          </p>
        </div>

        <form onSubmit={handleSignup} noValidate>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "16px"
            }}
          >
            <div>
              <label style={{ display: "block", marginBottom: "8px", color: "#ffffff", fontSize: "14px", fontWeight: "700" }}>
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter your first name"
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
              <label style={{ display: "block", marginBottom: "8px", color: "#ffffff", fontSize: "14px", fontWeight: "700" }}>
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter your last name"
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

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", marginBottom: "8px", color: "#ffffff", fontSize: "14px", fontWeight: "700" }}>
                Student Number
              </label>
              <input
                type="text"
                value={studentNo}
                onChange={(e) => setStudentNo(e.target.value)}
                placeholder="Enter your student number"
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

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", marginBottom: "8px", color: "#ffffff", fontSize: "14px", fontWeight: "700" }}>
                Email
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
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
              <label style={{ display: "block", marginBottom: "8px", color: "#ffffff", fontSize: "14px", fontWeight: "700" }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
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
              <label style={{ display: "block", marginBottom: "8px", color: "#ffffff", fontSize: "14px", fontWeight: "700" }}>
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
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

          <div
            style={{
              marginTop: "18px",
              padding: "18px",
              borderRadius: "20px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)"
            }}
          >
            <div
              style={{
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: "700",
                marginBottom: "12px"
              }}
            >
              Queue Lane Type
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: isPriority ? "14px" : "0" }}>
              <button
                type="button"
                style={laneButtonStyle("Regular")}
                onClick={() => {
                  setLaneChoice("Regular");
                  setPriorityProofFileName("");
                  setPriorityProofData("");
                  setFormError("");
                }}
              >
                Regular Lane
              </button>

              <button
                type="button"
                style={laneButtonStyle("Priority")}
                onClick={() => {
                  setLaneChoice("Priority");
                  setFormError("");
                }}
              >
                Priority Lane
              </button>
            </div>

            {isPriority && (
              <div style={{ display: "grid", gap: "14px" }}>
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
                    Priority Type
                  </label>

                  <select
                    value={priorityType}
                    onChange={(e) => setPriorityType(e.target.value)}
                    style={{
                      width: "100%",
                      height: "52px",
                      padding: "0 16px",
                      borderRadius: "14px",
                      border: "1px solid rgba(148,163,184,0.16)",
                      background: "rgba(15,23,42,0.82)",
                      color: "#ffffff",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box"
                    }}
                  >
                    <option value="PWD">PWD</option>
                    <option value="Pregnant">Pregnant</option>
                    <option value="Senior Citizen">Senior Citizen</option>
                  </select>
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
                    Upload Proof for Verification
                  </label>

                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    onChange={handlePriorityProofChange}
                    style={{
                      width: "100%",
                      color: "#cbd5e1"
                    }}
                  />

                  {priorityProofFileName && (
                    <div
                      style={{
                        marginTop: "8px",
                        color: "#93c5fd",
                        fontSize: "13px",
                        fontWeight: "600"
                      }}
                    >
                      Selected file: {priorityProofFileName}
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: "8px",
                      color: "#94a3b8",
                      fontSize: "12px",
                      lineHeight: "1.6"
                    }}
                  >
                    Your request will stay pending until the school verifies your proof.
                  </div>
                </div>
              </div>
            )}
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
              background: "linear-gradient(135deg, #2ea8ff 0%, #2563eb 100%)",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: "800",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 14px 30px rgba(37,99,235,0.26)",
              opacity: loading ? 0.75 : 1
            }}
          >
            {loading ? "Creating Account..." : "Create Account"}
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
            Already have an account?{" "}
            <span
              onClick={() => navigate("/login")}
              style={{
                color: "#60a5fa",
                fontWeight: "800",
                cursor: "pointer"
              }}
            >
              Sign In
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Signup;