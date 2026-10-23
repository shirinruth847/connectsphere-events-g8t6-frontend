// Pure helpers for an event's venue section (SPM-72/74); type-only imports,
// so they are unit tested.
import type { EventVenueOption } from "../../../lib/api/event-venues";

const SINGAPORE = "Asia/Singapore";
const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: SINGAPORE, year: "numeric", month: "2-digit", day: "2-digit" });
const timeParts = new Intl.DateTimeFormat("en-GB", { timeZone: SINGAPORE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// The event's window as the calendar's "check a period" inputs (Singapore
// civil date and times), or null when the event has no dates.
export function eventCalendarCheck(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return { date: dateParts.format(from), startTime: timeParts.format(from), endTime: timeParts.format(to) };
}

// Why the coordinator cannot suggest this venue, or null. The backend refuses
// the same venues; this only explains the disabled button.
export function suggestionBlocker(venue: EventVenueOption): string | null {
  const capacity = venue.requirements.find((item) => item.key === "capacity");
  if (capacity?.status === "UNMET") return "This venue cannot hold the expected attendance.";
  return null;
}

// Venues the list shows at first and per "Show more".
export const VENUE_PAGE_SIZE = 12;

export function venueById(venues: EventVenueOption[], venueId: number | null) {
  return venueId === null ? null : venues.find((venue) => venue.venueId === venueId) ?? null;
}
