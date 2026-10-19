"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCoordinatorAvailability,
  getUnassignedEvents,
  type ApiEvent,
  type CoordinatorAvailability,
} from "@/lib/api/events";
import { CalendarView, type CalendarEvent } from "@/components/calendar/calendar-view";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { useSessionUser } from "@/components/auth/auth-gate";
import { getAccessToken } from "@/lib/supabase";

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

function EventQueueContent() {
  const router = useRouter();
  const user = useSessionUser();
  const [accessToken, setAccessToken] = useState("");
  const [requests, setRequests] = useState<EventRequest[]>([]);
  const [coordinators, setCoordinators] = useState<LiveCoordinator[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authState, setAuthState] = useState<AuthState>("loading");

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
      if (!mounted || !user) return;
      const token = await getAccessToken();
      if (!token) return;
      setAccessToken(token);
      setAuthState("ready");
      await loadData(token);
    };
    void run();
    return () => { mounted = false; };
  }, [user, router]);

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

  const calendarCoordinators = coordinators.map((c) => ({
    coordinatorId: c.coordinatorId,
    name: c.name,
    events: c.events.map((e) => toCalendarEvent(e, c.coordinatorId, c.name)),
  }));

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
          />
        </div>
      ) : loading ? <div className="empty-state"><h2>Loading requests…</h2></div> : unassigned.length === 0 ? <div className="empty-state"><span className="empty-icon">✓</span><h2>Queue cleared</h2><p>Every submitted request has an Event Coordinator assigned.</p></div> : <div className="request-list">{unassigned.map((request) => <article className="request-card" key={request.requestId}><div className="card-top"><span className="status-chip">UNASSIGNED</span><span className="reference-tag">{request.requestId}</span></div><div className="request-main"><div><h3>{request.title}</h3><p className="description">Submitted by {request.organisation?.name ?? "ConnectSphere"}</p></div><span className="submitted">Submitted {request.submitted}</span></div><div className="details-panel"><div><span className="detail-label">DATE & TIME</span><strong>{request.date} · {request.start}–{request.end}</strong></div><div><span className="detail-label">EXPECTED ATTENDANCE</span><strong>{request.expectedAttendance} people</strong></div><div><span className="detail-label">VENUE REQUIREMENT</span><strong>{request.venue}</strong></div></div><footer className="card-footer"><span className="next-action">Next action: choose an Event Coordinator</span><button className="button button-primary" disabled title="Event coordinator assignment is covered in later scope.">Assign coordinator</button></footer></article>)}</div>}
    </>
  );
}

export default function EventQueuePage() {
  return <DashboardWorkspace role="COORDINATOR_LEAD"><EventQueueContent /></DashboardWorkspace>;
}
