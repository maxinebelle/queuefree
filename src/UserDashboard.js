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
    const dept = departmentData[ticket.deptName];
    const avgServiceTime = Number(
      dept?.avg_service_time || ticket.avg_service_time_snapshot || 0
    );

    if (
      ticket.initial_estimated_wait_min !== undefined &&
      ticket.initial_estimated_wait_min !== null
    ) {
      return Number(ticket.initial_estimated_wait_min || 0);
    }

    if (
      ticket.status === "Done" ||
      ticket.status === "Cancelled" ||
      ticket.status === "Reset"
    ) {
      const initialAhead = Number(
        ticket.initial_people_ahead ?? Math.max((ticket.lane_number || 1) - 1, 0)
      );

      return initialAhead * avgServiceTime;
    }

    if (ticket.status === "Serving") return 0;

    const ahead = getPeopleAhead(ticket);
    if (typeof ahead !== "number") return 0;

    return ahead * avgServiceTime;
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
        const effectivePriority = requestedPriority && priorityStatus === "approved";

        const priorityType = effectivePriority
          ? userData.priority_type || "Priority"
          : "Regular";

        const laneType = effectivePriority ? "Priority" : "Regular";

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

        const avgServiceTime = Number(deptData.avg_service_time || 0);
        const initialPeopleAhead = Math.max(nextLaneNumber - 1, 0);
        const initialEstimatedWaitMin = initialPeopleAhead * avgServiceTime;

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
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(660, audioContext.currentTime + 0.12);

      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.35);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.38);
    } catch (error) {
      console.warn("Notification sound blocked by browser until user interacts:", error);
    }
  };

  const buildAiQueueMessage = (ticket, ahead, wait) => {
    if (ticket.status === "Serving") {
      return `AI prediction: your queue number ${ticket.ticket_number} is now active in ${ticket.deptName}. Please proceed to the office now.`;
    }

    if (typeof ahead !== "number") {
      return `AI prediction is still checking the live queue flow for ${ticket.deptName}.`;
    }

    if (ahead === 0) {
      return `AI prediction: your turn is about to be called in ${ticket.deptName}. Please stay near the office now.`;
    }

    if (ahead === 1) {
      return `AI prediction: only 1 queue number is before your turn in ${ticket.deptName}. Please standby near the office.`;
    }

    if (ahead <= 4) {
      return `AI prediction: your turn is approaching. ${ahead} queue numbers are still before your turn in ${ticket.deptName}. Estimated wait is ${wait}.`;
    }

    return `AI prediction: queue movement in ${ticket.deptName} is stable. ${ahead} queue numbers are still before your turn. Estimated wait is ${wait}.`;
  };

  const generatedNotifications = useMemo(() => {
    const notifications = [];

    activeTickets.forEach((ticket) => {
      const ahead = getPeopleAhead(ticket);
      const after = getPeopleAfter(ticket);
      const wait = getEstimatedWait(ticket);
      const status = getDisplayStatus(ticket);
      const nowServing = getNowServingDisplay(
        ticket.deptName,
        ticket.lane_type || "Regular"
      );

      if (queueAlertsEnabled && status === "Serving") {
        notifications.push({
          id: `${ticket.id}-turn`,
          category: "queue",
          type: "turn",
          title: "It's Your Turn!",
          message: `Your queue number ${ticket.ticket_number} in ${ticket.deptName} is now being called. Please proceed to the assigned office.`,
          time: "Live",
          hasMetrics: true,
          ticketNumber: ticket.ticket_number,
          nowServing,
          numbersBeforeTurn: ahead,
          afterYou: after,
          estimatedWait: wait,
          popupPriority: 1
        });
      } else if (queueAlertsEnabled && typeof ahead === "number" && ahead === 1) {
        notifications.push({
          id: `${ticket.id}-next`,
          category: "queue",
          type: "next",
          title: "Queue Update",
          message: `You're next. Current now serving is ${nowServing || "-"} and your number is ${ticket.ticket_number}.`,
          time: "Live",
          hasMetrics: true,
          ticketNumber: ticket.ticket_number,
          nowServing,
          numbersBeforeTurn: ahead,
          afterYou: after,
          estimatedWait: wait,
          popupPriority: 2
        });
      } else if (queueAlertsEnabled && typeof ahead === "number" && ahead <= 3) {
        notifications.push({
          id: `${ticket.id}-warning`,
          category: "queue",
          type: "warning",
          title: "Queue Update",
          message: `Only ${ahead} queue ${ahead === 1 ? "number is" : "numbers are"} before your turn in ${ticket.deptName}. Please get ready.`,
          time: "Live",
          hasMetrics: true,
          ticketNumber: ticket.ticket_number,
          nowServing,
          numbersBeforeTurn: ahead,
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
          ticketNumber: ticket.ticket_number,
          nowServing,
          numbersBeforeTurn: ahead,
          afterYou: after,
          estimatedWait: wait,
          popupPriority:
            status === "Serving" || (typeof ahead === "number" && ahead <= 4) ? 2 : 5
        });
      }

      if (systemAnnouncementsEnabled && isRecentTicket(ticket)) {
        notifications.push({
          id: `${ticket.id}-created`,
          category: "system",
          type: "system",
          title: "Queue Number Generated",
          message: `Your queue number ${ticket.ticket_number} for ${ticket.deptName} has been created successfully.`,
          time: formatTimestampLabel(ticket.created_at),
          hasMetrics: false,
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
        popupPriority: 6
      });
    }

    if (aiNotificationsEnabled) {
      const officeWait = getOfficeEstimatedWait(selectedDeptName);
      const officeQueue = getLanePendingCountByDept(selectedDeptName);

      notifications.push({
        id: `ai-best-time-${selectedDeptName}-${currentLaneType}`,
        category: "system",
        type: "ai",
        title: "AI Queue Insight",
        message:
          officeQueue === 0
            ? `AI prediction: ${selectedDeptName} currently has no waiting users in the ${currentLaneType} lane. This is a good time to go now.`
            : `AI prediction: ${selectedDeptName} currently has ${officeQueue} waiting ${officeQueue === 1 ? "person" : "people"} in the ${currentLaneType} lane. Estimated wait is ${officeWait}.`,
        time: "Live",
        hasMetrics: false,
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
    allTickets
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
        !readNotificationIds.includes(item.id) &&
        !dismissedPopupIds.includes(item.id) &&
        (item.type === "turn" ||
          item.type === "next" ||
          item.type === "warning" ||
          item.type === "ai")
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

  const renderHomeSection = () => (
    <>
      <section className="qf-top-hero">
        <div className="qf-greeting">
          <div className="qf-mini-brand">QUEUEFREE • UCLM</div>
          <h1>Hello, {displayName}</h1>
          <p>
            Monitor your queue in real time based on your assigned lane. This dashboard
            shows exactly how many queue numbers are before your turn.
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
                <span>Numbers Before Turn</span>
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

  const renderNotificationMetrics = (notificationItem) => {
    if (!notificationItem.hasMetrics) return null;

    return (
      <div className="qf-notification-meta-grid">
        <div className="qf-notification-meta-box">
          <span>Ticket</span>
          <strong>{notificationItem.ticketNumber}</strong>
        </div>

        <div className="qf-notification-meta-box">
          <span>Now Serving</span>
          <strong>{notificationItem.nowServing}</strong>
        </div>

        <div className="qf-notification-meta-box">
          <span>Numbers Before Turn</span>
          <strong>{notificationItem.numbersBeforeTurn}</strong>
        </div>

        <div className="qf-notification-meta-box">
          <span>After You</span>
          <strong>{notificationItem.afterYou}</strong>
        </div>

        <div className="qf-notification-meta-box">
          <span>Est. Wait</span>
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
            <p>AI-generated queue updates and live status notifications.</p>
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
          className={`qf-notification-filter-pill ${notificationFilter === "all" ? "active" : ""}`}
          onClick={() => setNotificationFilter("all")}
        >
          All
        </button>

        <button
          type="button"
          className={`qf-notification-filter-pill ${notificationFilter === "queue" ? "active" : ""}`}
          onClick={() => setNotificationFilter("queue")}
        >
          Queue
        </button>

        <button
          type="button"
          className={`qf-notification-filter-pill ${notificationFilter === "system" ? "active" : ""}`}
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
          <p>Track your past and current queue activities.</p>
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
          className={`qf-notification-filter-pill ${historyFilter === "active" ? "active" : ""}`}
          onClick={() => setHistoryFilter("active")}
        >
          Active
        </button>

        <button
          type="button"
          className={`qf-notification-filter-pill ${historyFilter === "completed" ? "active" : ""}`}
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
                  <span>Numbers Before Turn</span>
                  <strong>{getNumbersBeforeTurn(ticket)}</strong>
                </div>

                <div>
                  <span>Estimated Wait</span>
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
            <p>Receive notifications when your turn gets closer in the queue.</p>
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
            <p>Receive AI-based predictions like turn approaching and queue movement updates.</p>
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
            <p>Show general queue creation and status announcements.</p>
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
            <p>Play a short sound when a new AI notification appears.</p>
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

                {item.badge > 0 && (
                  <span className="qf-menu-badge">{item.badge}</span>
                )}
              </span>
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

      {popupNotification && activeSection !== "notifications" && (
        <div className="qf-ai-popup">
          <div className={`qf-ai-popup-card qf-notification-${popupNotification.type}`}>
            <div className="qf-ai-popup-left">
              <div className="qf-ai-popup-badge">AI</div>

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
                  <span>Before Turn</span>
                  <strong>{popupNotification.numbersBeforeTurn}</strong>
                </div>

                <div className="qf-ai-popup-mini-box">
                  <span>Est. Wait</span>
                  <strong>{popupNotification.estimatedWait}</strong>
                </div>
              </div>
            )}

            <div className="qf-ai-popup-actions">
              <button
                type="button"
                className="qf-ai-popup-secondary"
                onClick={dismissPopupNotification}
              >
                Dismiss
              </button>

              <button
                type="button"
                className="qf-ai-popup-primary"
                onClick={() => {
                  setActiveSection("notifications");
                  markNotificationAsRead(popupNotification.id);
                }}
              >
                View
              </button>

              <button
                type="button"
                className="qf-ai-popup-close"
                onClick={dismissPopupNotification}
              >
                ✕
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