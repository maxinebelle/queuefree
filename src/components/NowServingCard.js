import React from "react";

function NowServingCard({ department, nowServing }) {
  return (
    <div
      style={{
        backgroundColor: "#eff6ff",
        padding: "20px",
        borderRadius: "14px",
        marginBottom: "20px",
        textAlign: "center"
      }}
    >
      <h3>{department} Now Serving</h3>
      <h1 style={{ fontSize: "40px", margin: 0 }}>{nowServing}</h1>
    </div>
  );
}

export default NowServingCard;