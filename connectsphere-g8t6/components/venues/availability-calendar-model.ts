// Maps the availability API onto the shared calendar (SPM-74, SPM-181): each
// venue is a calendar lane and each booking, hold or block an event spanning
// its occupied range. Pure (type-only imports), so it is unit tested.
import type { CalendarCoordinator, CalendarEvent, CalendarViewMode } from "../calendar/calendar-view";
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
