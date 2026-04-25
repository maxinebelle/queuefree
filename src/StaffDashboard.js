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
  updateDoc,
  where
} from "firebase/firestore";
import "./StaffDashboard.css";

const DEPARTMENT_NAMES = ["Registrar", "Cashier", "Accounting", "EDP"];

function StaffDashboard() {
  const { currentUser } = useAuth();

  const [selectedDeptName, setSelectedDeptName] = useState("Registrar");
  const [departmentData, setDepartmentData] = useState({});
  const [tickets, setTickets] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");

  const [processingNext, setProcessingNext] = useState(false);
  const [processingFinish, setProcessingFinish] = useState(false);
  const [processingPause, setProcessingPause] = useState(false);
  const [processingResume, setProcessingResume] = useState(false);

  const assignedOffice = currentUser?.office_assignment || "";
  const assignedWindow = currentUser?.window_assignment || "Window 1";

  const staffDisplayName =
    `${currentUser?.first_name || ""} ${currentUser?.last_name || ""}`.trim() ||
    currentUser?.email?.split("@")[0] ||
    "Staff";

  const availableDepartments = useMemo(() => {
    if (assignedOffice && DEPARTMENT_NAMES.includes(assignedOffice)) {
      return [assignedOffice];
    }

    return DEPARTMENT_NAMES;
  }, [assignedOffice]);

  useEffect(() => {
    if (assignedOffice && DEPARTMENT_NAMES.includes(assignedOffice)) {
      setSelectedDeptName(assignedOffice);
    }
  }, [assignedOffice]);

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

    return () => {
      unsubscribers.forEach((unsub) => unsub && unsub());
      unsubscribeUsers();
    };
  }, []);

  const selectedDept = useMemo(() => {
    return departmentData[selectedDeptName] || null;
  }, [departmentData, selectedDeptName]);

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

  const nextPriorityTicket = useMemo(() => {
    const copy = [...pendingPriorityTickets];
    copy.sort((a, b) => (a.lane_number || 0) - (b.lane_number || 0));
    return copy[0] || null;
  }, [pendingPriorityTickets]);

  const nextRegularTicket = useMemo(() => {
    const copy = [...pendingRegularTickets];
    copy.sort((a, b) => (a.lane_number || 0) - (b.lane_number || 0));
    return copy[0] || null;
  }, [pendingRegularTickets]);

  const nextUpTicket = useMemo(() => {
    return nextPriorityTicket || nextRegularTicket || null;
  }, [nextPriorityTicket, nextRegularTicket]);

  const currentServingTicket = useMemo(() => {
    return servingTickets[0] || null;
  }, [servingTickets]);

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

  const normalizeDisplayValue = (value) => {
    if (!value) return "-";

    const text = String(value).trim();

    if (text === "0") return "-";
    if (/^[A-Z]P?000$/i.test(text)) return "-";

    return text;
  };

  const getAverageWaitMinutes = () => {
    const avg = selectedDept?.avg_service_time || 0;
    return `${avg} min`;
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

    const avg = selectedDept?.avg_service_time || 0;
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

    return `${index * avg} min`;
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
    return ticket?.window_assignment || assignedWindow || "Window 1";
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
        alert(
          "Please finish the current serving ticket first before calling the next one."
        );
        return;
      }

      setProcessingNext(true);

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
        served_by: currentUser?.uid || ""
      });

      await updateDepartmentServingDisplay(nextTicket);

      alert(
        `Now serving: ${nextTicket.ticket_number} at ${
          assignedWindow || "Window 1"
        }`
      );
    } catch (error) {
      console.error("CALL NEXT ERROR:", error);

      if (error.code === "permission-denied") {
        alert(
          "Failed to call next ticket because Firestore rules blocked the update."
        );
        return;
      }

      alert("Failed to call next ticket.");
    } finally {
      setProcessingNext(false);
    }
  };

  const handleFinishCurrent = async () => {
    try {
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
        completed_at: serverTimestamp()
      });

      await addDoc(collection(db, "transactions"), {
        ticket_id: currentServingTicket.id,
        ticket_number: currentServingTicket.ticket_number || "",
        user_id: currentServingTicket.user_id || "",
        user_name: currentServingTicket.user_name || "",
        student_no: currentServingTicket.student_no || "",
        dept_id: selectedDept.id,
        dept_name: selectedDept.dept_name || selectedDeptName,
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

      alert(`Completed: ${currentServingTicket.ticket_number}`);
    } catch (error) {
      console.error("FINISH CURRENT ERROR:", error);

      if (error.code === "permission-denied") {
        alert(
          "Failed to finish current ticket because Firestore rules blocked the update."
        );
        return;
      }

      alert("Failed to finish current ticket.");
    } finally {
      setProcessingFinish(false);
    }
  };

  const handlePauseCurrent = async () => {
    try {
      if (!currentServingTicket) {
        alert("No serving ticket to pause.");
        return;
      }

      if (processingPause) return;

      setProcessingPause(true);

      await updateDoc(doc(db, "queue_tickets", currentServingTicket.id), {
        status: "Paused",
        paused_at: serverTimestamp()
      });

      await clearDepartmentServingDisplay(currentServingTicket);

      alert(`Paused: ${currentServingTicket.ticket_number}`);
    } catch (error) {
      console.error("PAUSE CURRENT ERROR:", error);

      if (error.code === "permission-denied") {
        alert(
          "Failed to pause current ticket because Firestore rules blocked the update."
        );
        return;
      }

      alert("Failed to pause current ticket.");
    } finally {
      setProcessingPause(false);
    }
  };

  const handleResumePaused = async (ticket) => {
    try {
      if (!ticket) return;

      if (currentServingTicket) {
        alert(
          "Finish the currently serving ticket first before resuming another ticket."
        );
        return;
      }

      if (processingResume) return;

      setProcessingResume(true);

      await updateDoc(doc(db, "queue_tickets", ticket.id), {
        status: "Serving",
        resumed_at: serverTimestamp(),
        window_assignment: assignedWindow || "Window 1",
        served_by: currentUser?.uid || ""
      });

      await updateDepartmentServingDisplay(ticket);

      alert(`Resumed: ${ticket.ticket_number} at ${assignedWindow || "Window 1"}`);
    } catch (error) {
      console.error("RESUME PAUSED ERROR:", error);

      if (error.code === "permission-denied") {
        alert(
          "Failed to resume paused ticket because Firestore rules blocked the update."
        );
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
    { key: "overview", label: "Overview" },
    { key: "queue", label: "Queue Control" },
    { key: "completed", label: "Completed" }
  ];

  const renderOverviewSection = () => (
    <>
      <section className="qf-staff-hero">
        <div className="qf-staff-hero-left">
          <div className="qf-staff-badge">STAFF CONTROL PANEL</div>
          <h1>{selectedDeptName} Queue Operations</h1>
          <p>
            Monitor live queue flow, serve the next ticket correctly, and guide
            users to the assigned service window.
          </p>
        </div>

        <div className="qf-staff-hero-right">
          <div className="qf-staff-mini-card">
            <span>Assigned Office</span>
            <strong>{assignedOffice || selectedDeptName}</strong>
          </div>

          <div className="qf-staff-mini-card">
            <span>Assigned Window</span>
            <strong>{assignedWindow || "-"}</strong>
          </div>

          <div className="qf-staff-mini-card">
            <span>Pending</span>
            <strong>{pendingTickets.length}</strong>
          </div>

          <div className="qf-staff-mini-card">
            <span>Serving</span>
            <strong>{servingTickets.length}</strong>
          </div>

          <div className="qf-staff-mini-card">
            <span>Paused</span>
            <strong>{pausedTickets.length}</strong>
          </div>

          <div className="qf-staff-mini-card">
            <span>Done</span>
            <strong>{doneTickets.length}</strong>
          </div>
        </div>
      </section>

      <section className="qf-staff-summary-grid">
        <div className="qf-staff-summary-card">
          <span>Regular Now Serving</span>
          <strong>{normalizeDisplayValue(selectedDept?.regular_now_serving_display)}</strong>
        </div>

        <div className="qf-staff-summary-card">
          <span>Regular Window</span>
          <strong>{selectedDept?.regular_now_serving_window || "-"}</strong>
        </div>

        <div className="qf-staff-summary-card priority">
          <span>Priority Now Serving</span>
          <strong>{normalizeDisplayValue(selectedDept?.priority_now_serving_display)}</strong>
        </div>

        <div className="qf-staff-summary-card priority">
          <span>Priority Window</span>
          <strong>{selectedDept?.priority_now_serving_window || "-"}</strong>
        </div>
      </section>

      <section className="qf-staff-panel">
        <div className="qf-staff-panel-head">
          <div>
            <h2>Quick Controls</h2>
            <p>Use the controls below to manage the current live queue flow.</p>
          </div>
        </div>

        <div className="qf-staff-action-row">
          <select
            value={selectedDeptName}
            onChange={(e) => setSelectedDeptName(e.target.value)}
            className="qf-staff-select"
            disabled={availableDepartments.length === 1}
          >
            {availableDepartments.map((deptName) => (
              <option key={deptName} value={deptName}>
                {deptName}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="qf-staff-primary-btn"
            onClick={handleCallNext}
            disabled={processingNext || !selectedDept || !selectedDept.is_active}
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
      </section>

      <section className="qf-staff-live-grid">
        <div className="qf-staff-panel">
          <div className="qf-staff-panel-head">
            <div>
              <h2>Now Serving</h2>
              <p>The ticket currently being handled in your assigned window.</p>
            </div>
          </div>

          {!currentServingTicket ? (
            <div className="qf-staff-empty-box">
              No ticket currently being served.
            </div>
          ) : (
            <div className="qf-staff-live-serving-card">
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
                  <span>Assigned Window</span>
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
              <p>Resume paused tickets when the current serving slot is free.</p>
            </div>
          </div>

          {pausedTickets.length === 0 ? (
            <div className="qf-staff-empty-box">No paused tickets.</div>
          ) : (
            <div className="qf-staff-ticket-list">
              {pausedTickets.map((ticket) => (
                <div key={ticket.id} className="qf-staff-ticket-card paused">
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
                      <span>Est. Wait</span>
                      <strong>{getEstimatedWaitForTicket(ticket)}</strong>
                    </div>
                  </div>

                  <div className="qf-staff-inline-actions">
                    <button
                      type="button"
                      className="qf-staff-primary-btn qf-staff-small-btn"
                      onClick={() => handleResumePaused(ticket)}
                      disabled={processingResume}
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
          <h2>Queue Control</h2>
          <p>
            Priority tickets appear before regular tickets. The assigned window is
            shown when a ticket is called.
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
            <div className="qf-staff-empty-box">
              No pending priority tickets.
            </div>
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
                      <span>Lane Number</span>
                      <strong>{ticket.lane_number || "-"}</strong>
                    </div>

                    <div className="qf-staff-meta-box">
                      <span>Queue Position</span>
                      <strong>{getQueuePositionLabel(ticket)}</strong>
                    </div>

                    <div className="qf-staff-meta-box">
                      <span>Est. Wait</span>
                      <strong>{getEstimatedWaitForTicket(ticket)}</strong>
                    </div>

                    <div className="qf-staff-meta-box">
                      <span>Assigned Window</span>
                      <strong>{ticket.window_assignment || "Not called yet"}</strong>
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
                      <span>Lane Number</span>
                      <strong>{ticket.lane_number || "-"}</strong>
                    </div>

                    <div className="qf-staff-meta-box">
                      <span>Queue Position</span>
                      <strong>{getQueuePositionLabel(ticket)}</strong>
                    </div>

                    <div className="qf-staff-meta-box">
                      <span>Est. Wait</span>
                      <strong>{getEstimatedWaitForTicket(ticket)}</strong>
                    </div>

                    <div className="qf-staff-meta-box">
                      <span>Assigned Window</span>
                      <strong>{ticket.window_assignment || "Not called yet"}</strong>
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
          <p>Finished tickets and reset-cleared tickets handled inside the selected department.</p>
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
                  <strong>{ticket.window_assignment || "-"}</strong>
                </div>

                <div className="qf-staff-meta-box">
                  <span>Priority Type</span>
                  <strong>{ticket.priority_type || "Regular"}</strong>
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
                  <span>Queue Position</span>
                  <strong>{getQueuePositionLabel(ticket)}</strong>
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
      {!sidebarOpen && (
        <button
          className="qf-staff-hamburger"
          onClick={() => setSidebarOpen(true)}
          type="button"
          aria-label="Open menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      )}

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
            <p>{assignedOffice || "Queue Operations"}</p>
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