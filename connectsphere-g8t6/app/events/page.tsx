"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  assignCoordinator,
  getCoordinatorAvailability,
  getCurrentUser,
  getUnassignedEvents,
  type ApiEvent,
  type CoordinatorAvailability,
} from "@/lib/api/events";
import { AvailabilityMatrix } from "@/components/assignments/availability-matrix";
import { CalendarView, type CalendarEvent } from "@/components/calendar/calendar-view";
import { CoordinatorShell } from "@/components/layout/coordinator-shell";
import { useAuth } from "@/components/auth/auth-provider";

type ViewMode = "list" | "calendar";
type EventRequest = Omit<ApiEvent, "organisation"> & { date: string; start: string; end: string; organiser: string; organisation: { organisationId: number; name: string } | null; venue: string; submitted: string };
type LiveCoordinator = Omit<CoordinatorAvailability, "events"> & { events: EventRequest[] };
type AuthState = "loading" | "unauthenticated" | "ready" | "forbidden" | "error";

function toRequest(event: ApiEvent): EventRequest {
  const start = new Date(event.startDatetime);
  const end = new Date(event.endDatetime);
  return {
    ...event,
    date: start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    start: start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    end: end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    organiser: "Event organiser",
    organisation: event.organisation ?? null,
    venue: "Assigned after review",
    submitted: new Date(event.createdAt).toLocaleString(),
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
  return first.startDatetime < second.endDatetime && second.startDatetime < first.endDatetime;
}

function EventQueueContent() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [accessToken, setAccessToken] = useState("");
  const [requests, setRequests] = useState<EventRequest[]>([]);
  const [coordinators, setCoordinators] = useState<LiveCoordinator[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [assignment, setAssignment] = useState<number>();
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function loadData(token: string) {
    setLoading(true);
    setError("");
    setFeedback("");
    try {
      const [queue, availability] = await Promise.all([getUnassignedEvents(token), getCoordinatorAvailability(token)]);
      setRequests(queue.events.map(toRequest));
      setCoordinators(availability.coordinators.map((coordinator) => ({ ...coordinator, events: coordinator.events.map(toRequest) })));
    } catch (loadError) {
      const typedError = loadError as Error & { status?: number };
      setError(typedError.status === 403 ? "Your account is not permitted to view this queue." : typedError.message);
      setAuthState(typedError.status === 403 ? "forbidden" : "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!mounted) return;
      // Redirect decisions come from the single source of truth (AuthProvider)
      // and only run once auth state has finished loading.
      if (authLoading) return;
      const token = session?.access_token ?? null;
      if (!token) {
        setAuthState("unauthenticated");
        router.replace("/");
        return;
      }
      setAccessToken(token);
      try {
        const result = await getCurrentUser(token);
        const canManageRequests = result.user.role === "COORDINATOR_LEAD";
        setAuthState(canManageRequests ? "ready" : "forbidden");
        if (canManageRequests) await loadData(token);
      } catch (loadError) {
        const typedError = loadError as Error & { status?: number };
        if (typedError.status === 401) {
          setAccessToken("");
          setAuthState("unauthenticated");
          router.replace("/");
        } else {
          setError(typedError.message);
          setAuthState("error");
        }
      }
    };
    void run();
    return () => { mounted = false; };
  }, [session, authLoading, router]);

  if (authState === "loading") {
    return <div className="empty-state"><h2>Loading requests…</h2></div>;
  }
  if (authState === "forbidden") {
    return <div className="access-denied"><div className="access-card"><span className="eyebrow">EVENT COORDINATOR LEAD WORKSPACE</span><h1>Lead access required</h1><p>This queue is restricted to Event Coordinator Leads. Your current account does not have permission to view or assign submitted requests.</p></div></div>;
  }
  if (authState === "error") {
    return <div className="access-denied"><div className="access-card"><h1>Unable to load event requests</h1><p>{error}</p><button className="button button-primary" onClick={() => loadData(accessToken)}>Retry</button></div></div>;
  }

  const unassigned = requests;
  const selected = requests.find((request) => request.eventId === selectedId);
  const selectedCoordinator = coordinators.find((coordinator) => coordinator.coordinatorId === assignment);
  const conflict = selected && selectedCoordinator?.events.find((event) => overlaps(event, selected));
  const assignmentBlocked = Boolean(conflict) || submitting;

  const calendarCoordinators = coordinators.map((c) => ({
    coordinatorId: c.coordinatorId,
    name: c.name,
    events: c.events.map((e) => toCalendarEvent(e, c.coordinatorId, c.name)),
  }));

  async function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || assignment === undefined) {
      setError("Select an Event Coordinator before confirming the assignment.");
      return;
    }
    if (conflict) {
      setError(`${selectedCoordinator?.name} is unavailable from ${selected.start} to ${selected.end} because "${conflict.title}" is scheduled from ${conflict.start} to ${conflict.end}. Choose another coordinator.`);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await assignCoordinator(selected.eventId, assignment, accessToken);
      setFeedback(`${selected.requestId} assigned to ${selectedCoordinator?.name}.`);
      setSelectedId(null);
      setAssignment(undefined);
      await loadData(accessToken);
    } catch (assignmentError) {
      const typedError = assignmentError as Error & { status?: number; code?: string };
      setError(typedError.code === "COORDINATOR_CONFLICT" ? "The selected coordinator became unavailable. Choose another coordinator." : typedError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {feedback && <div className="success-banner" role="status">{feedback}<button onClick={() => setFeedback("")} aria-label="Dismiss">×</button></div>}
      {error && <div className="error-alert" role="alert"><strong>Request failed</strong><span>{error}</span></div>}
      <section className="section-heading"><div><h2>{viewMode === "list" ? "Assignment queue" : "Coordinator availability"}</h2><p>{viewMode === "list" ? "Only submitted requests without an assigned coordinator appear here." : "Review each coordinator's scheduled events before assigning a request."}</p></div><div className="view-toggle" role="group" aria-label="Queue view"><button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>Unassigned requests</button><button className={viewMode === "calendar" ? "active" : ""} onClick={() => setViewMode("calendar")}>Calendar</button></div></section>
      {viewMode === "calendar" ? (
        <div className="calendar-panel">
          <div className="calendar-panel-header"><strong>Coordinator availability</strong><span>Live data from the backend</span></div>
          <CalendarView
            coordinators={calendarCoordinators}
            selectedEvent={selected ? toCalendarEvent(selected) : undefined}
            selectedCoordinatorId={assignment}
            onSelectCoordinator={(id) => {
              setAssignment(id);
              setError("");
            }}
          />
        </div>
      ) : loading ? <div className="empty-state"><h2>Loading requests…</h2></div> : unassigned.length === 0 ? <div className="empty-state"><span className="empty-icon">✓</span><h2>Queue cleared</h2><p>Every submitted request has an Event Coordinator assigned.</p></div> : <div className="request-list">{unassigned.map((request) => <article className="request-card" key={request.eventId}><div className="card-top"><span className="status-chip">UNASSIGNED</span><span className="reference-tag">{request.requestId}</span></div><div className="request-main"><div><h3>{request.title}</h3><p className="description">Submitted by {request.organisation?.name ?? "ConnectSphere"}</p></div><span className="submitted">Submitted {request.submitted}</span></div><div className="details-panel"><div><span className="detail-label">DATE & TIME</span><strong>{request.date} · {request.start}–{request.end}</strong></div><div><span className="detail-label">EXPECTED ATTENDANCE</span><strong>{request.expectedAttendance} people</strong></div><div><span className="detail-label">VENUE REQUIREMENT</span><strong>{request.venue}</strong></div></div><footer className="card-footer"><span className="next-action">Next action: choose an Event Coordinator</span><button className="button button-primary" onClick={() => { setSelectedId(request.eventId); setAssignment(undefined); setError(""); }}>Assign coordinator</button></footer></article>)}</div>}
      {selected && (
        <div className="modal-backdrop assignments-modal-backdrop" role="presentation">
          <section className="modal reassign-modal" role="dialog" aria-modal="true" aria-labelledby="assign-title">
            <header className="modal-header">
              <div>
                <span className="eyebrow">ASSIGN REQUEST</span>
                <h2 id="assign-title">{selected.title}</h2>
                <span className="reference-tag">{selected.requestId}</span>
              </div>
              <button className="close-button" onClick={() => setSelectedId(null)} aria-label="Close">×</button>
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
              <button className="button button-secondary" type="button" onClick={() => setSelectedId(null)}>Cancel</button>
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
    </>
  );
}

export default function EventQueuePage() {
  return (
    <CoordinatorShell userName="Coordinator Lead" userEmail="coordinator@connectsphere.test">
      <EventQueueContent />
    </CoordinatorShell>
  );
}