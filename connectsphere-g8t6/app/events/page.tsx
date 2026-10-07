"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  assignCoordinator,
  getCoordinatorAvailability,
  getCurrentUser,
  getUnassignedEvents,
  type ApiEvent,
  type CoordinatorAvailability,
} from "../../lib/api/events";
import { getSupabaseBrowserClient } from "../../lib/supabase/browser";

type ViewMode = "list" | "calendar";
type EventRequest = Omit<ApiEvent, "organisation"> & { date: string; start: string; end: string; organiser: string; organisation: string; venue: string; submitted: string };
type LiveCoordinator = Omit<CoordinatorAvailability, "events"> & { events: EventRequest[] };
type AuthState = "loading" | "signed-out" | "ready" | "forbidden" | "configuration-error" | "error";

function toRequest(event: ApiEvent): EventRequest {
  const start = new Date(event.startDatetime);
  const end = new Date(event.endDatetime);
  return {
    ...event,
    date: start.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    start: start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    end: end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    organiser: "Event organiser",
    organisation: event.organisation?.name ?? "ConnectSphere",
    venue: "Assigned after review",
    submitted: new Date(event.createdAt).toLocaleString(),
  };
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function overlaps(first: EventRequest, second: EventRequest) {
  return first.startDatetime < second.endDatetime && second.startDatetime < first.endDatetime;
}

function CoordinatorCalendar({ workloads, selected, assignment, onSelect }: { workloads: LiveCoordinator[]; selected?: EventRequest; assignment?: number; onSelect?: (id: number) => void }) {
  return (
    <div className="availability-calendar" aria-label="Coordinator availability calendar">
      <div className="time-axis" aria-hidden="true">
        {["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"].map((time) => <span key={time}>{time}</span>)}
      </div>
      <div className="coordinator-columns">
        {workloads.map((coordinator) => {
          const column = (
            <>
              <span className="coordinator-header"><strong>{coordinator.name}</strong><b>{coordinator.events.length} {coordinator.events.length === 1 ? "event" : "events"}</b></span>
              <span className="calendar-grid">
                {coordinator.events.map((event) => <span className="busy-block" key={event.eventId} style={{ top: `${((timeToMinutes(event.start) - 480) / 60) * 10}%`, height: `${((timeToMinutes(event.end) - timeToMinutes(event.start)) / 60) * 10}%` }}>{event.title}<small>{event.start}–{event.end}</small></span>)}
                {selected && <span className="requested-slot" style={{ top: `${((timeToMinutes(selected.start) - 480) / 60) * 10}%`, height: `${((timeToMinutes(selected.end) - timeToMinutes(selected.start)) / 60) * 10}%` }}>This request</span>}
              </span>
            </>
          );
          return onSelect ? <button className={`coordinator-column${assignment === coordinator.coordinatorId ? " selected" : ""}`} key={coordinator.coordinatorId} type="button" onClick={() => onSelect(coordinator.coordinatorId)} aria-pressed={assignment === coordinator.coordinatorId}>{column}</button> : <div className="coordinator-column" key={coordinator.coordinatorId}>{column}</div>;
        })}
      </div>
    </div>
  );
}

export default function EventQueuePage() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [accessToken, setAccessToken] = useState("");
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    try {
      const supabase = getSupabaseBrowserClient();
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!mounted) return;
        if (!session?.access_token) {
          setAuthState("signed-out");
          return;
        }
        try {
          const result = await getCurrentUser(session.access_token);
          setAccessToken(session.access_token);
          setUserName(result.user.name);
          setAuthState(result.user.role === "COORDINATOR_LEAD" ? "ready" : "forbidden");
          if (result.user.role === "COORDINATOR_LEAD") await loadData(session.access_token);
        } catch (loadError) {
          const typedError = loadError as Error & { status?: number };
          if (typedError.status === 401) {
            setAccessToken("");
            setAuthState("signed-out");
          } else {
            setError(typedError.message);
            setAuthState("error");
          }
        }
      });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session) {
          setAccessToken("");
          setAuthState("signed-out");
        }
      });
      return () => { mounted = false; listener.subscription.unsubscribe(); };
    } catch (configurationError) {
      queueMicrotask(() => {
        if (!mounted) return;
        setError((configurationError as Error).message);
        setAuthState("configuration-error");
      });
    }
  }, []);

  const unassigned = requests;
  const selected = requests.find((request) => request.eventId === selectedId);
  const selectedCoordinator = coordinators.find((coordinator) => coordinator.coordinatorId === assignment);
  const conflict = selected && selectedCoordinator?.events.find((event) => overlaps(event, selected));
  const assignmentBlocked = Boolean(conflict) || submitting;

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const { data, error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({ email, password });
      if (signInError || !data.session) throw signInError ?? new Error("Sign-in did not return an active session.");
      const result = await getCurrentUser(data.session.access_token);
      if (result.user.role !== "COORDINATOR_LEAD") {
        setAuthState("forbidden");
        return;
      }
      setAccessToken(data.session.access_token);
      setUserName(result.user.name);
      setAuthState("ready");
      await loadData(data.session.access_token);
    } catch (signInError) {
      setError((signInError as Error).message);
    }
  }

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

  if (authState === "loading") return <main className="access-denied"><div className="access-card"><h1>Loading ConnectSphere</h1><p>Checking your authenticated session.</p></div></main>;
  if (authState === "configuration-error") return <main className="access-denied"><div className="access-card"><h1>Supabase setup required</h1><p>{error}</p></div></main>;
  if (authState === "signed-out") return <main className="access-denied"><div className="access-card"><span className="eyebrow">CONNECTSPHERE AUTHENTICATION</span><h1>Sign in to event operations</h1><p>Use an Event Coordinator Lead account to view and assign submitted event requests.</p><form onSubmit={signIn}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <div className="error-alert" role="alert"><span>{error}</span></div>}<button className="button button-primary" type="submit">Sign in</button></form></div></main>;
  if (authState === "forbidden") return <main className="access-denied"><div className="access-card"><span className="eyebrow">COORDINATOR LEAD OPERATIONS</span><h1>Unassigned request queue</h1><p>This queue is restricted to Event Coordinator Leads. Your current account does not have permission to view or assign submitted requests.</p><button className="button button-secondary" onClick={() => getSupabaseBrowserClient().auth.signOut()}>Sign out</button></div></main>;
  if (authState === "error") return <main className="access-denied"><div className="access-card"><h1>Unable to load event requests</h1><p>{error}</p><button className="button button-primary" onClick={() => loadData(accessToken)}>Retry</button></div></main>;

  return (
    <main className="console-shell">
      <header className="top-nav"><a className="brand" href="/events"><span className="brand-mark">C</span><span>ConnectSphere</span></a><nav aria-label="Primary navigation"><a className="nav-link active" href="/events">Event requests</a><a className="nav-link" href="#calendar">Coordinator calendar</a></nav><div className="profile"><span className="avatar">{userName.slice(0, 2).toUpperCase()}</span><span><strong>{userName}</strong><small>Event Coordinator Lead</small></span><button className="role-switch" onClick={() => getSupabaseBrowserClient().auth.signOut()}>Sign out</button></div></header>
      <div className="content"><section className="page-header"><div><span className="eyebrow"><span className="status-dot" /> COORDINATOR LEAD CONTROL CENTER</span><h1>Unassigned event requests</h1><p>Review newly submitted requests and assign each one to the right Event Coordinator.</p></div><div className="header-actions"><div className="stat-chip"><strong>{unassigned.length}</strong><span>Awaiting assignment</span></div><button className="button button-secondary" onClick={() => loadData(accessToken)} disabled={loading}>{loading ? "Refreshing…" : "Refresh data"}</button></div></section>
        {feedback && <div className="success-banner" role="status">{feedback}<button onClick={() => setFeedback("")} aria-label="Dismiss">×</button></div>}
        {error && <div className="error-alert" role="alert"><strong>Request failed</strong><span>{error}</span></div>}
        <section className="section-heading"><div><h2>{viewMode === "list" ? "Assignment queue" : "Coordinator availability"}</h2><p>{viewMode === "list" ? "Only submitted requests without an assigned coordinator appear here." : "Review each coordinator's scheduled events before assigning a request."}</p></div><div className="view-toggle" role="group" aria-label="Queue view"><button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>Unassigned requests</button><button className={viewMode === "calendar" ? "active" : ""} onClick={() => setViewMode("calendar")}>Calendar</button></div></section>
        {viewMode === "calendar" ? <div className="calendar-panel"><div className="calendar-panel-header"><strong>Coordinator availability</strong><span>Live data from the backend</span></div><CoordinatorCalendar workloads={coordinators} /></div> : loading ? <div className="empty-state"><h2>Loading requests…</h2></div> : unassigned.length === 0 ? <div className="empty-state"><span className="empty-icon">✓</span><h2>Queue cleared</h2><p>Every submitted request has an Event Coordinator assigned.</p></div> : <div className="request-list">{unassigned.map((request) => <article className="request-card" key={request.eventId}><div className="card-top"><span className="status-chip">UNASSIGNED</span><span className="reference-tag">{request.requestId}</span></div><div className="request-main"><div><h3>{request.title}</h3><p className="description">Submitted by {request.organisation}</p></div><span className="submitted">Submitted {request.submitted}</span></div><div className="details-panel"><div><span className="detail-label">DATE & TIME</span><strong>{request.date} · {request.start}–{request.end}</strong></div><div><span className="detail-label">EXPECTED ATTENDANCE</span><strong>{request.expectedAttendance} people</strong></div><div><span className="detail-label">VENUE REQUIREMENT</span><strong>{request.venue}</strong></div></div><footer className="card-footer"><span className="next-action">Next action: choose an Event Coordinator</span><button className="button button-primary" onClick={() => { setSelectedId(request.eventId); setAssignment(undefined); setError(""); }}>Assign coordinator</button></footer></article>)}</div>}
      </div>
      {selected && <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="assign-title"><div className="modal-header"><div><span className="eyebrow">ASSIGN REQUEST</span><h2 id="assign-title">{selected.title}</h2><span className="reference-tag">{selected.requestId}</span></div><button className="close-button" onClick={() => setSelectedId(null)} aria-label="Close">×</button></div><div className="modal-body"><div className="modal-summary"><strong>{selected.date}</strong><span>{selected.start}–{selected.end} · {selected.expectedAttendance} people</span></div>{conflict && <div className="conflict-alert" id="assignment-conflict" role="alert"><strong>Schedule overlap detected</strong><span>{selectedCoordinator?.name} already has “{conflict.title}” scheduled from {conflict.start} to {conflict.end}. This assignment will be blocked.</span></div>}{error && <div className="error-alert" role="alert"><strong>Assignment cannot be confirmed</strong><span>{error}</span></div>}<form id="assignment-form" onSubmit={submitAssignment}><div className="calendar-heading"><div><label>Coordinator availability</label><span>Live schedule from the backend</span></div><span className="calendar-legend"><i className="available-key" /> Available <i className="busy-key" /> Busy</span></div><CoordinatorCalendar workloads={coordinators} selected={selected} assignment={assignment} onSelect={(id) => { setAssignment(id); setError(""); }} /><p className="selection-hint">{selectedCoordinator ? `${selectedCoordinator.name} selected · ${selectedCoordinator.events.length} existing events` : "Select a coordinator column to assign this request."}</p></form></div><footer className="modal-footer"><button className="button button-secondary" type="button" onClick={() => setSelectedId(null)}>Cancel</button><button className="button button-primary" form="assignment-form" disabled={assignmentBlocked} aria-describedby={conflict ? "assignment-conflict" : undefined} title={conflict ? "Choose a coordinator without a schedule conflict." : undefined}>{submitting ? "Assigning…" : conflict ? "Conflict detected" : "Confirm assignment"}</button></footer></section></div>}
    </main>
  );
}
