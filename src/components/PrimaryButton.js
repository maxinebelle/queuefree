import React from "react";

function PrimaryButton({ text, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "12px 18px",
        borderRadius: "10px",
        border: "none",
        backgroundColor: "#2563eb",
        color: "#ffffff",
        fontWeight: "600",
        cursor: "pointer"
      }}
    >
      {text}
    </button>
  );
}

export default PrimaryButton;