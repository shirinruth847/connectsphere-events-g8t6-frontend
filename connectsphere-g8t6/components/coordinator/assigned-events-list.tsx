"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageContent } from "@/components/layout/page-content";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { AlertBanner, Button, buttonClasses, EmptyState, ReferenceIdTag, Skeleton, StatusChip } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { SectionHeading } from "@/components/shared/section-heading";
import { compareValues, FilterSelect, ListToolbar, matchesSearch, type SortOrder } from "@/components/shared/list-filters";
import { listAssignedEvents, type AssignedEvent } from "@/lib/api/event-workspace";
import { ROLE_LABELS } from "@/lib/auth";
import { statusPresentation } from "@/lib/events";
import { formatEventWindow } from "@/lib/datetime";

type EventSort = "event" | "updated" | "title" | "attendance";
const SORT_OPTIONS: Array<{ value: EventSort; label: string }> = [
  { value: "event", label: "Event date" },
  { value: "updated", label: "Last updated" },
  { value: "title", label: "Title" },
  { value: "attendance", label: "Attendance" },
];
// Soonest events first; the most recently updated first.
const DEFAULT_ORDER: Record<EventSort, SortOrder> = { event: "asc", updated: "desc", title: "asc", attendance: "desc" };
const sortValue = (event: AssignedEvent, sort: EventSort) => ({
  event: event.startDatetime,
  updated: event.updatedAt,
  title: event.title.toLowerCase(),
  attendance: event.expectedAttendance,
}[sort]);

type ListState =
  | { status: "loading" }
  | { status: "ready"; events: AssignedEvent[] }
  | { status: "error"; message: string };

function AssignedEventCard({ event }: { event: AssignedEvent }) {
  const presentation = statusPresentation(event.status);
  const titleId = `assigned-${event.eventId}-title`;
  return (
    <article
      aria-labelledby={titleId}
      className={`flex flex-col gap-4 rounded-panel border-t-4 ${presentation.border} bg-surface-container-lowest p-5 shadow-elevation-1 transition-shadow duration-150 hover:shadow-elevation-2`}
    >
      <div className="flex items-center justify-between gap-3">
        <StatusChip status={event.status} />
        <ReferenceIdTag value={event.requestId} />
      </div>
      <div>
        <h3 id={titleId} className="line-clamp-2 text-base font-bold leading-snug text-on-surface">{event.title}</h3>
        <p className="mt-1 text-xs text-on-surface-variant">{event.organisation?.name ?? "Organisation not provided"}</p>
      </div>
      <KeyValuePanel
        rows={[
          { icon: "calendar", label: "Date & time", value: formatEventWindow(event.startDatetime, event.endDatetime) },
          {
            icon: "attendees",
            label: "Attendance",
            value: event.expectedAttendance ? `${event.expectedAttendance.toLocaleString()} people` : "Not provided",
          },
        ]}
      />
      {event.status === "AWAITING_CLARIFICATION" ? (
        <p className="flex items-start gap-2 rounded-control bg-error-container p-3 text-xs font-semibold text-on-error-container">
          <Icon name="info" size={16} />Waiting for the organiser to respond to your clarification request.
        </p>
      ) : null}
      <div className="mt-auto">
        <Link href={`/events/${event.eventId}`} className={buttonClasses("primary")} aria-describedby={titleId}>
          Open event<Icon name="arrow-forward" size={16} />
        </Link>
      </div>
    </article>
  );
}

// The Event Coordinator's dashboard: every event a Lead has assigned to them.
export function AssignedEventsList() {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<EventSort>("event");
  const [order, setOrder] = useState<SortOrder>("asc");

  useEffect(() => {
    let alive = true;
    listAssignedEvents()
      .then(({ events }) => {
        if (alive) setState({ status: "ready", events });
      })
      .catch((caught: unknown) => {
        if (alive) setState({ status: "error", message: caught instanceof Error ? caught.message : "Could not load your assigned events." });
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  const events = state.status === "ready" ? state.events : [];
  const needsAction = events.filter((event) => event.status === "AWAITING_CLARIFICATION").length;
  const statusOptions = [...new Set(events.map((event) => event.status))].map((value) => ({ value, label: statusPresentation(value).label }));
  const shown = events
    .filter((event) => (!status || event.status === status) && matchesSearch(search, [event.title, event.requestId, event.organisation?.name]))
    .sort((left, right) => compareValues(sortValue(left, sort), sortValue(right, sort), order) || left.eventId - right.eventId);
  const filtered = Boolean(search.trim() || status);
  const clear = () => { setSearch(""); setStatus(""); setSort("event"); setOrder("asc"); };

  return (
    <PageContent
        eyebrow={ROLE_LABELS.COORDINATOR}
        title={`${ROLE_LABELS.COORDINATOR} dashboard`}
        description="Events a Coordinator Lead has assigned to you, soonest first. Open one to review it, correct its title, purpose or description, and see its change history."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {state.status === "ready" ? (
              <>
                <span className="rounded-control bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
                  <strong className="block text-xl font-bold text-primary">{events.length}</strong>Assigned
                </span>
                <span className={`rounded-control px-3 py-2 text-xs ${needsAction ? "bg-error-container text-on-error-container" : "bg-surface-container-low text-on-surface-variant"}`}>
                  <strong className={`block text-xl font-bold ${needsAction ? "" : "text-primary"}`}>{needsAction}</strong>Awaiting clarification
                </span>
              </>
            ) : null}
            {/* The coordinator's Updates button and panel, shared with attendees and organisers (SPM-193). */}
            <NotificationsBell />
          </div>
        }
      >
      <section aria-labelledby="assigned-heading" className="grid gap-4">
        <SectionHeading id="assigned-heading" title="Assigned events" description="Only events currently assigned to you appear here." />
        <ListToolbar
          id="assigned-events"
          label="Search, sort and filter assigned events"
          search={search}
          onSearch={setSearch}
          placeholder="Request ID, title or organisation"
          sort={{ value: sort, options: SORT_OPTIONS, onChange: (value) => { setSort(value as EventSort); setOrder(DEFAULT_ORDER[value as EventSort]); }, order, onOrderChange: setOrder }}
          onClear={clear}
          canClear={filtered || sort !== "event" || order !== "asc"}
        >
          <FilterSelect id="assigned-status" label="Status" value={status} allLabel="All statuses" width="w-[12rem]" options={statusOptions} onChange={setStatus} />
        </ListToolbar>
        {state.status === "loading" ? (
          <div className="grid gap-4 md:grid-cols-2 min-[66rem]:grid-cols-3" aria-busy="true" aria-label="Loading assigned events">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        ) : state.status === "error" ? (
          <AlertBanner tone="error" title="Could not load your assigned events">
            {state.message}
            <div className="mt-3"><Button variant="secondary" onClick={retry}><Icon name="refresh" size={16} />Try again</Button></div>
          </AlertBanner>
        ) : events.length === 0 ? (
          <EmptyState title="No events assigned yet" description="When a Coordinator Lead assigns an event to you, it appears here." />
        ) : shown.length === 0 ? (
          <EmptyState title="No events match" description="Change the search or filters, or select Clear to see every assigned event." />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 min-[66rem]:grid-cols-3">
            {shown.map((event) => (
              <li key={event.eventId} className="grid"><AssignedEventCard event={event} /></li>
            ))}
          </ul>
        )}
      </section>
    </PageContent>
  );
}
