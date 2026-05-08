import React, { useEffect, useMemo, useState } from "react";
import { db, auth } from "./firebase";
import { useAuth } from "./AuthContext";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import jsPDF from "jspdf";
import * as XLSX from "xlsx-js-style";
import "./AdminDashboard.css";

const QF_XLSX_COLORS = {
  title: "FF111827",
  navy: "FFE5E7EB",
  navy2: "FFF2F4F7",
  subtitle: "FF667085",
  header: "FFF2F4F7",
  header2: "FFE5E7EB",
  panel: "FFFFFFFF",
  panel2: "FFF9FAFB",
  border: "FFD0D5DD",
  text: "FF101828",
  muted: "FF667085",
  white: "FFFFFFFF",
  blue: "FF344054",
  bluePale: "FFF8FAFC",
  purple: "FF475467",
  purplePale: "FFF8FAFC",
  amber: "FF7A5C1F",
  amberPale: "FFFFFCF5",
  teal: "FF276749",
  tealPale: "FFF6FEF9",
  green: "FF276749",
  red: "FFB42318",
  slate: "FF344054",
  progress: "FF475467",
  progressTrack: "FFE5E7EB"
};

function qfXlsxStyle({
  bold = false,
  size = 10,
  color = QF_XLSX_COLORS.text,
  bg = null,
  align = "left",
  valign = "center",
  wrap = true,
  border = true
} = {}) {
  const style = {
    font: { name: "Arial", sz: size, bold, color: { rgb: color } },
    alignment: { horizontal: align, vertical: valign, wrapText: wrap }
  };

  if (bg) {
    style.fill = { patternType: "solid", fgColor: { rgb: bg } };
  }

  if (border) {
    const line = { style: "thin", color: { rgb: QF_XLSX_COLORS.border } };
    style.border = { top: line, right: line, bottom: line, left: line };
  }

  return style;
}

function qfCell(ws, col, row, value, style, numFmt) {
  const address = XLSX.utils.encode_cell({ c: col, r: row });
  const isNumber = typeof value === "number" && Number.isFinite(value);

  ws[address] = {
    v: value === null || value === undefined ? "" : value,
    t: isNumber ? "n" : "s"
  };

  if (style) ws[address].s = style;
  if (numFmt) ws[address].z = numFmt;
}

function qfMerge(ws, startCol, startRow, endCol, endRow) {
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"].push({
    s: { c: startCol, r: startRow },
    e: { c: endCol, r: endRow }
  });
}

function qfWriteMerged(ws, row, startCol, endCol, value, style) {
  for (let col = startCol; col <= endCol; col += 1) {
    qfCell(ws, col, row, col === startCol ? value : "", style);
  }
  qfMerge(ws, startCol, row, endCol, row);
}

function qfSafePercent(value, total) {
  const safeTotal = Math.max(Number(total || 0), 1);
  return Math.round((Number(value || 0) / safeTotal) * 100);
}

function qfVisualBar(value, total, length = 26) {
  const percent = qfSafePercent(value, total);
  const filled = Math.min(length, Math.round((percent / 100) * length));
  const empty = Math.max(0, length - filled);
  return `${"■".repeat(filled)}${"□".repeat(empty)}  ${percent}%`;
}

function qfChartFinding(title, data, total = 0) {
  const safeData = Array.isArray(data) ? data : [];
  if (safeData.length === 0 || safeData.every((item) => Number(item.value || 0) === 0)) {
    return `${title}: No matching records are available for the selected filters.`;
  }

  const sorted = [...safeData].sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
  const top = sorted[0];
  const percent = total ? qfSafePercent(top.value, total) : 100;

  return `${title}: ${top.label} has the highest value with ${top.value} record${Number(top.value || 0) === 1 ? "" : "s"}${total ? `, representing ${percent}% of the selected report data` : ""}.`;
}

function qfWriteWorkbookTitle(ws, title, subtitle, filters, preparedBy) {
  const titleStyle = qfXlsxStyle({
    bold: true,
    size: 18,
    color: QF_XLSX_COLORS.title,
    bg: QF_XLSX_COLORS.panel,
    border: false
  });
  const subStyle = qfXlsxStyle({
    size: 10,
    color: QF_XLSX_COLORS.subtitle,
    bg: QF_XLSX_COLORS.panel,
    border: false
  });
  const filterStyle = qfXlsxStyle({
    size: 10,
    color: QF_XLSX_COLORS.text,
    bg: QF_XLSX_COLORS.header,
    border: true
  });

  qfWriteMerged(ws, 0, 0, 9, title, titleStyle);
  qfWriteMerged(ws, 1, 0, 9, subtitle, subStyle);
  qfWriteMerged(ws, 2, 0, 9, `Generated: ${new Date().toLocaleString()} | Prepared by: ${preparedBy}`, subStyle);
  qfWriteMerged(ws, 3, 0, 9, filters, filterStyle);

  ws["!rows"] = ws["!rows"] || [];
  ws["!rows"][0] = { hpt: 28 };
  ws["!rows"][1] = { hpt: 20 };
  ws["!rows"][2] = { hpt: 20 };
  ws["!rows"][3] = { hpt: 24 };

  return 5;
}

function qfWriteSection(ws, row, title, span = 10) {
  const style = qfXlsxStyle({
    bold: true,
    size: 12,
    color: QF_XLSX_COLORS.title,
    bg: QF_XLSX_COLORS.header2,
    border: true
  });
  qfWriteMerged(ws, row, 0, span - 1, title, style);
  return row + 2;
}

function qfWriteKpi(ws, col, row, label, value, note) {
  const top = qfXlsxStyle({
    bold: true,
    size: 9,
    color: QF_XLSX_COLORS.muted,
    bg: QF_XLSX_COLORS.panel,
    border: true
  });
  const main = qfXlsxStyle({
    bold: true,
    size: 18,
    color: QF_XLSX_COLORS.title,
    bg: QF_XLSX_COLORS.panel,
    border: true
  });
  const sub = qfXlsxStyle({
    size: 9,
    color: QF_XLSX_COLORS.slate,
    bg: QF_XLSX_COLORS.panel,
    border: true
  });

  qfCell(ws, col, row, label.toUpperCase(), top);
  qfCell(ws, col + 1, row, "", top);
  qfMerge(ws, col, row, col + 1, row);

  qfCell(ws, col, row + 1, value, main);
  qfCell(ws, col + 1, row + 1, "", main);
  qfMerge(ws, col, row + 1, col + 1, row + 1);

  qfCell(ws, col, row + 2, note, sub);
  qfCell(ws, col + 1, row + 2, "", sub);
  qfMerge(ws, col, row + 2, col + 1, row + 2);
}

function qfWriteChartTable(ws, startRow, title, data, accent, totalForPercent, finding) {
  let row = startRow;
  const titleStyle = qfXlsxStyle({
    bold: true,
    size: 11,
    color: QF_XLSX_COLORS.title,
    bg: QF_XLSX_COLORS.header,
    border: true
  });
  const headStyle = qfXlsxStyle({
    bold: true,
    size: 9,
    color: QF_XLSX_COLORS.title,
    bg: QF_XLSX_COLORS.header2,
    align: "center",
    border: true
  });
  const rowStyle = qfXlsxStyle({
    size: 9,
    color: QF_XLSX_COLORS.text,
    bg: QF_XLSX_COLORS.panel,
    border: true
  });
  const altRowStyle = qfXlsxStyle({
    size: 9,
    color: QF_XLSX_COLORS.text,
    bg: QF_XLSX_COLORS.panel2,
    border: true
  });
  const barStyle = qfXlsxStyle({
    bold: true,
    size: 10,
    color: QF_XLSX_COLORS.progress,
    bg: QF_XLSX_COLORS.panel,
    border: true
  });
  const findStyle = qfXlsxStyle({
    size: 9,
    color: QF_XLSX_COLORS.text,
    bg: QF_XLSX_COLORS.panel2,
    border: true
  });

  qfWriteMerged(ws, row, 0, 5, title, titleStyle);
  row += 1;

  ["Label", "Count", "Share", "Progress", "Finding", "Source"].forEach((header, index) => {
    qfCell(ws, index, row, header, headStyle);
  });
  row += 1;

  const safeData = data && data.length ? data : [{ label: "No Data", value: 0 }];

  safeData.forEach((item, index) => {
    const value = Number(item.value || 0);
    const baseStyle = index % 2 === 0 ? rowStyle : altRowStyle;
    qfCell(ws, 0, row, item.label, baseStyle);
    qfCell(ws, 1, row, value, baseStyle);
    qfCell(ws, 2, row, `${qfSafePercent(value, totalForPercent)}%`, baseStyle);
    qfCell(ws, 3, row, qfVisualBar(value, totalForPercent), barStyle);
    qfCell(ws, 4, row, value > 0 ? `${item.label} contributes ${qfSafePercent(value, totalForPercent)}% in this view.` : "No matching record.", baseStyle);
    qfCell(ws, 5, row, title, baseStyle);
    row += 1;
  });

  qfWriteMerged(ws, row, 0, 5, finding, findStyle);
  row += 2;

  return row;
}

function qfWriteDataTable(ws, startRow, title, headers, rows, spanCols = null) {
  let row = startRow;
  const tableWidth = spanCols || headers.length;
  const titleStyle = qfXlsxStyle({
    bold: true,
    size: 11,
    color: QF_XLSX_COLORS.title,
    bg: QF_XLSX_COLORS.panel,
    border: false
  });
  const headStyle = qfXlsxStyle({
    bold: true,
    size: 9,
    color: QF_XLSX_COLORS.title,
    bg: QF_XLSX_COLORS.header2,
    align: "center",
    border: true
  });
  const bodyStyleA = qfXlsxStyle({
    size: 9,
    color: QF_XLSX_COLORS.text,
    bg: QF_XLSX_COLORS.panel,
    border: true
  });
  const bodyStyleB = qfXlsxStyle({
    size: 9,
    color: QF_XLSX_COLORS.text,
    bg: QF_XLSX_COLORS.panel2,
    border: true
  });

  qfWriteMerged(ws, row, 0, tableWidth - 1, title, titleStyle);
  row += 1;

  headers.forEach((header, index) => qfCell(ws, index, row, header, headStyle));
  row += 1;

  if (!rows || rows.length === 0) {
    qfWriteMerged(ws, row, 0, tableWidth - 1, "No records available for the selected filters.", bodyStyleA);
    row += 1;
  } else {
    rows.forEach((dataRow, rowIndex) => {
      const style = rowIndex % 2 === 0 ? bodyStyleA : bodyStyleB;
      dataRow.forEach((cell, colIndex) => qfCell(ws, colIndex, row, cell, style));
      row += 1;
    });
  }

  return row + 2;
}

const DEPARTMENT_NAMES = ["Registrar", "Cashier", "Accounting", "EDP"];
const WINDOW_OPTIONS = ["Window 1", "Window 2", "Window 3", "Window 4"];

function AdminDashboard() {
  const { currentUser } = useAuth();

  const [departments, setDepartments] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [users, setUsers] = useState([]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("offices");
  const [selectedDeptName, setSelectedDeptName] = useState("Registrar");
  const [adminLoading, setAdminLoading] = useState(false);

  const [staffAssignments, setStaffAssignments] = useState({});
  const [staffWindowAssignments, setStaffWindowAssignments] = useState({});
  const [proofPreviewUser, setProofPreviewUser] = useState(null);

  const [reportOfficeFilter, setReportOfficeFilter] = useState("all");
  const [reportStatusFilter, setReportStatusFilter] = useState("all");
  const [reportLaneFilter, setReportLaneFilter] = useState("all");
  const [reportPeriodFilter, setReportPeriodFilter] = useState("all");

  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const [newStaff, setNewStaff] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    office_assignment: "",
    window_assignment: "Window 1"
  });

  const displayName =
    `${currentUser?.first_name || ""} ${currentUser?.last_name || ""}`.trim() ||
    currentUser?.email?.split("@")[0] ||
    "Admin";

  useEffect(() => {
    const openSidebarFromGlobalHeader = () => {
      setSidebarOpen(true);
    };

    window.addEventListener("queuefree-open-sidebar", openSidebarFromGlobalHeader);

    return () => {
      window.removeEventListener(
        "queuefree-open-sidebar",
        openSidebarFromGlobalHeader
      );
    };
  }, []);

  function getReadableDateTime(value) {
    if (value?.toDate) {
      return value.toDate().toLocaleString();
    }

    if (value?.seconds) {
      return new Date(value.seconds * 1000).toLocaleString();
    }

    if (value instanceof Date) {
      return value.toLocaleString();
    }

    return "-";
  }

  function getDateFromFirestoreValue(value) {
    if (value?.toDate) return value.toDate();
    if (value?.seconds) return new Date(value.seconds * 1000);
    if (value instanceof Date) return value;
    return null;
  }

  function isWithinReportPeriod(value) {
    if (reportPeriodFilter === "all") return true;

    const dateObj = getDateFromFirestoreValue(value);
    if (!dateObj) return false;

    const now = new Date();
    const start = new Date(now);

    if (reportPeriodFilter === "today") {
      return dateObj.toDateString() === now.toDateString();
    }

    if (reportPeriodFilter === "week") {
      start.setDate(now.getDate() - 7);
      return dateObj >= start && dateObj <= now;
    }

    if (reportPeriodFilter === "month") {
      start.setMonth(now.getMonth() - 1);
      return dateObj >= start && dateObj <= now;
    }

    return true;
  }

  function getProofType(proofData = "") {
    if (!proofData || typeof proofData !== "string") return "none";
    if (proofData.startsWith("data:image")) return "image";
    if (proofData.startsWith("data:application/pdf")) return "pdf";
    return "unknown";
  }

  function getDepartmentNameById(deptId) {
    const found = departments.find((dept) => dept.id === deptId);
    return found?.dept_name || "-";
  }

  function getUserById(userId) {
    return users.find((user) => user.id === userId) || null;
  }

  function getFullName(user) {
    if (!user) return "Unknown User";

    return (
      `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
      user.email ||
      "Unknown User"
    );
  }

  function getStatusClass(status) {
    if (status === "Serving") return "qf-admin-status qf-admin-status-serving";
    if (status === "Done") return "qf-admin-status qf-admin-status-done";
    if (status === "Paused") return "qf-admin-status qf-admin-status-paused";
    if (status === "Reset") return "qf-admin-status qf-admin-status-done";
    if (status === "Cancelled") return "qf-admin-status qf-admin-status-done";
    return "qf-admin-status qf-admin-status-pending";
  }

  function normalizeNowServingDisplay(value) {
    if (!value) return "-";

    const text = String(value).trim();

    if (text === "0") return "-";
    if (/^[A-Z]P?000$/i.test(text)) return "-";

    return text;
  }

  function getStaffWindowDocId(officeName, windowName) {
    const safeOffice = String(officeName || "Office")
      .trim()
      .replace(/\s+/g, "_");

    const safeWindow = String(windowName || "Window_1")
      .trim()
      .replace(/\s+/g, "_");

    return `${safeOffice}_${safeWindow}`;
  }

  async function syncStaffWindowRecord({
    staffUid,
    staffName,
    staffEmail,
    officeAssignment,
    windowAssignment,
    isActive,
    accountStatus
  }) {
    if (!staffUid || !officeAssignment || !windowAssignment) return;

    const docId = getStaffWindowDocId(officeAssignment, windowAssignment);
    const staffWindowRef = doc(db, "staff_windows", docId);

    await setDoc(
      staffWindowRef,
      {
        office_assignment: officeAssignment,
        window_assignment: windowAssignment,
        staff_uid: staffUid,
        staff_name: staffName || "Staff",
        staff_email: staffEmail || "",
        is_active: isActive === true,
        account_status: accountStatus || "active",
        updated_at: serverTimestamp()
      },
      { merge: true }
    );
  }

  async function deactivateOldStaffWindowRecord(staffUser, newOffice, newWindow) {
    const oldOffice = staffUser?.office_assignment || "";
    const oldWindow = staffUser?.window_assignment || "";

    if (!staffUser?.id || !oldOffice || !oldWindow) return;

    const officeChanged = oldOffice !== newOffice;
    const windowChanged = oldWindow !== newWindow;

    if (!officeChanged && !windowChanged) return;

    const oldDocId = getStaffWindowDocId(oldOffice, oldWindow);
    const oldStaffWindowRef = doc(db, "staff_windows", oldDocId);

    await setDoc(
      oldStaffWindowRef,
      {
        office_assignment: oldOffice,
        window_assignment: oldWindow,
        staff_uid: staffUser.id,
        staff_name: getFullName(staffUser),
        staff_email: staffUser.email || "",
        is_active: false,
        account_status: staffUser.account_status || "active",
        updated_at: serverTimestamp()
      },
      { merge: true }
    );
  }

  function downloadCsv(filename, rows) {
    if (!rows || rows.length === 0) {
      alert("No records available to export.");
      return;
    }

    const headers = Object.keys(rows[0]);

    const escapeCsv = (value) => {
      const text = value === null || value === undefined ? "" : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };

    const csvContent = [
      headers.map(escapeCsv).join(","),
      ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    const unsubDepartments = onSnapshot(
      collection(db, "departments"),
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));

        data.sort((a, b) =>
          String(a.dept_name || "").localeCompare(String(b.dept_name || ""))
        );

        setDepartments(data);
      },
      (error) => {
        console.error("Departments listener error:", error);
      }
    );

    const unsubTickets = onSnapshot(
      collection(db, "queue_tickets"),
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));

        setTickets(data);
      },
      (error) => {
        console.error("Tickets listener error:", error);
      }
    );

    const unsubTransactions = onSnapshot(
      collection(db, "transactions"),
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));

        setTransactions(data);
      },
      (error) => {
        console.error("Transactions listener error:", error);
      }
    );

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));

        data.sort((a, b) =>
          String(a.email || "").localeCompare(String(b.email || ""))
        );

        setUsers(data);

        const officeMap = {};
        const windowMap = {};

        snapshot.docs.forEach((docSnap) => {
          const userData = docSnap.data();

          officeMap[docSnap.id] = userData.office_assignment || "";
          windowMap[docSnap.id] = userData.window_assignment || "Window 1";
        });

        setStaffAssignments(officeMap);
        setStaffWindowAssignments(windowMap);
      },
      (error) => {
        console.error("Users listener error:", error);
      }
    );

    return () => {
      unsubDepartments();
      unsubTickets();
      unsubTransactions();
      unsubUsers();
    };
  }, []);

  const selectedDepartment = useMemo(() => {
    return departments.find((dept) => dept.dept_name === selectedDeptName) || null;
  }, [departments, selectedDeptName]);

  const totalTickets = tickets.length;

  const totalRequests = tickets.filter(
    (ticket) =>
      ticket.status !== "Done" &&
      ticket.status !== "Cancelled" &&
      ticket.status !== "Reset"
  ).length;

  const totalServed = tickets.filter((ticket) => ticket.status === "Done").length;
  const totalPending = tickets.filter((ticket) => ticket.status === "Pending").length;
  const totalServing = tickets.filter((ticket) => ticket.status === "Serving").length;
  const totalPaused = tickets.filter((ticket) => ticket.status === "Paused").length;
  const totalDone = tickets.filter((ticket) => ticket.status === "Done").length;
  const totalReset = tickets.filter((ticket) => ticket.status === "Reset").length;
  const totalCancelled = tickets.filter((ticket) => ticket.status === "Cancelled").length;

  const totalPriority = tickets.filter(
    (ticket) => (ticket.lane_type || "Regular") === "Priority"
  ).length;

  const totalRegular = tickets.filter(
    (ticket) => (ticket.lane_type || "Regular") !== "Priority"
  ).length;

  const filteredReportTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const deptName = ticket.dept_name || getDepartmentNameById(ticket.dept_id);
      const status = ticket.status || "Pending";
      const lane = ticket.lane_type || "Regular";

      const officeOk = reportOfficeFilter === "all" || deptName === reportOfficeFilter;
      const statusOk = reportStatusFilter === "all" || status === reportStatusFilter;
      const laneOk = reportLaneFilter === "all" || lane === reportLaneFilter;
      const periodOk = isWithinReportPeriod(ticket.created_at);

      return officeOk && statusOk && laneOk && periodOk;
    });
  }, [
    tickets,
    departments,
    reportOfficeFilter,
    reportStatusFilter,
    reportLaneFilter,
    reportPeriodFilter
  ]);

  const filteredReportTransactions = useMemo(() => {
    return transactions.filter((item) => {
      const deptName = item.dept_name || getDepartmentNameById(item.dept_id);
      const lane = item.lane_type || "Regular";

      const officeOk = reportOfficeFilter === "all" || deptName === reportOfficeFilter;
      const laneOk = reportLaneFilter === "all" || lane === reportLaneFilter;
      const periodOk = isWithinReportPeriod(item.end_time);

      return officeOk && laneOk && periodOk;
    });
  }, [
    transactions,
    departments,
    reportOfficeFilter,
    reportLaneFilter,
    reportPeriodFilter
  ]);

  const reportTotalTickets = filteredReportTickets.length;

  const reportTotalRequests = filteredReportTickets.filter(
    (ticket) =>
      ticket.status !== "Done" &&
      ticket.status !== "Cancelled" &&
      ticket.status !== "Reset"
  ).length;

  const reportTotalPending = filteredReportTickets.filter(
    (ticket) => ticket.status === "Pending"
  ).length;

  const reportTotalServing = filteredReportTickets.filter(
    (ticket) => ticket.status === "Serving"
  ).length;

  const reportTotalPaused = filteredReportTickets.filter(
    (ticket) => ticket.status === "Paused"
  ).length;

  const reportTotalDone = filteredReportTickets.filter(
    (ticket) => ticket.status === "Done"
  ).length;

  const reportTotalReset = filteredReportTickets.filter(
    (ticket) => ticket.status === "Reset"
  ).length;

  const reportTotalCancelled = filteredReportTickets.filter(
    (ticket) => ticket.status === "Cancelled"
  ).length;

  const reportTotalPriority = filteredReportTickets.filter(
    (ticket) => (ticket.lane_type || "Regular") === "Priority"
  ).length;

  const reportTotalRegular = filteredReportTickets.filter(
    (ticket) => (ticket.lane_type || "Regular") !== "Priority"
  ).length;

  const userAccounts = useMemo(() => {
    return users.filter((user) => (user.role || "").toLowerCase() === "user");
  }, [users]);

  const activeUserAccounts = useMemo(() => {
    return userAccounts.filter((user) => user.is_deleted !== true);
  }, [userAccounts]);

  const archivedUserAccounts = useMemo(() => {
    return userAccounts.filter((user) => user.is_deleted === true);
  }, [userAccounts]);

  const staffAccounts = useMemo(() => {
    return users.filter((user) => (user.role || "").toLowerCase() === "staff");
  }, [users]);

  const activeStaffAccounts = useMemo(() => {
    return staffAccounts.filter((user) => user.is_deleted !== true);
  }, [staffAccounts]);

  const archivedStaffAccounts = useMemo(() => {
    return staffAccounts.filter((user) => user.is_deleted === true);
  }, [staffAccounts]);

  const pendingPriorityUsers = useMemo(() => {
    return users.filter(
      (user) =>
        (user.role || "").toLowerCase() === "user" &&
        user.is_priority === true &&
        (user.priority_status || "").toLowerCase() === "pending"
    );
  }, [users]);

  const approvedPriorityUsers = useMemo(() => {
    return users.filter(
      (user) =>
        (user.role || "").toLowerCase() === "user" &&
        user.is_priority === true &&
        (user.priority_status || "").toLowerCase() === "approved"
    );
  }, [users]);

  const rejectedPriorityUsers = useMemo(() => {
    return users.filter(
      (user) =>
        (user.role || "").toLowerCase() === "user" &&
        user.is_priority === true &&
        (user.priority_status || "").toLowerCase() === "rejected"
    );
  }, [users]);

  const avgWaitTime = useMemo(() => {
    if (departments.length === 0) return 0;

    const total = departments.reduce(
      (sum, dept) => sum + Number(dept.avg_service_time || 0),
      0
    );

    return Math.round(total / departments.length);
  }, [departments]);

  const avgServiceSeconds = useMemo(() => {
    if (transactions.length === 0) return 0;

    const totalSeconds = transactions.reduce(
      (sum, item) => sum + Number(item.duration_sec || 0),
      0
    );

    return Math.round(totalSeconds / transactions.length);
  }, [transactions]);

  const reportAvgServiceSeconds = useMemo(() => {
    if (filteredReportTransactions.length === 0) return 0;

    const totalSeconds = filteredReportTransactions.reduce(
      (sum, item) => sum + Number(item.duration_sec || 0),
      0
    );

    return Math.round(totalSeconds / filteredReportTransactions.length);
  }, [filteredReportTransactions]);

  const avgServiceMinutes = useMemo(() => {
    if (!avgServiceSeconds) return 0;
    return Math.max(1, Math.round(avgServiceSeconds / 60));
  }, [avgServiceSeconds]);

  const reportAvgServiceMinutes = useMemo(() => {
    if (!reportAvgServiceSeconds) return 0;
    return Math.max(1, Math.round(reportAvgServiceSeconds / 60));
  }, [reportAvgServiceSeconds]);

  const completionRate = useMemo(() => {
    if (!totalTickets) return 0;
    return Math.round((totalDone / totalTickets) * 100);
  }, [totalDone, totalTickets]);

  const activeQueueRate = useMemo(() => {
    if (!totalTickets) return 0;
    return Math.round((totalRequests / totalTickets) * 100);
  }, [totalRequests, totalTickets]);

  const priorityRate = useMemo(() => {
    if (!totalTickets) return 0;
    return Math.round((totalPriority / totalTickets) * 100);
  }, [totalPriority, totalTickets]);

  const reportCompletionRate = useMemo(() => {
    if (!reportTotalTickets) return 0;
    return Math.round((reportTotalDone / reportTotalTickets) * 100);
  }, [reportTotalDone, reportTotalTickets]);

  const reportPriorityRate = useMemo(() => {
    if (!reportTotalTickets) return 0;
    return Math.round((reportTotalPriority / reportTotalTickets) * 100);
  }, [reportTotalPriority, reportTotalTickets]);

  const getDepartmentCounts = (deptId) => {
    const deptTickets = tickets.filter((ticket) => ticket.dept_id === deptId);

    return {
      pending: deptTickets.filter((ticket) => ticket.status === "Pending").length,
      serving: deptTickets.filter((ticket) => ticket.status === "Serving").length,
      paused: deptTickets.filter((ticket) => ticket.status === "Paused").length,
      done: deptTickets.filter((ticket) => ticket.status === "Done").length,
      reset: deptTickets.filter((ticket) => ticket.status === "Reset").length,
      cancelled: deptTickets.filter((ticket) => ticket.status === "Cancelled").length,
      active: deptTickets.filter(
        (ticket) =>
          ticket.status !== "Done" &&
          ticket.status !== "Cancelled" &&
          ticket.status !== "Reset"
      ).length,
      regular: deptTickets.filter(
        (ticket) => (ticket.lane_type || "Regular") !== "Priority"
      ).length,
      priority: deptTickets.filter(
        (ticket) => (ticket.lane_type || "Regular") === "Priority"
      ).length,
      total: deptTickets.length
    };
  };

  const getReportDepartmentCounts = (deptId) => {
    const deptTickets = filteredReportTickets.filter((ticket) => ticket.dept_id === deptId);

    return {
      pending: deptTickets.filter((ticket) => ticket.status === "Pending").length,
      serving: deptTickets.filter((ticket) => ticket.status === "Serving").length,
      paused: deptTickets.filter((ticket) => ticket.status === "Paused").length,
      done: deptTickets.filter((ticket) => ticket.status === "Done").length,
      reset: deptTickets.filter((ticket) => ticket.status === "Reset").length,
      cancelled: deptTickets.filter((ticket) => ticket.status === "Cancelled").length,
      active: deptTickets.filter(
        (ticket) =>
          ticket.status !== "Done" &&
          ticket.status !== "Cancelled" &&
          ticket.status !== "Reset"
      ).length,
      regular: deptTickets.filter(
        (ticket) => (ticket.lane_type || "Regular") !== "Priority"
      ).length,
      priority: deptTickets.filter(
        (ticket) => (ticket.lane_type || "Regular") === "Priority"
      ).length,
      total: deptTickets.length
    };
  };

  const recentTickets = useMemo(() => {
    return [...tickets]
      .sort((a, b) => {
        const aTime = a.created_at?.seconds || 0;
        const bTime = b.created_at?.seconds || 0;
        return bTime - aTime;
      })
      .slice(0, 10);
  }, [tickets]);

  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => {
        const aTime = a.end_time?.seconds || 0;
        const bTime = b.end_time?.seconds || 0;
        return bTime - aTime;
      })
      .slice(0, 10);
  }, [transactions]);

  const userActivityLogs = useMemo(() => {
    return [...tickets]
      .sort((a, b) => {
        const aTime = a.created_at?.seconds || 0;
        const bTime = b.created_at?.seconds || 0;
        return bTime - aTime;
      })
      .slice(0, 30)
      .map((ticket) => {
        const linkedUser = getUserById(ticket.user_id);

        return {
          id: ticket.id,
          userName: getFullName(linkedUser),
          email: linkedUser?.email || "-",
          action: `Generated ${ticket.lane_type || "Regular"} queue ticket`,
          ticketNumber: ticket.ticket_number || "-",
          department: ticket.dept_name || getDepartmentNameById(ticket.dept_id),
          status: ticket.status || "Pending",
          createdAt: getReadableDateTime(ticket.created_at)
        };
      });
  }, [tickets, users, departments]);

  const reportUserActivityLogs = useMemo(() => {
    return [...filteredReportTickets]
      .sort((a, b) => {
        const aTime = a.created_at?.seconds || 0;
        const bTime = b.created_at?.seconds || 0;
        return bTime - aTime;
      })
      .slice(0, 30)
      .map((ticket) => {
        const linkedUser = getUserById(ticket.user_id);

        return {
          id: ticket.id,
          userName: getFullName(linkedUser),
          email: linkedUser?.email || "-",
          action: `Generated ${ticket.lane_type || "Regular"} queue ticket`,
          ticketNumber: ticket.ticket_number || "-",
          department: ticket.dept_name || getDepartmentNameById(ticket.dept_id),
          status: ticket.status || "Pending",
          createdAt: getReadableDateTime(ticket.created_at)
        };
      });
  }, [filteredReportTickets, users, departments]);

  const hourlyBuckets = useMemo(() => {
    const buckets = {
      "8 AM": 0,
      "9 AM": 0,
      "10 AM": 0,
      "11 AM": 0,
      "12 PM": 0,
      "1 PM": 0,
      "2 PM": 0,
      "3 PM": 0,
      "4 PM": 0
    };

    tickets.forEach((ticket) => {
      const dateObj = getDateFromFirestoreValue(ticket.created_at);
      if (!dateObj) return;

      const hour = dateObj.getHours();

      if (hour === 8) buckets["8 AM"] += 1;
      else if (hour === 9) buckets["9 AM"] += 1;
      else if (hour === 10) buckets["10 AM"] += 1;
      else if (hour === 11) buckets["11 AM"] += 1;
      else if (hour === 12) buckets["12 PM"] += 1;
      else if (hour === 13) buckets["1 PM"] += 1;
      else if (hour === 14) buckets["2 PM"] += 1;
      else if (hour === 15) buckets["3 PM"] += 1;
      else if (hour === 16) buckets["4 PM"] += 1;
    });

    return buckets;
  }, [tickets]);

  const reportHourlyBuckets = useMemo(() => {
    const buckets = {
      "8 AM": 0,
      "9 AM": 0,
      "10 AM": 0,
      "11 AM": 0,
      "12 PM": 0,
      "1 PM": 0,
      "2 PM": 0,
      "3 PM": 0,
      "4 PM": 0
    };

    filteredReportTickets.forEach((ticket) => {
      const dateObj = getDateFromFirestoreValue(ticket.created_at);
      if (!dateObj) return;

      const hour = dateObj.getHours();

      if (hour === 8) buckets["8 AM"] += 1;
      else if (hour === 9) buckets["9 AM"] += 1;
      else if (hour === 10) buckets["10 AM"] += 1;
      else if (hour === 11) buckets["11 AM"] += 1;
      else if (hour === 12) buckets["12 PM"] += 1;
      else if (hour === 13) buckets["1 PM"] += 1;
      else if (hour === 14) buckets["2 PM"] += 1;
      else if (hour === 15) buckets["3 PM"] += 1;
      else if (hour === 16) buckets["4 PM"] += 1;
    });

    return buckets;
  }, [filteredReportTickets]);

  const getPercent = (value, total) => {
    if (!total) return 0;
    return Math.round((Number(value || 0) / total) * 100);
  };

  const makeBarData = (items) => {
    const maxValue = Math.max(...items.map((item) => item.value), 1);

    return items.map((item) => ({
      ...item,
      widthPercent: Math.max((item.value / maxValue) * 100, item.value > 0 ? 12 : 5)
    }));
  };

  const peakHourData = useMemo(() => {
    return makeBarData(
      Object.entries(hourlyBuckets).map(([label, value]) => ({
        label,
        value
      }))
    );
  }, [hourlyBuckets]);

  const reportPeakHourData = useMemo(() => {
    return makeBarData(
      Object.entries(reportHourlyBuckets).map(([label, value]) => ({
        label,
        value
      }))
    );
  }, [reportHourlyBuckets]);

  const departmentSummaryData = useMemo(() => {
    return makeBarData(
      departments.map((dept) => {
        const counts = getDepartmentCounts(dept.id);

        return {
          label: dept.dept_name || "Office",
          value: counts.total,
          active: counts.active,
          pending: counts.pending,
          serving: counts.serving,
          done: counts.done,
          priority: counts.priority,
          regular: counts.regular
        };
      })
    );
  }, [departments, tickets]);

  const reportDepartmentSummaryData = useMemo(() => {
    return makeBarData(
      departments
        .filter((dept) => reportOfficeFilter === "all" || dept.dept_name === reportOfficeFilter)
        .map((dept) => {
          const counts = getReportDepartmentCounts(dept.id);

          return {
            label: dept.dept_name || "Office",
            value: counts.total,
            active: counts.active,
            pending: counts.pending,
            serving: counts.serving,
            done: counts.done,
            priority: counts.priority,
            regular: counts.regular
          };
        })
    );
  }, [departments, filteredReportTickets, reportOfficeFilter]);

  const activeQueuePressureData = useMemo(() => {
    return makeBarData(
      departments.map((dept) => {
        const counts = getDepartmentCounts(dept.id);

        return {
          label: dept.dept_name || "Office",
          value: counts.active,
          pending: counts.pending,
          serving: counts.serving,
          paused: counts.paused,
          total: counts.total
        };
      })
    );
  }, [departments, tickets]);

  const statusDistributionData = useMemo(() => {
    return makeBarData([
      { label: "Pending", value: totalPending, className: "qf-admin-bar-pending" },
      { label: "Serving", value: totalServing, className: "qf-admin-bar-serving" },
      { label: "Paused", value: totalPaused, className: "qf-admin-bar-paused" },
      { label: "Done", value: totalDone, className: "qf-admin-bar-done" },
      { label: "Reset", value: totalReset, className: "qf-admin-bar-reset" },
      { label: "Cancelled", value: totalCancelled, className: "qf-admin-bar-cancelled" }
    ]);
  }, [totalPending, totalServing, totalPaused, totalDone, totalReset, totalCancelled]);

  const reportStatusDistributionData = useMemo(() => {
    return makeBarData([
      { label: "Pending", value: reportTotalPending, className: "qf-admin-bar-pending" },
      { label: "Serving", value: reportTotalServing, className: "qf-admin-bar-serving" },
      { label: "Paused", value: reportTotalPaused, className: "qf-admin-bar-paused" },
      { label: "Done", value: reportTotalDone, className: "qf-admin-bar-done" },
      { label: "Reset", value: reportTotalReset, className: "qf-admin-bar-reset" },
      { label: "Cancelled", value: reportTotalCancelled, className: "qf-admin-bar-cancelled" }
    ]);
  }, [
    reportTotalPending,
    reportTotalServing,
    reportTotalPaused,
    reportTotalDone,
    reportTotalReset,
    reportTotalCancelled
  ]);

  const laneDistributionData = useMemo(() => {
    return makeBarData([
      {
        label: "Regular",
        value: totalRegular,
        className: "qf-admin-bar-regular"
      },
      {
        label: "Priority",
        value: totalPriority,
        className: "qf-admin-bar-priority"
      }
    ]);
  }, [totalRegular, totalPriority]);

  const reportLaneDistributionData = useMemo(() => {
    return makeBarData([
      {
        label: "Regular",
        value: reportTotalRegular,
        className: "qf-admin-bar-regular"
      },
      {
        label: "Priority",
        value: reportTotalPriority,
        className: "qf-admin-bar-priority"
      }
    ]);
  }, [reportTotalRegular, reportTotalPriority]);

  const transactionByOfficeData = useMemo(() => {
    const map = {};

    departments.forEach((dept) => {
      map[dept.dept_name || dept.id] = 0;
    });

    transactions.forEach((item) => {
      const deptName = item.dept_name || getDepartmentNameById(item.dept_id);
      map[deptName] = (map[deptName] || 0) + 1;
    });

    return makeBarData(
      Object.entries(map).map(([label, value]) => ({
        label,
        value
      }))
    );
  }, [departments, transactions]);

  const serviceSpeedByOfficeData = useMemo(() => {
    const officeMap = {};

    transactions.forEach((item) => {
      const deptName = item.dept_name || getDepartmentNameById(item.dept_id);
      const duration = Number(item.duration_sec || 0);

      if (!officeMap[deptName]) {
        officeMap[deptName] = {
          total: 0,
          count: 0
        };
      }

      if (duration > 0) {
        officeMap[deptName].total += duration;
        officeMap[deptName].count += 1;
      }
    });

    const rows = departments.map((dept) => {
      const label = dept.dept_name || "Office";
      const record = officeMap[label];

      const averageSeconds =
        record && record.count > 0 ? Math.round(record.total / record.count) : 0;

      return {
        label,
        value: averageSeconds
      };
    });

    return makeBarData(rows);
  }, [departments, transactions]);

  const topDepartment = useMemo(() => {
    if (departmentSummaryData.length === 0) return null;
    return [...departmentSummaryData].sort((a, b) => b.value - a.value)[0];
  }, [departmentSummaryData]);

  const reportTopDepartment = useMemo(() => {
    if (reportDepartmentSummaryData.length === 0) return null;
    return [...reportDepartmentSummaryData].sort((a, b) => b.value - a.value)[0];
  }, [reportDepartmentSummaryData]);

  const busiestActiveOffice = useMemo(() => {
    if (activeQueuePressureData.length === 0) return null;
    return [...activeQueuePressureData].sort((a, b) => b.value - a.value)[0];
  }, [activeQueuePressureData]);

  const peakInsight = useMemo(() => {
    const sorted = [...peakHourData].sort((a, b) => b.value - a.value);

    if (!sorted.length) {
      return "No queue data yet.";
    }

    const top = sorted[0];

    if (top.value === 0) {
      return "No peak queue hour detected yet.";
    }

    return `${top.label} has the highest activity with ${top.value} ticket${
      top.value === 1 ? "" : "s"
    }.`;
  }, [peakHourData]);

  const reportPeakInsight = useMemo(() => {
    const sorted = [...reportPeakHourData].sort((a, b) => b.value - a.value);

    if (!sorted.length) {
      return "No queue data matches the selected filters yet.";
    }

    const top = sorted[0];

    if (top.value === 0) {
      return "No peak hour found for the selected filters.";
    }

    return `${top.label} has the highest activity in this filtered report with ${top.value} ticket${
      top.value === 1 ? "" : "s"
    }.`;
  }, [reportPeakHourData]);

  const analyticsInsight = useMemo(() => {
    if (totalTickets === 0) {
      return "No queue activity yet. Analytics will update automatically once users generate queue tickets.";
    }

    const busiestOffice = topDepartment?.label || "No office yet";
    const pressureOffice = busiestActiveOffice?.label || "No active office yet";

    return `${busiestOffice} has the highest total queue volume. ${pressureOffice} has the highest active queue pressure. Completion rate is ${completionRate}% and priority lane usage is ${priorityRate}%.`;
  }, [
    totalTickets,
    topDepartment,
    busiestActiveOffice,
    completionRate,
    priorityRate
  ]);

  const summaryInsight = useMemo(() => {
    const activePercent = getPercent(reportTotalRequests, reportTotalTickets);
    const donePercent = getPercent(reportTotalDone, reportTotalTickets);
    const priorityPercent = getPercent(reportTotalPriority, reportTotalTickets);
    const busiestOffice = reportTopDepartment?.label || "No office yet";

    if (reportTotalTickets === 0) {
      return "No queue records match the selected filters yet. Change the filters or wait for new queue activity to appear in the report.";
    }

    return `This report shows ${reportTotalTickets} queue ticket${
      reportTotalTickets === 1 ? "" : "s"
    }, with ${activePercent}% still active and ${donePercent}% completed. ${busiestOffice} has the highest queue volume in this view. Priority lane usage is ${priorityPercent}%, with ${filteredReportTransactions.length} related service transaction${
      filteredReportTransactions.length === 1 ? "" : "s"
    } available for service-time review.`;
  }, [
    reportTotalTickets,
    reportTotalRequests,
    reportTotalDone,
    reportTotalPriority,
    reportTopDepartment,
    filteredReportTransactions.length
  ]);

  const systemHealthLabel = useMemo(() => {
    if (totalTickets === 0) return "No Data";
    if (totalPending > totalDone && totalPending >= 10) return "Busy";
    if (totalServing > 0 || totalPending > 0) return "Active";
    return "Stable";
  }, [totalTickets, totalPending, totalDone, totalServing]);

  const reportHealthLabel = useMemo(() => {
    if (reportTotalTickets === 0) return "No Data";
    if (reportTotalPending >= 10) return "Busy";
    if (reportTotalServing > 0 || reportTotalPending > 0) return "Active";
    return "Stable";
  }, [reportTotalTickets, reportTotalPending, reportTotalServing]);

  const handleClearReportFilters = () => {
    setReportOfficeFilter("all");
    setReportStatusFilter("all");
    setReportLaneFilter("all");
    setReportPeriodFilter("all");
  };


  const getReportPeriodLabel = () => {
    if (reportPeriodFilter === "today") return "Today";
    if (reportPeriodFilter === "week") return "Last 7 Days";
    if (reportPeriodFilter === "month") return "Last 30 Days";
    return "All Time";
  };

  const getReportFileBaseName = () => {
    const normalize = (value) =>
      String(value || "all")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    const office = reportOfficeFilter === "all" ? "all-offices" : normalize(reportOfficeFilter);
    const status = reportStatusFilter === "all" ? "all-status" : normalize(reportStatusFilter);
    const lane = reportLaneFilter === "all" ? "all-lanes" : normalize(reportLaneFilter);
    const period = normalize(getReportPeriodLabel());

    return `queuefree-summary-report-${office}-${status}-${lane}-${period}`;
  };

  const getReportFiltersText = () => {
    return `Office: ${
      reportOfficeFilter === "all" ? "All Offices" : reportOfficeFilter
    } | Status: ${
      reportStatusFilter === "all" ? "All Statuses" : reportStatusFilter
    } | Lane: ${
      reportLaneFilter === "all" ? "All Lanes" : reportLaneFilter
    } | Period: ${getReportPeriodLabel()}`;
  };

  const createTextBar = (value, total, size = 20) => {
    const safeTotal = Math.max(Number(total || 0), 1);
    const safeValue = Math.max(Number(value || 0), 0);
    const percent = Math.min(100, Math.round((safeValue / safeTotal) * 100));
    const filled = Math.min(size, Math.round((percent / 100) * size));
    const empty = Math.max(0, size - filled);

    return `[${"#".repeat(filled)}${"-".repeat(empty)}] ${percent}%`;
  };

  const getChartRowsForExport = (section, chartName, data, total, finding) => {
    const maxValue = Math.max(...data.map((item) => Number(item.value || 0)), 1);

    return data.map((item, index) => {
      const value = Number(item.value || 0);
      const percentOfTotal = getPercent(value, total);

      return {
        ReportPart: section,
        VisualType: "BAR CHART",
        ChartShownInSystem: chartName,
        Rank: index + 1,
        Label: item.label,
        Value: value,
        PercentOfTotal: `${percentOfTotal}%`,
        BarShownInSystemWidth: `${Math.round(item.widthPercent || 0)}%`,
        CsvVisualBar: createTextBar(value, maxValue),
        ChartFinding: finding,
        Notes: `This row represents the same ${item.label} bar shown in the Summary Reports chart.`
      };
    });
  };

  const getProfessionalCsvRows = () => {
    const rows = [];
    const addRow = ({
      section,
      category,
      item,
      count,
      total,
      percentage,
      interpretation,
      sourcePanel
    }) => {
      const hasNumericPercent = typeof percentage === "number" && Number.isFinite(percentage);
      const computedPercent = hasNumericPercent
        ? percentage
        : typeof count === "number" && typeof total === "number"
        ? getPercent(count, total)
        : "";

      rows.push({
        Section: section,
        Category: category,
        ReportItem: item,
        Count: count,
        Percentage: computedPercent === "" ? "" : `${computedPercent}%`,
        ProgressBar:
          computedPercent === "" ? "" : createTextBar(Number(computedPercent || 0), 100),
        Interpretation: interpretation,
        SourcePanel: sourcePanel
      });
    };

    addRow({
      section: "Report Information",
      category: "Selected Filters",
      item: "Current Report View",
      count: reportTotalTickets,
      percentage: 100,
      interpretation: getReportFiltersText(),
      sourcePanel: "Summary Reports"
    });

    addRow({
      section: "Executive Summary",
      category: "Report Snapshot",
      item: reportHealthLabel,
      count: reportTotalTickets,
      percentage: reportTotalTickets ? 100 : 0,
      interpretation: summaryInsight,
      sourcePanel: "Report Snapshot"
    });

    addRow({
      section: "KPI Summary",
      category: "Queue Totals",
      item: "Total Tickets",
      count: reportTotalTickets,
      percentage: reportTotalTickets ? 100 : 0,
      interpretation: `${reportTotalRequests} active queue${reportTotalRequests === 1 ? "" : "s"} in the selected view.`,
      sourcePanel: "KPI Cards"
    });

    addRow({
      section: "KPI Summary",
      category: "Completion",
      item: "Completed Tickets",
      count: reportTotalDone,
      total: reportTotalTickets,
      interpretation: `${reportCompletionRate}% of selected tickets are completed.`,
      sourcePanel: "KPI Cards"
    });

    addRow({
      section: "KPI Summary",
      category: "Priority Lane",
      item: "Priority Tickets",
      count: reportTotalPriority,
      total: reportTotalTickets,
      interpretation: `${reportPriorityRate}% of selected tickets are priority lane tickets.`,
      sourcePanel: "KPI Cards"
    });

    addRow({
      section: "KPI Summary",
      category: "Service Transactions",
      item: "Completed Transactions",
      count: filteredReportTransactions.length,
      total: Math.max(reportTotalTickets, filteredReportTransactions.length),
      interpretation: `${reportAvgServiceSeconds}s average service time for matching transaction records.`,
      sourcePanel: "KPI Cards"
    });

    reportStatusDistributionData.forEach((item) => {
      addRow({
        section: "Queue Status Breakdown",
        category: "Status Distribution",
        item: item.label,
        count: item.value,
        total: reportTotalTickets,
        interpretation: `${item.label} ticket count in the selected report.`,
        sourcePanel: "Queue Status Chart"
      });
    });

    reportDepartmentSummaryData.forEach((item) => {
      addRow({
        section: "Office Queue Volume",
        category: "Office Demand",
        item: item.label,
        count: item.value,
        total: reportTotalTickets,
        interpretation: `${item.label} received ${item.value} selected ticket${item.value === 1 ? "" : "s"}.`,
        sourcePanel: "Office Queue Volume Chart"
      });
    });

    reportLaneDistributionData.forEach((item) => {
      addRow({
        section: "Lane Usage",
        category: "Regular and Priority",
        item: item.label,
        count: item.value,
        total: reportTotalTickets,
        interpretation: `${item.label} lane total for the selected report.`,
        sourcePanel: "Lane Usage Chart"
      });
    });

    reportPeakHourData.forEach((item) => {
      addRow({
        section: "Peak Hour Pattern",
        category: "Time Activity",
        item: item.label,
        count: item.value,
        total: reportTotalTickets,
        interpretation: `${item.label} queue activity for the selected report period.`,
        sourcePanel: "Peak Hour Pattern Chart"
      });
    });

    const totalPriorityRequests =
      pendingPriorityUsers.length + approvedPriorityUsers.length + rejectedPriorityUsers.length;

    [
      ["Pending", pendingPriorityUsers.length, "Users waiting for priority verification."],
      ["Approved", approvedPriorityUsers.length, "Users approved for priority lane access."],
      ["Rejected", rejectedPriorityUsers.length, "Users rejected from priority lane access."]
    ].forEach(([label, value, interpretation]) => {
      addRow({
        section: "Priority Requests",
        category: "Verification Status",
        item: label,
        count: value,
        total: totalPriorityRequests,
        interpretation,
        sourcePanel: "Priority Requests Summary"
      });
    });

    filteredReportTransactions.slice(0, 25).forEach((item, index) => {
      addRow({
        section: "Transaction History",
        category: "Recent Service Record",
        item: `${index + 1}. ${item.ticket_number || item.ticket_id || "-"}`,
        count: Number(item.duration_sec || 0),
        percentage: "",
        interpretation: `Office: ${item.dept_name || getDepartmentNameById(item.dept_id)} | Lane: ${item.lane_type || "Regular"} | Window: ${item.window_assignment || "-"} | Served by: ${item.served_by_name || item.served_by || "-"} | End Time: ${getReadableDateTime(item.end_time)}`,
        sourcePanel: "Latest Transaction History"
      });
    });

    reportUserActivityLogs.slice(0, 25).forEach((log, index) => {
      addRow({
        section: "User Activity Logs",
        category: "Recent User Action",
        item: `${index + 1}. ${log.ticketNumber}`,
        count: log.status,
        percentage: "",
        interpretation: `User: ${log.userName} | Email: ${log.email} | Office: ${log.department} | Action: ${log.action} | Created: ${log.createdAt}`,
        sourcePanel: "Latest User Activity"
      });
    });

    return rows;
  };

  const drawPdfBarChart = ({
    pdf,
    x,
    y,
    width,
    title,
    subtitle,
    data,
    accent,
    totalForPercent,
    colors
  }) => {
    const rowHeight = 8;
    const headerHeight = 15;
    const footerHeight = 7;
    const cardHeight = headerHeight + data.length * rowHeight + footerHeight;
    const maxValue = Math.max(...data.map((item) => Number(item.value || 0)), 1);

    pdf.setFillColor(...colors.white);
    pdf.setDrawColor(...colors.border);
    pdf.roundedRect(x, y, width, cardHeight, 3, 3, "FD");

    pdf.setFillColor(...accent);
    pdf.roundedRect(x, y, width, 10.5, 3, 3, "F");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.3);
    pdf.setTextColor(...colors.white);
    pdf.text(title, x + 4, y + 6.8, { maxWidth: width - 8 });

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.8);
    pdf.setTextColor(...colors.muted);
    pdf.text(subtitle, x + 4, y + 14, { maxWidth: width - 8 });

    const labelWidth = 28;
    const valueWidth = 11;
    const barX = x + 4 + labelWidth;
    const barWidth = width - labelWidth - valueWidth - 12;

    let rowY = y + headerHeight + 2;

    data.forEach((item) => {
      const value = Number(item.value || 0);
      const filledWidth = value > 0 ? Math.max(2.5, (value / maxValue) * barWidth) : 0;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6.8);
      pdf.setTextColor(...colors.darkText);
      pdf.text(String(item.label).slice(0, 17), x + 4, rowY + 2, {
        maxWidth: labelWidth - 2
      });

      pdf.setFillColor(...colors.track);
      pdf.roundedRect(barX, rowY - 1.8, barWidth, 4.2, 1.5, 1.5, "F");

      if (filledWidth > 0) {
        pdf.setFillColor(...accent);
        pdf.roundedRect(barX, rowY - 1.8, filledWidth, 4.2, 1.5, 1.5, "F");
      }

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(6.9);
      pdf.setTextColor(...colors.darkText);
      pdf.text(String(value), barX + barWidth + 3, rowY + 2);

      rowY += rowHeight;
    });

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.6);
    pdf.setTextColor(...colors.muted);
    pdf.text(
      `Based on ${totalForPercent || 0} selected ticket record(s).`,
      x + 4,
      y + cardHeight - 3
    );

    return cardHeight;
  };

  const handleExportReport = (format) => {
    setExportMenuOpen(false);

    if (format === "csv") {
      handleExportSummaryCsv();
      return;
    }

    if (format === "pdf") {
      handleExportSummaryPdf();
    }
  };


  const handleExportSummaryCsv = () => {
    try {
      const workbook = XLSX.utils.book_new();

      const summarySheet = {};
      summarySheet["!merges"] = [];

      let row = qfWriteWorkbookTitle(
        summarySheet,
        "QueueFree Summary Report",
        "Campus queue analytics, visual chart data, transaction history, and user activity logs.",
        getReportFiltersText(),
        displayName
      );

      row = qfWriteSection(summarySheet, row, "Report Snapshot", 10, QF_XLSX_COLORS.teal);
      qfWriteMerged(
        summarySheet,
        row,
        0,
        9,
        `Status: ${reportHealthLabel} — ${summaryInsight}`,
        qfXlsxStyle({ size: 10, color: QF_XLSX_COLORS.text, bg: QF_XLSX_COLORS.panel, border: true })
      );
      row += 2;

      row = qfWriteSection(summarySheet, row, "Key Metrics", 10, QF_XLSX_COLORS.blue);
      qfWriteKpi(summarySheet, 0, row, "Total Tickets", reportTotalTickets, `${reportTotalRequests} active queue${reportTotalRequests === 1 ? "" : "s"}`, QF_XLSX_COLORS.blue);
      qfWriteKpi(summarySheet, 2, row, "Completed", reportTotalDone, `${reportCompletionRate}% completion rate`, QF_XLSX_COLORS.green);
      qfWriteKpi(summarySheet, 4, row, "Priority Tickets", reportTotalPriority, `${reportPriorityRate}% priority usage`, QF_XLSX_COLORS.amber);
      qfWriteKpi(summarySheet, 6, row, "Transactions", filteredReportTransactions.length, `${reportAvgServiceSeconds}s avg service`, QF_XLSX_COLORS.purple);
      row += 5;

      row = qfWriteSection(summarySheet, row, "Visual Analytics", 10, QF_XLSX_COLORS.purple);
      row = qfWriteChartTable(
        summarySheet,
        row,
        "Queue Status Distribution",
        reportStatusDistributionData,
        QF_XLSX_COLORS.blue,
        reportTotalTickets,
        qfChartFinding("Queue Status Distribution", reportStatusDistributionData, reportTotalTickets)
      );

      row = qfWriteChartTable(
        summarySheet,
        row,
        "Office Queue Volume",
        reportDepartmentSummaryData,
        QF_XLSX_COLORS.purple,
        reportTotalTickets,
        qfChartFinding("Office Queue Volume", reportDepartmentSummaryData, reportTotalTickets)
      );

      row = qfWriteChartTable(
        summarySheet,
        row,
        "Lane Usage",
        reportLaneDistributionData,
        QF_XLSX_COLORS.amber,
        reportTotalTickets,
        qfChartFinding("Lane Usage", reportLaneDistributionData, reportTotalTickets)
      );

      row = qfWriteChartTable(
        summarySheet,
        row,
        "Peak Hour Pattern",
        reportPeakHourData,
        QF_XLSX_COLORS.teal,
        reportTotalTickets,
        reportPeakInsight
      );

      row = qfWriteSection(summarySheet, row, "Office Breakdown", 10, QF_XLSX_COLORS.blue);
      row = qfWriteDataTable(
        summarySheet,
        row,
        "Office-Level Queue Summary",
        ["Office", "Total", "Active", "Pending", "Serving", "Paused", "Done", "Priority", "Regular", "Completion"],
        departments
          .filter((dept) => reportOfficeFilter === "all" || dept.dept_name === reportOfficeFilter)
          .map((dept) => {
            const counts = getReportDepartmentCounts(dept.id);
            return [
              dept.dept_name || "Office",
              counts.total,
              counts.active,
              counts.pending,
              counts.serving,
              counts.paused,
              counts.done,
              counts.priority,
              counts.regular,
              `${getPercent(counts.done, counts.total)}%`
            ];
          }),
        10
      );

      row = qfWriteSection(summarySheet, row, "Priority Requests", 10, QF_XLSX_COLORS.amber);
      row = qfWriteDataTable(
        summarySheet,
        row,
        "Priority Verification Summary",
        ["Status", "Count", "Meaning"],
        [
          ["Pending", pendingPriorityUsers.length, "Waiting for admin verification"],
          ["Approved", approvedPriorityUsers.length, "Allowed to use priority lane"],
          ["Rejected", rejectedPriorityUsers.length, "Not allowed for priority lane"]
        ],
        10
      );

      summarySheet["!cols"] = [
        { wch: 24 },
        { wch: 12 },
        { wch: 12 },
        { wch: 38 },
        { wch: 48 },
        { wch: 24 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 }
      ];
      summarySheet["!ref"] = `A1:J${row + 3}`;
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary Report");

      const transactionSheet = {};
      transactionSheet["!merges"] = [];
      let txRow = qfWriteWorkbookTitle(transactionSheet, "QueueFree Transaction History", "Filtered completed service transactions.", getReportFiltersText(), displayName);
      txRow = qfWriteDataTable(
        transactionSheet,
        txRow,
        `Transactions (${filteredReportTransactions.length})`,
        ["Ticket", "Office", "Lane", "Window", "Duration (sec)", "Served By", "End Time"],
        filteredReportTransactions.map((item) => [
          item.ticket_number || item.ticket_id || "-",
          item.dept_name || getDepartmentNameById(item.dept_id),
          item.lane_type || "Regular",
          item.window_assignment || "-",
          Number(item.duration_sec || 0),
          item.served_by_name || item.served_by || "-",
          getReadableDateTime(item.end_time)
        ]),
        7
      );
      transactionSheet["!cols"] = [{ wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 28 }, { wch: 28 }];
      transactionSheet["!ref"] = `A1:G${txRow + 3}`;
      XLSX.utils.book_append_sheet(workbook, transactionSheet, "Transactions");

      const activitySheet = {};
      activitySheet["!merges"] = [];
      let actRow = qfWriteWorkbookTitle(activitySheet, "QueueFree User Activity Logs", "Filtered recent user queue actions.", getReportFiltersText(), displayName);
      actRow = qfWriteDataTable(
        activitySheet,
        actRow,
        `User Activity (${reportUserActivityLogs.length})`,
        ["User", "Email", "Ticket", "Office", "Status", "Action", "Created"],
        reportUserActivityLogs.map((log) => [
          log.userName,
          log.email,
          log.ticketNumber,
          log.department,
          log.status,
          log.action,
          log.createdAt
        ]),
        7
      );
      activitySheet["!cols"] = [{ wch: 24 }, { wch: 30 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 36 }, { wch: 28 }];
      activitySheet["!ref"] = `A1:G${actRow + 3}`;
      XLSX.utils.book_append_sheet(workbook, activitySheet, "User Activity");

      const rawRows = getProfessionalCsvRows();
      const rawSheet = XLSX.utils.json_to_sheet(rawRows);
      rawSheet["!cols"] = [
        { wch: 24 },
        { wch: 24 },
        { wch: 34 },
        { wch: 14 },
        { wch: 14 },
        { wch: 42 },
        { wch: 70 },
        { wch: 26 }
      ];

      Object.keys(rawRows[0] || {}).forEach((_, colIndex) => {
        const address = XLSX.utils.encode_cell({ c: colIndex, r: 0 });
        if (rawSheet[address]) {
          rawSheet[address].s = qfXlsxStyle({ bold: true, size: 10, color: QF_XLSX_COLORS.title, bg: QF_XLSX_COLORS.header2, align: "center", border: true });
        }
      });

      XLSX.utils.book_append_sheet(workbook, rawSheet, "Raw Data");
      XLSX.writeFile(workbook, `${getReportFileBaseName()}.xlsx`);
    } catch (error) {
      console.error("EXPORT SUMMARY EXCEL ERROR:", error);
      alert("Failed to export Excel report. Please try again.");
    }
  };

  const handleExportSummaryPdf = async () => {
    try {
      setExportingPdf(true);

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 12;

      const colors = {
        page: [248, 250, 252],
        white: [255, 255, 255],
        darkText: [15, 23, 42],
        text: [51, 65, 85],
        muted: [100, 116, 139],
        border: [203, 213, 225],
        track: [226, 232, 240],
        navy: [15, 23, 42],
        blue: [46, 168, 255],
        purple: [139, 92, 246],
        teal: [20, 184, 166],
        green: [34, 197, 94],
        amber: [245, 158, 11],
        red: [239, 68, 68]
      };

      let y = 12;

      const paintPage = () => {
        pdf.setFillColor(...colors.page);
        pdf.rect(0, 0, pageWidth, pageHeight, "F");
      };

      const addPageIfNeeded = (neededHeight = 25) => {
        if (y + neededHeight > pageHeight - 14) {
          pdf.addPage();
          paintPage();
          y = 12;
          drawPageHeader(false);
        }
      };

      const drawPageHeader = (isCover = false) => {
        pdf.setFillColor(...colors.white);
        pdf.setDrawColor(...colors.border);
        pdf.roundedRect(margin, y, pageWidth - margin * 2, isCover ? 36 : 28, 4, 4, "FD");

        pdf.setFillColor(...colors.teal);
        pdf.roundedRect(margin + 5, y + 6, 4, isCover ? 24 : 16, 1.8, 1.8, "F");
        pdf.setFillColor(...colors.blue);
        pdf.roundedRect(margin + 10, y + 6, 4, isCover ? 24 : 16, 1.8, 1.8, "F");
        pdf.setFillColor(...colors.purple);
        pdf.roundedRect(margin + 15, y + 6, 4, isCover ? 24 : 16, 1.8, 1.8, "F");

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(isCover ? 17 : 12);
        pdf.setTextColor(...colors.darkText);
        pdf.text("QueueFree Summary Report", margin + 24, y + (isCover ? 13 : 10));

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(isCover ? 8.3 : 7.3);
        pdf.setTextColor(...colors.muted);
        pdf.text("Queue analytics, report charts, transactions, and user activity.", margin + 24, y + (isCover ? 20 : 16));
        pdf.text(`Generated: ${new Date().toLocaleString()} | Prepared by: ${displayName}`, margin + 24, y + (isCover ? 27 : 22));

        y += isCover ? 44 : 35;
      };

      const drawSectionTitle = (title, helper = "") => {
        addPageIfNeeded(helper ? 16 : 10);

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12.2);
        pdf.setTextColor(...colors.darkText);
        pdf.text(title, margin, y);
        y += 5.5;

        if (helper) {
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(7.8);
          pdf.setTextColor(...colors.muted);
          pdf.text(helper, margin, y, { maxWidth: pageWidth - margin * 2 });
          y += 6.5;
        }
      };

      const drawFilterStrip = () => {
        addPageIfNeeded(20);

        pdf.setFillColor(...colors.white);
        pdf.setDrawColor(...colors.border);
        pdf.roundedRect(margin, y, pageWidth - margin * 2, 16, 3, 3, "FD");

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.5);
        pdf.setTextColor(...colors.blue);
        pdf.text("FILTERS USED", margin + 4, y + 6);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.5);
        pdf.setTextColor(...colors.darkText);
        pdf.text(getReportFiltersText(), margin + 4, y + 11.5, {
          maxWidth: pageWidth - margin * 2 - 8
        });

        y += 22;
      };

      const drawKpiCard = (x, cardY, width, label, value, helper, accentColor) => {
        pdf.setFillColor(...colors.white);
        pdf.setDrawColor(...colors.border);
        pdf.roundedRect(x, cardY, width, 26, 3, 3, "FD");

        pdf.setFillColor(...accentColor);
        pdf.roundedRect(x + 3, cardY + 3, 2.5, 20, 1.2, 1.2, "F");

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(6.8);
        pdf.setTextColor(...colors.muted);
        pdf.text(String(label).toUpperCase(), x + 8, cardY + 7.2, { maxWidth: width - 11 });

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(15.5);
        pdf.setTextColor(...colors.darkText);
        pdf.text(String(value), x + 8, cardY + 16.2);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(6.7);
        pdf.setTextColor(...colors.text);
        pdf.text(String(helper), x + 8, cardY + 22.4, { maxWidth: width - 11 });
      };

      const drawSummaryPanel = () => {
        addPageIfNeeded(32);

        pdf.setFillColor(...colors.white);
        pdf.setDrawColor(...colors.border);
        pdf.roundedRect(margin, y, pageWidth - margin * 2, 28, 3, 3, "FD");

        pdf.setFillColor(...colors.teal);
        pdf.roundedRect(margin, y, 3, 28, 1.2, 1.2, "F");

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10.5);
        pdf.setTextColor(...colors.darkText);
        pdf.text(`Report Snapshot: ${reportHealthLabel}`, margin + 6, y + 7.5);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.8);
        pdf.setTextColor(...colors.text);
        pdf.text(summaryInsight, margin + 6, y + 14.2, {
          maxWidth: pageWidth - margin * 2 - 12
        });

        y += 35;
      };

      const drawTable = (title, headers, rows, widths) => {
        addPageIfNeeded(24);
        drawSectionTitle(title);

        if (!rows || rows.length === 0) {
          rows = [["No records available"]];
          headers = ["Message"];
          widths = [pageWidth - margin * 2 - 4];
        }

        pdf.setFillColor(...colors.navy);
        pdf.roundedRect(margin, y, pageWidth - margin * 2, 8, 2, 2, "F");

        let x = margin + 2;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7);
        pdf.setTextColor(...colors.white);

        headers.forEach((header, index) => {
          pdf.text(String(header), x, y + 5.3, { maxWidth: widths[index] - 2 });
          x += widths[index];
        });

        y += 8;

        rows.forEach((row, rowIndex) => {
          addPageIfNeeded(9);

          pdf.setFillColor(...(rowIndex % 2 === 0 ? colors.white : [241, 245, 249]));
          pdf.rect(margin, y, pageWidth - margin * 2, 8, "F");

          x = margin + 2;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(6.7);
          pdf.setTextColor(...colors.darkText);

          row.forEach((cell, index) => {
            pdf.text(String(cell || "-").slice(0, 55), x, y + 5, {
              maxWidth: widths[index] - 2
            });
            x += widths[index];
          });

          y += 8;
        });

        y += 5;
      };

      paintPage();
      drawPageHeader(true);
      drawFilterStrip();

      drawSectionTitle(
        "Executive Summary",
        "This export uses the current filters selected in the Summary Reports panel."
      );

      const gap = 3;
      const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4;

      drawKpiCard(
        margin,
        y,
        cardWidth,
        "Total Tickets",
        reportTotalTickets,
        `${reportTotalRequests} active queue${reportTotalRequests === 1 ? "" : "s"}`,
        colors.blue
      );

      drawKpiCard(
        margin + (cardWidth + gap),
        y,
        cardWidth,
        "Completed",
        reportTotalDone,
        `${reportCompletionRate}% completion rate`,
        colors.green
      );

      drawKpiCard(
        margin + (cardWidth + gap) * 2,
        y,
        cardWidth,
        "Priority",
        reportTotalPriority,
        `${reportPriorityRate}% priority usage`,
        colors.amber
      );

      drawKpiCard(
        margin + (cardWidth + gap) * 3,
        y,
        cardWidth,
        "Transactions",
        filteredReportTransactions.length,
        `${reportAvgServiceSeconds}s avg service`,
        colors.purple
      );

      y += 33;
      drawSummaryPanel();

      drawSectionTitle("Visual Analytics", "Main chart data from the Summary Reports panel.");
      const chartGap = 6;
      const chartWidth = (pageWidth - margin * 2 - chartGap) / 2;

      const chartOneHeight = drawPdfBarChart({
        pdf,
        x: margin,
        y,
        width: chartWidth,
        title: "Queue Status",
        subtitle: `${reportTotalTickets} selected ticket record(s)`,
        data: reportStatusDistributionData,
        accent: colors.blue,
        totalForPercent: reportTotalTickets,
        colors
      });

      const chartTwoHeight = drawPdfBarChart({
        pdf,
        x: margin + chartWidth + chartGap,
        y,
        width: chartWidth,
        title: "Office Queue Volume",
        subtitle: `${reportDepartmentSummaryData.length} office${reportDepartmentSummaryData.length === 1 ? "" : "s"}`,
        data: reportDepartmentSummaryData,
        accent: colors.purple,
        totalForPercent: reportTotalTickets,
        colors
      });

      y += Math.max(chartOneHeight, chartTwoHeight) + 7;

      addPageIfNeeded(70);

      const chartThreeHeight = drawPdfBarChart({
        pdf,
        x: margin,
        y,
        width: chartWidth,
        title: "Lane Usage",
        subtitle: "Regular versus priority lane",
        data: reportLaneDistributionData,
        accent: colors.amber,
        totalForPercent: reportTotalTickets,
        colors
      });

      const chartFourHeight = drawPdfBarChart({
        pdf,
        x: margin + chartWidth + chartGap,
        y,
        width: chartWidth,
        title: "Peak Hour Pattern",
        subtitle: "Activity by office hour",
        data: reportPeakHourData,
        accent: colors.teal,
        totalForPercent: reportTotalTickets,
        colors
      });

      y += Math.max(chartThreeHeight, chartFourHeight) + 9;

      drawTable(
        "Office Breakdown",
        ["Office", "Total", "Active", "Pending", "Serving", "Done", "Priority"],
        departments
          .filter((dept) => reportOfficeFilter === "all" || dept.dept_name === reportOfficeFilter)
          .map((dept) => {
            const counts = getReportDepartmentCounts(dept.id);

            return [
              dept.dept_name || "Office",
              counts.total,
              counts.active,
              counts.pending,
              counts.serving,
              counts.done,
              counts.priority
            ];
          }),
        [42, 19, 20, 22, 22, 19, 22]
      );

      drawTable(
        "Priority Request Summary",
        ["Category", "Count", "Meaning"],
        [
          ["Pending", pendingPriorityUsers.length, "Waiting for admin verification"],
          ["Approved", approvedPriorityUsers.length, "Allowed to use priority lane"],
          ["Rejected", rejectedPriorityUsers.length, "Not allowed for priority lane"]
        ],
        [42, 24, 112]
      );

      drawTable(
        "Latest Transaction History",
        ["Ticket", "Office", "Lane", "Window", "Duration", "End Time"],
        filteredReportTransactions.slice(0, 15).map((item) => [
          item.ticket_number || item.ticket_id || "-",
          item.dept_name || getDepartmentNameById(item.dept_id),
          item.lane_type || "Regular",
          item.window_assignment || "-",
          `${item.duration_sec || 0}s`,
          getReadableDateTime(item.end_time)
        ]),
        [30, 32, 23, 28, 24, 50]
      );

      drawTable(
        "Latest User Activity Logs",
        ["User", "Ticket", "Office", "Status", "Created"],
        reportUserActivityLogs.slice(0, 16).map((log) => [
          log.userName,
          log.ticketNumber,
          log.department,
          log.status,
          log.createdAt
        ]),
        [46, 28, 32, 27, 54]
      );

      const pageCount = pdf.internal.getNumberOfPages();

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        pdf.setPage(pageNumber);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.setTextColor(...colors.muted);
        pdf.text(
          `QueueFree Summary Report | Page ${pageNumber} of ${pageCount}`,
          margin,
          pageHeight - 7
        );
      }

      pdf.save(`${getReportFileBaseName()}.pdf`);
    } catch (error) {
      console.error("EXPORT SUMMARY PDF ERROR:", error);
      alert("Failed to export PDF report. Please try again.");
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportTransactionsCsv = () => {
    const rows = transactions.map((item) => ({
      TicketId: item.ticket_id || "-",
      TicketNumber: item.ticket_number || "-",
      Department: item.dept_name || getDepartmentNameById(item.dept_id),
      Lane: item.lane_type || "Regular",
      Window: item.window_assignment || "-",
      ServedBy: item.served_by_name || item.served_by || "-",
      DurationSeconds: item.duration_sec || 0,
      EndTime: getReadableDateTime(item.end_time)
    }));

    downloadCsv("queuefree-transaction-history.csv", rows);
  };

  const handleExportUserActivityCsv = () => {
    const rows = userActivityLogs.map((item) => ({
      UserName: item.userName,
      Email: item.email,
      Action: item.action,
      TicketNumber: item.ticketNumber,
      Department: item.department,
      Status: item.status,
      CreatedAt: item.createdAt
    }));

    downloadCsv("queuefree-user-activity-logs.csv", rows);
  };

  const handleToggleDepartmentStatus = async () => {
    try {
      if (!selectedDepartment) {
        alert("Select a department first.");
        return;
      }

      setAdminLoading(true);

      await updateDoc(doc(db, "departments", selectedDepartment.id), {
        is_active: !selectedDepartment.is_active
      });

      alert(
        `${selectedDepartment.dept_name} is now ${
          selectedDepartment.is_active ? "Inactive" : "Active"
        }.`
      );
    } catch (error) {
      console.error("TOGGLE DEPARTMENT STATUS ERROR:", error);
      alert("Failed to update department status.");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleResetDepartmentQueue = async () => {
    try {
      if (!selectedDepartment) {
        alert("Select a department first.");
        return;
      }

      const confirmReset = window.confirm(
        `Reset ${selectedDepartment.dept_name} queue?\n\nThis will clear active queue tickets, remove now-serving display, and restart new queue numbers from 1.`
      );

      if (!confirmReset) return;

      setAdminLoading(true);

      const activeTicketQuery = query(
        collection(db, "queue_tickets"),
        where("dept_id", "==", selectedDepartment.id)
      );

      const ticketSnapshot = await getDocs(activeTicketQuery);
      const batch = writeBatch(db);
      const deptRef = doc(db, "departments", selectedDepartment.id);

      batch.update(deptRef, {
        current_number: 0,
        current_serving_display: "-",
        current_serving_window: "",
        last_number: 0,
        now_serving: 0,
        priority_last_number: 0,
        priority_now_serving_number: 0,
        priority_now_serving_display: "-",
        priority_now_serving_window: "",
        regular_last_number: 0,
        regular_now_serving_number: 0,
        regular_now_serving_display: "-",
        regular_now_serving_window: ""
      });

      ticketSnapshot.docs.forEach((ticketDoc) => {
        const ticketData = ticketDoc.data();

        if (
          ticketData.status !== "Done" &&
          ticketData.status !== "Cancelled" &&
          ticketData.status !== "Reset"
        ) {
          batch.update(ticketDoc.ref, {
            status: "Reset",
            reset_by_admin: true,
            reset_at: new Date(),
            completed_at: ticketData.completed_at || new Date()
          });
        }
      });

      await batch.commit();

      alert(
        `${selectedDepartment.dept_name} queue reset successfully. New queue numbers will start again at 1.`
      );
    } catch (error) {
      console.error("RESET DEPARTMENT QUEUE ERROR:", error);
      alert("Failed to reset department queue.");
    } finally {
      setAdminLoading(false);
    }
  };

  const handlePriorityDecision = async (userId, action) => {
    try {
      setAdminLoading(true);

      if (action === "approve") {
        await updateDoc(doc(db, "users", userId), {
          priority_status: "approved"
        });

        alert("Priority request approved.");
      }

      if (action === "reject") {
        await updateDoc(doc(db, "users", userId), {
          priority_status: "rejected"
        });

        alert("Priority request rejected.");
      }

      if (action === "reset") {
        await updateDoc(doc(db, "users", userId), {
          priority_status: "pending"
        });

        alert("Priority request moved back to pending.");
      }
    } catch (error) {
      console.error("PRIORITY DECISION ERROR:", error);
      alert("Failed to update priority request.");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleSaveStaffAssignment = async (staffUser) => {
    try {
      const officeValue = staffAssignments[staffUser.id] || "";
      const windowValue = staffWindowAssignments[staffUser.id] || "Window 1";

      if (!officeValue) {
        alert("Please select an office assignment first.");
        return;
      }

      setAdminLoading(true);

      await deactivateOldStaffWindowRecord(staffUser, officeValue, windowValue);

      await updateDoc(doc(db, "users", staffUser.id), {
        office_assignment: officeValue,
        window_assignment: windowValue
      });

      await syncStaffWindowRecord({
        staffUid: staffUser.id,
        staffName: getFullName(staffUser),
        staffEmail: staffUser.email || "",
        officeAssignment: officeValue,
        windowAssignment: windowValue,
        isActive:
          staffUser.is_deleted !== true &&
          (staffUser.account_status || "active") === "active",
        accountStatus: staffUser.account_status || "active"
      });

      alert("Staff assignment updated successfully.");
    } catch (error) {
      console.error("SAVE STAFF ASSIGNMENT ERROR:", error);
      alert("Failed to save staff assignment.");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleStaffStatusChange = async (staffUser, nextStatus) => {
    try {
      setAdminLoading(true);

      await updateDoc(doc(db, "users", staffUser.id), {
        account_status: nextStatus
      });

      await syncStaffWindowRecord({
        staffUid: staffUser.id,
        staffName: getFullName(staffUser),
        staffEmail: staffUser.email || "",
        officeAssignment: staffUser.office_assignment || staffAssignments[staffUser.id],
        windowAssignment:
          staffUser.window_assignment || staffWindowAssignments[staffUser.id] || "Window 1",
        isActive: staffUser.is_deleted !== true && nextStatus === "active",
        accountStatus: nextStatus
      });

      alert(`Staff account is now ${nextStatus}.`);
    } catch (error) {
      console.error("STAFF STATUS CHANGE ERROR:", error);
      alert("Failed to update staff account status.");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleToggleStaffArchive = async (staffUser) => {
    try {
      setAdminLoading(true);

      const nextDeleted = !(staffUser.is_deleted === true);
      const currentStatus = staffUser.account_status || "active";

      await updateDoc(doc(db, "users", staffUser.id), {
        is_deleted: nextDeleted
      });

      await syncStaffWindowRecord({
        staffUid: staffUser.id,
        staffName: getFullName(staffUser),
        staffEmail: staffUser.email || "",
        officeAssignment: staffUser.office_assignment || staffAssignments[staffUser.id],
        windowAssignment:
          staffUser.window_assignment || staffWindowAssignments[staffUser.id] || "Window 1",
        isActive: nextDeleted !== true && currentStatus === "active",
        accountStatus: currentStatus
      });

      alert(
        staffUser.is_deleted === true
          ? "Staff account restored successfully."
          : "Staff account archived successfully."
      );
    } catch (error) {
      console.error("TOGGLE STAFF ARCHIVE ERROR:", error);
      alert("Failed to update archive status.");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleCreateStaff = async () => {
    try {
      const firstName = newStaff.first_name.trim();
      const lastName = newStaff.last_name.trim();
      const email = newStaff.email.trim().toLowerCase();
      const password = newStaff.password.trim();
      const officeAssignment = newStaff.office_assignment.trim();
      const windowAssignment = newStaff.window_assignment.trim();
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!firstName) {
        alert("Please enter the staff first name.");
        return;
      }

      if (!lastName) {
        alert("Please enter the staff last name.");
        return;
      }

      if (!email) {
        alert("Please enter the staff email address.");
        return;
      }

      if (!emailPattern.test(email)) {
        alert("Please enter a valid staff email address.");
        return;
      }

      if (!password) {
        alert("Please enter the staff password.");
        return;
      }

      if (password.length < 6) {
        alert("Staff password must be at least 6 characters.");
        return;
      }

      if (!officeAssignment) {
        alert("Please select the office assignment.");
        return;
      }

      if (!windowAssignment) {
        alert("Please select the window assignment.");
        return;
      }

      const duplicateEmail = users.some(
        (user) => String(user.email || "").toLowerCase().trim() === email
      );

      if (duplicateEmail) {
        alert("This email is already registered in the system.");
        return;
      }

      const currentAdminUser = auth.currentUser;
      const currentAdminEmail = currentAdminUser?.email || "";

      if (!currentAdminEmail) {
        alert("Current admin session not found. Please log in again.");
        return;
      }

      const currentAdminPassword = window.prompt(
        "For security, enter the current admin password to create the staff account:"
      );

      if (!currentAdminPassword) {
        alert("Staff creation was cancelled.");
        return;
      }

      setAdminLoading(true);

      const staffCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const staffUid = staffCredential.user.uid;
      const staffName = `${firstName} ${lastName}`.trim();

      await setDoc(doc(db, "users", staffUid), {
        first_name: firstName,
        last_name: lastName,
        email: email,
        student_no: "",
        role: "staff",
        user_type: "Staff",
        is_priority: false,
        priority_type: "Regular",
        priority_status: "not_applicable",
        priority_proof_file_name: "",
        priority_proof_data: "",
        office_assignment: officeAssignment,
        window_assignment: windowAssignment,
        profile_image: "",
        account_status: "active",
        is_deleted: false,
        created_at: new Date()
      });

      await syncStaffWindowRecord({
        staffUid,
        staffName,
        staffEmail: email,
        officeAssignment,
        windowAssignment,
        isActive: true,
        accountStatus: "active"
      });

      await signOut(auth);
      await signInWithEmailAndPassword(auth, currentAdminEmail, currentAdminPassword);

      setNewStaff({
        first_name: "",
        last_name: "",
        email: "",
        password: "",
        office_assignment: "",
        window_assignment: "Window 1"
      });

      alert("Staff account created successfully.");
    } catch (error) {
      console.error("CREATE STAFF ERROR:", error);

      try {
        if (auth.currentUser && auth.currentUser.email !== currentUser?.email) {
          await signOut(auth);
        }
      } catch (innerError) {
        console.error("Sign out cleanup error:", innerError);
      }

      if (error.code === "auth/email-already-in-use") {
        alert("This email is already used by another account.");
      } else if (error.code === "auth/invalid-email") {
        alert("Invalid staff email address.");
      } else if (error.code === "auth/weak-password") {
        alert("Staff password is too weak.");
      } else if (
        error.code === "auth/wrong-password" ||
        error.code === "auth/invalid-credential"
      ) {
        alert("Admin password is incorrect. Staff account creation failed.");
      } else {
        alert("Failed to create staff account.");
      }
    } finally {
      setAdminLoading(false);
    }
  };

  const drawerItems = [
    { key: "offices", label: "Offices" },
    { key: "analytics", label: "Analytics" },
    { key: "reports", label: "Summary Reports" },
    { key: "activity", label: "User Activity Logs" },
    { key: "tickets", label: "Tickets" },
    { key: "transactions", label: "Transactions" },
    { key: "users", label: "Users" },
    { key: "priority", label: "Priority Requests" },
    { key: "staff", label: "Staff Management" }
  ];

  const renderHeaderStats = () => (
    <div className="qf-admin-top-stats">
      <div className="qf-admin-top-stat">
        <span>Total Queues</span>
        <strong>{totalTickets}</strong>
      </div>

      <div className="qf-admin-top-stat">
        <span>Active Queues</span>
        <strong>{totalRequests}</strong>
      </div>

      <div className="qf-admin-top-stat">
        <span>Avg. Wait Time</span>
        <strong>{avgWaitTime} min</strong>
      </div>

      <div className="qf-admin-top-stat">
        <span>Daily Served</span>
        <strong>{totalServed}</strong>
      </div>
    </div>
  );

  const renderAdminOverviewCard = () => (
    <section className="qf-admin-header-card">
      <div className="qf-admin-header-row">
        <div className="qf-admin-header-brand-line">
          <div className="qf-admin-header-top">
            <p className="qf-admin-mini">QUEUEFREE • UCLM</p>
            <h1>Admin Dashboard</h1>
            <p className="qf-admin-subtitle">
              System management overview for offices, users, queue operations,
              priority requests, and generated reports.
            </p>
          </div>
        </div>

        <div className="qf-admin-top-user">
          <div className="qf-admin-user-chip">{displayName}</div>
        </div>
      </div>

      {renderHeaderStats()}
    </section>
  );

  const renderBarList = (data, compact = false) => (
    <div className={`qf-admin-bar-list ${compact ? "compact" : ""}`}>
      {data.map((item) => (
        <div key={item.label} className="qf-admin-bar-row">
          <div className="qf-admin-bar-label">{item.label}</div>

          <div className="qf-admin-bar-track">
            <div
              className={`qf-admin-bar-fill ${item.className || ""}`}
              style={{ width: `${item.widthPercent}%` }}
            ></div>
          </div>

          <div className="qf-admin-bar-value">{item.value}</div>
        </div>
      ))}
    </div>
  );

  const renderDonutMetric = ({
    label,
    value,
    total,
    helper,
    className = ""
  }) => {
    const percent = getPercent(value, total);
    const degrees = Math.round((percent / 100) * 360);

    return (
      <div className={`qf-admin-donut-card ${className}`}>
        <div
          className="qf-admin-donut-ring"
          style={{
            background: `radial-gradient(circle, rgba(2,6,13,0.96) 0%, rgba(2,6,13,0.96) 52%, transparent 54%), conic-gradient(#2ea8ff 0deg, #8b5cf6 ${degrees}deg, rgba(148,163,184,0.16) ${degrees}deg 360deg)`
          }}
        >
          <strong>{percent}%</strong>
        </div>

        <div className="qf-admin-donut-info">
          <span>{label}</span>
          <strong>
            {value} / {total || 0}
          </strong>
          <p>{helper}</p>
        </div>
      </div>
    );
  };

  const renderAnalyticsCard = ({ title, label, value, helper, children }) => (
    <div className="qf-admin-analytics-visual-card">
      <div className="qf-admin-analytics-card-top">
        <div>
          <span>{label}</span>
          <h3>{title}</h3>
        </div>

        <strong>{value}</strong>
      </div>

      {children}

      {helper && <p className="qf-admin-analytics-helper">{helper}</p>}
    </div>
  );

  const renderOfficesSection = () => (
    <div className="qf-admin-content-grid">
      {renderAdminOverviewCard()}

      <div className="qf-admin-section-card">
        <div className="qf-admin-section-headline">
          <h2>Offices</h2>
          <p>Live office status and queue activity across the campus.</p>
        </div>

        <div className="qf-admin-control-bar">
          <select
            id="admin-selected-office"
            name="admin-selected-office"
            value={selectedDeptName}
            onChange={(e) => setSelectedDeptName(e.target.value)}
            className="qf-admin-select"
          >
            {DEPARTMENT_NAMES.map((deptName) => (
              <option key={deptName} value={deptName}>
                {deptName}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="qf-admin-primary-btn"
            onClick={handleToggleDepartmentStatus}
            disabled={adminLoading}
          >
            {adminLoading
              ? "Processing..."
              : selectedDepartment?.is_active
              ? "Set Inactive"
              : "Set Active"}
          </button>

          <button
            type="button"
            className="qf-admin-secondary-btn"
            onClick={handleResetDepartmentQueue}
            disabled={adminLoading}
          >
            {adminLoading ? "Processing..." : "Reset Queue"}
          </button>
        </div>

        <div className="qf-admin-offices-list">
          {departments.map((dept) => {
            const counts = getDepartmentCounts(dept.id);

            return (
              <div key={dept.id} className="qf-admin-office-row">
                <div className="qf-admin-office-left">
                  <h3>{dept.dept_name}</h3>

                  <span
                    className={
                      dept.is_active
                        ? "qf-admin-office-status active"
                        : "qf-admin-office-status inactive"
                    }
                  >
                    {dept.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="qf-admin-office-serving">
                  <div className="qf-admin-serving-box">
                    <span>Regular Now Serving</span>
                    <strong>
                      {normalizeNowServingDisplay(dept.regular_now_serving_display)}
                    </strong>
                  </div>

                  <div className="qf-admin-serving-box priority">
                    <span>Priority Now Serving</span>
                    <strong>
                      {normalizeNowServingDisplay(dept.priority_now_serving_display)}
                    </strong>
                  </div>
                </div>

                <div className="qf-admin-office-metrics">
                  <div className="qf-admin-office-metric">
                    <span>Active</span>
                    <strong>{counts.active}</strong>
                  </div>

                  <div className="qf-admin-office-metric">
                    <span>Pending</span>
                    <strong>{counts.pending}</strong>
                  </div>

                  <div className="qf-admin-office-metric">
                    <span>Serving</span>
                    <strong>{counts.serving}</strong>
                  </div>

                  <div className="qf-admin-office-metric">
                    <span>Paused</span>
                    <strong>{counts.paused}</strong>
                  </div>

                  <div className="qf-admin-office-metric">
                    <span>Done</span>
                    <strong>{counts.done}</strong>
                  </div>

                  <div className="qf-admin-office-metric">
                    <span>Total</span>
                    <strong>{counts.total}</strong>
                  </div>
                </div>
              </div>
            );
          })}

          {departments.length === 0 && (
            <div className="qf-admin-empty-state">No department records found.</div>
          )}
        </div>
      </div>
    </div>
  );

  const renderAnalyticsSection = () => (
    <div className="qf-admin-content-grid">
      <div className="qf-admin-section-card qf-admin-analytics-shell">
        <div className="qf-admin-section-headline qf-admin-report-title-row">
          <div>
            <h2>Analytics</h2>
            <p>
              Queue-focused visual analytics for live queue status, office demand,
              priority lane usage, peak hours, and service performance.
            </p>
          </div>

          <span className="qf-admin-live-pill">Live Queue Data</span>
        </div>

        <div className="qf-admin-analytics-hero-grid">
          <div className="qf-admin-analytics-hero-card">
            <div className="qf-admin-analytics-hero-top">
              <div>
                <span>System Queue Overview</span>
                <h3>{systemHealthLabel}</h3>
              </div>

              <strong>{totalTickets}</strong>
            </div>

            <p>{analyticsInsight}</p>

            <div className="qf-admin-analytics-progress-grid">
              <div>
                <span>Completion Rate</span>
                <strong>{completionRate}%</strong>
                <div className="qf-admin-mini-track">
                  <div style={{ width: `${completionRate}%` }}></div>
                </div>
              </div>

              <div>
                <span>Active Queue Rate</span>
                <strong>{activeQueueRate}%</strong>
                <div className="qf-admin-mini-track">
                  <div style={{ width: `${activeQueueRate}%` }}></div>
                </div>
              </div>

              <div>
                <span>Priority Usage</span>
                <strong>{priorityRate}%</strong>
                <div className="qf-admin-mini-track priority">
                  <div style={{ width: `${priorityRate}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="qf-admin-analytics-score-grid">
            <div className="qf-admin-analytics-score-card">
              <span>Pending</span>
              <strong>{totalPending}</strong>
              <p>waiting tickets</p>
            </div>

            <div className="qf-admin-analytics-score-card">
              <span>Serving</span>
              <strong>{totalServing}</strong>
              <p>currently called</p>
            </div>

            <div className="qf-admin-analytics-score-card">
              <span>Transactions</span>
              <strong>{transactions.length}</strong>
              <p>completed services</p>
            </div>

            <div className="qf-admin-analytics-score-card">
              <span>Avg Service</span>
              <strong>{avgServiceSeconds}s</strong>
              <p>{avgServiceMinutes} min average</p>
            </div>
          </div>
        </div>

        <div className="qf-admin-analytics-main-grid">
          {renderAnalyticsCard({
            title: "Queue Status Distribution",
            label: "Status Flow",
            value: `${totalRequests} active`,
            helper:
              "Shows where the queue records are currently placed: pending, serving, paused, done, reset, or cancelled.",
            children: renderBarList(statusDistributionData, true)
          })}

          {renderAnalyticsCard({
            title: "Active Queue Pressure",
            label: "Office Load",
            value: busiestActiveOffice?.label || "-",
            helper:
              "Highlights which office currently has the highest number of active queue tickets.",
            children: renderBarList(activeQueuePressureData, true)
          })}

          {renderAnalyticsCard({
            title: "Office Queue Volume",
            label: "Demand",
            value: topDepartment?.label || "-",
            helper:
              "Shows total generated queue tickets per office to identify which service area receives the most demand.",
            children: renderBarList(departmentSummaryData, true)
          })}

          {renderAnalyticsCard({
            title: "Peak Hours Today",
            label: "Time Pattern",
            value: [...peakHourData].sort((a, b) => b.value - a.value)[0]?.label || "-",
            helper: peakInsight,
            children: renderBarList(peakHourData, true)
          })}
        </div>

        <div className="qf-admin-analytics-donut-grid">
          {renderDonutMetric({
            label: "Completed Tickets",
            value: totalDone,
            total: totalTickets,
            helper: "Percentage of queue tickets already completed.",
            className: "done"
          })}

          {renderDonutMetric({
            label: "Active Tickets",
            value: totalRequests,
            total: totalTickets,
            helper: "Tickets still pending, serving, or paused.",
            className: "active"
          })}

          {renderDonutMetric({
            label: "Priority Lane",
            value: totalPriority,
            total: totalTickets,
            helper: "Share of tickets using the priority lane.",
            className: "priority"
          })}
        </div>

        <div className="qf-admin-analytics-main-grid">
          {renderAnalyticsCard({
            title: "Regular vs Priority Lane",
            label: "Lane Usage",
            value: `${totalRegular}/${totalPriority}`,
            helper:
              "Compares how many tickets are generated under Regular and Priority lanes.",
            children: renderBarList(laneDistributionData, true)
          })}

          {renderAnalyticsCard({
            title: "Transactions by Office",
            label: "Service Output",
            value: `${transactions.length} total`,
            helper:
              "Shows which offices have already completed service transactions.",
            children: renderBarList(transactionByOfficeData, true)
          })}

          {renderAnalyticsCard({
            title: "Average Service Time",
            label: "Speed",
            value: `${avgServiceSeconds}s`,
            helper:
              "Shows average service duration per office based on completed transactions.",
            children: renderBarList(serviceSpeedByOfficeData, true)
          })}

          <div className="qf-admin-analytics-visual-card qf-admin-analytics-table-card">
            <div className="qf-admin-analytics-card-top">
              <div>
                <span>Office Snapshot</span>
                <h3>Queue Breakdown</h3>
              </div>

              <strong>{departments.length}</strong>
            </div>

            <div className="qf-admin-office-breakdown-list">
              {departments.map((dept) => {
                const counts = getDepartmentCounts(dept.id);

                return (
                  <div key={dept.id} className="qf-admin-office-breakdown-row">
                    <div>
                      <strong>{dept.dept_name}</strong>
                      <span>
                        Regular {counts.regular} • Priority {counts.priority}
                      </span>
                    </div>

                    <div className="qf-admin-office-breakdown-metrics">
                      <span>{counts.pending} pending</span>
                      <span>{counts.serving} serving</span>
                      <span>{counts.done} done</span>
                    </div>
                  </div>
                );
              })}

              {departments.length === 0 && (
                <div className="qf-admin-empty-state">No office data available.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderReportsSection = () => (
    <div className="qf-admin-content-grid">
      <div className="qf-admin-section-card qf-admin-summary-report-shell">
        <div className="qf-admin-section-headline qf-admin-report-title-row qf-admin-report-title-clean">
          <div>
            <h2>Summary Reports</h2>
            <p>
              Filtered queue report with clear totals, visual trends, transactions,
              priority lane usage, and recent user activity.
            </p>
          </div>

          <div className="qf-admin-export-dropdown">
            <button
              type="button"
              className="qf-admin-export-main-btn"
              onClick={() => setExportMenuOpen((prev) => !prev)}
              disabled={exportingPdf}
              aria-haspopup="true"
              aria-expanded={exportMenuOpen}
            >
              <span>{exportingPdf ? "Preparing Report..." : "Export Report"}</span>
              <span className={`qf-admin-export-arrow ${exportMenuOpen ? "open" : ""}`}>
                ▾
              </span>
            </button>

            {exportMenuOpen && (
              <div className="qf-admin-export-menu">
                <button type="button" onClick={() => handleExportReport("pdf")}>
                  <strong>Export as PDF</strong>
                  <span>Printable report with summary, charts, transactions, and activity logs.</span>
                </button>

                <button type="button" onClick={() => handleExportReport("csv")}>
                  <strong>Export Excel Report</strong>
                  <span>Ready-to-pass workbook with chart-style progress bars, findings, transactions, and activity logs.</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="qf-admin-report-filter-panel">
          <div className="qf-admin-report-filter-group">
            <label htmlFor="report-office-filter">Office</label>
            <select
              id="report-office-filter"
              name="report-office-filter"
              className="qf-admin-select qf-admin-report-select"
              value={reportOfficeFilter}
              onChange={(e) => setReportOfficeFilter(e.target.value)}
            >
              <option value="all">All Offices</option>
              {DEPARTMENT_NAMES.map((deptName) => (
                <option key={deptName} value={deptName}>
                  {deptName}
                </option>
              ))}
            </select>
          </div>

          <div className="qf-admin-report-filter-group">
            <label htmlFor="report-status-filter">Status</label>
            <select
              id="report-status-filter"
              name="report-status-filter"
              className="qf-admin-select qf-admin-report-select"
              value={reportStatusFilter}
              onChange={(e) => setReportStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Serving">Serving</option>
              <option value="Paused">Paused</option>
              <option value="Done">Done</option>
              <option value="Reset">Reset</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div className="qf-admin-report-filter-group">
            <label htmlFor="report-lane-filter">Lane</label>
            <select
              id="report-lane-filter"
              name="report-lane-filter"
              className="qf-admin-select qf-admin-report-select"
              value={reportLaneFilter}
              onChange={(e) => setReportLaneFilter(e.target.value)}
            >
              <option value="all">All Lanes</option>
              <option value="Regular">Regular</option>
              <option value="Priority">Priority</option>
            </select>
          </div>

          <div className="qf-admin-report-filter-group">
            <label htmlFor="report-period-filter">Period</label>
            <select
              id="report-period-filter"
              name="report-period-filter"
              className="qf-admin-select qf-admin-report-select"
              value={reportPeriodFilter}
              onChange={(e) => setReportPeriodFilter(e.target.value)}
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
            </select>
          </div>

          <button
            type="button"
            className="qf-admin-clear-filter-btn"
            onClick={handleClearReportFilters}
          >
            Clear
          </button>
        </div>

        <div className="qf-admin-report-overview-panel qf-admin-report-overview-clean">
          <div>
            <span className="qf-admin-report-label">Report Snapshot</span>
            <h3>{reportHealthLabel}</h3>
            <p>{summaryInsight}</p>
          </div>

          <div className="qf-admin-report-health-grid">
            <div>
              <span>Total Shown</span>
              <strong>{reportTotalTickets}</strong>
            </div>

            <div>
              <span>Busiest Office</span>
              <strong>{reportTopDepartment?.label || "-"}</strong>
            </div>

            <div>
              <span>Peak Hour</span>
              <strong>
                {[...reportPeakHourData].sort((a, b) => b.value - a.value)[0]?.label ||
                  "-"}
              </strong>
            </div>
          </div>
        </div>

        <div className="qf-admin-report-kpi-grid qf-admin-report-kpi-clean">
          <div className="qf-admin-report-kpi-card">
            <span>Total Tickets</span>
            <strong>{reportTotalTickets}</strong>
            <p>{reportTotalRequests} active queue{reportTotalRequests === 1 ? "" : "s"}</p>
          </div>

          <div className="qf-admin-report-kpi-card">
            <span>Completed</span>
            <strong>{reportTotalDone}</strong>
            <p>{reportCompletionRate}% completion rate</p>
          </div>

          <div className="qf-admin-report-kpi-card">
            <span>Priority Tickets</span>
            <strong>{reportTotalPriority}</strong>
            <p>{reportPriorityRate}% priority usage</p>
          </div>

          <div className="qf-admin-report-kpi-card">
            <span>Transactions</span>
            <strong>{filteredReportTransactions.length}</strong>
            <p>{reportAvgServiceSeconds}s avg service</p>
          </div>
        </div>

        <div className="qf-admin-report-visual-grid qf-admin-report-main-visuals">
          <div className="qf-admin-report-visual-card">
            <div className="qf-admin-chart-head">
              <h4>Queue Status</h4>
              <span>{reportTotalTickets} total</span>
            </div>
            {renderBarList(reportStatusDistributionData, true)}
            <p className="qf-admin-chart-summary">
              A quick view of pending, serving, paused, completed, reset, and cancelled
              queue tickets.
            </p>
          </div>

          <div className="qf-admin-report-visual-card">
            <div className="qf-admin-chart-head">
              <h4>Office Queue Volume</h4>
              <span>{reportDepartmentSummaryData.length} office{reportDepartmentSummaryData.length === 1 ? "" : "s"}</span>
            </div>
            {renderBarList(reportDepartmentSummaryData, true)}
            <p className="qf-admin-chart-summary">
              {reportTopDepartment?.label || "No office"} has the highest ticket count in
              this selected report.
            </p>
          </div>

          <div className="qf-admin-report-visual-card">
            <div className="qf-admin-chart-head">
              <h4>Lane Usage</h4>
              <span>Regular / Priority</span>
            </div>
            {renderBarList(reportLaneDistributionData, true)}
            <p className="qf-admin-chart-summary">
              Regular tickets total {reportTotalRegular}, while priority tickets total{" "}
              {reportTotalPriority}.
            </p>
          </div>

          <div className="qf-admin-report-visual-card">
            <div className="qf-admin-chart-head">
              <h4>Peak Hour Pattern</h4>
              <span>Filtered</span>
            </div>
            {renderBarList(reportPeakHourData, true)}
            <p className="qf-admin-chart-summary">{reportPeakInsight}</p>
          </div>
        </div>

        <div className="qf-admin-report-bottom-grid qf-admin-report-bottom-clean">
          <div className="qf-admin-report-visual-card no-margin">
            <div className="qf-admin-chart-head">
              <h4>Priority Requests</h4>
              <span>Verification</span>
            </div>

            <div className="qf-admin-report-health-grid compact-health">
              <div>
                <span>Pending</span>
                <strong>{pendingPriorityUsers.length}</strong>
              </div>

              <div>
                <span>Approved</span>
                <strong>{approvedPriorityUsers.length}</strong>
              </div>

              <div>
                <span>Rejected</span>
                <strong>{rejectedPriorityUsers.length}</strong>
              </div>
            </div>
          </div>

          <div className="qf-admin-report-visual-card no-margin">
            <div className="qf-admin-chart-head">
              <h4>Latest User Activity</h4>
              <button
                type="button"
                className="qf-admin-mini-link-btn"
                onClick={() => setActiveSection("activity")}
              >
                Open Logs
              </button>
            </div>

            {reportUserActivityLogs.length === 0 ? (
              <div className="qf-admin-empty-state">No activity matches the filters.</div>
            ) : (
              <div className="qf-admin-mini-activity-list">
                {reportUserActivityLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="qf-admin-mini-activity-item">
                    <strong>{log.ticketNumber}</strong>
                    <span>{log.userName}</span>
                    <p>
                      {log.department} • {log.status}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="qf-admin-export-helper-note">
          <strong>Report coverage:</strong> This summary includes the selected queue records,
          status totals, office volume, lane usage, peak-hour activity, transactions, priority
          requests, and recent user activity in one export.
        </div>
      </div>
    </div>
  );

  const renderActivitySection = () => (
    <div className="qf-admin-content-grid">
      <div className="qf-admin-section-card">
        <div className="qf-admin-section-headline qf-admin-report-title-row">
          <div>
            <h2>User Activity Logs</h2>
            <p>Separate panel for recent queue actions generated by users.</p>
          </div>

          <button
            type="button"
            className="qf-admin-report-btn"
            onClick={handleExportUserActivityCsv}
          >
            Export Activity CSV
          </button>
        </div>

        <div className="qf-admin-priority-summary">
          <div className="qf-admin-analytics-chip">
            <span>Shown Logs</span>
            <strong>{userActivityLogs.length}</strong>
          </div>

          <div className="qf-admin-analytics-chip">
            <span>Registered Users</span>
            <strong>{userAccounts.length}</strong>
          </div>

          <div className="qf-admin-analytics-chip">
            <span>Active Users</span>
            <strong>{activeUserAccounts.length}</strong>
          </div>

          <div className="qf-admin-analytics-chip">
            <span>Archived Users</span>
            <strong>{archivedUserAccounts.length}</strong>
          </div>
        </div>

        {userActivityLogs.length === 0 ? (
          <div className="qf-admin-empty-state">No user activity logs yet.</div>
        ) : (
          <div className="qf-admin-record-grid">
            {userActivityLogs.map((log) => (
              <div key={log.id} className="qf-admin-record-card">
                <div className="qf-admin-record-top">
                  <div className="qf-admin-record-title-wrap">
                    <h3>{log.userName}</h3>
                    <p>{log.email}</p>
                  </div>

                  <span className={getStatusClass(log.status)}>{log.status}</span>
                </div>

                <div className="qf-admin-record-meta">
                  <div className="qf-admin-info-box">
                    <span>Action</span>
                    <strong>{log.action}</strong>
                  </div>

                  <div className="qf-admin-info-box">
                    <span>Ticket</span>
                    <strong>{log.ticketNumber}</strong>
                  </div>

                  <div className="qf-admin-info-box">
                    <span>Office</span>
                    <strong>{log.department}</strong>
                  </div>

                  <div className="qf-admin-info-box">
                    <span>Created</span>
                    <strong>{log.createdAt}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderTicketsSection = () => (
    <div className="qf-admin-content-grid">
      <div className="qf-admin-section-card">
        <div className="qf-admin-section-headline">
          <h2>Recent Tickets</h2>
          <p>Latest queue ticket activity across all offices.</p>
        </div>

        {recentTickets.length === 0 ? (
          <div className="qf-admin-empty-state">No tickets yet.</div>
        ) : (
          <div className="qf-admin-record-grid">
            {recentTickets.map((ticket) => {
              const linkedUser = getUserById(ticket.user_id);

              return (
                <div key={ticket.id} className="qf-admin-record-card">
                  <div className="qf-admin-record-top">
                    <div className="qf-admin-record-title-wrap">
                      <h3>{ticket.ticket_number || "-"}</h3>
                      <p>{ticket.lane_type || "Regular"} Lane</p>
                    </div>

                    <span className={getStatusClass(ticket.status)}>
                      {ticket.status || "Pending"}
                    </span>
                  </div>

                  <div className="qf-admin-record-meta">
                    <div className="qf-admin-info-box">
                      <span>Office</span>
                      <strong>
                        {ticket.dept_name || getDepartmentNameById(ticket.dept_id)}
                      </strong>
                    </div>

                    <div className="qf-admin-info-box">
                      <span>User</span>
                      <strong>{getFullName(linkedUser)}</strong>
                    </div>

                    <div className="qf-admin-info-box">
                      <span>Priority Type</span>
                      <strong>{ticket.priority_type || "Regular"}</strong>
                    </div>

                    <div className="qf-admin-info-box">
                      <span>Queued</span>
                      <strong>{getReadableDateTime(ticket.created_at)}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const renderTransactionsSection = () => (
    <div className="qf-admin-content-grid">
      <div className="qf-admin-section-card">
        <div className="qf-admin-section-headline qf-admin-report-title-row">
          <div>
            <h2>Recent Transactions</h2>
            <p>Latest completed service records with duration.</p>
          </div>

          <button
            type="button"
            className="qf-admin-report-btn"
            onClick={handleExportTransactionsCsv}
          >
            Export Transactions CSV
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="qf-admin-empty-state">No transactions yet.</div>
        ) : (
          <div className="qf-admin-record-grid">
            {recentTransactions.map((item) => (
              <div key={item.id} className="qf-admin-record-card">
                <div className="qf-admin-record-top">
                  <div className="qf-admin-record-title-wrap">
                    <h3 className="qf-admin-break-text">
                      {item.ticket_number || item.ticket_id || "-"}
                    </h3>
                    <p>{item.lane_type || "Regular"} Lane</p>
                  </div>

                  <span className="qf-admin-status qf-admin-status-done">Done</span>
                </div>

                <div className="qf-admin-record-meta">
                  <div className="qf-admin-info-box">
                    <span>Department</span>
                    <strong>{item.dept_name || getDepartmentNameById(item.dept_id)}</strong>
                  </div>

                  <div className="qf-admin-info-box">
                    <span>Duration</span>
                    <strong>{item.duration_sec || 0}s</strong>
                  </div>

                  <div className="qf-admin-info-box">
                    <span>Window</span>
                    <strong>{item.window_assignment || "-"}</strong>
                  </div>

                  <div className="qf-admin-info-box">
                    <span>End Time</span>
                    <strong className="qf-admin-break-text">
                      {getReadableDateTime(item.end_time)}
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderUsersSection = () => (
    <div className="qf-admin-content-grid">
      <div className="qf-admin-section-card">
        <div className="qf-admin-section-headline">
          <h2>Users</h2>
          <p>View registered user accounts and current priority state.</p>
        </div>

        <div className="qf-admin-priority-summary">
          <div className="qf-admin-analytics-chip">
            <span>All Users</span>
            <strong>{userAccounts.length}</strong>
          </div>

          <div className="qf-admin-analytics-chip">
            <span>Active Users</span>
            <strong>{activeUserAccounts.length}</strong>
          </div>

          <div className="qf-admin-analytics-chip">
            <span>Archived Users</span>
            <strong>{archivedUserAccounts.length}</strong>
          </div>
        </div>

        <div className="qf-admin-users-grid">
          {userAccounts.map((user) => (
            <div key={user.id} className="qf-admin-user-card">
              <div className="qf-admin-user-top">
                <div className="qf-admin-user-avatar">
                  {String(user.first_name || user.email || "U").charAt(0).toUpperCase()}
                </div>

                <div className="qf-admin-user-main">
                  <h3>{getFullName(user)}</h3>
                  <p>{user.email || "-"}</p>
                </div>
              </div>

              <div className="qf-admin-user-meta-grid">
                <div className="qf-admin-user-meta-box">
                  <span>Student No</span>
                  <strong>{user.student_no || "-"}</strong>
                </div>

                <div className="qf-admin-user-meta-box">
                  <span>Priority Request</span>
                  <strong>{user.is_priority ? user.priority_type || "Priority" : "No"}</strong>
                </div>

                <div className="qf-admin-user-meta-box">
                  <span>Priority Status</span>
                  <strong>{user.priority_status || "not_applicable"}</strong>
                </div>

                <div className="qf-admin-user-meta-box">
                  <span>Role</span>
                  <strong>{user.role || "user"}</strong>
                </div>

                <div className="qf-admin-user-meta-box">
                  <span>Archived</span>
                  <strong>{user.is_deleted === true ? "Yes" : "No"}</strong>
                </div>

                <div className="qf-admin-user-meta-box">
                  <span>Created</span>
                  <strong>{getReadableDateTime(user.created_at)}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>

        {userAccounts.length === 0 && (
          <div className="qf-admin-empty-state">No user accounts found.</div>
        )}
      </div>
    </div>
  );

  const renderProofModal = () => {
    if (!proofPreviewUser) return null;

    const proofData = proofPreviewUser.priority_proof_data || "";
    const proofType = getProofType(proofData);

    return (
      <div
        className="qf-admin-proof-overlay"
        onClick={() => setProofPreviewUser(null)}
      >
        <div className="qf-admin-proof-modal" onClick={(e) => e.stopPropagation()}>
          <div className="qf-admin-proof-modal-top">
            <div>
              <h3>Priority Proof Preview</h3>
              <p>{getFullName(proofPreviewUser)}</p>
            </div>

            <button
              type="button"
              className="qf-admin-proof-close"
              onClick={() => setProofPreviewUser(null)}
            >
              ✕
            </button>
          </div>

          <div className="qf-admin-proof-meta-grid">
            <div className="qf-admin-user-meta-box">
              <span>Email</span>
              <strong>{proofPreviewUser.email || "-"}</strong>
            </div>

            <div className="qf-admin-user-meta-box">
              <span>Requested Type</span>
              <strong>{proofPreviewUser.priority_type || "-"}</strong>
            </div>

            <div className="qf-admin-user-meta-box">
              <span>Proof File</span>
              <strong>{proofPreviewUser.priority_proof_file_name || "No file"}</strong>
            </div>

            <div className="qf-admin-user-meta-box">
              <span>Status</span>
              <strong>{proofPreviewUser.priority_status || "pending"}</strong>
            </div>
          </div>

          <div className="qf-admin-proof-body">
            {proofType === "image" && (
              <img src={proofData} alt="Priority Proof" className="qf-admin-proof-image" />
            )}

            {proofType === "pdf" && (
              <iframe
                src={proofData}
                title="Priority Proof PDF"
                className="qf-admin-proof-pdf"
              />
            )}

            {proofType !== "image" && proofType !== "pdf" && (
              <div className="qf-admin-empty-state">
                Preview is not available for this file type.
              </div>
            )}
          </div>

          {proofData && (
            <div className="qf-admin-action-row">
              <a
                href={proofData}
                download={proofPreviewUser.priority_proof_file_name || "priority-proof"}
                className="qf-admin-proof-download"
              >
                Download Proof
              </a>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPrioritySection = () => (
    <div className="qf-admin-content-grid">
      <div className="qf-admin-section-card">
        <div className="qf-admin-section-headline">
          <h2>Priority Requests</h2>
          <p>Review and decide whether a user qualifies for priority lane access.</p>
        </div>

        <div className="qf-admin-priority-summary">
          <div className="qf-admin-analytics-chip">
            <span>Pending</span>
            <strong>{pendingPriorityUsers.length}</strong>
          </div>

          <div className="qf-admin-analytics-chip">
            <span>Approved</span>
            <strong>{approvedPriorityUsers.length}</strong>
          </div>

          <div className="qf-admin-analytics-chip">
            <span>Rejected</span>
            <strong>{rejectedPriorityUsers.length}</strong>
          </div>
        </div>

        {pendingPriorityUsers.length === 0 ? (
          <div className="qf-admin-empty-state">No pending priority requests.</div>
        ) : (
          <div className="qf-admin-priority-list">
            {pendingPriorityUsers.map((user) => (
              <div key={user.id} className="qf-admin-priority-card">
                <div className="qf-admin-priority-head">
                  <div>
                    <h3>{getFullName(user)}</h3>
                    <p>{user.email || "-"}</p>
                  </div>

                  <span className="qf-admin-office-status active">Pending</span>
                </div>

                <div className="qf-admin-user-meta-grid">
                  <div className="qf-admin-user-meta-box">
                    <span>Student No</span>
                    <strong>{user.student_no || "-"}</strong>
                  </div>

                  <div className="qf-admin-user-meta-box">
                    <span>Requested Type</span>
                    <strong>{user.priority_type || "-"}</strong>
                  </div>

                  <div className="qf-admin-user-meta-box">
                    <span>Proof File</span>
                    <strong>{user.priority_proof_file_name || "No file"}</strong>
                  </div>

                  <div className="qf-admin-user-meta-box">
                    <span>Submitted</span>
                    <strong>{getReadableDateTime(user.created_at)}</strong>
                  </div>

                  <div className="qf-admin-user-meta-box">
                    <span>Proof Preview</span>
                    <strong>
                      {user.priority_proof_data
                        ? getProofType(user.priority_proof_data).toUpperCase()
                        : "NONE"}
                    </strong>
                  </div>

                  <div className="qf-admin-user-meta-box">
                    <span>Status</span>
                    <strong>{user.priority_status || "pending"}</strong>
                  </div>
                </div>

                <div className="qf-admin-action-row qf-admin-action-row-wrap">
                  <button
                    type="button"
                    className="qf-admin-secondary-btn"
                    onClick={() => setProofPreviewUser(user)}
                    disabled={adminLoading || !user.priority_proof_data}
                  >
                    View Proof
                  </button>

                  <button
                    type="button"
                    className="qf-admin-success-btn"
                    onClick={() => handlePriorityDecision(user.id, "approve")}
                    disabled={adminLoading}
                  >
                    Approve
                  </button>

                  <button
                    type="button"
                    className="qf-admin-danger-btn"
                    onClick={() => handlePriorityDecision(user.id, "reject")}
                    disabled={adminLoading}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="qf-admin-section-card">
        <div className="qf-admin-section-headline">
          <h2>Reviewed Priority Records</h2>
          <p>Already approved or rejected priority requests.</p>
        </div>

        <div className="qf-admin-priority-reviewed-grid">
          {[...approvedPriorityUsers, ...rejectedPriorityUsers].map((user) => (
            <div key={user.id} className="qf-admin-user-card">
              <div className="qf-admin-user-top">
                <div className="qf-admin-user-avatar">
                  {String(user.first_name || user.email || "U").charAt(0).toUpperCase()}
                </div>

                <div className="qf-admin-user-main">
                  <h3>{getFullName(user)}</h3>
                  <p>{user.email || "-"}</p>
                </div>
              </div>

              <div className="qf-admin-user-meta-grid">
                <div className="qf-admin-user-meta-box">
                  <span>Priority Type</span>
                  <strong>{user.priority_type || "-"}</strong>
                </div>

                <div className="qf-admin-user-meta-box">
                  <span>Status</span>
                  <strong>{user.priority_status || "-"}</strong>
                </div>

                <div className="qf-admin-user-meta-box">
                  <span>Proof File</span>
                  <strong>{user.priority_proof_file_name || "No file"}</strong>
                </div>

                <div className="qf-admin-user-meta-box">
                  <span>Preview Type</span>
                  <strong>
                    {user.priority_proof_data
                      ? getProofType(user.priority_proof_data).toUpperCase()
                      : "NONE"}
                  </strong>
                </div>
              </div>

              <div className="qf-admin-action-row qf-admin-action-row-wrap">
                <button
                  type="button"
                  className="qf-admin-secondary-btn"
                  onClick={() => setProofPreviewUser(user)}
                  disabled={adminLoading || !user.priority_proof_data}
                >
                  View Proof
                </button>

                <button
                  type="button"
                  className="qf-admin-secondary-btn"
                  onClick={() => handlePriorityDecision(user.id, "reset")}
                  disabled={adminLoading}
                >
                  Move to Pending
                </button>
              </div>
            </div>
          ))}

          {approvedPriorityUsers.length === 0 && rejectedPriorityUsers.length === 0 && (
            <div className="qf-admin-empty-state">No reviewed priority records yet.</div>
          )}
        </div>
      </div>
    </div>
  );

  const renderStaffSection = () => (
    <div className="qf-admin-content-grid">
      <div className="qf-admin-section-card">
        <div className="qf-admin-section-headline">
          <h2>Staff Management</h2>
          <p>
            Assign office and window, create staff accounts, activate or deactivate
            staff, and archive accounts when needed.
          </p>
        </div>

        <div className="qf-admin-priority-summary">
          <div className="qf-admin-analytics-chip">
            <span>All Staff</span>
            <strong>{staffAccounts.length}</strong>
          </div>

          <div className="qf-admin-analytics-chip">
            <span>Active Staff</span>
            <strong>{activeStaffAccounts.length}</strong>
          </div>

          <div className="qf-admin-analytics-chip">
            <span>Archived Staff</span>
            <strong>{archivedStaffAccounts.length}</strong>
          </div>
        </div>

        <div className="qf-admin-staff-create-card">
          <div className="qf-admin-section-headline qf-admin-sub-headline">
            <h2>Create Staff Account</h2>
            <p>Create a new staff login and assign the office and window immediately.</p>
          </div>

          <div className="qf-admin-staff-create-grid">
            <div className="qf-admin-field-group">
              <label htmlFor="new-staff-first-name">First Name</label>
              <input
                id="new-staff-first-name"
                name="new-staff-first-name"
                type="text"
                className="qf-admin-text-input"
                value={newStaff.first_name}
                onChange={(e) =>
                  setNewStaff((prev) => ({
                    ...prev,
                    first_name: e.target.value
                  }))
                }
                placeholder="Enter first name"
              />
            </div>

            <div className="qf-admin-field-group">
              <label htmlFor="new-staff-last-name">Last Name</label>
              <input
                id="new-staff-last-name"
                name="new-staff-last-name"
                type="text"
                className="qf-admin-text-input"
                value={newStaff.last_name}
                onChange={(e) =>
                  setNewStaff((prev) => ({
                    ...prev,
                    last_name: e.target.value
                  }))
                }
                placeholder="Enter last name"
              />
            </div>

            <div className="qf-admin-field-group">
              <label htmlFor="new-staff-email">Email</label>
              <input
                id="new-staff-email"
                name="new-staff-email"
                type="email"
                className="qf-admin-text-input"
                value={newStaff.email}
                onChange={(e) =>
                  setNewStaff((prev) => ({
                    ...prev,
                    email: e.target.value
                  }))
                }
                placeholder="Enter staff email"
              />
            </div>

            <div className="qf-admin-field-group">
              <label htmlFor="new-staff-password">Password</label>
              <input
                id="new-staff-password"
                name="new-staff-password"
                type="password"
                className="qf-admin-text-input"
                value={newStaff.password}
                onChange={(e) =>
                  setNewStaff((prev) => ({
                    ...prev,
                    password: e.target.value
                  }))
                }
                placeholder="Enter temporary password"
              />
            </div>

            <div className="qf-admin-field-group">
              <label htmlFor="new-staff-office">Office Assignment</label>
              <select
                id="new-staff-office"
                name="new-staff-office"
                className="qf-admin-select"
                value={newStaff.office_assignment}
                onChange={(e) =>
                  setNewStaff((prev) => ({
                    ...prev,
                    office_assignment: e.target.value
                  }))
                }
              >
                <option value="">Select Office</option>
                {DEPARTMENT_NAMES.map((deptName) => (
                  <option key={deptName} value={deptName}>
                    {deptName}
                  </option>
                ))}
              </select>
            </div>

            <div className="qf-admin-field-group">
              <label htmlFor="new-staff-window">Window Assignment</label>
              <select
                id="new-staff-window"
                name="new-staff-window"
                className="qf-admin-select"
                value={newStaff.window_assignment}
                onChange={(e) =>
                  setNewStaff((prev) => ({
                    ...prev,
                    window_assignment: e.target.value
                  }))
                }
              >
                {WINDOW_OPTIONS.map((windowName) => (
                  <option key={windowName} value={windowName}>
                    {windowName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="qf-admin-action-row">
            <button
              type="button"
              className="qf-admin-primary-btn"
              onClick={handleCreateStaff}
              disabled={adminLoading}
            >
              {adminLoading ? "Creating..." : "Create Staff Account"}
            </button>
          </div>
        </div>

        {staffAccounts.length === 0 ? (
          <div className="qf-admin-empty-state">No staff accounts found.</div>
        ) : (
          <div className="qf-admin-staff-grid">
            {staffAccounts.map((staffUser) => (
              <div key={staffUser.id} className="qf-admin-staff-card">
                <div className="qf-admin-user-top">
                  <div className="qf-admin-user-avatar staff">
                    {String(staffUser.first_name || staffUser.email || "S")
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <div className="qf-admin-user-main">
                    <h3>{getFullName(staffUser)}</h3>
                    <p>{staffUser.email || "-"}</p>
                  </div>
                </div>

                <div className="qf-admin-staff-form-grid">
                  <div className="qf-admin-field-group">
                    <label htmlFor={`staff-office-${staffUser.id}`}>
                      Office Assignment
                    </label>

                    <select
                      id={`staff-office-${staffUser.id}`}
                      name={`staff-office-${staffUser.id}`}
                      className="qf-admin-select"
                      value={staffAssignments[staffUser.id] || ""}
                      onChange={(e) =>
                        setStaffAssignments((prev) => ({
                          ...prev,
                          [staffUser.id]: e.target.value
                        }))
                      }
                    >
                      <option value="">Select Office</option>
                      {DEPARTMENT_NAMES.map((deptName) => (
                        <option key={deptName} value={deptName}>
                          {deptName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="qf-admin-field-group">
                    <label htmlFor={`staff-window-${staffUser.id}`}>
                      Window Assignment
                    </label>

                    <select
                      id={`staff-window-${staffUser.id}`}
                      name={`staff-window-${staffUser.id}`}
                      className="qf-admin-select"
                      value={staffWindowAssignments[staffUser.id] || "Window 1"}
                      onChange={(e) =>
                        setStaffWindowAssignments((prev) => ({
                          ...prev,
                          [staffUser.id]: e.target.value
                        }))
                      }
                    >
                      {WINDOW_OPTIONS.map((windowName) => (
                        <option key={windowName} value={windowName}>
                          {windowName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="qf-admin-user-meta-grid">
                  <div className="qf-admin-user-meta-box">
                    <span>Current Office</span>
                    <strong>{staffUser.office_assignment || "-"}</strong>
                  </div>

                  <div className="qf-admin-user-meta-box">
                    <span>Current Window</span>
                    <strong>{staffUser.window_assignment || "-"}</strong>
                  </div>

                  <div className="qf-admin-user-meta-box">
                    <span>Account Status</span>
                    <strong>{staffUser.account_status || "active"}</strong>
                  </div>

                  <div className="qf-admin-user-meta-box">
                    <span>Archived</span>
                    <strong>{staffUser.is_deleted === true ? "Yes" : "No"}</strong>
                  </div>
                </div>

                <div className="qf-admin-action-row qf-admin-action-row-wrap">
                  <button
                    type="button"
                    className="qf-admin-primary-btn"
                    onClick={() => handleSaveStaffAssignment(staffUser)}
                    disabled={adminLoading}
                  >
                    Save Assignment
                  </button>

                  <button
                    type="button"
                    className="qf-admin-success-btn"
                    onClick={() => handleStaffStatusChange(staffUser, "active")}
                    disabled={adminLoading}
                  >
                    Set Active
                  </button>

                  <button
                    type="button"
                    className="qf-admin-warning-btn"
                    onClick={() => handleStaffStatusChange(staffUser, "inactive")}
                    disabled={adminLoading}
                  >
                    Set Inactive
                  </button>

                  <button
                    type="button"
                    className="qf-admin-danger-btn"
                    onClick={() => handleToggleStaffArchive(staffUser)}
                    disabled={adminLoading}
                  >
                    {staffUser.is_deleted === true ? "Restore" : "Archive"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderActiveSection = () => {
    if (activeSection === "offices") return renderOfficesSection();
    if (activeSection === "analytics") return renderAnalyticsSection();
    if (activeSection === "reports") return renderReportsSection();
    if (activeSection === "activity") return renderActivitySection();
    if (activeSection === "tickets") return renderTicketsSection();
    if (activeSection === "transactions") return renderTransactionsSection();
    if (activeSection === "users") return renderUsersSection();
    if (activeSection === "priority") return renderPrioritySection();
    if (activeSection === "staff") return renderStaffSection();

    return renderOfficesSection();
  };

  return (
    <div className="qf-admin-layout">
      <aside className={`qf-admin-drawer ${sidebarOpen ? "open" : ""}`}>
        <div className="qf-admin-drawer-top">
          <div className="qf-admin-drawer-brand">QueueFree</div>

          <button
            className="qf-admin-drawer-close"
            onClick={() => setSidebarOpen(false)}
            type="button"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <div className="qf-admin-drawer-user">
          <div className="qf-admin-avatar">
            {String(displayName).charAt(0).toUpperCase()}
          </div>

          <div>
            <strong>{displayName}</strong>
            <p>{currentUser?.email || "admin@queuefree"}</p>
          </div>
        </div>

        <nav className="qf-admin-drawer-nav">
          {drawerItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`qf-admin-drawer-link ${
                activeSection === item.key ? "active" : ""
              }`}
              onClick={() => {
                setActiveSection(item.key);
                setSidebarOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {sidebarOpen && (
        <div
          className="qf-admin-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      <main className="qf-admin-main">{renderActiveSection()}</main>

      {renderProofModal()}
    </div>
  );
}

export default AdminDashboard;