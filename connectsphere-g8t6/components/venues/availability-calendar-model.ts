// Maps the availability API onto the shared calendar (SPM-74, SPM-181): each
// venue is a calendar lane and each booking, hold or block an event spanning
// its occupied range. Pure (type-only imports), so it is unit tested.
import type { CalendarCoordinator, CalendarEvent, CalendarOverlay, CalendarViewMode } from "../calendar/calendar-view";
import type { CalendarEntry, VenueAvailability } from "../../lib/api/venues";

export type CalendarEntryRef = { venueId: number; venueName: string; entry: CalendarEntry };

const pad = (value: number) => String(value).padStart(2, "0");
// The calendar's Date values are Singapore civil dates (local fields).
export const civilDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (from: Date, to: Date) =>
  Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / DAY_MS);

// The range to load for what the calendar shows: the whole year in year view;
// otherwise the month with a week either side, which covers any week or day
// view inside it (at most 45 days, within the API's 366-day limit).
export function calendarRange(mode: CalendarViewMode, current: Date): { date: string; days: number } {
  if (mode === "year") {
    const start = new Date(current.getFullYear(), 0, 1);
    return { date: civilDate(start), days: daysBetween(start, new Date(current.getFullYear() + 1, 0, 1)) };
  }
  const start = new Date(current.getFullYear(), current.getMonth(), 1 - 7);
  const end = new Date(current.getFullYear(), current.getMonth() + 1, 1 + 7);
  return { date: civilDate(start), days: daysBetween(start, end) };
}

const entryTitle = (entry: CalendarEntry) => {
  if (entry.type === "BOOKING" && entry.bookingId) return `${entry.label} · Booking #${entry.bookingId}`;
  if (entry.type === "BLOCK" && entry.reasonLabel) return `${entry.label} · ${entry.reasonLabel}`;
  return entry.requestId ? `${entry.label} · ${entry.requestId}` : entry.label;
};

// Events span the occupied range (setup and turnaround included), so the
// calendar shows exactly when the venue is unavailable. The status shown is the
// backend's label; the frontend never maps states itself.
export function toCalendarLanes(data: VenueAvailability): { lanes: CalendarCoordinator[]; refs: Map<number, CalendarEntryRef> } {
  const refs = new Map<number, CalendarEntryRef>();
  let nextId = 1;
  const lanes = data.venues.map((venue) => ({
    coordinatorId: venue.venueId,
    name: venue.name,
    events: venue.entries.map((entry): CalendarEvent => {
      const eventId = nextId++;
      refs.set(eventId, { venueId: venue.venueId, venueName: venue.name, entry });
      return {
        eventId,
        title: entryTitle(entry),
        purpose: entry.eventTitle ?? undefined,
        startDatetime: entry.occupiedStart,
        endDatetime: entry.occupiedEnd,
        coordinatorId: venue.venueId,
        status: entry.label,
        requestId: entry.requestId ?? undefined,
      };
    }),
  }));
  return { lanes, refs };
}

// Operating hours as the backend reads them: "HH:MM-HH:MM", Singapore time.
const OPERATING_HOURS = /^\s*([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-4]):([0-5]\d)\s*$/;
const parseOperatingHours = (text: string | null) => {
  const match = OPERATING_HOURS.exec(text ?? "");
  if (!match) return null;
  const open = Number(match[1]) * 60 + Number(match[2]);
  const close = Number(match[3]) * 60 + Number(match[4]);
  return close > open ? { open, close } : null;
};
const MINUTE_MS = 60 * 1000;
const iso = (time: number) => new Date(time).toISOString();

// What the calendar shades for the venues shown (developer request of 24
// October 2026), replacing the summary cards:
// - closed: the hours every venue is closed, each day of the range; nothing
//   when any venue's hours are not recorded;
// - request: the checked period, labelled with `label` and its times, with
//   the full period and each venue's result in the hover detail;
// - conflict: where a venue's occupied time for the request overlaps an
//   existing booking, hold or block.
export function availabilityOverlays(
  data: VenueAvailability,
  range: { date: string; days: number },
  { label, formatWindow, formatTimes = formatWindow }: { label: string; formatWindow: (start: string, end: string) => string; formatTimes?: (start: string, end: string) => string },
): CalendarOverlay[] {
  const overlays: CalendarOverlay[] = [];
  const hours = data.venues.map((venue) => parseOperatingHours(venue.operatingHours));
  if (hours.length && hours.every(Boolean)) {
    const open = Math.min(...hours.map((item) => item!.open));
    const close = Math.max(...hours.map((item) => item!.close));
    const first = Date.parse(`${range.date}T00:00:00+08:00`);
    for (let day = 0; day < range.days; day += 1) {
      const midnight = first + day * DAY_MS;
      if (open > 0) overlays.push({ id: `closed-${day}-am`, tone: "closed", start: iso(midnight), end: iso(midnight + open * MINUTE_MS) });
      if (close < 24 * 60) overlays.push({ id: `closed-${day}-pm`, tone: "closed", start: iso(midnight + close * MINUTE_MS), end: iso(midnight + DAY_MS) });
    }
  }

  const checked = data.venues.filter((venue) => venue.check);
  if (!checked.length) return overlays;
  const { start, end } = checked[0].check!;
  const detail = checked.map((venue) => {
    const check = venue.check!;
    const labels = new Map(venue.entries.map((entry) => [entry.entryId, entry.label]));
    return [
      `${venue.name}: ${check.availabilityLabel}`,
      `Occupied ${formatWindow(check.occupiedStart, check.occupiedEnd)} with setup and turnaround`,
      ...check.conflicts.map((conflict) => `Overlaps ${labels.get(conflict.entryId) ?? "an existing entry"}, ${formatWindow(conflict.occupiedStart, conflict.occupiedEnd)}`),
      ...(check.operatingHoursWarning ? [check.operatingHoursWarning.message] : []),
    ].join("\n");
  }).join("\n\n");
  overlays.push({ id: "request", tone: "request", start, end, label: `${label} · ${formatTimes(start, end)}`, detail: `${formatWindow(start, end)}\n\n${detail}` });

  for (const venue of checked) {
    const check = venue.check!;
    for (const conflict of check.conflicts) {
      const from = Math.max(Date.parse(conflict.occupiedStart), Date.parse(check.occupiedStart));
      const to = Math.min(Date.parse(conflict.occupiedEnd), Date.parse(check.occupiedEnd));
      if (from < to) overlays.push({ id: `conflict-${venue.venueId}-${conflict.entryId}`, tone: "conflict", start: iso(from), end: iso(to) });
    }
  }
  return overlays;
}
