"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageContent } from "@/components/layout/page-content";
import { AlertBanner, Button, buttonClasses, EmptyState, Skeleton, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { OptionDropdown } from "@/components/shared/option-dropdown";
import { SortOrderToggle } from "@/components/venues/sort-order-toggle";
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
import { BOOKING_SORT_OPTIONS, MAX_SEARCH_LENGTH, sortByLastAccessed, type BookingSort, type SortOrder } from "./booking-filters";
import { BOOKING_BORDERS, BookingStatusChip } from "./booking-status-chip";
import { useOpenedBookings } from "./use-opened-bookings";
import { RequestTypeTag, useHoldRequests } from "./hold-request-list";
import type { HoldRequestStatus, VenueHoldRequest } from "@/lib/api/venue-holds";

type ListState =
  | { status: "loading" }
  | { status: "ready"; bookings: VenueBookingListItem[]; hasMore: boolean; pendingCount: number; approvedCount: number }
  | { status: "error"; message: string; fields?: Record<string, string> };

type Option = { value: string; label: string };
type RequestType = "" | "BOOKING" | "HOLD";
type Filters = { type: RequestType; status: string; venueId: string; date: string };
type RequestItem = { kind: "BOOKING"; booking: VenueBookingListItem } | { kind: "HOLD"; request: VenueHoldRequest };

// One status filter for both kinds: a hold request's outcome reads as the
// booking status it corresponds to.
const STATUS_LABELS: Record<string, string> = { PENDING: "Pending", APPROVED: "Approved / hold placed", REJECTED: "Rejected / declined", CANCELLED: "Cancelled / withdrawn" };
const HOLD_STATUS_FOR: Record<string, HoldRequestStatus> = { PENDING: "PENDING", APPROVED: "PLACED", REJECTED: "DECLINED", CANCELLED: "WITHDRAWN" };
const TYPE_OPTIONS: Option[] = [{ value: "BOOKING", label: "Booking requests" }, { value: "HOLD", label: "Hold requests" }];
const EMPTY_FILTERS: Filters = { type: "", status: "", venueId: "", date: "" };
const sgtDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" });

// The booking filters, applied to hold requests in the browser.
const holdMatches = (request: VenueHoldRequest, filters: Filters, q: string) => {
  if (filters.status && request.status !== HOLD_STATUS_FOR[filters.status]) return false;
  if (filters.venueId && String(request.venueId) !== filters.venueId) return false;
  if (filters.date && sgtDate.format(new Date(request.start)) !== filters.date) return false;
  const text = q.toLowerCase();
  return !text || [request.eventTitle, request.requestId, request.venueName, request.label]
    .some((value) => value?.toLowerCase().includes(text));
};

const itemStart = (item: RequestItem) => Date.parse(item.kind === "BOOKING" ? item.booking.startDatetime : item.request.start);
// The direction each sort starts in when it is chosen.
const DEFAULT_ORDER: Record<BookingSort, SortOrder> = {
  default: "asc",
  date: "asc",
  attendance: "desc",
  lastAccessed: "desc",
  alphabetical: "asc",
};
// Compact controls: each select is as wide as its longest option.
const compactField = fieldClasses.replace("w-full", "");

const bookingHref = (booking: VenueBookingListItem) => `/events/${booking.event.eventId}?booking=${booking.bookingId}`;

// Compact card (SPM-186): headed by the event, without the booking ID; the
// viewer's own last opening sits bottom right.
function BookingRequestCard({ booking, openedAt, onOpen }: { booking: VenueBookingListItem; openedAt: number | null; onOpen: () => void }) {
  const titleId = `booking-${booking.bookingId}-title`;
  const venue = `${booking.venueName}${booking.label ? ` · ${booking.label}` : ""}`;
  return (
    <article
      aria-labelledby={titleId}
      data-booking-id={booking.bookingId}
      className={`flex flex-col gap-3 rounded-panel border-t-4 ${BOOKING_BORDERS[booking.status] ?? "border-t-slate-400"} bg-surface-container-lowest p-4 shadow-elevation-1 transition-shadow duration-150 hover:shadow-elevation-2`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 id={titleId} className="line-clamp-2 text-base font-bold leading-snug text-on-surface">{booking.event.title}</h3>
        <BookingStatusChip status={booking.status} label={booking.statusLabel} />
      </div>
      <p className="-mt-2 text-xs text-on-surface-variant">
        <RequestTypeTag>Booking request</RequestTypeTag>
        {venue} · <span className="font-mono">{booking.event.requestId}</span>
        {booking.fromHold ? <span className="ml-2 inline-flex rounded-chip bg-[#FEF3C7] px-1.5 py-0.5 text-[11px] font-semibold text-[#92400E]">From hold</span> : null}
      </p>
      <ul className="grid gap-1 text-sm text-on-surface">
        <li className="flex items-center gap-2"><Icon name="calendar" size={16} />{formatEventWindow(booking.startDatetime, booking.endDatetime)}</li>
        <li className="flex items-center gap-2">
          <Icon name="attendees" size={16} />
          {booking.expectedAttendance ? `${booking.expectedAttendance.toLocaleString()} people` : "Attendance not provided"}
        </li>
      </ul>
      <div className="mt-auto flex items-end justify-between gap-3">
        <Link href={bookingHref(booking)} onClick={onOpen} className={buttonClasses("primary")} aria-describedby={titleId}>
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

function FilterSelect({ id, label, value, options, allLabel, width, onChange }: {
  id: string;
  label: string;
  value: string;
  options: Option[];
  allLabel?: string;
  width: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-xs font-semibold text-on-surface-variant">{label}</label>
      <select id={id} className={`${compactField} ${width}`} value={value} onChange={(event) => onChange(event.target.value)}>
        {allLabel !== undefined ? <option value="">{allLabel}</option> : null}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

// The Venue Staff dashboard and "My Requests" tab (SPM-181): every booking
// request and hold request (SPM-190) in one list (developer request of 1
// November 2026), pending first by default, searchable as you type (booking
// ID, request ID, event title, venue or label), sortable and filterable by
// type, status, venue and date.
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
  const holds = useHoldRequests();
  const filtered = Boolean(filters.type || filters.status || filters.venueId || filters.date || q);

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
  const update = (key: Exclude<keyof Filters, "type">) => (value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const visibleBookings = state.status === "ready" && filters.type !== "HOLD"
    ? (sort === "lastAccessed" ? sortByLastAccessed(state.bookings, opened, order) : state.bookings)
    : [];
  const holdRequests = holds.state.status === "ready" ? holds.state.requests : [];
  const visibleHolds = filters.type !== "BOOKING" ? holdRequests.filter((item) => holdMatches(item, filters, q)) : [];
  // Pending hold requests lead, as pending bookings do; by date, everything
  // is ordered by its start.
  const items: RequestItem[] = (() => {
    const bookingItems = visibleBookings.map((booking): RequestItem => ({ kind: "BOOKING", booking }));
    const holdItems = visibleHolds.map((hold): RequestItem => ({ kind: "HOLD", request: hold }));
    if (sort === "date") return [...bookingItems, ...holdItems].sort((a, b) => (itemStart(a) - itemStart(b)) * (order === "desc" ? -1 : 1));
    const pendingHolds = holdItems.filter((item) => item.kind === "HOLD" && item.request.status === "PENDING");
    return [...pendingHolds, ...bookingItems, ...holdItems.filter((item) => !pendingHolds.includes(item))];
  })();
  // Both kinds count: a placed hold counts as approved.
  // A reply without a count counts as none, never NaN.
  const pendingCount = (state.status === "ready" ? state.pendingCount ?? 0 : 0) + holdRequests.filter((item) => item.status === "PENDING").length;
  const approvedCount = (state.status === "ready" ? state.approvedCount ?? 0 : 0) + holdRequests.filter((item) => item.status === "PLACED").length;

  return (
    <PageContent
      title="My Requests"
      eyebrow={ROLE_LABELS.VENUE_STAFF}
      description="Booking and hold requests from event coordinators. A hold keeps a venue for a few days while the coordinator confirms with the organiser; a booking request asks you to approve the venue for the event."
      action={
        state.status === "ready" ? (
          <div className="flex flex-wrap gap-2">
            <CountTile count={pendingCount} label="Pending" />
            <CountTile count={approvedCount} label="Approved" />
          </div>
        ) : null
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
            className={fieldClasses}
            placeholder="Booking ID, event, venue or label"
            maxLength={MAX_SEARCH_LENGTH}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-describedby="booking-search-hint"
          />
          <span id="booking-search-hint" className="sr-only">Results update as you type.</span>
        </div>
        <FilterSelect id="request-type" label="Type" value={filters.type} allLabel="All requests" width="w-[8.5rem]"
          options={TYPE_OPTIONS} onChange={(value) => setFilters((current) => ({ ...current, type: value as RequestType }))} />
        <FilterSelect id="booking-status" label="Status" value={filters.status} allLabel="All statuses" width="w-[10rem]"
          options={VENUE_BOOKING_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] ?? value }))} onChange={update("status")} />
        <div className="grid gap-1">
          <label htmlFor="booking-venue" className="text-xs font-semibold text-on-surface-variant">Venue</label>
          <OptionDropdown id="booking-venue" label="Venue" allLabel="All venues" className="w-[10.5rem]" value={filters.venueId} options={venueChoices} onChange={update("venueId")} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="booking-date" className="text-xs font-semibold text-on-surface-variant">Date (SGT)</label>
          <input id="booking-date" type="date" className={`${compactField} w-[9.5rem]`} value={filters.date} onChange={(event) => update("date")(event.target.value)} />
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
        {holds.notice ? <div className="mb-4"><AlertBanner tone={holds.notice.tone} live={false}>{holds.notice.text}</AlertBanner></div> : null}
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

      {holds.state.status === "error" ? (
        <div className="mb-4">
          <AlertBanner tone="error" title="Could not load hold requests">
            {holds.state.message}
            <div className="mt-3"><Button variant="secondary" onClick={holds.reload}><Icon name="refresh" size={16} />Try again</Button></div>
          </AlertBanner>
        </div>
      ) : null}

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

      {state.status === "ready" && items.length === 0 ? (
        <EmptyState
          title={filtered ? "No matching requests" : "No requests yet"}
          description={filtered ? "No booking or hold request matches this search or these filters. Clear them to see more." : "Booking and hold requests from event coordinators appear here."}
          action={filtered ? <Button variant="secondary" onClick={clearAll}>Clear search and filters</Button> : undefined}
        />
      ) : null}

      {state.status === "ready" && items.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 min-[66rem]:grid-cols-3" aria-busy={busy}>
            {items.map((item) => (item.kind === "HOLD" ? holds.card(item.request) : (
              <BookingRequestCard
                key={`booking-${item.booking.bookingId}`}
                booking={item.booking}
                openedAt={opened[String(item.booking.bookingId)] ?? null}
                onOpen={() => markOpened(item.booking.bookingId)}
              />
            )))}
          </div>
          {state.hasMore ? (
            <p className="mt-4 text-sm text-on-surface-variant">Showing the first {visibleBookings.length} booking requests. Narrow the search or filters to see the rest.</p>
          ) : null}
        </>
      ) : null}
      {holds.dialog}
    </PageContent>
  );
}
