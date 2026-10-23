// Pure helpers for choosing a venue (SPM-72/74/76); type-only imports,
// so they are unit tested.
import type { EventVenueOption, RequestVenueNeeds } from "../../../lib/api/event-venues";

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

// "Show" choices in the filter box; the list shows this many at first and
// adds this many per "Show more venues" (developer request of 23 October 2026).
export const VENUE_PAGE_SIZES = [10, 20, 50, 100] as const;
export type VenuePageSize = (typeof VENUE_PAGE_SIZES)[number];
export const DEFAULT_VENUE_PAGE_SIZE: VenuePageSize = 10;

// How many more venues "Show more venues" adds: a page, or what is left.
export function showMoreCount(shown: number, total: number, pageSize: number) {
  return Math.max(0, Math.min(pageSize, total - shown));
}

export function venueById(venues: EventVenueOption[], venueId: number | null) {
  return venueId === null ? null : venues.find((venue) => venue.venueId === venueId) ?? null;
}

const MAX_WINDOW_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_INTEGER = 2147483647;
const MAX_NEEDS = 20;
const NEED_LIMIT = 200;

// The organiser's form values as GET /api/venues/options takes them (SPM-76).
// Anything incomplete or invalid is left out, so a half-filled form still
// lists venues; the request form reports its own errors.
export function requestVenueNeeds(form: {
  startDatetime: string | null;
  endDatetime: string | null;
  expectedAttendance: string;
  preferredLayoutType: string;
  accessibilityNeeds: string[];
}): RequestVenueNeeds {
  const start = form.startDatetime ? Date.parse(form.startDatetime) : NaN;
  const end = form.endDatetime ? Date.parse(form.endDatetime) : NaN;
  const datesValid = Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= MAX_WINDOW_MS;
  const attendanceText = form.expectedAttendance.trim();
  const attendance = /^\d+$/.test(attendanceText) ? Number(attendanceText) : NaN;
  return {
    startDatetime: datesValid ? form.startDatetime : null,
    endDatetime: datesValid ? form.endDatetime : null,
    expectedAttendance: attendance >= 1 && attendance <= MAX_INTEGER ? attendance : null,
    preferredLayoutType: form.preferredLayoutType && form.preferredLayoutType !== "NO_PREFERENCE" ? form.preferredLayoutType : null,
    accessibilityNeeds: form.accessibilityNeeds.map((need) => need.trim()).filter((need) => need && need.length <= NEED_LIMIT).slice(0, MAX_NEEDS),
  };
}
