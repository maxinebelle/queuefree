import React, { useEffect, useMemo, useState } from "react";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import "./StaffDashboard.css";

const DEPARTMENT_NAMES = ["Registrar", "Cashier", "Accounting", "EDP"];

function StaffDashboard() {
  const { currentUser } = useAuth();

  const assignedOffice = currentUser?.office_assignment || "";
  const assignedWindow = currentUser?.window_assignment || "Window 1";

  const [selectedDeptName, setSelectedDeptName] = useState(
    assignedOffice && DEPARTMENT_NAMES.includes(assignedOffice)
      ? assignedOffice
      : "Registrar"
  );

  const [departmentData, setDepartmentData] = useState({});
  const [tickets, setTickets] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [staffWindows, setStaffWindows] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");

  const [processingNext, setProcessingNext] = useState(false);
  const [processingFinish, setProcessingFinish] = useState(false);
  const [processingPause, setProcessingPause] = useState(false);
  const [processingResume, setProcessingResume] = useState(false);

  const staffDisplayName =
    `${currentUser?.first_name || ""} ${currentUser?.last_name || ""}`.trim() ||
    currentUser?.email?.split("@")[0] ||
    "Staff";

  const hasValidAssignedOffice =
    assignedOffice && DEPARTMENT_NAMES.includes(assignedOffice);

  const effectiveDeptName = hasValidAssignedOffice ? assignedOffice : selectedDeptName;

  const getStaffWindowDocId = (officeName, windowName) => {
    const safeOffice = String(officeName || "UnknownOffice")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "");

    const safeWindow = String(windowName || "Window_1")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "");

    return `${safeOffice}_${safeWindow}`;
  };

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

  const getActiveWindowCountForDept = (deptName, sourceWindows = staffWindows) => {
    const activeWindowNames = sourceWindows
      .filter(
        (item) =>
          item.is_active === true &&
          (item.account_status || "active").toLowerCase() === "active" &&
          (item.office_assignment || "") === deptName &&
          (item.window_assignment || "").trim() !== ""
      )
      .map((item) => String(item.window_assignment || "").trim());

    return Math.max(new Set(activeWindowNames).size, 1);
  };

  const getSafePredictionStats = (
    deptName,
    laneType,
    sourceTickets = tickets,
    sourceWindows = staffWindows
  ) => {
    const dept = departmentData[deptName] || {};
    const activeWindows = getActiveWindowCountForDept(deptName, sourceWindows);

    const pendingCount = sourceTickets.filter(
      (ticket) =>
        (ticket.dept_name || deptName) === deptName &&
        ticket.status === "Pending" &&
        (ticket.lane_type || "Regular") === laneType
    ).length;

    const recentDoneTickets = sourceTickets.filter(
      (ticket) =>
        (ticket.dept_name || deptName) === deptName &&
        ticket.status === "Done" &&
        (ticket.lane_type || "Regular") === laneType
    );

    const transactionDurations = recentDoneTickets
      .map((ticket) => Number(ticket.duration_sec || 0))
      .filter((value) => value > 0);

    const baseAvgFromDept = Number(dept.avg_service_time || 5);

    const learnedAvgFromTickets =
      transactionDurations.length > 0
        ? Math.max(
            1,
            Math.round(
              transactionDurations.reduce((sum, value) => sum + value, 0) /
                transactionDurations.length /
                60
            )
          )
        : 0;

    const avgServiceMinutes = learnedAvgFromTickets || baseAvgFromDept || 5;

    const predictedWaitMinutes = Math.max(
      0,
      Math.ceil((pendingCount * avgServiceMinutes) / activeWindows)
    );

    const confidenceScore =
      transactionDurations.length >= 10
        ? 0.9
        : transactionDurations.length >= 5
        ? 0.8
        : transactionDurations.length >= 1
        ? 0.7
        : 0.65;

    let predictionMethod = "rule-based queue load prediction";

    if (transactionDurations.length >= 1) {
      predictionMethod = "historical service-time adjusted prediction";
    }

    if (activeWindows > 1) {
      predictionMethod = `${predictionMethod} with active-window adjustment`;
    }

    return {
      dept_name: deptName,
      lane_type: laneType,
      avg_service_minutes: avgServiceMinutes,
      active_windows: activeWindows,
      pending_count: pendingCount,
      predicted_wait_minutes: predictedWaitMinutes,
      confidence_score: confidenceScore,
      prediction_method: predictionMethod,
      is_active: dept?.is_active !== false
    };
  };

  const getFreshDepartmentRecord = async (deptName) => {
    const localDept = departmentData[deptName];

    if (localDept?.id) {
      return localDept;
    }

    const deptQuery = query(
      collection(db, "departments"),
      where("dept_name", "==", deptName)
    );

    const deptSnapshot = await getDocs(deptQuery);

    if (deptSnapshot.empty) {
      return null;
    }

    const deptDoc = deptSnapshot.docs[0];

    return {
      id: deptDoc.id,
      ...deptDoc.data()
    };
  };

  const getFreshTicketsForPrediction = async (deptName) => {
    const deptRecord = await getFreshDepartmentRecord(deptName);

    if (!deptRecord?.id) {
      return [];
    }

    const ticketsQuery = query(
      collection(db, "queue_tickets"),
      where("dept_id", "==", deptRecord.id)
    );

    const ticketsSnapshot = await getDocs(ticketsQuery);

    return ticketsSnapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  };

  const getFreshStaffWindowsForPrediction = async () => {
    const staffWindowsSnapshot = await getDocs(collection(db, "staff_windows"));

    return staffWindowsSnapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
  };

  const updateOfficePredictionStats = async (deptName = effectiveDeptName) => {
    try {
      if (!deptName) return;

      const freshTickets = await getFreshTicketsForPrediction(deptName);
      const freshStaffWindows = await getFreshStaffWindowsForPrediction();

      const laneTypes = ["Regular", "Priority"];

      await Promise.all(
        laneTypes.map(async (laneType) => {
          const stats = getSafePredictionStats(
            deptName,
            laneType,
            freshTickets,
            freshStaffWindows
          );

          const statDocId = getPredictionStatDocId(deptName, laneType);

          await setDoc(
            doc(db, "office_prediction_stats", statDocId),
            {
              ...stats,
              updated_at: serverTimestamp()
            },
            { merge: true }
          );
        })
      );
    } catch (error) {
      console.error("UPDATE OFFICE PREDICTION STATS ERROR:", error);
    }
  };

  const syncStaffWindowRecord = async () => {
    try {
      if (!currentUser?.uid) return;

      const officeValue = assignedOffice || effectiveDeptName;
      const windowValue = assignedWindow || "Window 1";

      if (!officeValue || !windowValue) return;

      const staffWindowId = getStaffWindowDocId(officeValue, windowValue);

      await setDoc(
        doc(db, "staff_windows", staffWindowId),
        {
          office_assignment: officeValue,
          window_assignment: windowValue,
          staff_uid: currentUser.uid,
          staff_name: staffDisplayName,
          staff_email: currentUser?.email || "",
          is_active: true,
          account_status: currentUser?.account_status || "active",
          updated_at: serverTimestamp()
        },
        { merge: true }
      );
    } catch (error) {
      console.error("SYNC STAFF WINDOW ERROR:", error);
      throw error;
    }
  };

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
    if (hasValidAssignedOffice) {
      setSelectedDeptName(assignedOffice);
    }
  }, [assignedOffice, hasValidAssignedOffice]);

  useEffect(() => {
    if (!currentUser?.uid) return;

    syncStaffWindowRecord().catch((error) => {
      console.error("Initial staff window sync failed:", error);
    });
  }, [
    currentUser?.uid,
    currentUser?.account_status,
    assignedOffice,
    assignedWindow,
    effectiveDeptName,
    staffDisplayName
  ]);

  useEffect(() => {
    const unsubscribers = DEPARTMENT_NAMES.map((deptName) => {
      const q = query(
        collection(db, "departments"),
        where("dept_name", "==", deptName)
      );

      return onSnapshot(
        q,
        (snapshot) => {
          if (!snapshot.empty) {
            const docSnap = snapshot.docs[0];

            setDepartmentData((prev) => ({
              ...prev,
              [deptName]: {
                id: docSnap.id,
                ...docSnap.data()
              }
            }));
          }
        },
        (error) => {
          console.error(`Department listener error for ${deptName}:`, error);
        }
      );
    });

    const unsubscribeUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const mapData = {};

        snapshot.docs.forEach((docSnap) => {
          mapData[docSnap.id] = {
            id: docSnap.id,
            ...docSnap.data()
          };
        });

        setUsersMap(mapData);
      },
      (error) => {
        console.error("Users listener error:", error);
      }
    );

    const unsubscribeStaffWindows = onSnapshot(
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

    return () => {
      unsubscribers.forEach((unsub) => unsub && unsub());
      unsubscribeUsers();
      unsubscribeStaffWindows();
    };
  }, []);

  const selectedDept = useMemo(() => {
    return departmentData[effectiveDeptName] || null;
  }, [departmentData, effectiveDeptName]);

  useEffect(() => {
    if (!selectedDept) {
      setTickets([]);
      return;
    }

    const q = query(
      collection(db, "queue_tickets"),
      where("dept_id", "==", selectedDept.id)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => {
          const ticketData = docSnap.data();
          const linkedUser = usersMap[ticketData.user_id] || null;

          return {
            id: docSnap.id,
            ...ticketData,
            user_name: linkedUser
              ? `${linkedUser.first_name || ""} ${linkedUser.last_name || ""}`.trim() ||
                linkedUser.email ||
                "Unknown User"
              : "Unknown User",
            student_no: linkedUser?.student_no || "-",
            priority_status: linkedUser?.priority_status || "not_applicable",
            user_email: linkedUser?.email || "-"
          };
        });

        setTickets(data);
      },
      (error) => {
        console.error("Staff tickets listener error:", error);
      }
    );

    return () => unsubscribe();
  }, [selectedDept, usersMap]);

  useEffect(() => {
    if (!effectiveDeptName || !selectedDept) return;

    const timeoutId = setTimeout(() => {
      updateOfficePredictionStats(effectiveDeptName);
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [effectiveDeptName, selectedDept, tickets, staffWindows]);

  const sortedTickets = useMemo(() => {
    const copy = [...tickets];

    copy.sort((a, b) => {
      const getStatusOrder = (ticket) => {
        if (ticket.status === "Serving") return 0;
        if (ticket.status === "Paused") return 1;
        if (ticket.status === "Pending") return 2;
        if (ticket.status === "Done") return 3;
        if (ticket.status === "Reset") return 4;
        return 5;
      };

      const aStatusOrder = getStatusOrder(a);
      const bStatusOrder = getStatusOrder(b);

      if (aStatusOrder !== bStatusOrder) {
        return aStatusOrder - bStatusOrder;
      }

      if (
        (a.lane_type || "Regular") === "Priority" &&
        (b.lane_type || "Regular") !== "Priority"
      ) {
        return -1;
      }

      if (
        (a.lane_type || "Regular") !== "Priority" &&
        (b.lane_type || "Regular") === "Priority"
      ) {
        return 1;
      }

      return (a.lane_number || 0) - (b.lane_number || 0);
    });

    return copy;
  }, [tickets]);

  const servingTickets = useMemo(
    () => sortedTickets.filter((ticket) => ticket.status === "Serving"),
    [sortedTickets]
  );

  const pausedTickets = useMemo(
    () => sortedTickets.filter((ticket) => ticket.status === "Paused"),
    [sortedTickets]
  );

  const pendingTickets = useMemo(
    () => sortedTickets.filter((ticket) => ticket.status === "Pending"),
    [sortedTickets]
  );

  const doneTickets = useMemo(
    () =>
      sortedTickets.filter(
        (ticket) => ticket.status === "Done" || ticket.status === "Reset"
      ),
    [sortedTickets]
  );

  const pendingPriorityTickets = useMemo(
    () =>
      pendingTickets.filter(
        (ticket) => (ticket.lane_type || "Regular") === "Priority"
      ),
    [pendingTickets]
  );

  const pendingRegularTickets = useMemo(
    () =>
      pendingTickets.filter(
        (ticket) => (ticket.lane_type || "Regular") !== "Priority"
      ),
    [pendingTickets]
  );

  const currentServingTicket = useMemo(() => {
    const ownWindowServing = servingTickets.find((ticket) => {
      const ticketWindow =
        ticket.window_assignment || ticket.assigned_window || assignedWindow;

      return (
        ticket.served_by === currentUser?.uid ||
        String(ticketWindow || "").trim() === String(assignedWindow || "").trim()
      );
    });

    return ownWindowServing || null;
  }, [servingTickets, currentUser?.uid, assignedWindow]);

  const selectedDeptActiveCount = useMemo(() => {
    return sortedTickets.filter(
      (ticket) =>
        ticket.status === "Pending" ||
        ticket.status === "Serving" ||
        ticket.status === "Paused"
    ).length;
  }, [sortedTickets]);

  const selectedDeptTotalCount = useMemo(() => {
    return sortedTickets.length;
  }, [sortedTickets]);

  const regularPredictionStats = useMemo(() => {
    return getSafePredictionStats(effectiveDeptName, "Regular", tickets);
  }, [effectiveDeptName, tickets, departmentData, staffWindows]);

  const priorityPredictionStats = useMemo(() => {
    return getSafePredictionStats(effectiveDeptName, "Priority", tickets);
  }, [effectiveDeptName, tickets, departmentData, staffWindows]);

  const normalizeDisplayValue = (value) => {
    if (!value) return "-";

    const text = String(value).trim();

    if (text === "0") return "-";
    if (/^[A-Z]P?000$/i.test(text)) return "-";

    return text;
  };

  const getReadableDateTime = (value) => {
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
  };

  const getEstimatedWaitForTicket = (ticket) => {
    if (!ticket || ticket.status === "Serving" || ticket.status === "Done") {
      return "0 min";
    }

    const laneType = ticket.lane_type || "Regular";
    const predictionStats =
      laneType === "Priority" ? priorityPredictionStats : regularPredictionStats;

    const avg = predictionStats.avg_service_minutes || selectedDept?.avg_service_time || 0;
    const activeWindows = Math.max(predictionStats.active_windows || 1, 1);

    const sameLaneActive = sortedTickets
      .filter(
        (item) =>
          item.status !== "Done" &&
          item.status !== "Reset" &&
          item.dept_id === ticket.dept_id &&
          (item.lane_type || "Regular") === laneType
      )
      .sort((a, b) => {
        const aServing = a.status === "Serving" ? 0 : 1;
        const bServing = b.status === "Serving" ? 0 : 1;

        if (aServing !== bServing) return aServing - bServing;

        return (a.lane_number || 0) - (b.lane_number || 0);
      });

    const index = sameLaneActive.findIndex((item) => item.id === ticket.id);

    if (index < 0) return "-";

    return `${Math.ceil((index * avg) / activeWindows)} min`;
  };

  const getQueuePositionLabel = (ticket) => {
    if (!ticket) return "-";

    if (ticket.status === "Done") {
      return "Completed";
    }

    if (ticket.status === "Reset") {
      return "Cleared by reset";
    }

    if (ticket.status === "Serving") {
      return "Now serving";
    }

    const laneType = ticket.lane_type || "Regular";

    const sameLaneActive = sortedTickets
      .filter(
        (item) =>
          item.status !== "Done" &&
          item.status !== "Reset" &&
          item.dept_id === ticket.dept_id &&
          (item.lane_type || "Regular") === laneType
      )
      .sort((a, b) => {
        const aServing = a.status === "Serving" ? 0 : 1;
        const bServing = b.status === "Serving" ? 0 : 1;

        if (aServing !== bServing) return aServing - bServing;

        return (a.lane_number || 0) - (b.lane_number || 0);
      });

    const index = sameLaneActive.findIndex((item) => item.id === ticket.id);

    if (index < 0) return "-";

    if (index === 0) return "Next in line";

    return `${index} queue number${index === 1 ? "" : "s"} before turn`;
  };

  const getWindowLabel = (ticket) => {
    return (
      ticket?.window_assignment ||
      ticket?.assigned_window ||
      assignedWindow ||
      "Window 1"
    );
  };

  const updateDepartmentServingDisplay = async (ticketData) => {
    if (!selectedDept) return;

    const deptRef = doc(db, "departments", selectedDept.id);
    const windowValue = assignedWindow || "Window 1";

    const payload = {
      current_number: ticketData?.lane_number || 0,
      current_serving_display: ticketData?.ticket_number || "-",
      current_serving_window: windowValue
    };

    if ((ticketData?.lane_type || "Regular") === "Priority") {
      payload.priority_now_serving_number = ticketData?.lane_number || 0;
      payload.priority_now_serving_display = ticketData?.ticket_number || "-";
      payload.priority_now_serving_window = windowValue;
    } else {
      payload.regular_now_serving_number = ticketData?.lane_number || 0;
      payload.regular_now_serving_display = ticketData?.ticket_number || "-";
      payload.regular_now_serving_window = windowValue;
    }

    await updateDoc(deptRef, payload);
  };

  const clearDepartmentServingDisplay = async (ticketData) => {
    if (!selectedDept) return;

    const deptRef = doc(db, "departments", selectedDept.id);

    const payload = {
      current_number: 0,
      current_serving_display: "-",
      current_serving_window: ""
    };

    if ((ticketData?.lane_type || "Regular") === "Priority") {
      payload.priority_now_serving_number = 0;
      payload.priority_now_serving_display = "-";
      payload.priority_now_serving_window = "";
    } else {
      payload.regular_now_serving_number = 0;
      payload.regular_now_serving_display = "-";
      payload.regular_now_serving_window = "";
    }

    await updateDoc(deptRef, payload);
  };

  const handleCallNext = async () => {
    try {
      if (!hasValidAssignedOffice) {
        alert("Your staff account has no valid assigned office. Please ask the admin to assign your office first.");
        return;
      }

      if (!selectedDept) {
        alert("Department data not loaded.");
        return;
      }

      if (!selectedDept.is_active) {
        alert("This office is currently inactive.");
        return;
      }

      if (processingNext) return;

      if (currentServingTicket) {
        alert("Please finish the current serving ticket first before calling the next one.");
        return;
      }

      setProcessingNext(true);

      await syncStaffWindowRecord();

      const pendingQuery = query(
        collection(db, "queue_tickets"),
        where("dept_id", "==", selectedDept.id),
        where("status", "==", "Pending")
      );

      const pendingSnapshot = await getDocs(pendingQuery);

      const pendingData = pendingSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ref: docSnap.ref,
        ...docSnap.data()
      }));

      const priorityPending = pendingData
        .filter((ticket) => (ticket.lane_type || "Regular") === "Priority")
        .sort((a, b) => (a.lane_number || 0) - (b.lane_number || 0));

      const regularPending = pendingData
        .filter((ticket) => (ticket.lane_type || "Regular") !== "Priority")
        .sort((a, b) => (a.lane_number || 0) - (b.lane_number || 0));

      const nextTicket = priorityPending[0] || regularPending[0] || null;

      if (!nextTicket) {
        alert("No pending tickets available.");
        return;
      }

      await updateDoc(nextTicket.ref, {
        status: "Serving",
        called_at: serverTimestamp(),
        window_assignment: assignedWindow || "Window 1",
        assigned_window: assignedWindow || "Window 1",
        served_by: currentUser?.uid || ""
      });

      await updateDepartmentServingDisplay(nextTicket);
      await updateOfficePredictionStats(effectiveDeptName);

      alert(`Now serving: ${nextTicket.ticket_number} at ${assignedWindow || "Window 1"}`);
    } catch (error) {
      console.error("CALL NEXT ERROR:", error);

      if (error.code === "permission-denied") {
        alert("Failed to call next ticket because Firestore rules blocked the update. Check if this staff account is assigned to this exact office.");
        return;
      }

      alert("Failed to call next ticket.");
    } finally {
      setProcessingNext(false);
    }
  };

  const handleFinishCurrent = async () => {
    try {
      if (!hasValidAssignedOffice) {
        alert("Your staff account has no valid assigned office. Please ask the admin to assign your office first.");
        return;
      }

      if (!selectedDept) {
        alert("Department data not loaded.");
        return;
      }

      if (!currentServingTicket) {
        alert("No serving ticket to finish.");
        return;
      }

      if (processingFinish) return;

      setProcessingFinish(true);

      await syncStaffWindowRecord();

      const endTime = new Date();
      let durationSec = 0;
      let startDate = null;

      if (
        currentServingTicket.called_at &&
        typeof currentServingTicket.called_at.toDate === "function"
      ) {
        startDate = currentServingTicket.called_at.toDate();
        durationSec = Math.floor((endTime - startDate) / 1000);
      } else if (currentServingTicket.called_at?.seconds) {
        startDate = new Date(currentServingTicket.called_at.seconds * 1000);
        durationSec = Math.floor((endTime - startDate) / 1000);
      }

      await updateDoc(doc(db, "queue_tickets", currentServingTicket.id), {
        status: "Done",
        completed_at: serverTimestamp(),
        duration_sec: durationSec
      });

      await addDoc(collection(db, "transactions"), {
        ticket_id: currentServingTicket.id,
        ticket_number: currentServingTicket.ticket_number || "",
        user_id: currentServingTicket.user_id || "",
        user_name: currentServingTicket.user_name || "",
        student_no: currentServingTicket.student_no || "",
        dept_id: selectedDept.id,
        dept_name: selectedDept.dept_name || effectiveDeptName,
        lane_type: currentServingTicket.lane_type || "Regular",
        priority_type: currentServingTicket.priority_type || "Regular",
        start_time: startDate || null,
        end_time: serverTimestamp(),
        duration_sec: durationSec,
        window_assignment: assignedWindow || "Window 1",
        served_by: currentUser?.uid || "",
        served_by_name: staffDisplayName || "Staff"
      });

      await clearDepartmentServingDisplay(currentServingTicket);
      await updateOfficePredictionStats(effectiveDeptName);

      alert(`Completed: ${currentServingTicket.ticket_number}`);
    } catch (error) {
      console.error("FINISH CURRENT ERROR:", error);

      if (error.code === "permission-denied") {
        alert("Failed to finish current ticket because Firestore rules blocked the update. Check if this staff account is assigned to this exact office.");
        return;
      }

      alert("Failed to finish current ticket.");
    } finally {
      setProcessingFinish(false);
    }
  };

  const handlePauseCurrent = async () => {
    try {
      if (!hasValidAssignedOffice) {
        alert("Your staff account has no valid assigned office. Please ask the admin to assign your office first.");
        return;
      }

      if (!currentServingTicket) {
        alert("No serving ticket to pause.");
        return;
      }

      if (processingPause) return;

      setProcessingPause(true);

      await syncStaffWindowRecord();

      await updateDoc(doc(db, "queue_tickets", currentServingTicket.id), {
        status: "Paused",
        paused_at: serverTimestamp(),
        window_assignment: assignedWindow || "Window 1",
        assigned_window: assignedWindow || "Window 1"
      });

      await clearDepartmentServingDisplay(currentServingTicket);
      await updateOfficePredictionStats(effectiveDeptName);

      alert(`Paused: ${currentServingTicket.ticket_number}`);
    } catch (error) {
      console.error("PAUSE CURRENT ERROR:", error);

      if (error.code === "permission-denied") {
        alert("Failed to pause current ticket because Firestore rules blocked the update. Check if this staff account is assigned to this exact office.");
        return;
      }

      alert("Failed to pause current ticket.");
    } finally {
      setProcessingPause(false);
    }
  };

  const handleResumePaused = async (ticket) => {
    try {
      if (!hasValidAssignedOffice) {
        alert("Your staff account has no valid assigned office. Please ask the admin to assign your office first.");
        return;
      }

      if (!ticket) return;

      if (currentServingTicket) {
        alert("Finish the currently serving ticket first before resuming another ticket.");
        return;
      }

      if (processingResume) return;

      setProcessingResume(true);

      await syncStaffWindowRecord();

      await updateDoc(doc(db, "queue_tickets", ticket.id), {
        status: "Serving",
        resumed_at: serverTimestamp(),
        window_assignment: assignedWindow || "Window 1",
        assigned_window: assignedWindow || "Window 1",
        served_by: currentUser?.uid || ""
      });

      await updateDepartmentServingDisplay(ticket);
      await updateOfficePredictionStats(effectiveDeptName);

      alert(`Resumed: ${ticket.ticket_number} at ${assignedWindow || "Window 1"}`);
    } catch (error) {
      console.error("RESUME PAUSED ERROR:", error);

      if (error.code === "permission-denied") {
        alert("Failed to resume paused ticket because Firestore rules blocked the update. Check if this staff account is assigned to this exact office.");
        return;
      }

      alert("Failed to resume paused ticket.");
    } finally {
      setProcessingResume(false);
    }
  };

  const getStatusClass = (status) => {
    if (status === "Serving") return "qf-staff-status qf-staff-status-serving";
    if (status === "Done" || status === "Reset") {
      return "qf-staff-status qf-staff-status-done";
    }
    if (status === "Paused") return "qf-staff-status qf-staff-status-paused";
    return "qf-staff-status qf-staff-status-pending";
  };

  const drawerItems = [
    { key: "overview", label: "Operations" },
    { key: "queue", label: "Waiting Queue" },
    { key: "completed", label: "Completed" }
  ];

  const renderActionButtons = () => (
    <div className="qf-staff-action-row qf-staff-action-row-locked">
      <button
        type="button"
        className="qf-staff-primary-btn"
        onClick={handleCallNext}
        disabled={
          processingNext ||
          !hasValidAssignedOffice ||
          !selectedDept ||
          !selectedDept.is_active ||
          !!currentServingTicket
        }
      >
        {processingNext ? "Processing..." : "Call Next"}
      </button>

      <button
        type="button"
        className="qf-staff-secondary-btn"
        onClick={handlePauseCurrent}
        disabled={processingPause || !currentServingTicket}
      >
        {processingPause ? "Pausing..." : "Pause"}
      </button>

      <button
        type="button"
        className="qf-staff-success-btn"
        onClick={handleFinishCurrent}
        disabled={processingFinish || !currentServingTicket}
      >
        {processingFinish ? "Finishing..." : "Finish Current"}
      </button>
    </div>
  );

  const renderOverviewSection = () => (
    <>
      <section className="qf-staff-hero qf-staff-hero-clean">
        <div className="qf-staff-hero-left">
          <div className="qf-staff-badge">STAFF OPERATIONS</div>

          <h1>
            {effectiveDeptName} • {assignedWindow || "Window 1"}
          </h1>
          <p>
            Manage the live queue for your assigned office only. Use Call Next,
            Pause, Finish, and Resume without switching to another department.
          </p>

          {!hasValidAssignedOffice && (
            <div className="qf-staff-warning-box qf-staff-hero-warning">
              This staff account has no valid assigned office. Please ask the admin
              to assign this account to Registrar, Cashier, Accounting, or EDP.
            </div>
          )}
        </div>

        <div className="qf-staff-command-card">
          <span className="qf-staff-command-label">Current Task</span>

          {currentServingTicket ? (
            <>
              <strong>{currentServingTicket.ticket_number}</strong>
              <p>
                {currentServingTicket.user_name} •{" "}
                {currentServingTicket.lane_type || "Regular"} Lane
              </p>
              <div className="qf-staff-command-meta">
                <span>{getWindowLabel(currentServingTicket)}</span>
                <span>{currentServingTicket.priority_type || "Regular"}</span>
              </div>
            </>
          ) : (
            <>
              <strong>No active ticket</strong>
              <p>Ready to call the next waiting ticket.</p>
              <div className="qf-staff-command-meta">
                <span>{pendingTickets.length} waiting</span>
                <span>{pausedTickets.length} paused</span>
              </div>
            </>
          )}

          {renderActionButtons()}
        </div>
      </section>

      <section className="qf-staff-metric-grid">
        <div className="qf-staff-metric-card">
          <span>Waiting</span>
          <strong>{pendingTickets.length}</strong>
          <p>
            {pendingPriorityTickets.length} priority •{" "}
            {pendingRegularTickets.length} regular
          </p>
        </div>

        <div className="qf-staff-metric-card">
          <span>Now Serving</span>
          <strong>{servingTickets.length}</strong>
          <p>
            {normalizeDisplayValue(selectedDept?.regular_now_serving_display)} regular •{" "}
            {normalizeDisplayValue(selectedDept?.priority_now_serving_display)} priority
          </p>
        </div>

        <div className="qf-staff-metric-card">
          <span>Paused</span>
          <strong>{pausedTickets.length}</strong>
          <p>Resume only when your window is free.</p>
        </div>

        <div className="qf-staff-metric-card">
          <span>Completed</span>
          <strong>{doneTickets.length}</strong>
          <p>Finished or reset-cleared records.</p>
        </div>
      </section>

      <section className="qf-staff-work-grid">
        <div className="qf-staff-panel qf-staff-focus-panel">
          <div className="qf-staff-panel-head">
            <div>
              <h2>Now Serving</h2>
              <p>The current ticket being handled at your assigned window.</p>
            </div>
          </div>

          {!currentServingTicket ? (
            <div className="qf-staff-empty-box">No ticket currently being served.</div>
          ) : (
            <div
              className={`qf-staff-ticket-card ${
                currentServingTicket.lane_type === "Priority" ? "priority" : ""
              }`}
            >
              <div className="qf-staff-ticket-top">
                <div>
                  <h3>{currentServingTicket.ticket_number}</h3>
                  <p>{currentServingTicket.lane_type || "Regular"} Lane</p>
                </div>

                <span className={getStatusClass(currentServingTicket.status)}>
                  {currentServingTicket.status}
                </span>
              </div>

              <div className="qf-staff-ticket-meta">
                <div className="qf-staff-meta-box">
                  <span>Name</span>
                  <strong>{currentServingTicket.user_name}</strong>
                </div>

                <div className="qf-staff-meta-box">
                  <span>Student No</span>
                  <strong>{currentServingTicket.student_no}</strong>
                </div>

                <div className="qf-staff-meta-box">
                  <span>Serving Window</span>
                  <strong>{getWindowLabel(currentServingTicket)}</strong>
                </div>

                <div className="qf-staff-meta-box">
                  <span>Priority Type</span>
                  <strong>{currentServingTicket.priority_type || "Regular"}</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="qf-staff-panel">
          <div className="qf-staff-panel-head">
            <div>
              <h2>Paused Tickets</h2>
              <p>Resume a paused ticket only when no ticket is currently serving.</p>
            </div>
          </div>

          {pausedTickets.length === 0 ? (
            <div className="qf-staff-empty-box">No paused tickets.</div>
          ) : (
            <div className="qf-staff-ticket-list qf-staff-compact-list">
              {pausedTickets.map((ticket) => (
                <div key={ticket.id} className="qf-staff-ticket-card paused">
                  <div className="qf-staff-ticket-top">
                    <div>
                      <h3>{ticket.ticket_number}</h3>
                      <p>{ticket.user_name}</p>
                    </div>

                    <span className={getStatusClass(ticket.status)}>
                      {ticket.status}
                    </span>
                  </div>

                  <div className="qf-staff-inline-actions">
                    <button
                      type="button"
                      className="qf-staff-primary-btn qf-staff-small-btn"
                      onClick={() => handleResumePaused(ticket)}
                      disabled={
                        processingResume ||
                        !hasValidAssignedOffice ||
                        !!currentServingTicket
                      }
                    >
                      {processingResume ? "Resuming..." : "Resume"}
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

  const renderQueueSection = () => (
    <section className="qf-staff-panel">
      <div className="qf-staff-panel-head">
        <div>
          <h2>Waiting Queue</h2>
          <p>
            This queue list is locked to your assigned office. Priority tickets are
            shown separately from regular tickets for easier control.
          </p>
        </div>
      </div>

      <div className="qf-staff-overview-strip">
        <div>
          <span>Active Queue</span>
          <strong>{selectedDeptActiveCount}</strong>
        </div>

        <div>
          <span>Total Records</span>
          <strong>{selectedDeptTotalCount}</strong>
        </div>

        <div>
          <span>Regular Waiting</span>
          <strong>{pendingRegularTickets.length}</strong>
        </div>

        <div>
          <span>Priority Waiting</span>
          <strong>{pendingPriorityTickets.length}</strong>
        </div>
      </div>

      <div className="qf-staff-queue-group-grid">
        <div className="qf-staff-queue-column">
          <div className="qf-staff-section-title">Priority Queue</div>

          {pendingPriorityTickets.length === 0 ? (
            <div className="qf-staff-empty-box">No pending priority tickets.</div>
          ) : (
            <div className="qf-staff-ticket-list">
              {pendingPriorityTickets.map((ticket) => (
                <div key={ticket.id} className="qf-staff-ticket-card priority">
                  <div className="qf-staff-ticket-top">
                    <div>
                      <h3>{ticket.ticket_number}</h3>
                      <p>{ticket.priority_type || "Priority"} Lane</p>
                    </div>

                    <span className={getStatusClass(ticket.status)}>
                      {ticket.status}
                    </span>
                  </div>

                  <div className="qf-staff-ticket-meta">
                    <div className="qf-staff-meta-box">
                      <span>Name</span>
                      <strong>{ticket.user_name}</strong>
                    </div>

                    <div className="qf-staff-meta-box">
                      <span>Student No</span>
                      <strong>{ticket.student_no}</strong>
                    </div>

                    <div className="qf-staff-meta-box">
                      <span>Queue Position</span>
                      <strong>{getQueuePositionLabel(ticket)}</strong>
                    </div>

                    <div className="qf-staff-meta-box">
                      <span>AI Est. Wait</span>
                      <strong>{getEstimatedWaitForTicket(ticket)}</strong>
                    </div>

                    <div className="qf-staff-meta-box">
                      <span>Assigned Window</span>
                      <strong>{getWindowLabel(ticket)}</strong>
                    </div>

                    <div className="qf-staff-meta-box">
                      <span>Created</span>
                      <strong>{getReadableDateTime(ticket.created_at)}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="qf-staff-queue-column">
          <div className="qf-staff-section-title">Regular Queue</div>

          {pendingRegularTickets.length === 0 ? (
            <div className="qf-staff-empty-box">No pending regular tickets.</div>
          ) : (
            <div className="qf-staff-ticket-list">
              {pendingRegularTickets.map((ticket) => (
                <div key={ticket.id} className="qf-staff-ticket-card">
                  <div className="qf-staff-ticket-top">
                    <div>
                      <h3>{ticket.ticket_number}</h3>
                      <p>{ticket.lane_type || "Regular"} Lane</p>
                    </div>

                    <span className={getStatusClass(ticket.status)}>
                      {ticket.status}
                    </span>
                  </div>

                  <div className="qf-staff-ticket-meta">
                    <div className="qf-staff-meta-box">
                      <span>Name</span>
                      <strong>{ticket.user_name}</strong>
                    </div>

                    <div className="qf-staff-meta-box">
                      <span>Student No</span>
                      <strong>{ticket.student_no}</strong>
                    </div>

                    <div className="qf-staff-meta-box">
                      <span>Queue Position</span>
                      <strong>{getQueuePositionLabel(ticket)}</strong>
                    </div>

                    <div className="qf-staff-meta-box">
                      <span>AI Est. Wait</span>
                      <strong>{getEstimatedWaitForTicket(ticket)}</strong>
                    </div>

                    <div className="qf-staff-meta-box">
                      <span>Assigned Window</span>
                      <strong>{getWindowLabel(ticket)}</strong>
                    </div>

                    <div className="qf-staff-meta-box">
                      <span>Created</span>
                      <strong>{getReadableDateTime(ticket.created_at)}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );

  const renderCompletedSection = () => (
    <section className="qf-staff-panel">
      <div className="qf-staff-panel-head">
        <div>
          <h2>Completed Records</h2>
          <p>
            Finished tickets and reset-cleared tickets handled inside your assigned
            department.
          </p>
        </div>
      </div>

      {doneTickets.length === 0 ? (
        <div className="qf-staff-empty-box">No completed records yet.</div>
      ) : (
        <div className="qf-staff-ticket-list">
          {doneTickets.map((ticket) => (
            <div key={ticket.id} className="qf-staff-ticket-card done">
              <div className="qf-staff-ticket-top">
                <div>
                  <h3>{ticket.ticket_number}</h3>
                  <p>{ticket.lane_type || "Regular"} Lane</p>
                </div>

                <span className={getStatusClass(ticket.status)}>
                  {ticket.status || "Done"}
                </span>
              </div>

              <div className="qf-staff-ticket-meta">
                <div className="qf-staff-meta-box">
                  <span>Name</span>
                  <strong>{ticket.user_name}</strong>
                </div>

                <div className="qf-staff-meta-box">
                  <span>Student No</span>
                  <strong>{ticket.student_no}</strong>
                </div>

                <div className="qf-staff-meta-box">
                  <span>Assigned Window</span>
                  <strong>{getWindowLabel(ticket)}</strong>
                </div>

                <div className="qf-staff-meta-box">
                  <span>Completed At</span>
                  <strong>{getReadableDateTime(ticket.completed_at)}</strong>
                </div>

                <div className="qf-staff-meta-box">
                  <span>Status</span>
                  <strong>{ticket.status || "-"}</strong>
                </div>

                <div className="qf-staff-meta-box">
                  <span>Reset By Admin</span>
                  <strong>{ticket.reset_by_admin ? "Yes" : "No"}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  const renderActiveSection = () => {
    if (activeSection === "overview") return renderOverviewSection();
    if (activeSection === "queue") return renderQueueSection();
    if (activeSection === "completed") return renderCompletedSection();

    return renderOverviewSection();
  };

  return (
    <div className="qf-staff-layout">
      <aside className={`qf-staff-drawer ${sidebarOpen ? "open" : ""}`}>
        <div className="qf-staff-drawer-top">
          <div className="qf-staff-drawer-brand">QueueFree</div>

          <button
            className="qf-staff-drawer-close"
            onClick={() => setSidebarOpen(false)}
            type="button"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <div className="qf-staff-drawer-user">
          <div className="qf-staff-avatar">
            {String(staffDisplayName).charAt(0).toUpperCase()}
          </div>

          <div>
            <strong>{staffDisplayName}</strong>
            <p>{assignedOffice || "No assigned office"}</p>
            <p>{assignedWindow || "Window 1"}</p>
          </div>
        </div>

        <nav className="qf-staff-drawer-nav">
          {drawerItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`qf-staff-drawer-link ${
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
          className="qf-staff-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      <main className="qf-staff-main">{renderActiveSection()}</main>
    </div>
  );
}

export default StaffDashboard;