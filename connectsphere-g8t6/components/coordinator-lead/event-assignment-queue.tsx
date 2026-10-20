"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  assignCoordinator,
  getCoordinatorAvailability,
  getUnassignedEvents,
  type ApiEvent,
  type CoordinatorAvailability,
} from "@/lib/api/events";
import { AvailabilityMatrix } from "@/components/assignments/availability-matrix";
import { type CalendarEvent } from "@/components/calendar/calendar-view";
import { CoordinatorAvailabilityCalendar } from "@/components/calendar/coordinator-availability-calendar";

import styles from "./event-assignment-queue.module.css";

type ViewMode = "list" | "calendar";
type EventRequest = Omit<ApiEvent, "organisation"> & { date: string; start: string; end: string; organiser: string; organisation: { organisationId: number; name: string } | null; venue: string; submitted: string };
type LiveCoordinator = Omit<CoordinatorAvailability, "events"> & { events: EventRequest[] };
type AuthState = "loading" | "ready" | "forbidden" | "error";

function toRequest(event: ApiEvent): EventRequest {
  const start = new Date(event.startDatetime);
  const end = new Date(event.endDatetime);
  return {
    ...event,
    date: start.toLocaleDateString("en-GB", { timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric" }),
    start: start.toLocaleTimeString([], { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hour12: false }),
    end: end.toLocaleTimeString([], { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hour12: false }),
    organiser: "Event organiser",
    organisation: event.organisation ?? null,
    venue: event.venuePreferences?.length ? event.venuePreferences.map((id, index) => `Preference ${index + 1}: Venue #${id}`).join(" · ") : "No venue preference",
    submitted: new Date(event.submittedAt ?? event.createdAt).toLocaleString("en-SG", { timeZone: "Asia/Singapore" }),
  };
}
function toCalendarEvent(event: EventRequest, coordinatorId?: number, coordinatorName?: string): CalendarEvent {
  return {
    eventId: event.eventId,
    title: event.title,
    startDatetime: event.startDatetime,
    endDatetime: event.endDatetime,
    coordinatorId,
    coordinatorName,
    isRequested: false,
    status: event.status,
    requestId: event.requestId,
    expectedAttendance: event.expectedAttendance,
    organisation: typeof event.organisation === 'string' ? event.organisation : event.organisation?.name ?? null,
    createdAt: event.createdAt,
  };
}

function overlaps(first: EventRequest, second: EventRequest) {
  return Date.parse(first.startDatetime) < Date.parse(second.endDatetime) && Date.parse(second.startDatetime) < Date.parse(first.endDatetime);
}

export function EventAssignmentQueue() {
  const loadRevision = useRef(0);
  const inFlight = useRef(false);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [requests, setRequests] = useState<EventRequest[]>([]);
  const [coordinators, setCoordinators] = useState<LiveCoordinator[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [assignment, setAssignment] = useState<number>();
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(() => {
    const revision = ++loadRevision.current;
    return getUnassignedEvents().then(async (queue) => {
      if (revision !== loadRevision.current) return false;
      setError("");
      setAvailabilityError("");
      setRequests(queue.events.map(toRequest));
      setAuthState("ready");
      try {
        const availability = await getCoordinatorAvailability();
        if (revision !== loadRevision.current) return false;
        setCoordinators(availability.coordinators.map((coordinator) => ({ ...coordinator, events: coordinator.events.map(toRequest) })));
        setNeedsRefresh(false);
        return true;
      } catch (cause) {
        if (revision !== loadRevision.current) return false;
        setCoordinators([]);
        setNeedsRefresh(true);
        setAvailabilityError(cause instanceof Error ? cause.message : "Availability is temporarily unavailable.");
        return false;
      }
    }).catch((cause) => {
      if (revision !== loadRevision.current) return false;
      const failure = cause as Error & { status?: number };
      setError(failure.message);
      setAuthState(failure.status === 403 ? "forbidden" : "error");
      return false;
    }).finally(() => {
      if (revision === loadRevision.current) setLoading(false);
    });
  }, []);

  function refresh() {
    setLoading(true);
    return loadData();
  }

  useEffect(() => {
    void loadData();
    return () => { loadRevision.current += 1; };
  }, [loadData]);

  if (authState === "loading") {
    return <div className="empty-state"><h2>Loading requests…</h2></div>;
  }
  if (authState === "forbidden") {
    return <div className="access-denied"><div className="access-card"><span className="eyebrow">EVENT ASSIGNMENT WORKSPACE</span><h1>Lead access required</h1><p>This queue is restricted to Event Coordinator Leads. Your current account does not have permission to view or assign submitted requests.</p></div></div>;
  }
  if (authState === "error") {
    return <div className="access-denied"><div className="access-card"><h1>Unable to load event requests</h1><p>{error}</p><button className="button button-primary" disabled={loading} onClick={() => void refresh()}>Retry</button></div></div>;
  }

  const unassigned = requests;
  const selected = requests.find((request) => request.eventId === selectedId);
  const selectedCoordinator = coordinators.find((coordinator) => coordinator.coordinatorId === assignment);
  const conflict = selected && selectedCoordinator?.events.find((event) => overlaps(event, selected));
  const assignmentBlocked = Boolean(conflict) || submitting || loading || needsRefresh;

  const calendarCoordinators = coordinators.map((c) => ({
    coordinatorId: c.coordinatorId,
    name: c.name,
    events: c.events.map((e) => toCalendarEvent(e, c.coordinatorId, c.name)),
  }));

  async function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || assignmentBlocked) return;
    if (!selected || assignment === undefined) {
      setError("Select an Event Coordinator before confirming the assignment.");
      return;
    }
    if (conflict) {
      setError(`${selectedCoordinator?.name} is unavailable from ${selected.start} to ${selected.end} because "${conflict.title}" is scheduled from ${conflict.start} to ${conflict.end}. Choose another coordinator.`);
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError("");
    try {
      await assignCoordinator(selected.eventId, assignment);
      const confirmation = `${selected.requestId} assigned to ${selectedCoordinator?.name}.`;
      setSelectedId(null);
      setAssignment(undefined);
      await refresh();
      setFeedback(confirmation);
    } catch (assignmentError) {
      setNeedsRefresh(true);
      setSelectedId(null);
      setAssignment(undefined);
      const typedError = assignmentError as Error & { status?: number; code?: string };
      setError(typedError.code === "COORDINATOR_CONFLICT" ? "The selected coordinator became unavailable. Choose another coordinator." : typedError.message);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.queue}>
      {(needsRefresh || availabilityError) && <div className="error-alert" role="alert"><strong>Refresh availability before assigning</strong><span>{availabilityError || "The last result may have changed the queue. Reload its current state before another assignment."}</span><button type="button" className="button button-secondary" disabled={loading || submitting} onClick={() => void refresh()}>Refresh availability</button></div>}
      {feedback && <div className="success-banner" role="status">{feedback}<button onClick={() => setFeedback("")} aria-label="Dismiss">×</button></div>}
      {error && <div className="error-alert" role="alert"><strong>Request failed</strong><span>{error}</span></div>}
      <section className="section-heading"><div><h2>{viewMode === "list" ? "Assignment queue" : "Coordinator availability"}</h2><p>{viewMode === "list" ? "Only submitted requests without an assigned coordinator appear here." : "Review each coordinator's scheduled events before assigning a request."}</p></div><div className="view-toggle" role="group" aria-label="Queue view"><button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>Unassigned requests</button><button className={viewMode === "calendar" ? "active" : ""} onClick={() => setViewMode("calendar")}>Calendar</button></div></section>
      {viewMode === "calendar" ? (
        <CoordinatorAvailabilityCalendar
            coordinators={calendarCoordinators}
            selectedEvent={selected ? toCalendarEvent(selected) : undefined}
            selectedCoordinatorId={assignment}
            onSelectCoordinator={(id) => {
              setAssignment(id);
              setError("");
            }}
        />
      ) : loading ? <div className="empty-state"><h2>Loading requests…</h2></div> : unassigned.length === 0 ? <div className="empty-state"><span className="empty-icon">✓</span><h2>Queue cleared</h2><p>Every submitted request has an Event Coordinator assigned.</p></div> : <div className="request-list">{unassigned.map((request) => <article className="request-card" key={request.eventId}><div className="card-top"><span className="status-chip">UNASSIGNED</span><span className="reference-tag">{request.requestId}</span></div><div className="request-main"><div><h3>{request.title}</h3><p className="description">Submitted by {request.organisation?.name ?? "ConnectSphere"}</p>{request.purpose && <p className="description">Purpose: {request.purpose}</p>}</div><span className="submitted">Submitted {request.submitted}</span></div><div className="details-panel"><div><span className="detail-label">DATE & TIME</span><strong>{request.date} · {request.start}–{request.end}</strong></div><div><span className="detail-label">EXPECTED ATTENDANCE</span><strong>{request.expectedAttendance} people</strong></div><div><span className="detail-label">VENUE PREFERENCES</span><strong>{request.venue}</strong></div><div><span className="detail-label">EQUIPMENT REQUIREMENTS</span><strong>{request.equipmentRequirements?.length ? request.equipmentRequirements.map((item) => `Equipment #${item.equipmentId}: ${item.quantity} ${item.quantity === 1 ? "unit" : "units"} requested`).join(" · ") : "None requested"}</strong></div></div><footer className="card-footer"><span className="next-action">Next action: choose an Event Coordinator</span><button className="button button-primary" disabled={submitting || loading || needsRefresh} onClick={() => { setSelectedId(request.eventId); setAssignment(undefined); setError(""); }}>Assign coordinator</button></footer></article>)}</div>}
      {selected && (
        <div className="modal-backdrop assignments-modal-backdrop" role="presentation">
          <section className="modal reassign-modal" role="dialog" aria-modal="true" aria-labelledby="assign-title">
            <header className="modal-header">
              <div>
                <span className="eyebrow">ASSIGN REQUEST</span>
                <h2 id="assign-title">{selected.title}</h2>
                <span className="reference-tag">{selected.requestId}</span>
              </div>
              <button className="close-button" disabled={submitting} onClick={() => setSelectedId(null)} aria-label="Close">×</button>
            </header>
            <div className="modal-body">
              <div className="reassign-event-summary">
                <div>
                  <span className="status-chip status-chip--primary">UNASSIGNED</span>
                  <h3>{selected.title}</h3>
                </div>
                <dl className="reassign-details">
                  <div>
                    <dt>Submitted by</dt>
                    <dd>{selected.organisation?.name ?? "ConnectSphere"}</dd>
                  </div>
                  <div>
                    <dt>Event time</dt>
                    <dd>{selected.date} · {selected.start}–{selected.end}</dd>
                  </div>
                  <div>
                    <dt>Expected attendance</dt>
                    <dd>{selected.expectedAttendance.toLocaleString()} people</dd>
                  </div>
                </dl>
              </div>
              {conflict && (
                <div className="conflict-alert" id="assignment-conflict" role="alert">
                  <strong>Schedule overlap detected</strong>
                  <span>{selectedCoordinator?.name} already has “{conflict.title}” scheduled from {conflict.start} to {conflict.end}. This assignment will be blocked.</span>
                </div>
              )}
              {error && (
                <div className="error-alert" role="alert">
                  <strong>Assignment cannot be confirmed</strong>
                  <span>{error}</span>
                </div>
              )}
              <form id="assignment-form" onSubmit={submitAssignment}>
                <fieldset className="coordinator-options">
                  <legend>Choose an Event Coordinator</legend>
                  <AvailabilityMatrix
                    coordinators={coordinators}
                    requested={selected}
                    selectedCoordinatorId={assignment ?? null}
                    onSelect={(id) => {
                      setAssignment(id);
                      setError("");
                    }}
                  />
                </fieldset>
              </form>
            </div>
            <footer className="modal-footer">
              <button className="button button-secondary" type="button" disabled={submitting} onClick={() => setSelectedId(null)}>Cancel</button>
              <button
                className="button button-primary"
                form="assignment-form"
                disabled={assignmentBlocked || assignment === undefined}
                aria-describedby={conflict ? "assignment-conflict" : undefined}
                title={conflict ? "Choose a coordinator without a schedule conflict." : undefined}
              >
                {submitting ? "Assigning…" : conflict ? "Conflict detected" : "Confirm assignment"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
