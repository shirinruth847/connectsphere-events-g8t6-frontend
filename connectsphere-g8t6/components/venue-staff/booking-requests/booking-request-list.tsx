"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageContent } from "@/components/layout/page-content";
import { AlertBanner, Button, buttonClasses, EmptyState, FormLabel, ReferenceIdTag, Skeleton, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { useDebouncedValue } from "@/components/venues/use-debounced-value";
import { useVenueOptions } from "@/components/venues/use-venue-options";
import { ROLE_LABELS } from "@/lib/auth";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import {
  listVenueBookings,
  VENUE_BOOKING_STATUSES,
  type VenueBookingFilters,
  type VenueBookingListItem,
} from "@/lib/api/venue-bookings";
import { BOOKING_SORT_OPTIONS, formatBookingId, sortByLastOpened, type BookingSort, type SortOrder } from "./booking-filters";
import { BOOKING_BORDERS, BookingStatusChip } from "./booking-status-chip";
import { useOpenedBookings } from "./use-opened-bookings";

type ListState =
  | { status: "loading" }
  | { status: "ready"; bookings: VenueBookingListItem[]; hasMore: boolean; pendingCount: number }
  | { status: "error"; message: string; fields?: Record<string, string> };

type Option = { value: string; label: string };
type Filters = { status: string; venueId: string; eventId: string; date: string };

const STATUS_LABELS: Record<string, string> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled" };
const EMPTY_FILTERS: Filters = { status: "", venueId: "", eventId: "", date: "" };
// The direction each sort starts in when it is chosen.
const DEFAULT_ORDER: Record<BookingSort, SortOrder> = {
  default: "asc",
  date: "asc",
  attendance: "desc",
  lastOpened: "desc",
  lastEdited: "desc",
  alphabetical: "asc",
};

const bookingHref = (booking: VenueBookingListItem) => `/events/${booking.event.eventId}?booking=${booking.bookingId}`;

function BookingRequestCard({ booking, openedAt, onOpen }: { booking: VenueBookingListItem; openedAt?: number; onOpen: () => void }) {
  const titleId = `booking-${booking.bookingId}-title`;
  return (
    <article
      aria-labelledby={titleId}
      className={`flex flex-col gap-4 rounded-panel border-t-4 ${BOOKING_BORDERS[booking.status] ?? "border-t-slate-400"} bg-surface-container-lowest p-5 shadow-elevation-1 transition-shadow duration-150 hover:shadow-elevation-2`}
    >
      <div className="flex items-center justify-between gap-3">
        <BookingStatusChip status={booking.status} label={booking.statusLabel} />
        <ReferenceIdTag value={formatBookingId(booking.bookingId)} />
      </div>
      <div>
        <h3 id={titleId} className="line-clamp-2 text-base font-bold leading-snug text-on-surface">
          {booking.venueName}{booking.label ? ` · ${booking.label}` : ""}
        </h3>
        <p className="mt-1 text-xs text-on-surface-variant">
          {booking.event.title} · <span className="font-mono">{booking.event.requestId}</span>
        </p>
      </div>
      <KeyValuePanel
        rows={[
          { icon: "registration", label: "Event type", value: booking.event.eventTypeLabel ?? "Not specified" },
          { icon: "calendar", label: "Date & time", value: formatEventWindow(booking.startDatetime, booking.endDatetime) },
          {
            icon: "attendees",
            label: "Venue attendance",
            value: booking.expectedAttendance ? `${booking.expectedAttendance.toLocaleString()} people` : "Not provided",
          },
          { icon: "history", label: "Submitted", value: formatTimestamp(booking.submittedAt) },
          ...(booking.updatedAt ? [{ icon: "history" as const, label: "Last edited", value: formatTimestamp(booking.updatedAt) }] : []),
          ...(openedAt ? [{ icon: "history" as const, label: "Last opened", value: formatTimestamp(new Date(openedAt).toISOString()) }] : []),
        ]}
      />
      <div className="mt-auto">
        <Link href={bookingHref(booking)} onClick={onOpen} className={buttonClasses("primary")} aria-describedby={titleId}>
          Review booking<Icon name="arrow-forward" size={16} />
        </Link>
      </div>
    </article>
  );
}

function FilterSelect({ id, label, value, options, allLabel, onChange }: {
  id: string;
  label: string;
  value: string;
  options: Option[];
  allLabel?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <FormLabel htmlFor={id}>{label}</FormLabel>
      <select id={id} className={fieldClasses} value={value} onChange={(event) => onChange(event.target.value)}>
        {allLabel !== undefined ? <option value="">{allLabel}</option> : null}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

const uniqueOptions = (bookings: VenueBookingListItem[], pick: (booking: VenueBookingListItem) => Option) =>
  [...new Map(bookings.map((booking) => {
    const option = pick(booking);
    return [option.value, option];
  })).values()].sort((a, b) => a.label.localeCompare(b.label));

// The Venue Staff dashboard and "My Requests" tab (SPM-181): every venue
// booking request, pending first by default, searchable as you type, sortable
// and filterable by status, venue, date and event.
export function BookingRequestList() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<BookingSort>("default");
  const [order, setOrder] = useState<SortOrder>("asc");
  const q = useDebouncedValue(search.trim());
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  // Event choices come from the unfiltered list, so narrowing one filter never
  // removes the choices of another.
  const [allBookings, setAllBookings] = useState<VenueBookingListItem[]>([]);
  const [attempt, setAttempt] = useState(0);
  const venueOptions = useVenueOptions();
  const { opened, markOpened } = useOpenedBookings();
  const filtered = Boolean(filters.status || filters.venueId || filters.eventId || filters.date || q);

  const request: VenueBookingFilters = useMemo(() => ({ ...filters, q, sort, order }), [filters, q, sort, order]);

  // `alive` drops a slower response for a search or filter that has since changed.
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(true);
    listVenueBookings(request)
      .then((result) => {
        if (!alive) return;
        setState({ status: "ready", ...result });
        if (!filtered) setAllBookings(result.bookings);
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
  }, [request, filtered, attempt]);

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
  const eventOptions = useMemo(
    () => uniqueOptions(allBookings, (b) => ({ value: String(b.event.eventId), label: `${b.event.title} (${b.event.requestId})` })),
    [allBookings],
  );
  const update = (key: keyof Filters) => (value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const visibleBookings = state.status === "ready"
    ? (sort === "lastOpened" ? sortByLastOpened(state.bookings, opened, order) : state.bookings)
    : [];

  return (
    <PageContent title="My Requests" eyebrow={ROLE_LABELS.VENUE_STAFF} description="Venue booking requests from event coordinators. Open a request to review its venue requirements and the event it belongs to.">
      <section aria-label="Search, sort and filter booking requests" className="mb-5 grid gap-3 rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:grid-cols-2 xl:grid-cols-4">
        <div className="sm:col-span-2">
          <FormLabel htmlFor="booking-search">Search</FormLabel>
          <input
            id="booking-search"
            type="search"
            className={fieldClasses}
            placeholder="Booking ID, request ID, event, venue or label"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-describedby="booking-search-hint"
          />
          <p id="booking-search-hint" className="mt-1 text-xs text-on-surface-variant">Results update as you type.</p>
        </div>
        <FilterSelect id="booking-sort" label="Sort by" value={sort} options={BOOKING_SORT_OPTIONS}
          onChange={(value) => { setSort(value as BookingSort); setOrder(DEFAULT_ORDER[value as BookingSort]); }} />
        <FilterSelect id="booking-order" label="Order" value={order}
          options={[{ value: "asc", label: "Ascending" }, { value: "desc", label: "Descending" }]}
          onChange={(value) => setOrder(value as SortOrder)} />
        <FilterSelect id="booking-status" label="Status" value={filters.status} allLabel="All statuses"
          options={VENUE_BOOKING_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }))} onChange={update("status")} />
        <FilterSelect id="booking-venue" label="Venue" value={filters.venueId} allLabel="All venues" options={venueChoices} onChange={update("venueId")} />
        <div>
          <FormLabel htmlFor="booking-date">Date (SGT)</FormLabel>
          <input id="booking-date" type="date" className={fieldClasses} value={filters.date} onChange={(event) => update("date")(event.target.value)} />
        </div>
        <FilterSelect id="booking-event" label="Event" value={filters.eventId} allLabel="All events" options={eventOptions} onChange={update("eventId")} />
        <div className="flex items-end sm:col-span-2 xl:col-span-4">
          <Button variant="quiet" onClick={clearAll} disabled={!filtered && !search}>Clear search and filters</Button>
          {venueOptions.error ? <p className="ml-3 text-xs text-error">Venue list unavailable: {venueOptions.error}</p> : null}
        </div>
      </section>

      <div aria-live="polite">
        {state.status === "ready" && state.pendingCount === 0 ? (
          <div className="mb-5"><AlertBanner tone="info" live={false}>No pending booking requests.</AlertBanner></div>
        ) : null}
        {state.status === "ready" && state.pendingCount > 0 ? (
          <p className="mb-4 text-sm font-semibold text-on-surface">
            {state.pendingCount} pending {state.pendingCount === 1 ? "request" : "requests"} awaiting review
          </p>
        ) : null}
        {busy && state.status === "ready" ? <p className="mb-2 text-xs text-on-surface-variant">Updating…</p> : null}
      </div>

      {state.status === "loading" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading booking requests">
          {[0, 1, 2].map((key) => <Skeleton key={key} className="h-72 w-full" />)}
        </div>
      ) : null}

      {state.status === "error" ? (
        <AlertBanner tone="error" title="Could not load booking requests">
          {state.fields ? Object.values(state.fields).join(" ") : state.message}
          <div className="mt-3"><Button variant="secondary" onClick={retry}><Icon name="refresh" size={16} />Try again</Button></div>
        </AlertBanner>
      ) : null}

      {state.status === "ready" && visibleBookings.length === 0 ? (
        <EmptyState
          title={filtered ? "No matching booking requests" : "No booking requests yet"}
          description={filtered ? "No venue booking matches this search or these filters. Clear them to see more." : "Booking requests from event coordinators appear here."}
          action={filtered ? <Button variant="secondary" onClick={clearAll}>Clear search and filters</Button> : undefined}
        />
      ) : null}

      {state.status === "ready" && visibleBookings.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy={busy}>
            {visibleBookings.map((booking) => (
              <BookingRequestCard
                key={booking.bookingId}
                booking={booking}
                openedAt={opened[String(booking.bookingId)]}
                onOpen={() => markOpened(booking.bookingId)}
              />
            ))}
          </div>
          {state.hasMore ? (
            <p className="mt-4 text-sm text-on-surface-variant">Showing the first {visibleBookings.length} requests. Narrow the search or filters to see the rest.</p>
          ) : null}
        </>
      ) : null}
    </PageContent>
  );
}
