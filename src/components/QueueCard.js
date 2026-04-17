import React from "react";

function QueueCard({ ticket }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "14px",
        padding: "18px",
        backgroundColor: "#fafafa"
      }}
    >
      <h3>{ticket.deptName}</h3>
      <p><strong>Your Number:</strong> {ticket.ticket_number}</p>
      <p><strong>Status:</strong> {ticket.status}</p>
      <p><strong>People Ahead:</strong> {ticket.peopleAhead}</p>
      <p><strong>Estimated Wait:</strong> {ticket.waitTime}</p>
    </div>
  );
}

export default QueueCard;