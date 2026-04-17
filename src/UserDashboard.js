import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import "./UserDashboard.css";

const DEPARTMENT_NAMES = ["Registrar", "Cashier", "Accounting", "EDP"];

function UserDashboard() {
  const { currentUser } = useAuth();

  const [selectedDeptName, setSelectedDeptName] = useState("Registrar");
  const [departmentData, setDepartmentData] = useState({});
  const [myTickets, setMyTickets] = useState([]);
  const [allTickets, setAllTickets] = useState([]);
  const [lastAlerts, setLastAlerts] = useState({});
  const [activeSection, setActiveSection] = useState("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [queueAlertsEnabled, setQueueAlertsEnabled] = useState(true);
  const [requestUpdatesEnabled, setRequestUpdatesEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const [userProfile, setUserProfile] = useState(null);

  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editProfileImage, setEditProfileImage] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [selectedImageName, setSelectedImageName] = useState("");

  const [alertFilter, setAlertFilter] = useState("all");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [cancelLoadingId, setCancelLoadingId] = useState("");
  const [queueLoading, setQueueLoading] = useState(false);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);

  const fileInputRef = useRef(null);

  useEffect(() => {
    setDepartmentsLoading(true);

    const unsubscribe = onSnapshot(
      collection(db, "departments"),
      (snapshot) => {
        const mapped = {};

        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const deptName = data.dept_name || "";

          if (deptName) {
            mapped[deptName] = {
              id: docSnap.id,
              ...data
            };
          }
        });

        setDepartmentData(mapped);
        setDepartmentsLoading(false);
      },
      (error) => {
        console.error("Departments listener error:", error);
        setDepartmentsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "queue_tickets"),
      (snapshot) => {
        const tickets = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        setAllTickets(tickets);
      },
      (error) => {
        console.error("Queue tickets listener error:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser?.uid) return;

    const unsubscribe = onSnapshot(
      doc(db, "users", currentUser.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setUserProfile({
            uid: currentUser.uid,
            ...data
          });
          setEditFirstName(data.first_name || "");
          setEditLastName(data.last_name || "");
          setEditProfileImage(data.profile_image || "");
        }
      },
      (error) => {
        console.error("User profile listener error:", error);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.uid) return;

    const q = query(
      collection(db, "queue_tickets"),
      where("user_id", "==", currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const tickets = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();

          const deptName =
            Object.keys(departmentData).find(
              (name) => departmentData[name]?.id === data.dept_id
            ) || data.dept_name || "Unknown";

          return {
            id: docSnap.id,
            ...data,
            deptName
          };
        });

        tickets.sort((a, b) => {
          const aTime = a.created_at?.seconds || 0;
          const bTime = b.created_at?.seconds || 0;
          return bTime - aTime;
        });

        setMyTickets(tickets);
      },
      (error) => {
        console.error("My tickets listener error:", error);
      }
    );

    return () => unsubscribe();
  }, [departmentData, currentUser]);

  const activeTickets = useMemo(() => {
    return myTickets.filter((ticket) => ticket.status !== "Done");
  }, [myTickets]);

  const getEffectiveLaneDetails = () => {
    const requestedPriority = userProfile?.is_priority === true;
    const priorityStatus = (userProfile?.priority_status || "").toLowerCase();
    const requestedPriorityType = userProfile?.priority_type || "Priority";

    if (requestedPriority && priorityStatus === "approved") {
      return {
        laneType: "Priority",
        laneLabel: requestedPriorityType,
        priorityStatusLabel: "Approved"
      };
    }

    if (requestedPriority && priorityStatus === "pending") {
      return {
        laneType: "Regular",
        laneLabel: `${requestedPriorityType} (Pending Review)`,
        priorityStatusLabel: "Pending Verification"
      };
    }

    if (requestedPriority && priorityStatus === "rejected") {
      return {
        laneType: "Regular",
        laneLabel: `${requestedPriorityType} (Rejected)`,
        priorityStatusLabel: "Rejected"
      };
    }

    return {
      laneType: "Regular",
      laneLabel: "Regular",
      priorityStatusLabel: "Not Requested"
    };
  };

  const effectiveLaneDetails = useMemo(() => {
    return getEffectiveLaneDetails();
  }, [userProfile]);

  const getDepartmentLaneQueue = (ticket) => {
    const laneType = ticket.lane_type || "Regular";

    const sameLaneTickets = allTickets.filter(
      (item) =>
        item.dept_id === ticket.dept_id &&
        item.status !== "Done" &&
        (item.lane_type || "Regular") === laneType
    );

    const sorted = [...sameLaneTickets];

    sorted.sort((a, b) => {
      const aServing = a.status === "Serving" ? 0 : 1;
      const bServing = b.status === "Serving" ? 0 : 1;

      if (aServing !== bServing) return aServing - bServing;

      return (a.lane_number || 0) - (b.lane_number || 0);
    });

    return sorted;
  };

  const getPeopleAhead = (ticket) => {
    if (ticket.status === "Done") return "Already served";
    if (ticket.status === "Serving") return 0;

    const orderedQueue = getDepartmentLaneQueue(ticket);
    const index = orderedQueue.findIndex((item) => item.id === ticket.id);

    if (index === -1) return "-";
    return index;
  };

  const getPeopleAfter = (ticket) => {
    if (ticket.status === "Done") return 0;

    const orderedQueue = getDepartmentLaneQueue(ticket);
    const index = orderedQueue.findIndex((item) => item.id === ticket.id);

    if (index === -1) return "-";
    return orderedQueue.length - index - 1;
  };

  const getEstimatedWait = (ticket) => {
    if (ticket.status === "Done" || ticket.status === "Serving") return "0 min";

    const dept = departmentData[ticket.deptName];
    if (!dept) return "-";

    const ahead = getPeopleAhead(ticket);
    if (typeof ahead !== "number") return "-";

    const avgServiceTime = dept.avg_service_time || 0;
    return `${ahead * avgServiceTime} min`;
  };

  const getDisplayStatus = (ticket) => {
    if (ticket.status === "Done") return "Done";
    if (ticket.status === "Serving") return "Serving";
    if (ticket.status === "Paused") return "Paused";
    return ticket.status || "Pending";
  };

  const getStatusClass = (ticket) => {
    const status = getDisplayStatus(ticket);

    if (status === "Serving") return "qf-status qf-status-serving";
    if (status === "Done") return "qf-status qf-status-done";
    if (status === "Paused") return "qf-status qf-status-paused";
    return "qf-status qf-status-pending";
  };

  const getNowServingDisplay = (deptName, laneType) => {
    const dept = departmentData[deptName];
    if (!dept) return "-";

    if (laneType === "Priority") {
      return dept.priority_now_serving_display || "-";
    }

    return dept.regular_now_serving_display || "-";
  };

  const getPriorityLabel = () => {
    return effectiveLaneDetails.laneLabel;
  };

  const currentLaneType = useMemo(() => {
    return effectiveLaneDetails.laneType;
  }, [effectiveLaneDetails]);

  const getSelectedLaneNowServing = (deptName) => {
    return getNowServingDisplay(deptName, currentLaneType);
  };

  const getLanePendingCountByDept = (deptName) => {
    const dept = departmentData[deptName];
    if (!dept) return 0;

    return allTickets.filter(
      (ticket) =>
        ticket.dept_id === dept.id &&
        ticket.status === "Pending" &&
        (ticket.lane_type || "Regular") === currentLaneType
    ).length;
  };

  const getOfficeEstimatedWait = (deptName) => {
    const dept = departmentData[deptName];
    if (!dept) return "-";

    const pendingCount = getLanePendingCountByDept(deptName);
    const avgTime = dept.avg_service_time || 0;
    return `${pendingCount * avgTime} min`;
  };

  const getDepartmentRecordForQueue = async () => {
    const stateDept = departmentData[selectedDeptName];
    if (stateDept?.id) {
      return stateDept;
    }

    const deptQuery = query(
      collection(db, "departments"),
      where("dept_name", "==", selectedDeptName)
    );

    const deptSnapshot = await getDocs(deptQuery);

    if (deptSnapshot.empty) {
      return null;
    }

    const docSnap = deptSnapshot.docs[0];
    return {
      id: docSnap.id,
      ...docSnap.data()
    };
  };

  const handleQueue = async () => {
    if (queueLoading) return;

    try {
      setQueueLoading(true);

      if (!currentUser?.uid) {
        alert("User not found. Please log in again.");
        return;
      }

      if (!selectedDeptName) {
        alert("Please select a department first.");
        return;
      }

      if (activeTickets.length >= 3) {
        alert("You can only have up to 3 active queues at the same time.");
        return;
      }

      const alreadyQueued = activeTickets.some(
        (ticket) => ticket.deptName === selectedDeptName
      );

      if (alreadyQueued) {
        alert(`You already have an active queue in ${selectedDeptName}.`);
        return;
      }

      const selectedDept = await getDepartmentRecordForQueue();

      if (!selectedDept?.id) {
        alert("Department data is not ready yet. Please wait a moment and try again.");
        return;
      }

      const ticketNumber = await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", currentUser.uid);
        const deptRef = doc(db, "departments", selectedDept.id);
        const newTicketRef = doc(collection(db, "queue_tickets"));

        const userSnap = await transaction.get(userRef);
        const deptSnap = await transaction.get(deptRef);

        if (!userSnap.exists()) {
          throw new Error("User profile not found.");
        }

        if (!deptSnap.exists()) {
          throw new Error("Department record not found.");
        }

        const userData = userSnap.data();
        const deptData = deptSnap.data();

        const requestedPriority = userData.is_priority === true;
        const priorityStatus = String(userData.priority_status || "").toLowerCase();
        const effectivePriority =
          requestedPriority && priorityStatus === "approved";

        const priorityType = effectivePriority
          ? userData.priority_type || "Priority"
          : "Regular";

        const laneType = effectivePriority ? "Priority" : "Regular";

        const laneLastField = effectivePriority
          ? "priority_last_number"
          : "regular_last_number";

        const currentLaneLast = Number(deptData[laneLastField] || 0);
        const nextLaneNumber = currentLaneLast + 1;

        const prefix =
          deptData.queue_prefix || selectedDeptName.charAt(0).toUpperCase();

        const formattedNumber = effectivePriority
          ? `${prefix}P${String(nextLaneNumber).padStart(3, "0")}`
          : `${prefix}${String(nextLaneNumber).padStart(3, "0")}`;

        transaction.update(deptRef, {
          [laneLastField]: nextLaneNumber
        });

        transaction.set(newTicketRef, {
          user_id: currentUser.uid,
          dept_id: selectedDept.id,
          dept_name: selectedDeptName,
          ticket_number: formattedNumber,
          lane_type: laneType,
          lane_number: nextLaneNumber,
          number: nextLaneNumber,
          status: "Pending",
          is_priority: effectivePriority,
          priority_type: priorityType,
          created_at: serverTimestamp()
        });

        return formattedNumber;
      });

      const requestedPriority = userProfile?.is_priority === true;
      const priorityStatus = String(userProfile?.priority_status || "").toLowerCase();

      if (requestedPriority && priorityStatus === "pending") {
        alert(
          `Queue Number for ${selectedDeptName}: ${ticketNumber}\n\nYour priority request is still pending verification, so you were queued under the Regular lane.`
        );
      } else if (requestedPriority && priorityStatus === "rejected") {
        alert(
          `Queue Number for ${selectedDeptName}: ${ticketNumber}\n\nYour priority request was rejected, so you were queued under the Regular lane.`
        );
      } else {
        alert(`Queue Number for ${selectedDeptName}: ${ticketNumber}`);
      }

      setActiveSection("queue");
    } catch (error) {
      console.error("QUEUE CREATION ERROR:", error);

      if (error.code === "permission-denied") {
        alert("Queue creation failed because Firestore permissions denied the request.");
        return;
      }

      alert(error.message || "Failed to create queue ticket.");
    } finally {
      setQueueLoading(false);
    }
  };

  const handleCancelTicket = async (ticket) => {
    try {
      if (!ticket?.id) return;

      if (ticket.status === "Serving") {
        alert("You cannot cancel a ticket that is already being served.");
        return;
      }

      if (ticket.status === "Done") {
        alert("You cannot cancel a completed ticket.");
        return;
      }

      const confirmCancel = window.confirm(
        `Are you sure you want to cancel ${ticket.ticket_number} for ${ticket.deptName}?`
      );

      if (!confirmCancel) return;

      setCancelLoadingId(ticket.id);

      await deleteDoc(doc(db, "queue_tickets", ticket.id));

      alert(`Queue ticket ${ticket.ticket_number} was cancelled successfully.`);
    } catch (error) {
      console.error("CANCEL QUEUE ERROR:", error);
      alert(error.message || "Failed to cancel queue ticket.");
    } finally {
      setCancelLoadingId("");
    }
  };

  useEffect(() => {
    if (!queueAlertsEnabled) return;

    activeTickets.forEach((ticket) => {
      const position = getPeopleAhead(ticket);
      const currentAlert = lastAlerts[ticket.id] || "";

      if (position === 3 && currentAlert !== "3") {
        alert(`🔔 ${ticket.deptName} (${ticket.lane_type}): Only 3 people ahead.`);
        setLastAlerts((prev) => ({ ...prev, [ticket.id]: "3" }));
      } else if (position === 1 && currentAlert !== "1") {
        alert(`⚡ ${ticket.deptName} (${ticket.lane_type}): You're next!`);
        setLastAlerts((prev) => ({ ...prev, [ticket.id]: "1" }));
      } else if (ticket.status === "Serving" && currentAlert !== "serving") {
        alert(`🎯 ${ticket.deptName} (${ticket.lane_type}): It is now your turn.`);
        setLastAlerts((prev) => ({ ...prev, [ticket.id]: "serving" }));
      }
    });
  }, [activeTickets, lastAlerts, queueAlertsEnabled]);

  const generatedAlerts = useMemo(() => {
    const alerts = [];

    if (
      userProfile?.is_priority === true &&
      (userProfile?.priority_status || "").toLowerCase() === "pending"
    ) {
      alerts.push({
        id: "priority-pending-status",
        category: "system",
        type: "system",
        title: "Priority Request Pending",
        message:
          "Your priority request is still under review. Until approved, your queue lane remains Regular.",
        time: "Live",
        ticketNumber: "-",
        nowServing: "-",
        beforeYou: "-",
        afterYou: "-",
        estimatedWait: "-"
      });
    }

    if (
      userProfile?.is_priority === true &&
      (userProfile?.priority_status || "").toLowerCase() === "approved"
    ) {
      alerts.push({
        id: "priority-approved-status",
        category: "system",
        type: "system",
        title: "Priority Request Approved",
        message:
          "Your priority request has already been approved. You may use the Priority lane.",
        time: "Live",
        ticketNumber: "-",
        nowServing: "-",
        beforeYou: "-",
        afterYou: "-",
        estimatedWait: "-"
      });
    }

    if (
      userProfile?.is_priority === true &&
      (userProfile?.priority_status || "").toLowerCase() === "rejected"
    ) {
      alerts.push({
        id: "priority-rejected-status",
        category: "system",
        type: "system",
        title: "Priority Request Rejected",
        message:
          "Your priority request was rejected. Your lane remains Regular.",
        time: "Live",
        ticketNumber: "-",
        nowServing: "-",
        beforeYou: "-",
        afterYou: "-",
        estimatedWait: "-"
      });
    }

    activeTickets.forEach((ticket) => {
      const ahead = getPeopleAhead(ticket);
      const after = getPeopleAfter(ticket);
      const wait = getEstimatedWait(ticket);
      const status = getDisplayStatus(ticket);
      const nowServing = getNowServingDisplay(
        ticket.deptName,
        ticket.lane_type || "Regular"
      );

      alerts.push({
        id: `${ticket.id}-status`,
        category:
          status === "Serving" || (typeof ahead === "number" && ahead <= 3)
            ? "queue"
            : "system",
        type:
          status === "Serving"
            ? "turn"
            : typeof ahead === "number" && ahead === 1
            ? "next"
            : typeof ahead === "number" && ahead <= 3
            ? "warning"
            : "info",
        title: `${ticket.deptName} • ${ticket.lane_type || "Regular"} Lane`,
        message:
          status === "Serving"
            ? `It is now your turn. Please proceed to the office.`
            : typeof ahead === "number" && ahead === 1
            ? `You are next. Current now serving is ${nowServing}.`
            : typeof ahead === "number" && ahead <= 3
            ? `Only ${ahead} ${ahead === 1 ? "person" : "people"} ahead of you.`
            : `${ahead} people ahead. Estimated wait time is ${wait}.`,
        time: "Live",
        ticketNumber: ticket.ticket_number,
        nowServing,
        beforeYou: ahead,
        afterYou: after,
        estimatedWait: wait
      });
    });

    if (alerts.length === 0) {
      alerts.push({
        id: "empty-alert",
        category: "system",
        type: "empty",
        title: "No Alerts Yet",
        message:
          "Your queue notifications and updates will appear here once you have an active queue.",
        time: "Now",
        ticketNumber: "-",
        nowServing: "-",
        beforeYou: "-",
        afterYou: "-",
        estimatedWait: "-"
      });
    }

    return alerts;
  }, [activeTickets, userProfile, departmentData, allTickets]);

  const filteredAlerts = useMemo(() => {
    if (alertFilter === "all") return generatedAlerts;
    return generatedAlerts.filter((alertItem) => alertItem.category === alertFilter);
  }, [generatedAlerts, alertFilter]);

  const filteredHistory = useMemo(() => {
    if (historyFilter === "all") return myTickets;
    if (historyFilter === "active") {
      return myTickets.filter((ticket) => ticket.status !== "Done");
    }
    if (historyFilter === "completed") {
      return myTickets.filter((ticket) => ticket.status === "Done");
    }
    return myTickets;
  }, [myTickets, historyFilter]);

  const displayName =
    `${userProfile?.first_name || ""} ${userProfile?.last_name || ""}`.trim() ||
    userProfile?.email?.split("@")[0] ||
    "User";

  const displayPhoto = userProfile?.profile_image || editProfileImage || "";

  const primaryLiveTicket = useMemo(() => {
    if (activeTickets.length === 0) return null;

    const servingTicket = activeTickets.find((ticket) => ticket.status === "Serving");
    if (servingTicket) return servingTicket;

    return activeTickets[0];
  }, [activeTickets]);

  const handleChoosePhotoClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleProfileImageChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setSelectedImageName(file.name);

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result;
      setEditProfileImage(base64String);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    try {
      if (!currentUser?.uid) return;

      setProfileSaving(true);

      await updateDoc(doc(db, "users", currentUser.uid), {
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        profile_image: editProfileImage.trim()
      });

      alert("Profile updated successfully.");
    } catch (error) {
      console.error("PROFILE SAVE ERROR:", error);
      alert(error.message || "Failed to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const menuItems = [
    { key: "home", label: "Home" },
    { key: "queue", label: "Queue" },
    { key: "alerts", label: "Alerts" },
    { key: "history", label: "History" },
    { key: "settings", label: "Settings" },
    { key: "accounts", label: "Accounts" }
  ];

  const renderProfileAvatar = () => {
    if (displayPhoto) {
      return <img src={displayPhoto} alt="Profile" className="qf-profile-photo" />;
    }

    return (
      <div className="qf-account-avatar">
        {String(displayName).charAt(0).toUpperCase()}
      </div>
    );
  };

  const renderHomeSection = () => (
    <>
      <section className="qf-top-hero">
        <div className="qf-greeting">
          <div className="qf-mini-brand">QUEUEFREE • UCLM</div>
          <h1>Hello, {displayName}</h1>
          <p>
            Monitor your queue in real time based on your assigned lane. This
            dashboard shows exactly how many are before and after you.
          </p>
        </div>

        <div className="qf-hero-side-summary">
          <div className="qf-side-stat">
            <span>Lane Assignment</span>
            <strong>{getPriorityLabel()}</strong>
          </div>
          <div className="qf-side-stat">
            <span>Priority Status</span>
            <strong>{effectiveLaneDetails.priorityStatusLabel}</strong>
          </div>
          <div className="qf-side-stat">
            <span>Active Queues</span>
            <strong>{activeTickets.length}</strong>
          </div>
        </div>
      </section>

      {primaryLiveTicket ? (
        <section className="qf-panel-v2">
          <div className="qf-panel-head">
            <div>
              <h2>My Live Queue Status</h2>
              <p>
                Real-time status for your current active ticket based on your own lane.
              </p>
            </div>
          </div>

          <div className="qf-live-summary-card">
            <div className="qf-live-summary-top">
              <div>
                <h3>{primaryLiveTicket.deptName}</h3>
                <p>{primaryLiveTicket.lane_type || "Regular"} Lane</p>
              </div>

              <span className={getStatusClass(primaryLiveTicket)}>
                {getDisplayStatus(primaryLiveTicket)}
              </span>
            </div>

            <div className="qf-live-big-number">
              <span>Your Queue Number</span>
              <strong>{primaryLiveTicket.ticket_number}</strong>
            </div>

            <div className="qf-live-metrics-grid">
              <div className="qf-live-metric-box">
                <span>Now Serving</span>
                <strong>
                  {getNowServingDisplay(
                    primaryLiveTicket.deptName,
                    primaryLiveTicket.lane_type || "Regular"
                  )}
                </strong>
              </div>

              <div className="qf-live-metric-box">
                <span>Before You</span>
                <strong>{getPeopleAhead(primaryLiveTicket)}</strong>
              </div>

              <div className="qf-live-metric-box">
                <span>After You</span>
                <strong>{getPeopleAfter(primaryLiveTicket)}</strong>
              </div>

              <div className="qf-live-metric-box">
                <span>Est. Wait</span>
                <strong>{getEstimatedWait(primaryLiveTicket)}</strong>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="qf-panel-v2">
          <div className="qf-empty-state-v2">
            <div className="qf-empty-title">No active queue yet</div>
            <p>Go to the Queue tab to generate your queue number.</p>
          </div>
        </section>
      )}
    </>
  );

  const renderQueueSection = () => {
    const today = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    return (
      <>
        <section className="qf-panel-v2">
          <div className="qf-panel-head">
            <div>
              <h2>Join Queue</h2>
              <p>Select an office to reserve your slot based on your effective lane assignment.</p>
            </div>
          </div>

          <div className="qf-queue-date-card">
            <span>Today’s Date</span>
            <strong>{today}</strong>
          </div>

          <div className="qf-office-selection-list">
            {DEPARTMENT_NAMES.map((deptName) => {
              const dept = departmentData[deptName];
              const isSelected = selectedDeptName === deptName;
              const lanePending = getLanePendingCountByDept(deptName);
              const nowServing = getSelectedLaneNowServing(deptName);
              const estimated = getOfficeEstimatedWait(deptName);

              return (
                <button
                  key={deptName}
                  type="button"
                  className={`qf-office-select-card ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedDeptName(deptName)}
                >
                  <div className="qf-office-select-left">
                    <div className="qf-office-icon-circle">
                      {dept?.queue_prefix || deptName.charAt(0)}
                    </div>

                    <div className="qf-office-main-info">
                      <h3>{deptName}</h3>
                      <p>{dept?.office_location || "Campus office"}</p>
                    </div>
                  </div>

                  <div className="qf-office-select-right">
                    <div className="qf-office-mini-info">
                      <span>Now Serving</span>
                      <strong>{nowServing}</strong>
                    </div>

                    <div className="qf-office-mini-info">
                      <span>In Queue</span>
                      <strong>{lanePending}</strong>
                    </div>

                    <div className="qf-office-mini-info">
                      <span>Est. Wait</span>
                      <strong>{estimated}</strong>
                    </div>

                    <div className="qf-office-mini-info">
                      <span>Your Lane</span>
                      <strong>{currentLaneType}</strong>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="qf-queue-action-row">
            <button
              onClick={handleQueue}
              className="qf-primary-btn-v2 qf-queue-page-btn"
              disabled={queueLoading || departmentsLoading}
            >
              {departmentsLoading
                ? "Loading Offices..."
                : queueLoading
                ? "Generating Queue..."
                : "Get Queue Number"}
            </button>
          </div>
        </section>

        <section className="qf-queue-bottom-grid">
          <div className="qf-panel-v2">
            <div className="qf-panel-head">
              <div>
                <h2>AI Prediction</h2>
                <p>Suggested best time based on current lane traffic.</p>
              </div>
            </div>

            <div className="qf-ai-card">
              <div className="qf-ai-badge">AI</div>
              <p>
                Based on current {currentLaneType.toLowerCase()} lane volume, the best
                time to visit <strong>{selectedDeptName}</strong> is approximately{" "}
                <strong>{getOfficeEstimatedWait(selectedDeptName)}</strong> from now.
              </p>
            </div>
          </div>

          <div className="qf-panel-v2">
            <div className="qf-panel-head">
              <div>
                <h2>My Active Queues</h2>
                <p>Your currently active tickets across different offices.</p>
              </div>
            </div>

            {activeTickets.length === 0 ? (
              <div className="qf-empty-state-v2">
                <div className="qf-empty-title">No active queue yet</div>
                <p>Select an office above and generate your queue number.</p>
              </div>
            ) : (
              <div className="qf-compact-ticket-list">
                {activeTickets.map((ticket) => (
                  <div key={ticket.id} className="qf-compact-ticket-item qf-compact-ticket-item-stack">
                    <div className="qf-compact-ticket-top">
                      <div>
                        <h3>{ticket.deptName}</h3>
                        <p>{ticket.ticket_number} • {ticket.lane_type || "Regular"} Lane</p>
                      </div>
                      <span className={getStatusClass(ticket)}>
                        {getDisplayStatus(ticket)}
                      </span>
                    </div>

                    <div className="qf-compact-ticket-actions">
                      <button
                        type="button"
                        className="qf-danger-btn"
                        onClick={() => handleCancelTicket(ticket)}
                        disabled={
                          cancelLoadingId === ticket.id ||
                          ticket.status === "Serving" ||
                          ticket.status === "Done"
                        }
                      >
                        {cancelLoadingId === ticket.id ? "Cancelling..." : "Cancel Queue"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </>
    );
  };

  const renderAlertsSection = () => (
    <section className="qf-panel-v2">
      <div className="qf-panel-head">
        <div>
          <h2>Notifications</h2>
          <p>Live queue alerts and updates based on your current active tickets.</p>
        </div>
      </div>

      <div className="qf-alert-filter-row">
        <button
          type="button"
          className={`qf-alert-filter-pill ${alertFilter === "all" ? "active" : ""}`}
          onClick={() => setAlertFilter("all")}
        >
          All
        </button>

        <button
          type="button"
          className={`qf-alert-filter-pill ${alertFilter === "queue" ? "active" : ""}`}
          onClick={() => setAlertFilter("queue")}
        >
          Queue
        </button>

        <button
          type="button"
          className={`qf-alert-filter-pill ${alertFilter === "system" ? "active" : ""}`}
          onClick={() => setAlertFilter("system")}
        >
          System
        </button>
      </div>

      <div className="qf-alert-list-v2">
        {filteredAlerts.map((alertItem) => (
          <div
            key={alertItem.id}
            className={`qf-alert-card-v2 qf-alert-${alertItem.type}`}
          >
            <div className="qf-alert-card-top-v2">
              <div>
                <h3>{alertItem.title}</h3>
                <p>{alertItem.message}</p>
              </div>
              <span>{alertItem.time}</span>
            </div>

            <div className="qf-alert-card-meta">
              <div className="qf-alert-meta-box">
                <span>Ticket</span>
                <strong>{alertItem.ticketNumber}</strong>
              </div>

              <div className="qf-alert-meta-box">
                <span>Now Serving</span>
                <strong>{alertItem.nowServing}</strong>
              </div>

              <div className="qf-alert-meta-box">
                <span>Before You</span>
                <strong>{alertItem.beforeYou}</strong>
              </div>

              <div className="qf-alert-meta-box">
                <span>After You</span>
                <strong>{alertItem.afterYou}</strong>
              </div>

              <div className="qf-alert-meta-box">
                <span>Est. Wait</span>
                <strong>{alertItem.estimatedWait}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const renderHistorySection = () => (
    <section className="qf-panel-v2">
      <div className="qf-panel-head">
        <div>
          <h2>History</h2>
          <p>Track your past and current queue activities.</p>
        </div>
      </div>

      <div className="qf-alert-filter-row">
        <button
          type="button"
          className={`qf-alert-filter-pill ${historyFilter === "all" ? "active" : ""}`}
          onClick={() => setHistoryFilter("all")}
        >
          All
        </button>

        <button
          type="button"
          className={`qf-alert-filter-pill ${historyFilter === "active" ? "active" : ""}`}
          onClick={() => setHistoryFilter("active")}
        >
          Active
        </button>

        <button
          type="button"
          className={`qf-alert-filter-pill ${historyFilter === "completed" ? "active" : ""}`}
          onClick={() => setHistoryFilter("completed")}
        >
          Completed
        </button>
      </div>

      {filteredHistory.length === 0 ? (
        <div className="qf-empty-state-v2">
          <div className="qf-empty-title">No records yet</div>
          <p>Your queue activity will appear here.</p>
        </div>
      ) : (
        <div className="qf-history-list">
          {filteredHistory.map((ticket) => (
            <div key={ticket.id} className="qf-history-card">
              <div className="qf-history-head">
                <div>
                  <h3>{ticket.deptName}</h3>
                  <p>{ticket.ticket_number}</p>
                </div>
                <span className={getStatusClass(ticket)}>
                  {getDisplayStatus(ticket)}
                </span>
              </div>

              <div className="qf-history-meta">
                <div>
                  <span>Lane</span>
                  <strong>{ticket.lane_type || "Regular"}</strong>
                </div>
                <div>
                  <span>Before You</span>
                  <strong>{ticket.status === "Done" ? "-" : getPeopleAhead(ticket)}</strong>
                </div>
                <div>
                  <span>Estimated Wait</span>
                  <strong>{ticket.status === "Done" ? "-" : getEstimatedWait(ticket)}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{getDisplayStatus(ticket)}</strong>
                </div>
                <div>
                  <span>Queued</span>
                  <strong>
                    {ticket.created_at?.toDate
                      ? ticket.created_at.toDate().toLocaleString()
                      : ticket.created_at?.seconds
                      ? new Date(ticket.created_at.seconds * 1000).toLocaleString()
                      : "-"}
                  </strong>
                </div>
              </div>

              {ticket.status !== "Done" && ticket.status !== "Serving" && (
                <div className="qf-history-action-row">
                  <button
                    type="button"
                    className="qf-danger-btn"
                    onClick={() => handleCancelTicket(ticket)}
                    disabled={cancelLoadingId === ticket.id}
                  >
                    {cancelLoadingId === ticket.id ? "Cancelling..." : "Cancel Queue"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );

  const renderSettingsSection = () => (
    <section className="qf-panel-v2">
      <div className="qf-panel-head">
        <div>
          <h2>Settings</h2>
          <p>Manage your dashboard preferences and notification settings.</p>
        </div>
      </div>

      <div className="qf-settings-list">
        <div className="qf-setting-card">
          <div>
            <strong>Queue Alerts</strong>
            <p>Receive queue position alerts like 3 ahead and next turn.</p>
          </div>
          <label className="qf-switch">
            <input
              type="checkbox"
              checked={queueAlertsEnabled}
              onChange={() => setQueueAlertsEnabled((prev) => !prev)}
            />
            <span className="qf-slider"></span>
          </label>
        </div>

        <div className="qf-setting-card">
          <div>
            <strong>Request Updates</strong>
            <p>Allow updates related to your queue progress.</p>
          </div>
          <label className="qf-switch">
            <input
              type="checkbox"
              checked={requestUpdatesEnabled}
              onChange={() => setRequestUpdatesEnabled((prev) => !prev)}
            />
            <span className="qf-slider"></span>
          </label>
        </div>

        <div className="qf-setting-card">
          <div>
            <strong>Sound Notifications</strong>
            <p>Enable or disable sound-based alerts in the dashboard.</p>
          </div>
          <label className="qf-switch">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={() => setSoundEnabled((prev) => !prev)}
            />
            <span className="qf-slider"></span>
          </label>
        </div>
      </div>
    </section>
  );

  const renderAccountsSection = () => (
    <section className="qf-panel-v2">
      <div className="qf-panel-head">
        <div>
          <h2>Accounts</h2>
          <p>Edit your profile photo and personal information.</p>
        </div>
      </div>

      <div className="qf-account-card-edit">
        <div className="qf-account-photo-area">
          {renderProfileAvatar()}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="qf-hidden-file-input"
            onChange={handleProfileImageChange}
          />

          <button
            type="button"
            className="qf-secondary-btn"
            onClick={handleChoosePhotoClick}
          >
            Choose Photo
          </button>

          {selectedImageName && (
            <div className="qf-selected-file-name">{selectedImageName}</div>
          )}
        </div>

        <div className="qf-account-edit-form">
          <div className="qf-field-group">
            <label htmlFor="account-first-name">First Name</label>
            <input
              id="account-first-name"
              name="account-first-name"
              type="text"
              value={editFirstName}
              onChange={(e) => setEditFirstName(e.target.value)}
              className="qf-input-v2"
            />
          </div>

          <div className="qf-field-group">
            <label htmlFor="account-last-name">Last Name</label>
            <input
              id="account-last-name"
              name="account-last-name"
              type="text"
              value={editLastName}
              onChange={(e) => setEditLastName(e.target.value)}
              className="qf-input-v2"
            />
          </div>

          <div className="qf-account-readonly-grid">
            <div className="qf-account-row">
              <span>Email</span>
              <strong>{userProfile?.email || "-"}</strong>
            </div>

            <div className="qf-account-row">
              <span>Student Number</span>
              <strong>{userProfile?.student_no || "-"}</strong>
            </div>

            <div className="qf-account-row">
              <span>Role</span>
              <strong>{userProfile?.role || "user"}</strong>
            </div>

            <div className="qf-account-row">
              <span>Lane Assignment</span>
              <strong>{getPriorityLabel()}</strong>
            </div>

            <div className="qf-account-row">
              <span>Priority Status</span>
              <strong>{effectiveLaneDetails.priorityStatusLabel}</strong>
            </div>

            <div className="qf-account-row">
              <span>Priority Type</span>
              <strong>{userProfile?.priority_type || "Regular"}</strong>
            </div>

            <div className="qf-account-row">
              <span>Priority Proof File</span>
              <strong>{userProfile?.priority_proof_file_name || "No uploaded file"}</strong>
            </div>
          </div>

          <button
            type="button"
            className="qf-primary-btn-v2 qf-save-profile-btn"
            onClick={handleSaveProfile}
            disabled={profileSaving}
          >
            {profileSaving ? "Saving..." : "Save Profile Changes"}
          </button>
        </div>
      </div>
    </section>
  );

  const renderActiveSection = () => {
    if (activeSection === "home") return renderHomeSection();
    if (activeSection === "queue") return renderQueueSection();
    if (activeSection === "alerts") return renderAlertsSection();
    if (activeSection === "history") return renderHistorySection();
    if (activeSection === "settings") return renderSettingsSection();
    if (activeSection === "accounts") return renderAccountsSection();
    return renderHomeSection();
  };

  return (
    <div className="qf-app-layout-drawer">
      {!sidebarOpen && (
        <button
          className="qf-hamburger"
          onClick={() => setSidebarOpen(true)}
          type="button"
          aria-label="Open menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      )}

      <aside className={`qf-drawer ${sidebarOpen ? "open" : ""}`}>
        <div className="qf-drawer-top">
          <div className="qf-drawer-brand">QueueFree</div>
          <button
            className="qf-drawer-close"
            onClick={() => setSidebarOpen(false)}
            type="button"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <div className="qf-drawer-user">
          {displayPhoto ? (
            <img src={displayPhoto} alt="Profile" className="qf-sidebar-photo" />
          ) : (
            <div className="qf-sidebar-avatar">
              {String(displayName).charAt(0).toUpperCase()}
            </div>
          )}

          <div>
            <strong>{displayName}</strong>
            <p>{userProfile?.email || "user@queuefree"}</p>
          </div>
        </div>

        <nav className="qf-drawer-nav">
          {menuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`qf-drawer-link ${activeSection === item.key ? "active" : ""}`}
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
          className="qf-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      <main className="qf-main-content-full">{renderActiveSection()}</main>
    </div>
  );
}

export default UserDashboard;