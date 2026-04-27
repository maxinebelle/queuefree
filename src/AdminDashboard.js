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
import "./AdminDashboard.css";

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

  const avgServiceMinutes = useMemo(() => {
    if (!avgServiceSeconds) return 0;
    return Math.max(1, Math.round(avgServiceSeconds / 60));
  }, [avgServiceSeconds]);

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
      let dateObj = null;

      if (ticket.created_at?.toDate) {
        dateObj = ticket.created_at.toDate();
      } else if (ticket.created_at?.seconds) {
        dateObj = new Date(ticket.created_at.seconds * 1000);
      }

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

  const departmentSummaryData = useMemo(() => {
    return makeBarData(
      departments.map((dept) => {
        const counts = getDepartmentCounts(dept.id);

        return {
          label: dept.dept_name || "Office",
          value: counts.total,
          active: counts.active,
          pending: counts.pending,
          done: counts.done,
          priority: counts.priority,
          regular: counts.regular
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

  const topDepartment = useMemo(() => {
    if (departmentSummaryData.length === 0) return null;
    return [...departmentSummaryData].sort((a, b) => b.value - a.value)[0];
  }, [departmentSummaryData]);

  const peakInsight = useMemo(() => {
    const sorted = [...peakHourData].sort((a, b) => b.value - a.value);

    if (!sorted.length) {
      return "No queue data yet.";
    }

    const top = sorted[0];

    if (top.value === 0) {
      return "No peak queue hour detected yet. The system will update once users start joining queues.";
    }

    return `${top.label} currently has the highest queue activity with ${top.value} ticket${
      top.value === 1 ? "" : "s"
    }.`;
  }, [peakHourData]);

  const summaryInsight = useMemo(() => {
    const activePercent = getPercent(totalRequests, totalTickets);
    const donePercent = getPercent(totalDone, totalTickets);
    const priorityPercent = getPercent(totalPriority, totalTickets);
    const busiestOffice = topDepartment?.label || "No office yet";

    if (totalTickets === 0) {
      return "QueueFree has no queue records yet. Once users start generating queue numbers, this summary report will automatically show queue volume, service completion, priority usage, and activity trends.";
    }

    return `QueueFree currently records ${totalTickets} total tickets, with ${activePercent}% still active and ${donePercent}% completed. ${busiestOffice} has the highest queue volume so far. Priority lane usage is ${priorityPercent}% of all tickets, while ${transactions.length} completed service transactions are available for service-time analysis.`;
  }, [totalTickets, totalRequests, totalDone, totalPriority, topDepartment, transactions.length]);

  const systemHealthLabel = useMemo(() => {
    if (totalTickets === 0) return "No Data";
    if (totalPending > totalDone && totalPending >= 10) return "Busy";
    if (totalServing > 0 || totalPending > 0) return "Active";
    return "Stable";
  }, [totalTickets, totalPending, totalDone, totalServing]);

  const handleExportSummaryCsv = () => {
    const rows = [];

    rows.push({
      Section: "Overall Summary",
      Name: "System Totals",
      MetricA: "Total Tickets",
      ValueA: totalTickets,
      MetricB: "Active Queues",
      ValueB: totalRequests,
      MetricC: "Transactions",
      ValueC: transactions.length,
      Notes: summaryInsight
    });

    rows.push({
      Section: "Overall Summary",
      Name: "Users and Staff",
      MetricA: "Total Users",
      ValueA: userAccounts.length,
      MetricB: "Active Users",
      ValueB: activeUserAccounts.length,
      MetricC: "Active Staff",
      ValueC: activeStaffAccounts.length,
      Notes: `Archived users: ${archivedUserAccounts.length}; archived staff: ${archivedStaffAccounts.length}`
    });

    rows.push({
      Section: "Queue Status",
      Name: "Status Distribution",
      MetricA: "Pending",
      ValueA: totalPending,
      MetricB: "Serving",
      ValueB: totalServing,
      MetricC: "Done",
      ValueC: totalDone,
      Notes: `Paused: ${totalPaused}; Reset: ${totalReset}; Cancelled: ${totalCancelled}`
    });

    rows.push({
      Section: "Lane Report",
      Name: "Regular vs Priority",
      MetricA: "Regular Tickets",
      ValueA: totalRegular,
      MetricB: "Priority Tickets",
      ValueB: totalPriority,
      MetricC: "Approved Priority Users",
      ValueC: approvedPriorityUsers.length,
      Notes: `Pending priority requests: ${pendingPriorityUsers.length}; Rejected priority requests: ${rejectedPriorityUsers.length}`
    });

    rows.push({
      Section: "Transaction History",
      Name: "Service Records",
      MetricA: "Transactions",
      ValueA: transactions.length,
      MetricB: "Average Service Seconds",
      ValueB: avgServiceSeconds,
      MetricC: "Average Service Minutes",
      ValueC: avgServiceMinutes,
      Notes: "Based on completed service records stored in the transactions collection."
    });

    departments.forEach((dept) => {
      const counts = getDepartmentCounts(dept.id);

      rows.push({
        Section: "Department Summary",
        Name: dept.dept_name || "Office",
        MetricA: "Total Tickets",
        ValueA: counts.total,
        MetricB: "Active Tickets",
        ValueB: counts.active,
        MetricC: "Completed Tickets",
        ValueC: counts.done,
        Notes: `Pending: ${counts.pending}; Serving: ${counts.serving}; Paused: ${counts.paused}; Regular: ${counts.regular}; Priority: ${counts.priority}; Regular now serving: ${normalizeNowServingDisplay(dept.regular_now_serving_display)}; Priority now serving: ${normalizeNowServingDisplay(dept.priority_now_serving_display)}`
      });
    });

    userActivityLogs.slice(0, 12).forEach((log) => {
      rows.push({
        Section: "User Activity Logs",
        Name: log.userName,
        MetricA: "Action",
        ValueA: log.action,
        MetricB: "Ticket",
        ValueB: log.ticketNumber,
        MetricC: "Status",
        ValueC: log.status,
        Notes: `${log.department}; ${log.email}; ${log.createdAt}`
      });
    });

    downloadCsv("queuefree-complete-summary-report.csv", rows);
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
      <div className="qf-admin-section-card">
        <div className="qf-admin-section-headline">
          <h2>Analytics</h2>
          <p>Live queue insights and performance summary.</p>
        </div>

        <div className="qf-admin-analytics-summary">
          <div className="qf-admin-analytics-chip">
            <span>Pending</span>
            <strong>{totalPending}</strong>
          </div>

          <div className="qf-admin-analytics-chip">
            <span>Serving</span>
            <strong>{totalServing}</strong>
          </div>

          <div className="qf-admin-analytics-chip">
            <span>Paused</span>
            <strong>{totalPaused}</strong>
          </div>

          <div className="qf-admin-analytics-chip">
            <span>Done</span>
            <strong>{totalDone}</strong>
          </div>

          <div className="qf-admin-analytics-chip">
            <span>Priority</span>
            <strong>{totalPriority}</strong>
          </div>

          <div className="qf-admin-analytics-chip">
            <span>Regular</span>
            <strong>{totalRegular}</strong>
          </div>

          <div className="qf-admin-analytics-chip">
            <span>Transactions</span>
            <strong>{transactions.length}</strong>
          </div>

          <div className="qf-admin-analytics-chip">
            <span>Avg Service</span>
            <strong>{avgServiceSeconds}s</strong>
          </div>
        </div>

        <div className="qf-admin-peak-card">
          <div className="qf-admin-section-head">
            <h3>Peak Hours Today</h3>
            <span className="qf-admin-live-pill">Live Data</span>
          </div>

          {renderBarList(peakHourData)}

          <div className="qf-admin-insight-box">
            <div className="qf-admin-insight-title">AI Insight</div>
            <p>{peakInsight}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderReportsSection = () => (
    <div className="qf-admin-content-grid">
      <div className="qf-admin-section-card qf-admin-summary-report-shell">
        <div className="qf-admin-section-headline qf-admin-report-title-row">
          <div>
            <h2>Summary Reports</h2>
            <p>
              One summarized report for the whole QueueFree system with visual analytics,
              queue status, transactions, priority lane usage, and recent user activity.
            </p>
          </div>

          <button
            type="button"
            className="qf-admin-report-btn"
            onClick={handleExportSummaryCsv}
          >
            Export Complete CSV
          </button>
        </div>

        <div className="qf-admin-report-overview-panel">
          <div>
            <h3>QueueFree System Snapshot</h3>
            <p>{summaryInsight}</p>
          </div>

          <div className="qf-admin-report-health-grid">
            <div>
              <span>System Status</span>
              <strong>{systemHealthLabel}</strong>
            </div>

            <div>
              <span>Busiest Office</span>
              <strong>{topDepartment?.label || "-"}</strong>
            </div>

            <div>
              <span>Peak Hour</span>
              <strong>
                {[...peakHourData].sort((a, b) => b.value - a.value)[0]?.label || "-"}
              </strong>
            </div>
          </div>
        </div>

        <div className="qf-admin-report-kpi-grid">
          <div className="qf-admin-report-kpi-card">
            <span>Total Tickets</span>
            <strong>{totalTickets}</strong>
            <p>{totalRequests} active queues</p>
          </div>

          <div className="qf-admin-report-kpi-card">
            <span>Transactions</span>
            <strong>{transactions.length}</strong>
            <p>{avgServiceSeconds}s avg service</p>
          </div>

          <div className="qf-admin-report-kpi-card">
            <span>User Activities</span>
            <strong>{userActivityLogs.length}</strong>
            <p>recent queue actions</p>
          </div>

          <div className="qf-admin-report-kpi-card">
            <span>Priority Tickets</span>
            <strong>{totalPriority}</strong>
            <p>{approvedPriorityUsers.length} approved priority users</p>
          </div>
        </div>

        <div className="qf-admin-report-visual-grid">
          <div className="qf-admin-report-visual-card">
            <div className="qf-admin-chart-head">
              <h4>Queue Status Distribution</h4>
              <span>{totalTickets} total</span>
            </div>
            {renderBarList(statusDistributionData, true)}
            <p className="qf-admin-chart-summary">
              Most queue records are currently shown by status so the admin can quickly
              see pending, serving, completed, reset, and cancelled flow.
            </p>
          </div>

          <div className="qf-admin-report-visual-card">
            <div className="qf-admin-chart-head">
              <h4>Office Queue Volume</h4>
              <span>{departments.length} offices</span>
            </div>
            {renderBarList(departmentSummaryData, true)}
            <p className="qf-admin-chart-summary">
              {topDepartment?.label || "No office"} currently has the highest recorded
              activity based on total generated tickets.
            </p>
          </div>

          <div className="qf-admin-report-visual-card">
            <div className="qf-admin-chart-head">
              <h4>Regular vs Priority</h4>
              <span>Lane usage</span>
            </div>

            <div className="qf-admin-lane-visual-list">
              <div className="qf-admin-lane-visual regular">
                <div className="qf-admin-lane-circle">
                  <strong>{getPercent(totalRegular, totalTickets)}%</strong>
                </div>
                <div>
                  <h4>Regular Lane</h4>
                  <p>{totalRegular} tickets generated under regular queue flow.</p>
                </div>
              </div>

              <div className="qf-admin-lane-visual priority">
                <div className="qf-admin-lane-circle">
                  <strong>{getPercent(totalPriority, totalTickets)}%</strong>
                </div>
                <div>
                  <h4>Priority Lane</h4>
                  <p>{totalPriority} tickets generated for approved priority access.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="qf-admin-report-visual-card">
            <div className="qf-admin-chart-head">
              <h4>Peak Hour Pattern</h4>
              <span>Today</span>
            </div>
            {renderBarList(peakHourData, true)}
            <p className="qf-admin-chart-summary">{peakInsight}</p>
          </div>
        </div>

        <div className="qf-admin-report-bottom-grid">
          <div className="qf-admin-report-visual-card no-margin">
            <div className="qf-admin-chart-head">
              <h4>Priority Request Summary</h4>
              <span>User verification</span>
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

            {userActivityLogs.length === 0 ? (
              <div className="qf-admin-empty-state">No recent user activity yet.</div>
            ) : (
              <div className="qf-admin-mini-activity-list">
                {userActivityLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="qf-admin-mini-activity-item">
                    <strong>{log.ticketNumber}</strong>
                    <span>{log.userName}</span>
                    <p>{log.department} • {log.status}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
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

                  <span className="qf-admin-status qf-admin-status-done">
                    Done
                  </span>
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
        <div
          className="qf-admin-proof-modal"
          onClick={(e) => e.stopPropagation()}
        >
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
              <img
                src={proofData}
                alt="Priority Proof"
                className="qf-admin-proof-image"
              />
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
