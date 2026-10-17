"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertBanner, EmptyState, ReferenceIdTag, SectionCard, Skeleton, StatusChip } from "@/components/shared/primitives";
import { apiRequest } from "@/lib/api";
import { displayEventStatus, EVENT_STATUS_ORDER, EventListItem, EventStatus, STATUS_PRESENTATION, formatDateRange } from "@/lib/events";

type ListResponse = { events?: EventListItem[]; nextCursor?: string | null };
type StatusSelection = EventStatus | "ALL";

const actionFor = (status: EventListItem["status"]) => {
  switch (status) {
    case "DRAFT": return "Continue draft";
    case "SUBMITTED": return "Track submission";
    case "UNDER_REVIEW":
    case "AWAITING_CLARIFICATION": return "View review status";
    case "PLANNING": return "View planning";
    case "CONFIRMED": return "View event";
    case "COMPLETED": return "View summary";
    case "CANCELLED": return "View cancellation";
    case "REJECTED": return "View decision";
  }
};

export function EventRequestDashboard() {
  const params = useSearchParams();
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [query, setQuery] = useState("");
  const [statusSelection, setStatusSelection] = useState<StatusSelection>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const notice = params.get("saved") === "draft"
    ? "Draft saved. You can resume it from My Requests."
    : params.get("submitted")
      ? "Your event request was submitted successfully."
      : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const all: EventListItem[] = [];
      let cursor: string | null = null;
      do {
        const query = new URLSearchParams({ limit: "100" });
        if (cursor) query.set("cursor", cursor);
        const page = await apiRequest<ListResponse>(`/events/mine?${query.toString()}`);
        all.push(...(page.events ?? []));
        cursor = page.nextCursor ?? null;
      } while (cursor);
      setEvents(all);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your event requests.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = events.filter((event) => {
      const matchesQuery = !needle || `${event.title} ${event.requestId}`.toLowerCase().includes(needle);
      const displayStatus = displayEventStatus(event.status, event.isAssignedToCoordinator);
      const matchesStatus = statusSelection === "ALL" || displayStatus === statusSelection;
      return matchesQuery && matchesStatus;
    });
    return filtered.sort((left, right) => {
      const leftStatus = displayEventStatus(left.status, left.isAssignedToCoordinator);
      const rightStatus = displayEventStatus(right.status, right.isAssignedToCoordinator);
      const statusDifference = EVENT_STATUS_ORDER.indexOf(leftStatus) - EVENT_STATUS_ORDER.indexOf(rightStatus);
      return statusDifference || (left.startDatetime || "").localeCompare(right.startDatetime || "");
    });
  }, [events, query, statusSelection]);

  return <>
    <section className="mb-7 rounded-[10px] bg-white px-4 py-5 shadow-[0_4px_12px_rgba(15,23,42,0.06)] sm:px-5" aria-label="Event management controls">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-[0.02em] text-[#4F46E5]">My Events</h1>
          <label className="relative block w-full sm:max-w-[298px]">
            <span className="sr-only">Search events</span>
            <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ..." className="h-[42px] w-full rounded-full bg-[#EEF2FF] py-2 pl-10 pr-4 text-[13px] text-[#1F2937] placeholder:text-[#6B7280] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5]" />
          </label>
        </div>
        <div className="flex flex-col gap-3 border-t border-[#EEF0F5] pt-3 lg:flex-row lg:items-center lg:justify-between lg:border-0 lg:pt-0">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/events/new" className="inline-flex h-[46px] items-center justify-center gap-2 rounded-[15px] border border-white bg-[#6366F1] px-4 text-xs font-medium text-white transition hover:bg-[#4F46E5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5]">
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
              New Event
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex h-[46px] items-center gap-2 rounded-[15px] border border-[#9CA3AF] px-3 text-xs text-[#6B7280]">
              <span className="whitespace-nowrap">Status:</span>
              <select aria-label="Filter events by status" value={statusSelection} onChange={(event) => setStatusSelection(event.target.value as StatusSelection)} className="min-w-0 bg-transparent text-[#4B5563] outline-none">
                <option value="ALL">All statuses</option>
                {EVENT_STATUS_ORDER.filter((status) => status !== "AWAITING_CLARIFICATION").map((status) => (
                  <option key={status} value={status}>{STATUS_PRESENTATION[status].label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </section>
    {notice ? <div className="mb-5"><AlertBanner tone="success">{notice}</AlertBanner></div> : null}
    {error ? <div className="mb-5"><AlertBanner tone="error" title="Requests could not be loaded">{error}<button className="ml-2 font-semibold underline" onClick={() => void load()}>Try again</button></AlertBanner></div> : null}
    {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-40 w-full" />)}</div>
      : visible.length === 0 ? <SectionCard><EmptyState title="No matching events" description="Try changing your status or search, or create a new event." action={<Link href="/events/new" className="rounded-control bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary">Create an event</Link>} /></SectionCard>
        : <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((event) => {
              const displayStatus = displayEventStatus(event.status, event.isAssignedToCoordinator);
              const statusStyle = STATUS_PRESENTATION[displayStatus];
              const isDraft = event.status === "DRAFT";
              const href = isDraft ? `/events/new?draft=${event.eventId}` : `/events/${event.eventId}`;
              return <article key={event.eventId} className={`flex min-h-[206px] flex-col rounded-[12px] border border-[#E5E7EB] border-t-4 ${statusStyle.border} bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.05)]`}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="line-clamp-2 text-base font-semibold text-[#1F2937]">{event.title || "Untitled draft"}</h2>
                  <StatusChip status={displayStatus} />
                </div>
                <p className="mt-3 text-sm text-[#6B7280]">{formatDateRange(event.startDatetime, event.endDatetime)}</p>
                {event.expectedAttendance ? <p className="mt-1 text-sm text-[#6B7280]">{event.expectedAttendance.toLocaleString()} expected attendees</p> : null}
                <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                  <ReferenceIdTag value={event.requestId} />
                  <Link href={href} className={`inline-flex min-h-9 items-center justify-center rounded-[10px] px-3 py-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] ${isDraft ? "bg-[#4F46E5] text-white hover:bg-[#4338CA]" : "border border-[#6366F1] text-[#4F46E5] hover:bg-[#EEF2FF]"}`}>
                    {actionFor(displayStatus)} <span aria-hidden="true" className="ml-1">→</span>
                  </Link>
                </div>
              </article>;
            })}
          </div>
          <p className="mt-4 text-xs text-[#6B7280]">Showing {visible.length} {visible.length === 1 ? "event" : "events"}.</p>
        </>}
  </>;
}
