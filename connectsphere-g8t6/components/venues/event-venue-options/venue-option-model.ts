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

// "Show" choices in the filter box; the list shows this many at first and
// adds this many per "Show more venues" (developer request of 23 October 2026).
export const VENUE_PAGE_SIZES = [10, 20, 50, 100] as const;
export type VenuePageSize = (typeof VENUE_PAGE_SIZES)[number];
export const DEFAULT_VENUE_PAGE_SIZE: VenuePageSize = 10;

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

const mergeChoices = (current: string[], values: Array<string | null | undefined>) => {
  const seen = new Map(current.map((value) => [value.toLowerCase(), value]));
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed && !seen.has(trimmed.toLowerCase())) seen.set(trimmed.toLowerCase(), trimmed);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
};

export function venueFilterChoices(venues: EventVenueOption[], previous: VenueFilterChoices = EMPTY_FILTER_CHOICES): VenueFilterChoices {
  return {
    layouts: mergeChoices(previous.layouts, venues.flatMap((venue) => [...(venue.supportedLayouts ?? []), ...venue.rooms.map((room) => room.layoutType)])),
    facilities: mergeChoices(previous.facilities, venues.flatMap((venue) => venue.facilities ?? [])),
    accessibility: mergeChoices(previous.accessibility, venues.flatMap((venue) => venue.accessibilityFeatures ?? [])),
  };
}

export function venueById(venues: EventVenueOption[], venueId: number | null) {
  return venueId === null ? null : venues.find((venue) => venue.venueId === venueId) ?? null;
}
