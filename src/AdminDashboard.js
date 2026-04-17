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
  onSnapshot,
  setDoc,
  updateDoc
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
    const unsubDepartments = onSnapshot(collection(db, "departments"), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setDepartments(data);
    });

    const unsubTickets = onSnapshot(collection(db, "queue_tickets"), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setTickets(data);
    });

    const unsubTransactions = onSnapshot(collection(db, "transactions"), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setTransactions(data);
    });

    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
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
    });

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
  const totalRequests = tickets.filter((ticket) => ticket.status !== "Done").length;
  const totalServed = tickets.filter((ticket) => ticket.status === "Done").length;
  const totalPending = tickets.filter((ticket) => ticket.status === "Pending").length;
  const totalServing = tickets.filter((ticket) => ticket.status === "Serving").length;
  const totalDone = tickets.filter((ticket) => ticket.status === "Done").length;
  const totalPriority = tickets.filter((ticket) => (ticket.lane_type || "Regular") === "Priority").length;
  const totalRegular = tickets.filter((ticket) => (ticket.lane_type || "Regular") !== "Priority").length;

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
    const total = departments.reduce((sum, dept) => sum + (dept.avg_service_time || 0), 0);
    return Math.round(total / departments.length);
  }, [departments]);

  const avgServiceSeconds = useMemo(() => {
    if (transactions.length === 0) return 0;
    const totalSeconds = transactions.reduce((sum, item) => sum + (item.duration_sec || 0), 0);
    return Math.round(totalSeconds / transactions.length);
  }, [transactions]);

  const getDepartmentCounts = (deptId) => {
    const deptTickets = tickets.filter((ticket) => ticket.dept_id === deptId);

    return {
      pending: deptTickets.filter((ticket) => ticket.status === "Pending").length,
      serving: deptTickets.filter((ticket) => ticket.status === "Serving").length,
      done: deptTickets.filter((ticket) => ticket.status === "Done").length,
      regular: deptTickets.filter((ticket) => (ticket.lane_type || "Regular") !== "Priority").length,
      priority: deptTickets.filter((ticket) => (ticket.lane_type || "Regular") === "Priority").length,
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

  const hourlyBuckets = useMemo(() => {
    const buckets = {
      "8:00 AM": 0,
      "9:00 AM": 0,
      "10:00 AM": 0,
      "11:00 AM": 0,
      "12:00 PM": 0,
      "1:00 PM": 0,
      "2:00 PM": 0,
      "3:00 PM": 0,
      "4:00 PM": 0
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

      if (hour === 8) buckets["8:00 AM"] += 1;
      else if (hour === 9) buckets["9:00 AM"] += 1;
      else if (hour === 10) buckets["10:00 AM"] += 1;
      else if (hour === 11) buckets["11:00 AM"] += 1;
      else if (hour === 12) buckets["12:00 PM"] += 1;
      else if (hour === 13) buckets["1:00 PM"] += 1;
      else if (hour === 14) buckets["2:00 PM"] += 1;
      else if (hour === 15) buckets["3:00 PM"] += 1;
      else if (hour === 16) buckets["4:00 PM"] += 1;
    });

    return buckets;
  }, [tickets]);

  const peakHourData = useMemo(() => {
    const values = Object.entries(hourlyBuckets).map(([label, value]) => ({
      label,
      value
    }));

    const maxValue = Math.max(...values.map((item) => item.value), 1);

    return values.map((item) => ({
      ...item,
      widthPercent: Math.max((item.value / maxValue) * 100, item.value > 0 ? 12 : 6)
    }));
  }, [hourlyBuckets]);

  const peakInsight = useMemo(() => {
    const sorted = [...peakHourData].sort((a, b) => b.value - a.value);
    if (!sorted.length) return "No queue data yet.";

    const top = sorted[0];
    return `${top.label} currently has the highest activity with ${top.value} ticket${top.value === 1 ? "" : "s"}.`;
  }, [peakHourData]);

  const reportsData = useMemo(() => {
    return [
      {
        title: "Daily Transaction Report",
        subtitle: "Today overview",
        value: `${totalDone} completed services`,
        note: "Based on finished queue transactions today."
      },
      {
        title: "Weekly Queue Summary",
        subtitle: "All lanes",
        value: `${totalTickets} total tickets`,
        note: "Combined regular and priority activity."
      },
      {
        title: "Monthly Performance",
        subtitle: "System output",
        value: `${transactions.length} total transactions`,
        note: `Average service time: ${avgServiceSeconds}s`
      },
      {
        title: "Document Processing Time",
        subtitle: "Current average",
        value: `${avgServiceSeconds}s average`,
        note: "Estimated from current completed transaction records."
      }
    ];
  }, [totalDone, totalTickets, transactions.length, avgServiceSeconds]);

  const getStatusClass = (status) => {
    if (status === "Serving") return "qf-admin-status qf-admin-status-serving";
    if (status === "Done") return "qf-admin-status qf-admin-status-done";
    return "qf-admin-status qf-admin-status-pending";
  };

  const getReadableDateTime = (value) => {
    if (value?.toDate) {
      return value.toDate().toLocaleString();
    }
    if (value?.seconds) {
      return new Date(value.seconds * 1000).toLocaleString();
    }
    return "-";
  };

  const getProofType = (proofData = "") => {
    if (!proofData || typeof proofData !== "string") return "none";
    if (proofData.startsWith("data:image")) return "image";
    if (proofData.startsWith("data:application/pdf")) return "pdf";
    return "unknown";
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
      console.error(error);
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
        `Are you sure you want to reset ${selectedDepartment.dept_name} queue counters?`
      );

      if (!confirmReset) return;

      setAdminLoading(true);

      const prefix =
        selectedDepartment.queue_prefix ||
        selectedDepartment.dept_name.charAt(0).toUpperCase();

      await updateDoc(doc(db, "departments", selectedDepartment.id), {
        current_number: 0,
        current_serving_display: `${prefix}000`,
        last_number: 0,
        now_serving: 0,
        priority_last_number: 0,
        priority_now_serving_number: 0,
        priority_now_serving_display: `${prefix}P000`,
        regular_last_number: 0,
        regular_now_serving_number: 0,
        regular_now_serving_display: `${prefix}000`
      });

      alert(`${selectedDepartment.dept_name} queue counters reset successfully.`);
    } catch (error) {
      console.error(error);
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
      console.error(error);
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

      await updateDoc(doc(db, "users", staffUser.id), {
        office_assignment: officeValue,
        window_assignment: windowValue
      });

      alert("Staff assignment updated successfully.");
    } catch (error) {
      console.error(error);
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

      alert(`Staff account is now ${nextStatus}.`);
    } catch (error) {
      console.error(error);
      alert("Failed to update staff account status.");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleToggleStaffArchive = async (staffUser) => {
    try {
      setAdminLoading(true);

      await updateDoc(doc(db, "users", staffUser.id), {
        is_deleted: !(staffUser.is_deleted === true)
      });

      alert(
        staffUser.is_deleted === true
          ? "Staff account restored successfully."
          : "Staff account archived successfully."
      );
    } catch (error) {
      console.error(error);
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
      console.error(error);

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
    { key: "reports", label: "Reports" },
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
        <span>Active Requests</span>
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

  const renderOfficesSection = () => (
    <div className="qf-admin-content-grid">
      <div className="qf-admin-section-card">
        <div className="qf-admin-section-headline">
          <h2>Offices</h2>
          <p>Live office status and queue activity across the campus.</p>
        </div>

        <div className="qf-admin-control-bar">
          <select
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
                  <span className={dept.is_active ? "qf-admin-office-status active" : "qf-admin-office-status inactive"}>
                    {dept.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="qf-admin-office-serving">
                  <div className="qf-admin-serving-box">
                    <span>Regular Now Serving</span>
                    <strong>{dept.regular_now_serving_display || "-"}</strong>
                  </div>

                  <div className="qf-admin-serving-box priority">
                    <span>Priority Now Serving</span>
                    <strong>{dept.priority_now_serving_display || "-"}</strong>
                  </div>
                </div>

                <div className="qf-admin-office-metrics">
                  <div className="qf-admin-office-metric">
                    <span>Pending</span>
                    <strong>{counts.pending}</strong>
                  </div>

                  <div className="qf-admin-office-metric">
                    <span>Serving</span>
                    <strong>{counts.serving}</strong>
                  </div>

                  <div className="qf-admin-office-metric">
                    <span>Done</span>
                    <strong>{counts.done}</strong>
                  </div>

                  <div className="qf-admin-office-metric">
                    <span>Regular</span>
                    <strong>{counts.regular}</strong>
                  </div>

                  <div className="qf-admin-office-metric">
                    <span>Priority</span>
                    <strong>{counts.priority}</strong>
                  </div>

                  <div className="qf-admin-office-metric">
                    <span>Total</span>
                    <strong>{counts.total}</strong>
                  </div>
                </div>
              </div>
            );
          })}
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
            <span>Avg Service</span>
            <strong>{avgServiceSeconds}s</strong>
          </div>
        </div>

        <div className="qf-admin-peak-card">
          <div className="qf-admin-section-head">
            <h3>Peak Hours Today</h3>
            <span className="qf-admin-live-pill">Live Data</span>
          </div>

          <div className="qf-admin-bar-list">
            {peakHourData.map((item) => (
              <div key={item.label} className="qf-admin-bar-row">
                <div className="qf-admin-bar-label">{item.label}</div>
                <div className="qf-admin-bar-track">
                  <div
                    className="qf-admin-bar-fill"
                    style={{ width: `${item.widthPercent}%` }}
                  ></div>
                </div>
                <div className="qf-admin-bar-value">{item.value}</div>
              </div>
            ))}
          </div>

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
      <div className="qf-admin-section-card">
        <div className="qf-admin-section-headline">
          <h2>Reports</h2>
          <p>Summary records and printable management reports.</p>
        </div>

        <div className="qf-admin-reports-list">
          {reportsData.map((report, index) => (
            <div key={index} className="qf-admin-report-card">
              <div>
                <h3>{report.title}</h3>
                <p>{report.subtitle}</p>
                <strong>{report.value}</strong>
                <small>{report.note}</small>
              </div>

              <button type="button" className="qf-admin-report-btn">
                View Report
              </button>
            </div>
          ))}
        </div>
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
            {recentTickets.map((ticket) => (
              <div key={ticket.id} className="qf-admin-record-card">
                <div className="qf-admin-record-top">
                  <div className="qf-admin-record-title-wrap">
                    <h3>{ticket.ticket_number || "-"}</h3>
                    <p>{ticket.lane_type || "Regular"} Lane</p>
                  </div>

                  <span className={getStatusClass(ticket.status)}>
                    {ticket.status}
                  </span>
                </div>

                <div className="qf-admin-record-meta">
                  <div className="qf-admin-info-box">
                    <span>User ID</span>
                    <strong className="qf-admin-break-text">{ticket.user_id || "-"}</strong>
                  </div>

                  <div className="qf-admin-info-box">
                    <span>Priority Type</span>
                    <strong>{ticket.priority_type || "Regular"}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderTransactionsSection = () => (
    <div className="qf-admin-content-grid">
      <div className="qf-admin-section-card">
        <div className="qf-admin-section-headline">
          <h2>Recent Transactions</h2>
          <p>Latest completed service records with duration.</p>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="qf-admin-empty-state">No transactions yet.</div>
        ) : (
          <div className="qf-admin-record-grid">
            {recentTransactions.map((item) => (
              <div key={item.id} className="qf-admin-record-card">
                <div className="qf-admin-record-top">
                  <div className="qf-admin-record-title-wrap">
                    <h3 className="qf-admin-break-text">{item.ticket_id || "-"}</h3>
                    <p>{item.lane_type || "Regular"} Lane</p>
                  </div>

                  <span className="qf-admin-status qf-admin-status-done">
                    Done
                  </span>
                </div>

                <div className="qf-admin-record-meta">
                  <div className="qf-admin-info-box">
                    <span>Duration</span>
                    <strong>{item.duration_sec || 0}s</strong>
                  </div>

                  <div className="qf-admin-info-box">
                    <span>End Time</span>
                    <strong className="qf-admin-break-text">
                      {item.end_time?.toDate
                        ? item.end_time.toDate().toLocaleString()
                        : "-"}
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
                  <h3>
                    {`${user.first_name || ""} ${user.last_name || ""}`.trim() || "Unnamed User"}
                  </h3>
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
      <div className="qf-admin-proof-overlay" onClick={() => setProofPreviewUser(null)}>
        <div
          className="qf-admin-proof-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="qf-admin-proof-modal-top">
            <div>
              <h3>Priority Proof Preview</h3>
              <p>
                {`${proofPreviewUser.first_name || ""} ${proofPreviewUser.last_name || ""}`.trim() ||
                  proofPreviewUser.email ||
                  "User"}
              </p>
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
                    <h3>
                      {`${user.first_name || ""} ${user.last_name || ""}`.trim() || "Unnamed User"}
                    </h3>
                    <p>{user.email || "-"}</p>
                  </div>

                  <span className="qf-admin-office-status active">
                    Pending
                  </span>
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
                      {user.priority_proof_data ? getProofType(user.priority_proof_data).toUpperCase() : "NONE"}
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
                  <h3>
                    {`${user.first_name || ""} ${user.last_name || ""}`.trim() || "Unnamed User"}
                  </h3>
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
                    {user.priority_proof_data ? getProofType(user.priority_proof_data).toUpperCase() : "NONE"}
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
          <p>Assign office and window, create staff accounts, activate or deactivate staff, and archive accounts when needed.</p>
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
              <label>First Name</label>
              <input
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
              <label>Last Name</label>
              <input
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
              <label>Email</label>
              <input
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
              <label>Password</label>
              <input
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
              <label>Office Assignment</label>
              <select
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
              <label>Window Assignment</label>
              <select
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
                    {String(staffUser.first_name || staffUser.email || "S").charAt(0).toUpperCase()}
                  </div>

                  <div className="qf-admin-user-main">
                    <h3>
                      {`${staffUser.first_name || ""} ${staffUser.last_name || ""}`.trim() || "Unnamed Staff"}
                    </h3>
                    <p>{staffUser.email || "-"}</p>
                  </div>
                </div>

                <div className="qf-admin-staff-form-grid">
                  <div className="qf-admin-field-group">
                    <label>Office Assignment</label>
                    <select
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
                    <label>Window Assignment</label>
                    <select
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
    if (activeSection === "tickets") return renderTicketsSection();
    if (activeSection === "transactions") return renderTransactionsSection();
    if (activeSection === "users") return renderUsersSection();
    if (activeSection === "priority") return renderPrioritySection();
    if (activeSection === "staff") return renderStaffSection();
    return renderOfficesSection();
  };

  return (
    <div className="qf-admin-layout">
      <button
        className="qf-admin-corner-menu-btn"
        onClick={() => setSidebarOpen(true)}
        type="button"
        aria-label="Open menu"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <main className="qf-admin-main">
        <section className="qf-admin-header-card">
          <div className="qf-admin-header-row">
            <div className="qf-admin-header-top">
              <p className="qf-admin-mini">QUEUEFREE • UCLM</p>
              <h1>Admin Dashboard</h1>
              <p className="qf-admin-subtitle">System Management</p>
            </div>

            <div className="qf-admin-top-user">
              <div className="qf-admin-user-chip">{displayName}</div>
            </div>
          </div>

          {renderHeaderStats()}
        </section>

        {renderActiveSection()}
      </main>

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
              className={`qf-admin-drawer-link ${activeSection === item.key ? "active" : ""}`}
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

      {renderProofModal()}
    </div>
  );
}

export default AdminDashboard;