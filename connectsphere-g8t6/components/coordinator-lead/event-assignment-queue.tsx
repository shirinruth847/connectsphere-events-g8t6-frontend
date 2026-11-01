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
import { EmptyState, Skeleton } from "@/components/shared/primitives";
import { compareValues, FilterSelect, ListToolbar, matchesSearch, type SortOrder } from "@/components/shared/list-filters";

import styles from "./event-assignment-queue.module.css";

type ViewMode = "list" | "calendar";
type QueueSort = "submitted" | "event" | "attendance" | "title";
const SORT_OPTIONS: Array<{ value: QueueSort; label: string }> = [
  { value: "submitted", label: "Submitted" },
  { value: "event", label: "Event date" },
  { value: "attendance", label: "Attendance" },
  { value: "title", label: "Title" },
];
// Longest-waiting and soonest first; the largest events first.
const DEFAULT_ORDER: Record<QueueSort, SortOrder> = { submitted: "asc", event: "asc", attendance: "desc", title: "asc" };
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

// filters: the search, organisation filter and sort above the list (the Lead's dashboard).
export function EventAssignmentQueue({ filters = false }: { filters?: boolean } = {}) {
  const loadRevision = useRef(0);
  const inFlight = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [requests, setRequests] = useState<EventRequest[]>([]);
  const [coordinators, setCoordinators] = useState<LiveCoordinator[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [assignView, setAssignView] = useState<"slots" | "week">("slots");
  const [assignment, setAssignment] = useState<number>();
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [sort, setSort] = useState<QueueSort>("submitted");
  const [order, setOrder] = useState<SortOrder>("asc");

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

  // showModal() keeps focus inside the assignment dialog; closing returns it
  // to the control that opened the dialog when that control still exists.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (selectedId === null || !dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [selectedId]);

  if (authState === "loading") {
    return <div className={styles.queue}><Skeleton className="h-48" /></div>;
  }
  if (authState === "forbidden") {
    return <div className={styles.queue}><div className="error-alert" role="alert"><h1>Lead access required</h1><span>This queue is restricted to Event Coordinator Leads. Your current account does not have permission to view or assign submitted requests.</span></div></div>;
  }
  if (authState === "error") {
    return <div className={styles.queue}><div className="error-alert" role="alert"><h1>Unable to load event requests</h1><span>{error}</span><button type="button" className="button button-secondary" disabled={loading} onClick={() => void refresh()}>Retry</button></div></div>;
  }

  const sortValue = (request: EventRequest) => ({
    submitted: request.submittedAt ?? request.createdAt,
    event: request.startDatetime,
    attendance: request.expectedAttendance,
    title: request.title.toLowerCase(),
  }[sort]);
  const organisationOptions = [...new Map(requests.flatMap((request) => (request.organisation ? [[String(request.organisation.organisationId), request.organisation.name] as const] : []))).entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
  const narrowed = Boolean(search.trim() || organisation);
  const unassigned = requests
    .filter((request) => (!organisation || String(request.organisation?.organisationId) === organisation)
      && matchesSearch(search, [request.title, request.requestId, request.organisation?.name, request.purpose]))
    .sort((left, right) => compareValues(sortValue(left), sortValue(right), order) || left.eventId - right.eventId);
  const clearFilters = () => { setSearch(""); setOrganisation(""); setSort("submitted"); setOrder("asc"); };
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
      {filters && viewMode === "list" ? (
        <ListToolbar
          id="assignment-queue"
          label="Search, sort and filter the assignment queue"
          search={search}
          onSearch={setSearch}
          placeholder="Request ID, title, purpose or organisation"
          sort={{ value: sort, options: SORT_OPTIONS, onChange: (value) => { setSort(value as QueueSort); setOrder(DEFAULT_ORDER[value as QueueSort]); }, order, onOrderChange: setOrder }}
          onClear={clearFilters}
          canClear={narrowed || sort !== "submitted" || order !== "asc"}
        >
          <FilterSelect id="assignment-organisation" label="Organisation" value={organisation} allLabel="All organisations" width="w-[13rem]" options={organisationOptions} onChange={setOrganisation} />
        </ListToolbar>
      ) : null}
      {viewMode === "calendar" ? (
        <CoordinatorAvailabilityCalendar coordinators={calendarCoordinators} />
      ) : loading ? <Skeleton className="h-48" /> : requests.length === 0 ? <EmptyState title="Queue cleared" description="Every submitted request has an Event Coordinator assigned." /> : unassigned.length === 0 ? <EmptyState title="No requests match" description="Change the search or filters, or select Clear to see the whole queue." /> : <div className="request-list">{unassigned.map((request) => <article className="request-card" key={request.eventId}><div className="card-top"><span className="status-chip">UNASSIGNED</span><span className="reference-tag">{request.requestId}</span></div><div className="request-main"><div><h3>{request.title}</h3><p className="description">Submitted by {request.organisation?.name ?? "ConnectSphere"}</p>{request.purpose && <p className="description">Purpose: {request.purpose}</p>}</div><span className="submitted">Submitted {request.submitted}</span></div><div className="details-panel"><div><span className="detail-label">DATE & TIME</span><strong>{request.date} · {request.start}–{request.end}</strong></div><div><span className="detail-label">EXPECTED ATTENDANCE</span><strong>{request.expectedAttendance} people</strong></div><div><span className="detail-label">VENUE PREFERENCES</span><strong>{request.venue}</strong></div><div><span className="detail-label">EQUIPMENT REQUIREMENTS</span><strong>{request.equipmentRequirements?.length ? request.equipmentRequirements.map((item) => `Equipment #${item.equipmentId}: ${item.quantity} ${item.quantity === 1 ? "unit" : "units"} requested`).join(" · ") : "None requested"}</strong></div></div><footer className="card-footer"><span className="next-action">Next action: choose an Event Coordinator</span><button className="button button-primary" disabled={submitting || loading || needsRefresh} onClick={() => { setSelectedId(request.eventId); setAssignView("slots"); setAssignment(undefined); setError(""); }}>Assign coordinator</button></footer></article>)}</div>}
      {selected && (
        <dialog
          ref={dialogRef}
          className="modal reassign-modal"
          aria-labelledby="assign-title"
          onCancel={(event) => {
            event.preventDefault();
            // Escape closes an open calendar entry before the dialog itself.
            const entryClose = dialogRef.current?.querySelector<HTMLButtonElement>(".cal-popover-close");
            if (entryClose) entryClose.click();
            else if (!submitting) setSelectedId(null);
          }}
        >
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
              <div className="view-toggle assignment-view-toggle" role="group" aria-label="Availability view">
                <button type="button" className={assignView === "slots" ? "active" : ""} aria-pressed={assignView === "slots"} onClick={() => setAssignView("slots")}>Time slots</button>
                <button type="button" className={assignView === "week" ? "active" : ""} aria-pressed={assignView === "week"} onClick={() => setAssignView("week")}>Event week</button>
              </div>
              <form id="assignment-form" onSubmit={submitAssignment}>
                {assignView === "slots" && (
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
                )}
              </form>
              {/* Outside the form: the calendar's own buttons are not submit buttons. */}
              {assignView === "week" && (
                <>
                  <p className="assignment-week-hint">
                    {selectedCoordinator
                      ? `Selected coordinator: ${selectedCoordinator.name}.`
                      : "No coordinator selected yet. Open an entry on the calendar and choose under Assign to, or switch to Time slots."}
                  </p>
                  <CoordinatorAvailabilityCalendar
                    coordinators={calendarCoordinators}
                    selectedEvent={toCalendarEvent(selected)}
                    selectedCoordinatorId={assignment ?? null}
                    onSelectCoordinator={(id) => {
                      setAssignment(id);
                      setError("");
                    }}
                  />
                </>
              )}
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
        </dialog>
      )}
    </div>
  );
}
