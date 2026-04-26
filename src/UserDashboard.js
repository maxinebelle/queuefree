import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import {
  collection,
  deleteDoc,
  doc,
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
const MAX_QUEUE_NUMBER = 999;

function UserDashboard() {
  const { currentUser } = useAuth();

  const [selectedDeptName, setSelectedDeptName] = useState("Registrar");
  const [departmentData, setDepartmentData] = useState({});
  const [myTickets, setMyTickets] = useState([]);
  const [allTickets, setAllTickets] = useState([]);
  const [staffWindows, setStaffWindows] = useState([]);
  const [officePredictionStats, setOfficePredictionStats] = useState([]);
  const [activeSection, setActiveSection] = useState("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [queueAlertsEnabled, setQueueAlertsEnabled] = useState(true);
  const [aiNotificationsEnabled, setAiNotificationsEnabled] = useState(true);
  const [systemAnnouncementsEnabled, setSystemAnnouncementsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [userProfile, setUserProfile] = useState(null);

  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editProfileImage, setEditProfileImage] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [selectedImageName, setSelectedImageName] = useState("");

  const [notificationFilter, setNotificationFilter] = useState("all");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [cancelLoadingId, setCancelLoadingId] = useState("");
  const [queueLoading, setQueueLoading] = useState(false);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [readNotificationIds, setReadNotificationIds] = useState([]);
  const [popupNotification, setPopupNotification] = useState(null);
  const [dismissedPopupIds, setDismissedPopupIds] = useState([]);

  const fileInputRef = useRef(null);
  const lastSoundPopupIdRef = useRef("");

  const notificationStorageKey = useMemo(() => {
    return currentUser?.uid ? `queuefree_notifications_read_${currentUser.uid}` : "";
  }, [currentUser]);

  useEffect(() => {
    const openSidebar = () => {
      setSidebarOpen(true);
    };

    window.addEventListener("queuefree-open-sidebar", openSidebar);

    return () => {
      window.removeEventListener("queuefree-open-sidebar", openSidebar);
    };
  }, []);

  useEffect(() => {
    if (!notificationStorageKey) {
      setReadNotificationIds([]);
      return;
    }

    try {
      const saved = localStorage.getItem(notificationStorageKey);

      if (saved) {
        const parsed = JSON.parse(saved);
        setReadNotificationIds(Array.isArray(parsed) ? parsed : []);
      } else {
        setReadNotificationIds([]);
      }
    } catch (error) {
      console.error("Failed to load notification read state:", error);
      setReadNotificationIds([]);
    }
  }, [notificationStorageKey]);

  useEffect(() => {
    if (!notificationStorageKey) return;

    try {
      localStorage.setItem(notificationStorageKey, JSON.stringify(readNotificationIds));
    } catch (error) {
      console.error("Failed to save notification read state:", error);
    }
  }, [notificationStorageKey, readNotificationIds]);

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
    const unsubscribe = onSnapshot(
      collection(db, "staff_windows"),
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));

        setStaffWindows(data);
      },
      (error) => {
        console.error("Staff windows listener error:", error);
        setStaffWindows([]);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "office_prediction_stats"),
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }));

        setOfficePredictionStats(data);
      },
      (error) => {
        console.error("Office prediction stats listener error:", error);
        setOfficePredictionStats([]);
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
            ) ||
            data.dept_name ||
            "Unknown";

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
    return myTickets.filter(
      (ticket) =>
        ticket.status !== "Done" &&
        ticket.status !== "Cancelled" &&
        ticket.status !== "Reset"
    );
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

  const currentLaneType = useMemo(() => {
    return effectiveLaneDetails.laneType;
  }, [effectiveLaneDetails]);

  const getPredictionStatDocId = (officeName, laneType) => {
    const safeOffice = String(officeName || "Office")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "");

    const safeLane = String(laneType || "Regular")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "");

    return `${safeOffice}_${safeLane}`;
  };

  const getActiveStaffWindowsByDept = (deptName) => {
    const windows = staffWindows
      .filter(
        (item) =>
          item.is_active === true &&
          (item.account_status || "active").toLowerCase() === "active" &&
          (item.office_assignment || "") === deptName &&
          (item.window_assignment || "").trim() !== ""
      )
      .map((item) => String(item.window_assignment || "").trim());

    return [...new Set(windows)].sort((a, b) => {
      const aNumber = Number(String(a).replace(/\D/g, "")) || 0;
      const bNumber = Number(String(b).replace(/\D/g, "")) || 0;
      return aNumber - bNumber;
    });
  };

  const getPredictionStats = (deptName, laneType) => {
    const docId = getPredictionStatDocId(deptName, laneType);

    const foundById = officePredictionStats.find((item) => item.id === docId);

    if (foundById) {
      return foundById;
    }

    const foundByFields = officePredictionStats.find(
      (item) =>
        (item.dept_name || "") === deptName &&
        (item.lane_type || "Regular") === laneType
    );

    if (foundByFields) {
      return foundByFields;
    }

    const dept = departmentData[deptName];
    const pendingCount = getLanePendingCountByDept(deptName);
    const avgServiceMinutes = Number(dept?.avg_service_time || 5);
    const activeWindows = Math.max(getActiveStaffWindowsByDept(deptName).length, 1);

    return {
      dept_name: deptName,
      lane_type: laneType,
      avg_service_minutes: avgServiceMinutes,
      active_windows: activeWindows,
      pending_count: pendingCount,
      predicted_wait_minutes: Math.ceil((pendingCount * avgServiceMinutes) / activeWindows),
      confidence_score: 0.65,
      prediction_method: "local fallback prediction",
      is_active: dept?.is_active !== false
    };
  };

  const getBestAssignedWindowForDept = (deptId, deptName, laneType) => {
    const activeWindows = getActiveStaffWindowsByDept(deptName);

    if (activeWindows.length === 0) {
      return "Window 1";
    }

    const activeStatuses = ["Pending", "Serving", "Paused"];

    const windowLoads = activeWindows.map((windowName) => {
      const activeCount = allTickets.filter(
        (ticket) =>
          ticket.dept_id === deptId &&
          activeStatuses.includes(ticket.status || "Pending") &&
          (ticket.lane_type || "Regular") === laneType &&
          (ticket.window_assignment || ticket.assigned_window || "") === windowName
      ).length;

      return {
        windowName,
        activeCount
      };
    });

    windowLoads.sort((a, b) => {
      if (a.activeCount !== b.activeCount) return a.activeCount - b.activeCount;

      const aNumber = Number(String(a.windowName).replace(/\D/g, "")) || 0;
      const bNumber = Number(String(b.windowName).replace(/\D/g, "")) || 0;
      return aNumber - bNumber;
    });

    return windowLoads[0]?.windowName || activeWindows[0] || "Window 1";
  };

  const getWindowDisplay = (ticket) => {
    if (!ticket) return "-";

    const assignedWindow =
      ticket.window_assignment ||
      ticket.assigned_window ||
      ticket.serving_window ||
      ticket.window ||
      "";

    if (assignedWindow) return assignedWindow;

    return "Window 1";
  };

  const getProceedInstruction = (ticket) => {
    if (!ticket) return "Please proceed to the assigned window when called.";

    const windowDisplay = getWindowDisplay(ticket);

    if (ticket.status === "Serving") {
      return `Please proceed to ${ticket.deptName} - ${windowDisplay}.`;
    }

    return `Please wait for your queue number. Your assigned service window is ${windowDisplay}.`;
  };

  const getDepartmentLaneQueue = (ticket) => {
    const laneType = ticket.lane_type || "Regular";

    const sameLaneTickets = allTickets.filter(
      (item) =>
        item.dept_id === ticket.dept_id &&
        item.status !== "Done" &&
        item.status !== "Cancelled" &&
        item.status !== "Reset" &&
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
    if (ticket.status === "Done") return 0;
    if (ticket.status === "Cancelled" || ticket.status === "Reset") return 0;
    if (ticket.status === "Serving") return 0;

    const orderedQueue = getDepartmentLaneQueue(ticket);
    const index = orderedQueue.findIndex((item) => item.id === ticket.id);

    if (index === -1) return "-";

    return index;
  };

  const getPeopleAfter = (ticket) => {
    if (ticket.status === "Done") return 0;
    if (ticket.status === "Cancelled" || ticket.status === "Reset") return 0;

    const orderedQueue = getDepartmentLaneQueue(ticket);
    const index = orderedQueue.findIndex((item) => item.id === ticket.id);

    if (index === -1) return "-";

    return orderedQueue.length - index - 1;
  };

  const getEstimatedWaitMinutesValue = (ticket) => {
    const laneType = ticket.lane_type || "Regular";
    const predictionStats = getPredictionStats(ticket.deptName, laneType);

    const dept = departmentData[ticket.deptName];
    const avgServiceTime = Number(
      predictionStats?.avg_service_minutes ||
        dept?.avg_service_time ||
        ticket.avg_service_time_snapshot ||
        0
    );

    const activeWindows = Math.max(Number(predictionStats?.active_windows || 1), 1);

    if (
      ticket.status === "Done" ||
      ticket.status === "Cancelled" ||
      ticket.status === "Reset"
    ) {
      if (
        ticket.initial_estimated_wait_min !== undefined &&
        ticket.initial_estimated_wait_min !== null
      ) {
        return Number(ticket.initial_estimated_wait_min || 0);
      }

      const initialAhead = Number(
        ticket.initial_people_ahead ?? Math.max((ticket.lane_number || 1) - 1, 0)
      );

      return Math.ceil((initialAhead * avgServiceTime) / activeWindows);
    }

    if (ticket.status === "Serving") return 0;

    const ahead = getPeopleAhead(ticket);
    if (typeof ahead !== "number") return 0;

    return Math.ceil((ahead * avgServiceTime) / activeWindows);
  };

  const getEstimatedWait = (ticket) => {
    const minutes = getEstimatedWaitMinutesValue(ticket);
    return `${minutes} min`;
  };

  const getNumbersBeforeTurn = (ticket) => {
    if (
      ticket.status === "Done" ||
      ticket.status === "Cancelled" ||
      ticket.status === "Reset"
    ) {
      return Number(
        ticket.initial_people_ahead ?? Math.max((ticket.lane_number || 1) - 1, 0)
      );
    }

    const ahead = getPeopleAhead(ticket);
    return ahead;
  };

  const getNumbersBeforeTurnLabel = (ticket) => {
    const beforeTurn = getNumbersBeforeTurn(ticket);

    if (ticket.status === "Serving") return "Your number is being served now.";
    if (ticket.status === "Done") return "This queue ticket has been completed.";
    if (ticket.status === "Cancelled") return "This queue ticket was cancelled.";
    if (ticket.status === "Reset") return "This queue ticket was cleared by reset.";

    if (typeof beforeTurn !== "number") return "Checking your queue position.";

    if (beforeTurn === 0) return "You are next in line.";
    if (beforeTurn === 1) return "1 queue number is before your turn.";

    return `${beforeTurn} queue numbers are before your turn.`;
  };

  const getDisplayStatus = (ticket) => {
    if (ticket.status === "Done") return "Done";
    if (ticket.status === "Serving") return "Serving";
    if (ticket.status === "Paused") return "Paused";
    if (ticket.status === "Cancelled") return "Cancelled";
    if (ticket.status === "Reset") return "Reset";
    return ticket.status || "Pending";
  };

  const getStatusClass = (ticket) => {
    const status = getDisplayStatus(ticket);

    if (status === "Serving") return "qf-status qf-status-serving";
    if (status === "Done") return "qf-status qf-status-done";
    if (status === "Paused") return "qf-status qf-status-paused";

    if (status === "Cancelled" || status === "Reset") {
      return "qf-status qf-status-done";
    }

    return "qf-status qf-status-pending";
  };

  const normalizeNowServingDisplay = (value) => {
    if (!value) return "-";

    const text = String(value).trim();

    if (text === "0") return "-";
    if (/^[A-Z]P?000$/i.test(text)) return "-";

    return text;
  };

  const getNowServingDisplay = (deptName, laneType) => {
    const dept = departmentData[deptName];
    if (!dept) return "-";

    if (laneType === "Priority") {
      return normalizeNowServingDisplay(dept.priority_now_serving_display);
    }

    return normalizeNowServingDisplay(dept.regular_now_serving_display);
  };

  const getPriorityLabel = () => {
    return effectiveLaneDetails.laneLabel;
  };

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
    const predictionStats = getPredictionStats(deptName, currentLaneType);

    if (
      predictionStats?.predicted_wait_minutes !== undefined &&
      predictionStats?.predicted_wait_minutes !== null
    ) {
      return `${Number(predictionStats.predicted_wait_minutes || 0)} min`;
    }

    const dept = departmentData[deptName];
    if (!dept) return "-";

    const pendingCount = getLanePendingCountByDept(deptName);
    const avgTime = dept.avg_service_time || 0;

    return `${pendingCount * avgTime} min`;
  };

  const getAiMethodLabel = (deptName, laneType) => {
    const predictionStats = getPredictionStats(deptName, laneType);
    return predictionStats?.prediction_method || "rule-based queue prediction";
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

      if (selectedDept.is_active === false) {
        alert(`${selectedDeptName} is currently inactive. Please select another office.`);
        return;
      }

      const ticketResult = await runTransaction(db, async (transaction) => {
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
        const effectivePriority = requestedPriority && priorityStatus === "approved";

        const priorityType = effectivePriority
          ? userData.priority_type || "Priority"
          : "Regular";

        const laneType = effectivePriority ? "Priority" : "Regular";

        const assignedWindow = getBestAssignedWindowForDept(
          selectedDept.id,
          selectedDeptName,
          laneType
        );

        const laneLastField = effectivePriority
          ? "priority_last_number"
          : "regular_last_number";

        const currentLaneLast = Number(deptData[laneLastField] || 0);
        const nextLaneNumber =
          currentLaneLast >= MAX_QUEUE_NUMBER ? 1 : currentLaneLast + 1;

        const prefix =
          deptData.queue_prefix || selectedDeptName.charAt(0).toUpperCase();

        const formattedNumber = effectivePriority
          ? `${prefix}P${String(nextLaneNumber).padStart(3, "0")}`
          : `${prefix}${String(nextLaneNumber).padStart(3, "0")}`;

        const predictionStats = getPredictionStats(selectedDeptName, laneType);
        const avgServiceTime = Number(
          predictionStats?.avg_service_minutes || deptData.avg_service_time || 0
        );

        const activeWindows = Math.max(Number(predictionStats?.active_windows || 1), 1);

        const sameLaneActiveCount = allTickets.filter(
          (ticket) =>
            ticket.dept_id === selectedDept.id &&
            ticket.status !== "Done" &&
            ticket.status !== "Cancelled" &&
            ticket.status !== "Reset" &&
            (ticket.lane_type || "Regular") === laneType
        ).length;

        const initialPeopleAhead = Math.max(sameLaneActiveCount, 0);
        const initialEstimatedWaitMin = Math.ceil(
          (initialPeopleAhead * avgServiceTime) / activeWindows
        );

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
          initial_people_ahead: initialPeopleAhead,
          initial_estimated_wait_min: initialEstimatedWaitMin,
          avg_service_time_snapshot: avgServiceTime,
          ai_prediction_method_snapshot:
            predictionStats?.prediction_method || "rule-based queue prediction",
          ai_confidence_snapshot: Number(predictionStats?.confidence_score || 0.65),
          active_windows_snapshot: activeWindows,
          window_assignment: assignedWindow,
          assigned_window: assignedWindow,
          created_at: serverTimestamp()
        });

        return {
          ticketNumber: formattedNumber,
          laneType,
          priorityType,
          assignedWindow,
          initialPeopleAhead,
          initialEstimatedWaitMin
        };
      });

      const requestedPriority = userProfile?.is_priority === true;
      const priorityStatus = String(userProfile?.priority_status || "").toLowerCase();

      if (requestedPriority && priorityStatus === "pending") {
        alert(
          `Queue Number for ${selectedDeptName}: ${ticketResult.ticketNumber}\n\nLane: Regular\nAssigned Window: ${ticketResult.assignedWindow}\nAI Estimated Wait: ${ticketResult.initialEstimatedWaitMin} min\n\nYour priority request is still pending verification, so you were queued under the Regular lane.`
        );
      } else if (requestedPriority && priorityStatus === "rejected") {
        alert(
          `Queue Number for ${selectedDeptName}: ${ticketResult.ticketNumber}\n\nLane: Regular\nAssigned Window: ${ticketResult.assignedWindow}\nAI Estimated Wait: ${ticketResult.initialEstimatedWaitMin} min\n\nYour priority request was rejected, so you were queued under the Regular lane.`
        );
      } else {
        alert(
          `Queue Number for ${selectedDeptName}: ${ticketResult.ticketNumber}\n\nLane: ${ticketResult.laneType}\nAssigned Window: ${ticketResult.assignedWindow}\nAI Estimated Wait: ${ticketResult.initialEstimatedWaitMin} min`
        );
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

  const formatTimestampLabel = (value) => {
    if (value?.toDate) {
      return value.toDate().toLocaleString();
    }

    if (value?.seconds) {
      return new Date(value.seconds * 1000).toLocaleString();
    }

    return "Live";
  };

  const isRecentTicket = (ticket) => {
    if (!ticket?.created_at?.seconds) return false;

    const nowSeconds = Math.floor(Date.now() / 1000);

    return nowSeconds - ticket.created_at.seconds <= 900;
  };

  const playNotificationSound = () => {
    if (!soundEnabled) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const audioContext = new AudioContext();
      const oscillatorOne = audioContext.createOscillator();
      const oscillatorTwo = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillatorOne.type = "sine";
      oscillatorTwo.type = "triangle";

      oscillatorOne.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillatorOne.frequency.setValueAtTime(660, audioContext.currentTime + 0.12);

      oscillatorTwo.frequency.setValueAtTime(1320, audioContext.currentTime);
      oscillatorTwo.frequency.setValueAtTime(990, audioContext.currentTime + 0.12);

      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.22, audioContext.currentTime + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.42);

      oscillatorOne.connect(gainNode);
      oscillatorTwo.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillatorOne.start(audioContext.currentTime);
      oscillatorTwo.start(audioContext.currentTime + 0.04);

      oscillatorOne.stop(audioContext.currentTime + 0.42);
      oscillatorTwo.stop(audioContext.currentTime + 0.42);
    } catch (error) {
      console.warn("Notification sound blocked by browser until user interacts:", error);
    }
  };

  const buildAiQueueMessage = (ticket, ahead, wait) => {
    const windowDisplay = getWindowDisplay(ticket);
    const laneType = ticket.lane_type || "Regular";
    const method = getAiMethodLabel(ticket.deptName, laneType);

    if (ticket.status === "Serving") {
      return `AI prediction: your queue number ${ticket.ticket_number} is now active in ${ticket.deptName}. Please proceed to ${windowDisplay}.`;
    }

    if (typeof ahead !== "number") {
      return `AI prediction is still checking the live queue flow for ${ticket.deptName}.`;
    }

    if (ahead === 0) {
      return `AI prediction: your turn is about to be called in ${ticket.deptName}. Please stay ready. Your assigned window is ${windowDisplay}.`;
    }

    if (ahead === 1) {
      return `AI prediction: only 1 queue number is before your turn in ${ticket.deptName}. Estimated wait is ${wait}. Your assigned window is ${windowDisplay}.`;
    }

    if (ahead <= 5) {
      return `AI prediction: your turn is approaching. ${ahead} queue numbers are still before your turn in ${ticket.deptName}. Estimated wait is ${wait}. Your assigned window is ${windowDisplay}.`;
    }

    return `AI prediction: ${ahead} queue numbers are still before your turn in ${ticket.deptName}. Estimated wait is ${wait}. Method: ${method}.`;
  };

  const generatedNotifications = useMemo(() => {
    const notifications = [];

    activeTickets.forEach((ticket) => {
      const ahead = getPeopleAhead(ticket);
      const after = getPeopleAfter(ticket);
      const wait = getEstimatedWait(ticket);
      const status = getDisplayStatus(ticket);
      const laneType = ticket.lane_type || "Regular";
      const nowServing = getNowServingDisplay(ticket.deptName, laneType);
      const windowDisplay = getWindowDisplay(ticket);
      const proceedInstruction = getProceedInstruction(ticket);

      if (queueAlertsEnabled && status === "Serving") {
        notifications.push({
          id: `${ticket.id}-turn`,
          category: "queue",
          type: "turn",
          title: "It's Your Turn!",
          message: `Your queue number ${ticket.ticket_number} in ${ticket.deptName} is now being called. ${proceedInstruction}`,
          time: "Live",
          hasMetrics: true,
          popupEligible: true,
          ticketNumber: ticket.ticket_number,
          deptName: ticket.deptName,
          laneType,
          nowServing,
          assignedWindow: windowDisplay,
          numbersBeforeTurn: ahead,
          numbersBeforeTurnLabel: getNumbersBeforeTurnLabel(ticket),
          afterYou: after,
          estimatedWait: wait,
          popupPriority: 1
        });
      } else if (queueAlertsEnabled && typeof ahead === "number" && ahead === 1) {
        notifications.push({
          id: `${ticket.id}-next`,
          category: "queue",
          type: "next",
          title: "You're Next",
          message: `Only 1 queue number is before your turn in ${ticket.deptName}. Current now serving is ${nowServing}. Your number is ${ticket.ticket_number}. Assigned window: ${windowDisplay}.`,
          time: "Live",
          hasMetrics: true,
          popupEligible: true,
          ticketNumber: ticket.ticket_number,
          deptName: ticket.deptName,
          laneType,
          nowServing,
          assignedWindow: windowDisplay,
          numbersBeforeTurn: ahead,
          numbersBeforeTurnLabel: getNumbersBeforeTurnLabel(ticket),
          afterYou: after,
          estimatedWait: wait,
          popupPriority: 2
        });
      } else if (queueAlertsEnabled && typeof ahead === "number" && ahead <= 5) {
        notifications.push({
          id: `${ticket.id}-warning`,
          category: "queue",
          type: "warning",
          title: "Your Turn Is Approaching",
          message: `${ahead} queue number${ahead === 1 ? "" : "s"} ${
            ahead === 1 ? "is" : "are"
          } before your turn in ${ticket.deptName}. Please get ready. Assigned window: ${windowDisplay}.`,
          time: "Live",
          hasMetrics: true,
          popupEligible: true,
          ticketNumber: ticket.ticket_number,
          deptName: ticket.deptName,
          laneType,
          nowServing,
          assignedWindow: windowDisplay,
          numbersBeforeTurn: ahead,
          numbersBeforeTurnLabel: getNumbersBeforeTurnLabel(ticket),
          afterYou: after,
          estimatedWait: wait,
          popupPriority: 3
        });
      }

      if (aiNotificationsEnabled) {
        notifications.push({
          id: `${ticket.id}-ai-progress`,
          category: "queue",
          type: "ai",
          title: "AI Queue Prediction",
          message: buildAiQueueMessage(ticket, ahead, wait),
          time: "Live",
          hasMetrics: typeof ahead === "number",
          popupEligible: false,
          ticketNumber: ticket.ticket_number,
          deptName: ticket.deptName,
          laneType,
          nowServing,
          assignedWindow: windowDisplay,
          numbersBeforeTurn: ahead,
          numbersBeforeTurnLabel: getNumbersBeforeTurnLabel(ticket),
          afterYou: after,
          estimatedWait: wait,
          popupPriority: 5
        });
      }

      if (systemAnnouncementsEnabled && isRecentTicket(ticket)) {
        notifications.push({
          id: `${ticket.id}-created`,
          category: "system",
          type: "system",
          title: "Queue Number Generated",
          message: `Your queue number ${ticket.ticket_number} for ${ticket.deptName} has been created successfully. Assigned window: ${windowDisplay}. AI estimated wait: ${getEstimatedWait(ticket)}.`,
          time: formatTimestampLabel(ticket.created_at),
          hasMetrics: true,
          popupEligible: false,
          ticketNumber: ticket.ticket_number,
          deptName: ticket.deptName,
          laneType,
          nowServing,
          assignedWindow: windowDisplay,
          numbersBeforeTurn: getPeopleAhead(ticket),
          numbersBeforeTurnLabel: getNumbersBeforeTurnLabel(ticket),
          afterYou: getPeopleAfter(ticket),
          estimatedWait: getEstimatedWait(ticket),
          popupPriority: 6
        });
      }
    });

    if (
      systemAnnouncementsEnabled &&
      userProfile?.is_priority === true &&
      (userProfile?.priority_status || "").toLowerCase() === "pending"
    ) {
      notifications.push({
        id: "priority-pending-status",
        category: "system",
        type: "system",
        title: "Priority Request Pending",
        message:
          "Your priority request is still under review. Until approved, your queue lane remains under Regular.",
        time: "Live",
        hasMetrics: false,
        popupEligible: false,
        popupPriority: 6
      });
    }

    if (
      systemAnnouncementsEnabled &&
      userProfile?.is_priority === true &&
      (userProfile?.priority_status || "").toLowerCase() === "approved"
    ) {
      notifications.push({
        id: "priority-approved-status",
        category: "system",
        type: "system",
        title: "Priority Request Approved",
        message:
          "Your priority request has been approved. You may now use the Priority lane when joining a queue.",
        time: "Live",
        hasMetrics: false,
        popupEligible: false,
        popupPriority: 6
      });
    }

    if (
      systemAnnouncementsEnabled &&
      userProfile?.is_priority === true &&
      (userProfile?.priority_status || "").toLowerCase() === "rejected"
    ) {
      notifications.push({
        id: "priority-rejected-status",
        category: "system",
        type: "system",
        title: "Priority Request Rejected",
        message:
          "Your priority request was rejected, so your queue access remains under the Regular lane.",
        time: "Live",
        hasMetrics: false,
        popupEligible: false,
        popupPriority: 6
      });
    }

    if (aiNotificationsEnabled) {
      const officeWait = getOfficeEstimatedWait(selectedDeptName);
      const officeQueue = getLanePendingCountByDept(selectedDeptName);
      const predictionStats = getPredictionStats(selectedDeptName, currentLaneType);

      notifications.push({
        id: `ai-best-time-${selectedDeptName}-${currentLaneType}`,
        category: "system",
        type: "ai",
        title: "AI Queue Insight",
        message:
          officeQueue === 0
            ? `AI prediction: ${selectedDeptName} currently has no waiting users in the ${currentLaneType} lane. This is a good time to go now.`
            : `AI prediction: ${selectedDeptName} currently has ${officeQueue} waiting ${
                officeQueue === 1 ? "person" : "people"
              } in the ${currentLaneType} lane. Estimated wait is ${officeWait}. Active windows: ${
                predictionStats.active_windows || 1
              }.`,
        time: "Live",
        hasMetrics: false,
        popupEligible: false,
        popupPriority: 7
      });
    }

    notifications.sort((a, b) => {
      const aPriority = a.popupPriority || 99;
      const bPriority = b.popupPriority || 99;
      return aPriority - bPriority;
    });

    return notifications;
  }, [
    activeTickets,
    userProfile,
    selectedDeptName,
    currentLaneType,
    queueAlertsEnabled,
    aiNotificationsEnabled,
    systemAnnouncementsEnabled,
    departmentData,
    allTickets,
    officePredictionStats,
    staffWindows
  ]);

  const filteredNotifications = useMemo(() => {
    if (notificationFilter === "all") return generatedNotifications;

    return generatedNotifications.filter(
      (notificationItem) => notificationItem.category === notificationFilter
    );
  }, [generatedNotifications, notificationFilter]);

  const unreadNotificationCount = useMemo(() => {
    return generatedNotifications.filter(
      (notificationItem) => !readNotificationIds.includes(notificationItem.id)
    ).length;
  }, [generatedNotifications, readNotificationIds]);

  useEffect(() => {
    if (activeSection === "notifications") {
      setPopupNotification(null);
      return;
    }

    const nextPopup = generatedNotifications.find(
      (item) =>
        item.popupEligible === true &&
        !readNotificationIds.includes(item.id) &&
        !dismissedPopupIds.includes(item.id)
    );

    if (nextPopup) {
      setPopupNotification(nextPopup);
    }
  }, [generatedNotifications, readNotificationIds, dismissedPopupIds, activeSection]);

  useEffect(() => {
    if (!popupNotification) return;
    if (activeSection === "notifications") return;

    if (lastSoundPopupIdRef.current !== popupNotification.id) {
      lastSoundPopupIdRef.current = popupNotification.id;
      playNotificationSound();
    }
  }, [popupNotification, activeSection, soundEnabled]);

  const markNotificationAsRead = (notificationId) => {
    if (!notificationId) return;

    setReadNotificationIds((prev) => {
      if (prev.includes(notificationId)) return prev;
      return [...prev, notificationId];
    });

    if (popupNotification?.id === notificationId) {
      setPopupNotification(null);
    }
  };

  const markAllNotificationsAsRead = () => {
    setReadNotificationIds(generatedNotifications.map((item) => item.id));
    setPopupNotification(null);
  };

  const dismissPopupNotification = () => {
    if (!popupNotification?.id) {
      setPopupNotification(null);
      return;
    }

    setDismissedPopupIds((prev) => {
      if (prev.includes(popupNotification.id)) return prev;
      return [...prev, popupNotification.id];
    });

    setPopupNotification(null);
  };

  const filteredHistory = useMemo(() => {
    if (historyFilter === "all") return myTickets;

    if (historyFilter === "active") {
      return myTickets.filter(
        (ticket) =>
          ticket.status !== "Done" &&
          ticket.status !== "Cancelled" &&
          ticket.status !== "Reset"
      );
    }

    if (historyFilter === "completed") {
      return myTickets.filter(
        (ticket) =>
          ticket.status === "Done" ||
          ticket.status === "Cancelled" ||
          ticket.status === "Reset"
      );
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
    { key: "notifications", label: "Notifications", badge: unreadNotificationCount },
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

  const renderWindowBox = (ticket) => (
    <div className="qf-live-metric-box qf-window-highlight-box">
      <span>Assigned Window</span>
      <strong>{getWindowDisplay(ticket)}</strong>
    </div>
  );

  const renderHomeSection = () => (
    <>
      <section className="qf-top-hero">
        <div className="qf-greeting">
          <div className="qf-mini-brand">QUEUEFREE • UCLM</div>

          <h1>Hello, {displayName}</h1>
          <p>
            Monitor your queue in real time based on your assigned lane. This dashboard
            shows exactly how many queue numbers are before your turn and which window
            to proceed to when called.
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
            <span>Notifications</span>
            <strong>{unreadNotificationCount}</strong>
          </div>
        </div>
      </section>

      {primaryLiveTicket ? (
        <section className="qf-panel-v2">
          <div className="qf-panel-head">
            <div>
              <h2>My Live Queue Status</h2>
              <p>Real-time status for your current active ticket based on your own lane.</p>
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

            <div className="qf-live-instruction-card">
              <span>Where to Go</span>
              <strong>{getProceedInstruction(primaryLiveTicket)}</strong>
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

              {renderWindowBox(primaryLiveTicket)}

              <div className="qf-live-metric-box">
                <span>Queue Numbers Before Turn</span>
                <strong>{getPeopleAhead(primaryLiveTicket)}</strong>
              </div>

              <div className="qf-live-metric-box">
                <span>People After You</span>
                <strong>{getPeopleAfter(primaryLiveTicket)}</strong>
              </div>

              <div className="qf-live-metric-box">
                <span>AI Est. Wait</span>
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
              const predictionStats = getPredictionStats(deptName, currentLaneType);

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
                      <span>AI Est. Wait</span>
                      <strong>{estimated}</strong>
                    </div>

                    <div className="qf-office-mini-info">
                      <span>Active Windows</span>
                      <strong>{predictionStats.active_windows || 1}</strong>
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
                <p>Suggested best time based on queue load, service speed, and active windows.</p>
              </div>
            </div>

            <div className="qf-ai-card">
              <div className="qf-ai-badge">AI</div>
              <p>
                {getLanePendingCountByDept(selectedDeptName) === 0 ? (
                  <>
                    AI predicts that <strong>{selectedDeptName}</strong> is currently clear for the{" "}
                    <strong>{currentLaneType}</strong> lane. This is a good time to go now.
                  </>
                ) : (
                  <>
                    AI predicts that <strong>{selectedDeptName}</strong> currently has{" "}
                    <strong>{getLanePendingCountByDept(selectedDeptName)}</strong> waiting{" "}
                    {getLanePendingCountByDept(selectedDeptName) === 1 ? "person" : "people"} in the{" "}
                    <strong>{currentLaneType}</strong> lane, with an estimated wait of{" "}
                    <strong>{getOfficeEstimatedWait(selectedDeptName)}</strong>.
                  </>
                )}
              </p>

              <p>
                Method:{" "}
                <strong>{getAiMethodLabel(selectedDeptName, currentLaneType)}</strong>
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
                  <div
                    key={ticket.id}
                    className="qf-compact-ticket-item qf-compact-ticket-item-stack"
                  >
                    <div className="qf-compact-ticket-top">
                      <div>
                        <h3>{ticket.deptName}</h3>
                        <p>
                          {ticket.ticket_number} • {ticket.lane_type || "Regular"} Lane
                        </p>
                      </div>

                      <span className={getStatusClass(ticket)}>
                        {getDisplayStatus(ticket)}
                      </span>
                    </div>

                    <div className="qf-compact-info-grid">
                      <div>
                        <span>Assigned Window</span>
                        <strong>{getWindowDisplay(ticket)}</strong>
                      </div>

                      <div>
                        <span>Queue Position</span>
                        <strong>{getNumbersBeforeTurnLabel(ticket)}</strong>
                      </div>

                      <div>
                        <span>AI Estimated Wait</span>
                        <strong>{getEstimatedWait(ticket)}</strong>
                      </div>
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

  const renderNotificationMetrics = (notificationItem) => {
    if (!notificationItem.hasMetrics) return null;

    return (
      <div className="qf-notification-meta-grid">
        <div className="qf-notification-meta-box">
          <span>Ticket</span>
          <strong>{notificationItem.ticketNumber}</strong>
        </div>

        <div className="qf-notification-meta-box">
          <span>Office</span>
          <strong>{notificationItem.deptName || "-"}</strong>
        </div>

        <div className="qf-notification-meta-box">
          <span>Lane</span>
          <strong>{notificationItem.laneType || "-"}</strong>
        </div>

        <div className="qf-notification-meta-box">
          <span>Assigned Window</span>
          <strong>{notificationItem.assignedWindow || "-"}</strong>
        </div>

        <div className="qf-notification-meta-box">
          <span>Now Serving</span>
          <strong>{notificationItem.nowServing}</strong>
        </div>

        <div className="qf-notification-meta-box">
          <span>Queue Position</span>
          <strong>{notificationItem.numbersBeforeTurnLabel}</strong>
        </div>

        <div className="qf-notification-meta-box">
          <span>After You</span>
          <strong>{notificationItem.afterYou}</strong>
        </div>

        <div className="qf-notification-meta-box">
          <span>AI Est. Wait</span>
          <strong>{notificationItem.estimatedWait}</strong>
        </div>
      </div>
    );
  };

  const renderNotificationsSection = () => (
    <section className="qf-panel-v2">
      <div className="qf-notification-head-row">
        <div className="qf-panel-head qf-panel-head-no-margin">
          <div>
            <h2>Notifications</h2>
            <p>Important alerts, AI queue predictions, and system updates appear here.</p>
          </div>
        </div>

        <button
          type="button"
          className="qf-mark-read-btn"
          onClick={markAllNotificationsAsRead}
        >
          Mark all read
        </button>
      </div>

      <div className="qf-notification-filter-row">
        <button
          type="button"
          className={`qf-notification-filter-pill ${
            notificationFilter === "all" ? "active" : ""
          }`}
          onClick={() => setNotificationFilter("all")}
        >
          All
        </button>

        <button
          type="button"
          className={`qf-notification-filter-pill ${
            notificationFilter === "queue" ? "active" : ""
          }`}
          onClick={() => setNotificationFilter("queue")}
        >
          Queue
        </button>

        <button
          type="button"
          className={`qf-notification-filter-pill ${
            notificationFilter === "system" ? "active" : ""
          }`}
          onClick={() => setNotificationFilter("system")}
        >
          System
        </button>
      </div>

      <div className="qf-notification-list">
        {filteredNotifications.length === 0 ? (
          <div className="qf-empty-state-v2">
            <div className="qf-empty-title">No notifications</div>
            <p>Your queue updates will appear here.</p>
          </div>
        ) : (
          filteredNotifications.map((notificationItem) => {
            const isRead = readNotificationIds.includes(notificationItem.id);

            return (
              <button
                key={notificationItem.id}
                type="button"
                className={`qf-notification-card qf-notification-${notificationItem.type} ${
                  isRead ? "read" : "unread"
                }`}
                onClick={() => markNotificationAsRead(notificationItem.id)}
              >
                <div className="qf-notification-card-top">
                  <div className="qf-notification-title-wrap">
                    <div className={`qf-notification-dot ${isRead ? "read" : ""}`}></div>

                    <div>
                      <h3>{notificationItem.title}</h3>
                      <p>{notificationItem.message}</p>
                    </div>
                  </div>

                  <span className="qf-notification-time">{notificationItem.time}</span>
                </div>

                {renderNotificationMetrics(notificationItem)}
              </button>
            );
          })
        )}
      </div>
    </section>
  );

  const renderHistorySection = () => (
    <section className="qf-panel-v2">
      <div className="qf-panel-head">
        <div>
          <h2>History</h2>
          <p>Track your past and current queue activities with complete queue details.</p>
        </div>
      </div>

      <div className="qf-notification-filter-row">
        <button
          type="button"
          className={`qf-notification-filter-pill ${historyFilter === "all" ? "active" : ""}`}
          onClick={() => setHistoryFilter("all")}
        >
          All
        </button>

        <button
          type="button"
          className={`qf-notification-filter-pill ${
            historyFilter === "active" ? "active" : ""
          }`}
          onClick={() => setHistoryFilter("active")}
        >
          Active
        </button>

        <button
          type="button"
          className={`qf-notification-filter-pill ${
            historyFilter === "completed" ? "active" : ""
          }`}
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
                  <p>
                    {ticket.ticket_number} • {ticket.lane_type || "Regular"} Lane
                  </p>
                </div>

                <span className={getStatusClass(ticket)}>{getDisplayStatus(ticket)}</span>
              </div>

              <div className="qf-history-instruction">
                <span>Queue Position Details</span>
                <strong>{getNumbersBeforeTurnLabel(ticket)}</strong>
              </div>

              <div className="qf-history-meta">
                <div>
                  <span>Office</span>
                  <strong>{ticket.deptName}</strong>
                </div>

                <div>
                  <span>Queue Number</span>
                  <strong>{ticket.ticket_number}</strong>
                </div>

                <div>
                  <span>Lane</span>
                  <strong>{ticket.lane_type || "Regular"}</strong>
                </div>

                <div>
                  <span>Assigned Window</span>
                  <strong>{getWindowDisplay(ticket)}</strong>
                </div>

                <div>
                  <span>Queue Numbers Before Turn</span>
                  <strong>{getNumbersBeforeTurn(ticket)}</strong>
                </div>

                <div>
                  <span>People After You</span>
                  <strong>{getPeopleAfter(ticket)}</strong>
                </div>

                <div>
                  <span>AI Estimated Wait</span>
                  <strong>{getEstimatedWait(ticket)}</strong>
                </div>

                <div>
                  <span>Now Serving</span>
                  <strong>
                    {getNowServingDisplay(ticket.deptName, ticket.lane_type || "Regular")}
                  </strong>
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

                <div>
                  <span>Called</span>
                  <strong>
                    {ticket.called_at?.toDate
                      ? ticket.called_at.toDate().toLocaleString()
                      : ticket.called_at?.seconds
                      ? new Date(ticket.called_at.seconds * 1000).toLocaleString()
                      : "-"}
                  </strong>
                </div>

                <div>
                  <span>Completed</span>
                  <strong>
                    {ticket.completed_at?.toDate
                      ? ticket.completed_at.toDate().toLocaleString()
                      : ticket.completed_at?.seconds
                      ? new Date(ticket.completed_at.seconds * 1000).toLocaleString()
                      : "-"}
                  </strong>
                </div>
              </div>

              {ticket.status !== "Done" &&
                ticket.status !== "Serving" &&
                ticket.status !== "Cancelled" &&
                ticket.status !== "Reset" && (
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
            <p>Receive important notifications when your turn gets closer in the queue.</p>
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
            <strong>AI Notifications</strong>
            <p>Receive AI-based predictions inside the notifications panel.</p>
          </div>

          <label className="qf-switch">
            <input
              type="checkbox"
              checked={aiNotificationsEnabled}
              onChange={() => setAiNotificationsEnabled((prev) => !prev)}
            />
            <span className="qf-slider"></span>
          </label>
        </div>

        <div className="qf-setting-card">
          <div>
            <strong>System Announcements</strong>
            <p>Show general queue creation and priority status announcements.</p>
          </div>

          <label className="qf-switch">
            <input
              type="checkbox"
              checked={systemAnnouncementsEnabled}
              onChange={() => setSystemAnnouncementsEnabled((prev) => !prev)}
            />
            <span className="qf-slider"></span>
          </label>
        </div>

        <div className="qf-setting-card">
          <div>
            <strong>Sound Notifications</strong>
            <p>Play a short alert sound when an important popup notification appears.</p>
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
            id="account-profile-image"
            name="account-profile-image"
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
    if (activeSection === "notifications") return renderNotificationsSection();
    if (activeSection === "history") return renderHistorySection();
    if (activeSection === "settings") return renderSettingsSection();
    if (activeSection === "accounts") return renderAccountsSection();

    return renderHomeSection();
  };

  return (
    <div className="qf-app-layout-drawer">
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
              <span className="qf-menu-link-content">
                <span>{item.label}</span>

                {item.badge > 0 && <span className="qf-menu-badge">{item.badge}</span>}
              </span>
            </button>
          ))}
        </nav>
      </aside>

      {sidebarOpen && (
        <div className="qf-sidebar-overlay" onClick={() => setSidebarOpen(false)}></div>
      )}

      {popupNotification && activeSection !== "notifications" && (
        <div className="qf-ai-popup">
          <div className={`qf-ai-popup-card qf-notification-${popupNotification.type}`}>
            <button
              type="button"
              className="qf-ai-popup-close"
              onClick={dismissPopupNotification}
              aria-label="Close notification"
            >
              ✕
            </button>

            <div className="qf-ai-popup-left">
              <div className="qf-ai-popup-badge">
                {popupNotification.type === "turn" ? "NOW" : "ALERT"}
              </div>

              <div>
                <h3>{popupNotification.title}</h3>
                <p>{popupNotification.message}</p>
              </div>
            </div>

            {popupNotification.hasMetrics && (
              <div className="qf-ai-popup-mini-grid">
                <div className="qf-ai-popup-mini-box">
                  <span>Ticket</span>
                  <strong>{popupNotification.ticketNumber}</strong>
                </div>

                <div className="qf-ai-popup-mini-box">
                  <span>Window</span>
                  <strong>{popupNotification.assignedWindow}</strong>
                </div>

                <div className="qf-ai-popup-mini-box">
                  <span>Before Turn</span>
                  <strong>{popupNotification.numbersBeforeTurn}</strong>
                </div>

                <div className="qf-ai-popup-mini-box">
                  <span>AI Est. Wait</span>
                  <strong>{popupNotification.estimatedWait}</strong>
                </div>
              </div>
            )}

            <div className="qf-ai-popup-actions">
              <button
                type="button"
                className="qf-ai-popup-primary"
                onClick={() => {
                  setActiveSection("notifications");
                  markNotificationAsRead(popupNotification.id);
                }}
              >
                View Details
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="qf-main-content-full">{renderActiveSection()}</main>
    </div>
  );
}

export default UserDashboard;