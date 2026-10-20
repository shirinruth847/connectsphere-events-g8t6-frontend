"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { AlertBanner, Button, EmptyState, FormLabel, ReferenceIdTag, SectionCard, Skeleton, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { ApiError } from "@/lib/api";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import {
  getVenueAvailability,
  getVenueCatalogue,
  type AvailabilityParams,
  type CalendarEntry,
  type Venue,
  type VenueAvailability,
  type VenueCalendar,
} from "@/lib/api/venues";

const MAX_VENUES = 20;
const DAY_OPTIONS = [1, 3, 7, 14];
const todayInSingapore = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());

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

const SUMMARY_CHIPS: Record<string, string> = {
  AVAILABLE: "bg-[#DCFCE7] text-[#166534]",
  AVAILABLE_WITH_WARNING: "bg-[#FEF3C7] text-[#92400E]",
};
function SummaryChip({ value, label }: { value: string; label: string }) {
  return (
    <span className={`inline-flex rounded-chip px-2 py-1 text-[11px] font-semibold uppercase tracking-label ${SUMMARY_CHIPS[value] ?? "bg-[#FEE2E2] text-[#991B1B]"}`}>
      {label}
    </span>
  );
}

function EntryRow({ entry }: { entry: CalendarEntry }) {
  const hasBuffers = entry.occupiedStart !== entry.start || entry.occupiedEnd !== entry.end;
  return (
    <li className={`grid gap-1 rounded-control border-l-4 p-3 text-sm ${entryStyle(entry)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-on-surface">{entry.label}</span>
        <span className="flex flex-wrap gap-1">
          {entry.bookingReference ? <ReferenceIdTag value={entry.bookingReference} /> : null}
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

function VenueCalendarCard({ venue }: { venue: VenueCalendar }) {
  const entriesById = new Map(venue.entries.map((entry) => [entry.entryId, entry]));
  const describe = (entryId: string) => entriesById.get(entryId)?.label ?? entryId;
  return (
    <SectionCard className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-on-surface">{venue.name}</h3>
          <p className="text-sm text-on-surface-variant">
            {venue.operatingHours ? `Open ${venue.operatingHours}` : "Operating hours not listed"}
            {" · "}
            {venue.buffersRecorded ? `${venue.setupMinutes} min setup, ${venue.turnaroundMinutes} min turnaround` : "Setup and turnaround not recorded"}
          </p>
        </div>
        <SummaryChip value={venue.summary} label={venue.summaryLabel} />
      </div>

      {!venue.buffersRecorded ? (
        <AlertBanner tone="warning" live={false}>
          Venue Staff have not recorded setup and turnaround times, so bookings are shown without them and no hold or booking can be made yet.
        </AlertBanner>
      ) : null}

      {venue.check ? (
        <AlertBanner tone={venue.check.canRequest ? (venue.check.operatingHoursWarning ? "warning" : "success") : "error"} live={false} title={`Requested period: ${venue.check.availabilityLabel}`}>
          Occupied {formatEventWindow(venue.check.occupiedStart, venue.check.occupiedEnd)} including setup and turnaround.
          {venue.check.conflicts.length ? ` Conflicts with: ${venue.check.conflicts.map((conflict) => `${describe(conflict.entryId)} (${formatEventWindow(conflict.occupiedStart, conflict.occupiedEnd)})`).join("; ")}. This period cannot be requested.` : ""}
          {venue.check.operatingHoursWarning ? ` ${venue.check.operatingHoursWarning.message}` : ""}
        </AlertBanner>
      ) : null}

      {venue.overlaps.length ? (
        <AlertBanner tone="error" live={false} title="Overlapping occupied periods">
          {venue.overlaps.map((overlap) => overlap.entryIds.map(describe).join(" and ")).join("; ")}
        </AlertBanner>
      ) : null}

      {venue.entries.length ? (
        <ul className="grid gap-2" aria-label={`Calendar entries for ${venue.name}`}>
          {venue.entries.map((entry) => <EntryRow key={entry.entryId} entry={entry} />)}
        </ul>
      ) : (
        <p className="rounded-control bg-[#F0FDF4] p-3 text-sm font-semibold text-[#166534]">
          No bookings, holds or blocks in this period. The venue is available for the whole range.
        </p>
      )}

      {venue.entries.length && venue.freePeriods.length ? (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-label text-on-surface-variant">Available</h4>
          <ul className="flex flex-wrap gap-2 text-xs">
            {venue.freePeriods.map((period) => (
              <li key={period.start} className="rounded-chip bg-[#DCFCE7] px-2 py-1 text-[#166534]">{formatEventWindow(period.start, period.end)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </SectionCard>
  );
}

// The venue availability calendar (SPM-74) for Event Coordinators and Venue
// Staff. Availability is computed by the backend from PostgreSQL bookings and
// MongoDB holds and blocks; if it cannot be loaded, nothing is shown as available.
export function VenueAvailabilityCalendar() {
  const searchParams = useSearchParams();
  const initialVenue = Number(searchParams.get("venueId"));
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [venueError, setVenueError] = useState("");
  const [venueSearch, setVenueSearch] = useState("");
  const [selected, setSelected] = useState<number[]>(Number.isInteger(initialVenue) && initialVenue > 0 ? [initialVenue] : []);
  const [date, setDate] = useState(todayInSingapore);
  const [days, setDays] = useState(7);
  const [checkOn, setCheckOn] = useState(false);
  const [check, setCheck] = useState({ date: todayInSingapore(), startTime: "10:00", endTime: "12:00" });
  const [params, setParams] = useState<AvailabilityParams | null>(null);
  const [state, setState] = useState<CalendarState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    getVenueCatalogue()
      .then((result) => { if (alive) setVenues(result.venues); })
      .catch((caught: unknown) => { if (alive) setVenueError(caught instanceof Error ? caught.message : "Venues could not be loaded."); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!params) return;
    let alive = true;
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
    return (venues ?? []).filter((venue) => !text || `${venue.name} ${venue.address}`.toLowerCase().includes(text));
  }, [venues, venueSearch]);

  const toggle = (venueId: number) =>
    setSelected((current) => (current.includes(venueId) ? current.filter((id) => id !== venueId) : current.length >= MAX_VENUES ? current : [...current, venueId]));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selected.length) return;
    setState({ status: "loading" });
    setParams({ date, days, venueIds: selected, check: checkOn ? check : null });
  };

  return (
    <div className="grid gap-4">
      <form onSubmit={submit} aria-label="Choose venues and dates" className="grid gap-4 rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <fieldset className="grid content-start gap-2">
          <legend className="mb-1 text-xs font-semibold text-on-surface">Venues ({selected.length}/{MAX_VENUES} selected)</legend>
          <input aria-label="Find a venue" className={fieldClasses} placeholder="Find a venue" value={venueSearch} onChange={(event) => setVenueSearch(event.target.value)} />
          {venueError ? <AlertBanner tone="error">{venueError}</AlertBanner> : null}
          {venues === null && !venueError ? <Skeleton className="h-24 w-full" /> : null}
          {venues ? (
            <div className="max-h-56 overflow-y-auto rounded-control border border-outline-variant p-2">
              {visibleVenues.length ? visibleVenues.map((venue) => (
                <label key={venue.venueId} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-2 text-sm hover:bg-surface-container-low">
                  <input type="checkbox" checked={selected.includes(venue.venueId)} onChange={() => toggle(venue.venueId)} disabled={!selected.includes(venue.venueId) && selected.length >= MAX_VENUES} />
                  <span className="min-w-0 truncate">{venue.name}</span>
                </label>
              )) : <p className="p-2 text-sm text-on-surface-variant">No venues match.</p>}
            </div>
          ) : null}
        </fieldset>

        <div className="grid content-start gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FormLabel htmlFor="availability-date">From (SGT)</FormLabel>
              <input id="availability-date" type="date" className={fieldClasses} value={date} onChange={(event) => setDate(event.target.value)} required />
            </div>
            <div>
              <FormLabel htmlFor="availability-days">Days</FormLabel>
              <select id="availability-days" className={fieldClasses} value={days} onChange={(event) => setDays(Number(event.target.value))}>
                {DAY_OPTIONS.map((option) => <option key={option} value={option}>{option} {option === 1 ? "day" : "days"}</option>)}
              </select>
            </div>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-on-surface">
            <input type="checkbox" checked={checkOn} onChange={(event) => setCheckOn(event.target.checked)} />
            Check a requested period
          </label>
          {checkOn ? (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <FormLabel htmlFor="check-date">Date</FormLabel>
                <input id="check-date" type="date" className={fieldClasses} value={check.date} onChange={(event) => setCheck({ ...check, date: event.target.value })} />
              </div>
              <div>
                <FormLabel htmlFor="check-start">Start</FormLabel>
                <input id="check-start" type="time" className={fieldClasses} value={check.startTime} onChange={(event) => setCheck({ ...check, startTime: event.target.value })} />
              </div>
              <div>
                <FormLabel htmlFor="check-end">End</FormLabel>
                <input id="check-end" type="time" className={fieldClasses} value={check.endTime} onChange={(event) => setCheck({ ...check, endTime: event.target.value })} />
              </div>
            </div>
          ) : null}
          <div>
            <Button type="submit" disabled={!selected.length}><Icon name="calendar" size={16} />Show availability</Button>
            {!selected.length ? <p className="mt-2 text-xs text-on-surface-variant">Choose at least one venue.</p> : null}
          </div>
        </div>
      </form>

      <div aria-live="polite">
        {state.status === "idle" ? (
          <EmptyState title="Choose venues and a date range" description="Bookings, active holds, operational blocks and setup/turnaround time are shown for each venue." />
        ) : null}
        {state.status === "loading" ? (
          <div className="grid gap-4" aria-busy="true" aria-label="Loading availability"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>
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
        {state.status === "ready" ? (
          state.data.venues.length ? (
            <div className="grid gap-4">
              <p className="text-sm text-on-surface-variant">
                {formatEventWindow(state.data.from, state.data.to)}
                {state.data.generatedAt ? ` · as of ${formatTimestamp(state.data.generatedAt)}` : ""}
              </p>
              {state.data.venues.map((venue) => <VenueCalendarCard key={venue.venueId} venue={venue} />)}
            </div>
          ) : (
            <EmptyState title="No venues to show" description="The selected venues are not available in the catalogue." />
          )
        ) : null}
      </div>
    </div>
  );
}
