import React from "react";

function DepartmentSelector({ departments, selected, onChange }) {
  return (
    <select
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "12px",
        borderRadius: "10px",
        border: "1px solid #d1d5db",
        marginRight: "10px"
      }}
    >
      {departments.map((dept) => (
        <option key={dept} value={dept}>
          {dept}
        </option>
      ))}
    </select>
  );
}

export default DepartmentSelector;