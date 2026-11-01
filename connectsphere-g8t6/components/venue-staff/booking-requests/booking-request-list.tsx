"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageContent } from "@/components/layout/page-content";
import { AlertBanner, Button, buttonClasses, EmptyState, Skeleton } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { OptionDropdown } from "@/components/shared/option-dropdown";
import { compactField, FilterSelect } from "@/components/shared/list-filters";
import { SortOrderToggle } from "@/components/venues/sort-order-toggle";
import { useDebouncedValue } from "@/components/venues/use-debounced-value";
import { useVenueOptions } from "@/components/venues/use-venue-options";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { ROLE_LABELS } from "@/lib/auth";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import {
  listVenueBookings,
  VENUE_BOOKING_STATUSES,
  type VenueBookingFilters,
  type VenueBookingListItem,
} from "@/lib/api/venue-bookings";
import { BOOKING_SORT_OPTIONS, MAX_SEARCH_LENGTH, groupBookingsByEvent, sortByLastAccessed, type BookingSort, type EventRequestGroup, type SortOrder } from "./booking-filters";
import { BOOKING_BORDERS, BookingStatusChip } from "./booking-status-chip";
import { useOpenedBookings } from "./use-opened-bookings";

type ListState =
  | { status: "loading" }
  | { status: "ready"; bookings: VenueBookingListItem[]; hasMore: boolean; pendingCount: number; approvedCount: number }
  | { status: "error"; message: string; fields?: Record<string, string> };

type Filters = { status: string; venueId: string; date: string };

// Short labels, so every filter in the row is the same size (developer
// request of 1 November 2026). A booking request is the venue's hold while it
// is pending, so there are no separate hold requests (SPM-190).
const STATUS_LABELS: Record<string, string> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled", EXPIRED: "Expired" };
const EMPTY_FILTERS: Filters = { status: "", venueId: "", date: "" };

// The direction each sort starts in when it is chosen.
const DEFAULT_ORDER: Record<BookingSort, SortOrder> = {
  default: "asc",
  date: "asc",
  attendance: "desc",
  lastAccessed: "desc",
  alphabetical: "asc",
};
// Review opens the event's venue bookings with the card's lead booking selected.
const groupHref = (group: EventRequestGroup<VenueBookingListItem>) => `/events/${group.event.eventId}?booking=${group.lead.bookingId}`;

// One card per event (developer request of 1 November 2026): the event title,
// the venues it asks for, the event's date and time and when to respond by.
// The viewer's own last opening sits bottom right.
function EventRequestCard({ group, openedAt, onOpen }: { group: EventRequestGroup<VenueBookingListItem>; openedAt: number | null; onOpen: () => void }) {
  const titleId = `event-request-${group.event.eventId}-title`;
  const { lead } = group;
  return (
    <article
      aria-labelledby={titleId}
      data-event-id={group.event.eventId}
      data-booking-id={lead.bookingId}
      className={`flex flex-col gap-3 rounded-panel border-t-4 ${BOOKING_BORDERS[lead.status] ?? "border-t-slate-400"} bg-surface-container-lowest p-4 shadow-elevation-1 transition-shadow duration-150 hover:shadow-elevation-2`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 id={titleId} className="line-clamp-2 text-base font-bold leading-snug text-on-surface">{group.event.title}</h3>
        <BookingStatusChip status={lead.status} label={lead.statusLabel} />
      </div>
      <ul className="grid gap-1.5 text-sm text-on-surface">
        <li className="flex items-start gap-2">
          <Icon name="venue" size={16} className="mt-0.5 shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]"><span className="sr-only">Venues: </span>{group.venues.join(", ")}</span>
        </li>
        <li className="flex items-start gap-2"><Icon name="calendar" size={16} className="mt-0.5 shrink-0" />{formatEventWindow(group.start, group.end)}</li>
        {group.decideBy ? (
          <li className="flex items-start gap-2 font-semibold text-[#92400E]"><Icon name="schedule" size={16} className="mt-0.5 shrink-0" />Respond by {formatTimestamp(group.decideBy)}</li>
        ) : null}
      </ul>
      <div className="mt-auto flex items-end justify-between gap-3">
        <Link href={groupHref(group)} onClick={onOpen} className={buttonClasses("primary")} aria-describedby={titleId}>
          Review<Icon name="arrow-forward" size={16} />
        </Link>
        {openedAt ? (
          <span className="text-xs italic text-slate-400">Opened {formatTimestamp(new Date(openedAt).toISOString())}</span>
        ) : null}
      </div>
    </article>
  );
}

function CountTile({ count, label }: { count: number; label: string }) {
  return (
    <span className="rounded-control bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
      <strong className="block text-xl font-bold text-primary">{count}</strong>{label}
    </span>
  );
}

// The Venue Staff dashboard and "My Requests" tab (SPM-181): every booking
// request, pending first by default, searchable as you type (booking ID,
// request ID, event title, venue or label), sortable and filterable by
// status, venue and date. A pending request keeps the venue until it is
// decided or its respond-by time passes (SPM-190); the backend handles that.
export function BookingRequestList() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<BookingSort>("default");
  const [order, setOrder] = useState<SortOrder>("asc");
  const q = useDebouncedValue(search.trim());
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const venueOptions = useVenueOptions();
  const { opened, markOpened } = useOpenedBookings();
  const filtered = Boolean(filters.status || filters.venueId || filters.date || q);

  const request: VenueBookingFilters = useMemo(
    () => ({ status: filters.status, venueId: filters.venueId, date: filters.date, q, sort, order }),
    [filters.status, filters.venueId, filters.date, q, sort, order],
  );

  // `alive` drops a slower response for a search or filter that has since changed.
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(true);
    listVenueBookings(request)
      .then((result) => {
        if (alive) setState({ status: "ready", ...result });
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        const fields = (caught as { fields?: Record<string, string> }).fields;
        setState({ status: "error", message: caught instanceof Error ? caught.message : "Booking requests could not be loaded.", fields });
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [request, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);
  const clearAll = () => {
    setFilters(EMPTY_FILTERS);
    setSearch("");
  };

  // Venues come from the live venue list, so a venue added, renamed or deleted
  // in My Venues is reflected here (useVenueOptions re-reads on focus).
  const venueChoices = useMemo(
    () => (venueOptions.venues ?? []).map((venue) => ({ value: String(venue.venueId), label: venue.name })),
    [venueOptions.venues],
  );
  const update = (key: keyof Filters) => (value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const bookings = state.status === "ready"
    ? (sort === "lastAccessed" ? sortByLastAccessed(state.bookings, opened, order) : state.bookings)
    : [];
  const groups = groupBookingsByEvent(bookings);
  // A reply without a count counts as none, never NaN.
  const pendingCount = state.status === "ready" ? state.pendingCount ?? 0 : 0;
  const approvedCount = state.status === "ready" ? state.approvedCount ?? 0 : 0;

  return (
    <PageContent
      title="My Requests"
      eyebrow={ROLE_LABELS.VENUE_STAFF}
      description="Venue booking requests from event coordinators. Approve or reject each pending request by its respond-by time; after that the venue is released."
      action={
        <div className="flex flex-wrap items-center gap-2">
          {state.status === "ready" ? (
            <>
              <CountTile count={pendingCount} label="Pending" />
              <CountTile count={approvedCount} label="Approved" />
            </>
          ) : null}
          {/* The Updates button and panel shared with the other inbox roles (SPM-286). */}
          <NotificationsBell />
        </div>
      }
    >
      <h2 className="mb-3 text-lg font-semibold text-on-surface">Requests</h2>
      <section aria-label="Search, sort and filter requests" className="mb-5 flex flex-wrap items-end gap-x-2 gap-y-2 rounded-panel bg-surface-container-lowest p-3 shadow-elevation-1">
        {/* Clear is always present (disabled when empty), so typing never resizes the box. */}
        <div className="grid min-w-[10rem] flex-1 gap-1">
          <label htmlFor="booking-search" className="text-xs font-semibold text-on-surface-variant">Search</label>
          <input
            id="booking-search"
            type="search"
            className={`${compactField} w-full`}
            placeholder="Booking ID, event, venue or label"
            maxLength={MAX_SEARCH_LENGTH}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-describedby="booking-search-hint"
          />
          <span id="booking-search-hint" className="sr-only">Results update as you type.</span>
        </div>
        <FilterSelect id="booking-status" label="Status" value={filters.status} allLabel="All statuses" width="w-[10rem]"
          options={VENUE_BOOKING_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] ?? value }))} onChange={update("status")} />
        <div className="grid gap-1">
          <label htmlFor="booking-venue" className="text-xs font-semibold text-on-surface-variant">Venue</label>
          <OptionDropdown id="booking-venue" label="Venue" allLabel="All venues" className="w-[10rem]" value={filters.venueId} options={venueChoices} onChange={update("venueId")} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="booking-date" className="text-xs font-semibold text-on-surface-variant">Date (SGT)</label>
          <input id="booking-date" type="date" className={`${compactField} w-[10rem]`} value={filters.date} onChange={(event) => update("date")(event.target.value)} />
        </div>
        <div className="flex items-end gap-1">
          <FilterSelect id="booking-sort" label="Sort by" value={sort} options={BOOKING_SORT_OPTIONS} width="w-[10rem]"
            onChange={(value) => { setSort(value as BookingSort); setOrder(DEFAULT_ORDER[value as BookingSort]); }} />
          <SortOrderToggle order={order} onChange={setOrder} />
        </div>
        <Button variant="quiet" className="px-3" disabled={!filtered && !search} onClick={clearAll}>Clear</Button>
        {venueOptions.error ? <p className="basis-full text-xs text-error">Venue list unavailable: {venueOptions.error}</p> : null}
      </section>

      <div aria-live="polite">
        {state.status === "ready" && pendingCount === 0 ? (
          <div className="mb-5"><AlertBanner tone="info" live={false}>No pending requests.</AlertBanner></div>
        ) : null}
        {state.status === "ready" && pendingCount > 0 ? (
          <p className="mb-4 text-sm font-semibold text-on-surface">
            {pendingCount} pending {pendingCount === 1 ? "request" : "requests"} awaiting review
          </p>
        ) : null}
        {busy && state.status === "ready" ? <p className="mb-2 text-xs text-on-surface-variant">Updating…</p> : null}
      </div>

      {state.status === "loading" ? (
        <div className="grid gap-4 md:grid-cols-2 min-[66rem]:grid-cols-3" aria-busy="true" aria-label="Loading requests">
          {[0, 1, 2].map((key) => <Skeleton key={key} className="h-48 w-full" />)}
        </div>
      ) : null}

      {state.status === "error" ? (
        <AlertBanner tone="error" title="Could not load booking requests">
          {state.fields ? Object.values(state.fields).join(" ") : state.message}
          <div className="mt-3"><Button variant="secondary" onClick={retry}><Icon name="refresh" size={16} />Try again</Button></div>
        </AlertBanner>
      ) : null}

      {state.status === "ready" && bookings.length === 0 ? (
        <EmptyState
          title={filtered ? "No matching requests" : "No requests yet"}
          description={filtered ? "No booking request matches this search or these filters. Clear them to see more." : "Booking requests from event coordinators appear here."}
          action={filtered ? <Button variant="secondary" onClick={clearAll}>Clear search and filters</Button> : undefined}
        />
      ) : null}

      {state.status === "ready" && bookings.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 min-[66rem]:grid-cols-3" aria-busy={busy}>
            {groups.map((group) => {
              const openings = group.bookings.map((booking) => opened[String(booking.bookingId)]).filter((time): time is number => typeof time === "number");
              return (
                <EventRequestCard
                  key={`event-${group.event.eventId}`}
                  group={group}
                  openedAt={openings.length ? Math.max(...openings) : null}
                  onOpen={() => markOpened(group.lead.bookingId)}
                />
              );
            })}
          </div>
          {state.hasMore ? (
            <p className="mt-4 text-sm text-on-surface-variant">Showing the first {bookings.length} booking requests. Narrow the search or filters to see the rest.</p>
          ) : null}
        </>
      ) : null}
    </PageContent>
  );
}
