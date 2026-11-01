// Pure helpers for choosing a venue (SPM-72/74/75); type-only imports,
// so they are unit tested.
import type { EventVenueOption } from "../../../lib/api/event-venues";

const SINGAPORE = "Asia/Singapore";
const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: SINGAPORE, year: "numeric", month: "2-digit", day: "2-digit" });
const timeParts = new Intl.DateTimeFormat("en-GB", { timeZone: SINGAPORE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// The event's window as the calendar's "check a period" inputs (Singapore
// civil dates and times), or null when the event has no dates. A multi-day
// event is checked from its first start to its last end.
export function eventCalendarCheck(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return { date: dateParts.format(from), startTime: timeParts.format(from), endDate: dateParts.format(to), endTime: timeParts.format(to) };
}

// Why the coordinator cannot suggest this venue, or null. The backend refuses
// the same venues; this only explains the disabled button.
export function suggestionBlocker(venue: EventVenueOption): string | null {
  const capacity = venue.requirements.find((item) => item.key === "capacity");
  if (capacity?.status === "UNMET") return "This venue cannot hold the expected attendance.";
  return null;
}

// "Show x results": the list shows this many at first and adds this many per
// "Show more venues" (developer requests of 23, 24 and 25 October 2026:
// twelve, four rows of three).
export const DEFAULT_VENUE_PAGE_SIZE = 12;
export const MAX_VENUE_PAGE_SIZE = 100;

// The typed "Show" number, or null while it is not a whole number from 1 to 100.
export function parsePageSize(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const size = Number(value);
  return size >= 1 && size <= MAX_VENUE_PAGE_SIZE ? size : null;
}

// How many more venues "Show more venues" adds: a page, or what is left.
export function showMoreCount(shown: number, total: number, pageSize: number) {
  return Math.max(0, Math.min(pageSize, total - shown));
}

// The choices in the layout, facility and accessibility dropdowns: every value
// the loaded venues carry, merged into the earlier choices so a narrowed list
// keeps them. The backend matches these filters as text (Master 5.4.5).
export interface VenueFilterChoices {
  layouts: string[];
  facilities: string[];
  accessibility: string[];
}

export const EMPTY_FILTER_CHOICES: VenueFilterChoices = { layouts: [], facilities: [], accessibility: [] };

// Venue data spells one layout "Theater" and "THEATRE"; every layout list and
// label shows it as "Theatre" (developer request of 1 November 2026). The
// backend matches either spelling.
export const canonicalLayout = (value: string) => (/^theat(re|er)$/i.test(value.trim()) ? "Theatre" : value);

const mergeChoices = (current: string[], values: Array<string | null | undefined>, canonical: (value: string) => string = (value) => value) => {
  const seen = new Map(current.map((value) => [value.toLowerCase(), value]));
  for (const value of values) {
    const trimmed = value == null ? undefined : canonical(value).trim();
    if (trimmed && !seen.has(trimmed.toLowerCase())) seen.set(trimmed.toLowerCase(), trimmed);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
};

export function venueFilterChoices(venues: EventVenueOption[], previous: VenueFilterChoices = EMPTY_FILTER_CHOICES): VenueFilterChoices {
  return {
    layouts: mergeChoices(previous.layouts, venues.flatMap((venue) => [...(venue.supportedLayouts ?? []), ...venue.rooms.map((room) => room.layoutType)]), canonicalLayout),
    facilities: mergeChoices(previous.facilities, venues.flatMap((venue) => venue.facilities ?? [])),
    accessibility: mergeChoices(previous.accessibility, venues.flatMap((venue) => venue.accessibilityFeatures ?? [])),
  };
}

export function venueById(venues: EventVenueOption[], venueId: number | null) {
  return venueId === null ? null : venues.find((venue) => venue.venueId === venueId) ?? null;
}
