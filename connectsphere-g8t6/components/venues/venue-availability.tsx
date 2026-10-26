"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useSessionUser } from "@/components/auth/auth-gate";
import { CalendarView, type CalendarViewMode } from "@/components/calendar/calendar-view";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, EmptyState, FormLabel, ReferenceIdTag, Skeleton, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { ApiError } from "@/lib/api";
import { calendarDate } from "@/lib/coordinator-calendar";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import {
  getVenueAvailability,
  VENUE_STATUS_LABELS,
  type AvailabilityParams,
  type CalendarEntry,
  type VenueAvailability,
} from "@/lib/api/venues";
import { availabilityOverlays, calendarRange, civilDate, toCalendarLanes, type CalendarEntryRef } from "./availability-calendar-model";
import { useVenueOptions } from "./use-venue-options";

const MAX_VENUES = 20;

// "10:00–12:00" in Singapore time, for the request block's label: its column
// already gives the date.
const timeOfDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const formatTimes = (start: string, end: string) => `${timeOfDay.format(new Date(start))}–${timeOfDay.format(new Date(end))}`;

type CalendarState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: VenueAvailability }
  | { status: "forbidden" }
  | { status: "error"; message: string };

// Colours per entry kind; labels always come from the backend.
const ENTRY_STYLES: Record<string, string> = {
  BOOKING_APPROVED: "border-l-[#991B1B] bg-[#FEF2F2]",
  BOOKING_PENDING: "border-l-[#4338CA] bg-[#EEF2FF]",
  HOLD_ACTIVE: "border-l-[#B45309] bg-[#FFFBEB]",
  HOLD_EXPIRED: "border-l-[#9CA3AF] bg-surface-container-low",
  BLOCK_ACTIVE: "border-l-[#374151] bg-[#F3F4F6]",
};
const entryStyleKey = (entry: CalendarEntry) => {
  if (entry.type === "BOOKING") return `BOOKING_${entry.status}`;
  if (entry.type === "HOLD") return entry.blocking ? "HOLD_ACTIVE" : "HOLD_EXPIRED";
  return "BLOCK_ACTIVE";
};
const entryStyle = (entry: CalendarEntry) => ENTRY_STYLES[entryStyleKey(entry)] ?? "border-l-outline bg-surface-container-low";

function EntryRow({ entry }: { entry: CalendarEntry }) {
  const hasBuffers = entry.occupiedStart !== entry.start || entry.occupiedEnd !== entry.end;
  return (
    <li className={`grid gap-1 rounded-control border-l-4 p-3 text-sm ${entryStyle(entry)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-on-surface">{entry.label}</span>
        <span className="flex flex-wrap gap-1">
          {entry.bookingId ? <ReferenceIdTag value={`Booking #${entry.bookingId}`} /> : null}
          {entry.requestId ? <ReferenceIdTag value={entry.requestId} /> : null}
        </span>
      </div>
      <span className="text-on-surface">
        {hasBuffers ? "Occupied " : ""}{formatEventWindow(entry.occupiedStart, entry.occupiedEnd)}
      </span>
      {hasBuffers ? (
        <span className="text-xs text-on-surface-variant">Booked time {formatEventWindow(entry.start, entry.end)}, plus setup and turnaround</span>
      ) : null}
      {entry.eventTitle ? <span className="text-xs text-on-surface-variant">{entry.eventTitle}</span> : null}
      {entry.holdExpiresAt ? (
        <span className="text-xs font-semibold text-on-surface">
          {entry.blocking ? "Hold expires" : "Hold expired"} {formatTimestamp(entry.holdExpiresAt)}
        </span>
      ) : null}
      {entry.reasonLabel ? <span className="text-xs font-semibold text-on-surface">Reason: {entry.reasonLabel}</span> : null}
      {entry.note ? <span className="text-xs text-on-surface-variant">Note: {entry.note}</span> : null}
      {entry.operatingHoursWarning ? (
        <span className="flex items-start gap-1 text-xs font-semibold text-[#92400E]">
          <Icon name="warning" size={16} />{entry.operatingHoursWarning.message}
        </span>
      ) : null}
    </li>
  );
}

// The venues an event's calendar shows, opened on the event's date with its
// window checked (SPM-72/74 venue section); the venue picker is hidden.
export interface FixedCalendarVenues {
  eventId: number;
  venueIds: number[];
  date: Date;
  check: AvailabilityParams["check"];
  // Names the checked period on the calendar, e.g. the request ID.
  label?: string;
}

// The venue availability calendar (SPM-74, SPM-181) in the shared calendar's
// year/month/week/day timeline: Venue Staff pick venues at /venues; Event
// Coordinators see it inside an event's venue section with `fixed` venues. The
// backend computes availability from PostgreSQL bookings and MongoDB holds and
// blocks; if it cannot be loaded, no calendar is shown, so nothing looks free.
export function VenueAvailabilityCalendar({ fixed }: { fixed?: FixedCalendarVenues } = {}) {
  const searchParams = useSearchParams();
  const user = useSessionUser();
  const initialVenue = Number(searchParams.get("venueId"));
  // Every non-deleted venue for Venue Staff, live (SPM-181).
  const picker = useVenueOptions(!fixed && user?.role === "VENUE_STAFF");
  const [venueSearch, setVenueSearch] = useState("");
  const [pickedVenues, setSelected] = useState<number[]>(Number.isInteger(initialVenue) && initialVenue > 0 ? [initialVenue] : []);
  const selected = fixed ? fixed.venueIds : pickedVenues;
  const [viewMode, setViewMode] = useState<CalendarViewMode>(fixed ? "week" : "month");
  const [currentDate, setCurrentDate] = useState(() => fixed?.date ?? calendarDate(new Date()));
  const [checkOn, setCheckOn] = useState(Boolean(fixed?.check));
  const [checkDraft, setCheckDraft] = useState(() => fixed?.check ?? { date: civilDate(calendarDate(new Date())), startTime: "10:00", endDate: "", endTime: "12:00" });
  const [check, setCheck] = useState<AvailabilityParams["check"]>(fixed?.check ?? null);
  const [state, setState] = useState<CalendarState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const [openEntry, setOpenEntry] = useState<CalendarEntryRef | null>(null);

  const range = calendarRange(viewMode, currentDate);
  // Keyed on the IDs' contents: a fixed list is rebuilt on every parent render.
  const selectedKey = selected.join(",");
  const eventId = fixed?.eventId;
  const params: AvailabilityParams | null = useMemo(
    () => (selectedKey ? { eventId, date: range.date, days: range.days, venueIds: selectedKey.split(",").map(Number), check } : null),
    [eventId, selectedKey, range.date, range.days, check],
  );

  // Loads whenever the venues, the visible range or the checked period change.
  useEffect(() => {
    if (!params) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "idle" });
      return;
    }
    let alive = true;
    // The current calendar describes the previous request. Hide it while the
    // selected venues, range or checked period is being refreshed.
    setState({ status: "loading" });
    getVenueAvailability(params)
      .then((data) => { if (alive) setState({ status: "ready", data }); })
      .catch((caught: unknown) => {
        if (!alive) return;
        if (caught instanceof ApiError && caught.status === 403) setState({ status: "forbidden" });
        else setState({ status: "error", message: caught instanceof Error ? caught.message : "Availability could not be loaded." });
      });
    return () => { alive = false; };
  }, [params, attempt]);

  const visibleVenues = useMemo(() => {
    const text = venueSearch.trim().toLowerCase();
    return (picker.venues ?? []).filter((venue) => !text || venue.name.toLowerCase().includes(text));
  }, [picker.venues, venueSearch]);
  const calendar = useMemo(() => (state.status === "ready" ? toCalendarLanes(state.data) : null), [state]);
  const overlays = useMemo(
    () => (state.status === "ready" ? availabilityOverlays(state.data, range, { label: fixed?.label ?? "Requested period", formatWindow: formatEventWindow, formatTimes }) : []),
    // range is rebuilt each render; its fields are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, range.date, range.days, fixed?.label],
  );
  const missingBuffers = state.status === "ready" ? state.data.venues.filter((venue) => !venue.buffersRecorded) : [];
  const overlapping = state.status === "ready" ? state.data.venues.filter((venue) => venue.overlaps.length) : [];
  const outOfService = state.status === "ready" ? state.data.venues.filter((venue) => venue.status !== "ACTIVE") : [];

  const toggle = (venueId: number) =>
    setSelected((current) => (current.includes(venueId) ? current.filter((id) => id !== venueId) : current.length >= MAX_VENUES ? current : [...current, venueId]));

  const applyCheck = (event: FormEvent) => {
    event.preventDefault();
    setCheck(checkOn ? { ...checkDraft } : null);
    // Show the checked period: the calendar moves to its first day.
    const [year, month, day] = checkDraft.date.split("-").map(Number);
    if (checkOn && year && month && day) setCurrentDate(new Date(year, month - 1, day));
  };

  return (
    <div className="grid gap-4">
      <div className={`grid gap-4 rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 ${fixed ? "" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"}`}>
        {fixed ? null : <fieldset className="grid content-start gap-2">
          <legend className="mb-1 text-xs font-semibold text-on-surface">Venues ({selected.length}/{MAX_VENUES} selected)</legend>
          <input aria-label="Find a venue" type="search" className={fieldClasses} placeholder="Find a venue" value={venueSearch} onChange={(event) => setVenueSearch(event.target.value)} />
          {picker.error ? <AlertBanner tone="error">{picker.error}</AlertBanner> : null}
          {picker.venues === null && !picker.error ? <Skeleton className="h-24 w-full" /> : null}
          {picker.venues ? (
            <div className="max-h-56 overflow-y-auto rounded-control border border-outline-variant p-2">
              {visibleVenues.length ? visibleVenues.map((venue) => (
                <label key={venue.venueId} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-2 text-sm hover:bg-surface-container-low">
                  <input type="checkbox" checked={selected.includes(venue.venueId)} onChange={() => toggle(venue.venueId)} disabled={!selected.includes(venue.venueId) && selected.length >= MAX_VENUES} />
                  <span className="min-w-0 truncate">{venue.name}</span>
                </label>
              )) : <p className="p-2 text-sm text-on-surface-variant">No venues match.</p>}
            </div>
          ) : null}
        </fieldset>}

        <form onSubmit={applyCheck} aria-label="Check a requested period" className="grid content-start gap-3">
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-on-surface">
            <input type="checkbox" checked={checkOn} onChange={(event) => { setCheckOn(event.target.checked); if (!event.target.checked) setCheck(null); }} />
            Check a requested period
          </label>
          {checkOn ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <FormLabel htmlFor="check-date">Date</FormLabel>
                  <input id="check-date" type="date" className={fieldClasses} value={checkDraft.date} onChange={(event) => setCheckDraft({ ...checkDraft, date: event.target.value })} />
                </div>
                <div>
                  <FormLabel htmlFor="check-start">Start</FormLabel>
                  <input id="check-start" type="time" className={fieldClasses} value={checkDraft.startTime} onChange={(event) => setCheckDraft({ ...checkDraft, startTime: event.target.value })} />
                </div>
                <div>
                  <FormLabel htmlFor="check-end-date">End date</FormLabel>
                  <input id="check-end-date" type="date" className={fieldClasses} value={checkDraft.endDate ?? ""} min={checkDraft.date} onChange={(event) => setCheckDraft({ ...checkDraft, endDate: event.target.value })} />
                </div>
                <div>
                  <FormLabel htmlFor="check-end">End</FormLabel>
                  <input id="check-end" type="time" className={fieldClasses} value={checkDraft.endTime} onChange={(event) => setCheckDraft({ ...checkDraft, endTime: event.target.value })} />
                </div>
              </div>
              <div><Button type="submit" disabled={!selected.length}><Icon name="check" size={16} />Check period</Button></div>
            </>
          ) : null}
          <p className="text-xs text-on-surface-variant">
            Occupied time includes each venue&apos;s setup and turnaround. Click an entry in the calendar for its details.
          </p>
        </form>
      </div>

      <div aria-live="polite">
        {state.status === "idle" ? (
          <EmptyState title="Choose venues" description="Bookings, active holds, operational blocks and setup/turnaround time appear on the calendar for each venue you choose." />
        ) : null}
        {state.status === "loading" ? (
          <div className="grid gap-4" aria-busy="true" aria-label="Loading availability"><Skeleton className="h-96 w-full" /></div>
        ) : null}
        {state.status === "forbidden" ? (
          <AlertBanner tone="error" title="Access denied">Only Event Coordinators and Venue Staff can view venue availability.</AlertBanner>
        ) : null}
        {state.status === "error" ? (
          <AlertBanner tone="error" title="Availability could not be loaded">
            {state.message} No venue is shown as available until availability loads.
            <div className="mt-3"><Button variant="secondary" onClick={() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }}><Icon name="refresh" size={16} />Try again</Button></div>
          </AlertBanner>
        ) : null}
      </div>

      {state.status === "ready" && calendar ? (
        state.data.venues.length ? (
          <>
            {/* The shared calendar's styles are scoped to the .coordinator-shell
                class (components/layout/coordinator-shell.css); this wrapper
                reuses them without the shell's full-page sizing. */}
            {missingBuffers.length ? (
              <AlertBanner tone="warning" live={false}>
                {missingBuffers.map((venue) => venue.name).join(", ")}: Venue Staff have not recorded setup and turnaround times, so bookings are shown without them and no hold or booking can be made yet.
              </AlertBanner>
            ) : null}
            {outOfService.length ? (
              <AlertBanner tone="warning" live={false} title="Out of service">
                <ul className="grid gap-1">
                  {outOfService.map((venue) => (
                    <li key={venue.venueId}>
                      {venue.name}: {VENUE_STATUS_LABELS[venue.status] ?? venue.status}{venue.statusReason ? ` (${venue.statusReason})` : ""}. Its existing bookings are kept and shown below; it takes no new requests.
                    </li>
                  ))}
                </ul>
              </AlertBanner>
            ) : null}
            {overlapping.length ? (
              <AlertBanner tone="error" live={false} title="Overlapping occupied periods">
                {overlapping.map((venue) => venue.name).join(", ")} already {overlapping.length === 1 ? "has" : "have"} entries that overlap. Click an entry for its details.
              </AlertBanner>
            ) : null}
            <section aria-label="Venue availability calendar" className="coordinator-shell venue-calendar overflow-hidden rounded-panel shadow-elevation-1" style={{ minHeight: 0, background: "transparent" }}>
              <CalendarView
                overlays={overlays}
                monthBars
                coordinators={calendar.lanes}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                currentDate={currentDate}
                onCurrentDateChange={setCurrentDate}
                entityLabel={{ singular: "venue", plural: "venues" }}
                onEventClick={(event) => setOpenEntry(calendar.refs.get(event.eventId) ?? null)}
              />
            </section>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant" aria-label="Calendar key">
              <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm border-2 border-[#CA8A04] bg-[#FACC15]/30" />Requested period</span>
              <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm bg-[#DC2626]/35" />Overlaps existing time</span>
              <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm bg-outline/25" />Closed</span>
            </p>
          </>
        ) : (
          <EmptyState title="No venues to show" description="The selected venues are not available in the catalogue." />
        )
      ) : null}

      <Dialog open={openEntry !== null} onClose={() => setOpenEntry(null)} title={openEntry ? `${openEntry.venueName}` : "Calendar entry"}>
        {openEntry ? <ul className="grid gap-2"><EntryRow entry={openEntry.entry} /></ul> : null}
      </Dialog>
    </div>
  );
}
