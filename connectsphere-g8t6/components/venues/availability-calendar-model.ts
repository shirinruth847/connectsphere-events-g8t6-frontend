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

// Each entry reads as what it is and when (SPM-186): the event's name (or,
// when the viewer may not see it, the label and request ID; a block's reason),
// then its start and end. The bar itself still spans the occupied time.
const entryTitle = (entry: CalendarEntry, formatWindow?: (start: string, end: string) => string) => {
  const name = entry.type === "BLOCK"
    ? (entry.reasonLabel ? `${entry.label} · ${entry.reasonLabel}` : entry.label)
    : entry.eventTitle ?? (entry.requestId ? `${entry.label} · ${entry.requestId}` : entry.label);
  return formatWindow ? `${name} · ${formatWindow(entry.start, entry.end)}` : name;
};

// Events span the occupied range (setup and turnaround included), so the
// calendar shows exactly when the venue is unavailable. The status shown is the
// backend's label; the frontend never maps states itself.
// skipBlocks leaves active blocks out of the lanes when blockOverlays draws them.
export function toCalendarLanes(
  data: VenueAvailability,
  formatWindow?: (start: string, end: string) => string,
  { skipBlocks = false }: { skipBlocks?: boolean } = {},
): { lanes: CalendarCoordinator[]; refs: Map<number, CalendarEntryRef> } {
  const refs = new Map<number, CalendarEntryRef>();
  let nextId = 1;
  const lanes = data.venues.map((venue) => ({
    coordinatorId: venue.venueId,
    name: venue.name,
    events: venue.entries.filter((entry) => !(skipBlocks && entry.type === "BLOCK" && entry.blocking)).map((entry): CalendarEvent => {
      const eventId = nextId++;
      refs.set(eventId, { venueId: venue.venueId, venueName: venue.name, entry });
      return {
        eventId,
        title: entryTitle(entry, formatWindow),
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
// The hours every venue is closed, each day of the range; nothing when any
// venue's hours are not recorded.
export function closedHourOverlays(operatingHours: Array<string | null>, range: { date: string; days: number }): CalendarOverlay[] {
  const overlays: CalendarOverlay[] = [];
  const hours = operatingHours.map(parseOperatingHours);
  if (!hours.length || !hours.every(Boolean)) return overlays;
  const open = Math.min(...hours.map((item) => item!.open));
  const close = Math.max(...hours.map((item) => item!.close));
  const first = Date.parse(`${range.date}T00:00:00+08:00`);
  for (let day = 0; day < range.days; day += 1) {
    const midnight = first + day * DAY_MS;
    if (open > 0) overlays.push({ id: `closed-${day}-am`, tone: "closed", start: iso(midnight), end: iso(midnight + open * MINUTE_MS) });
    if (close < 24 * 60) overlays.push({ id: `closed-${day}-pm`, tone: "closed", start: iso(midnight + close * MINUTE_MS), end: iso(midnight + DAY_MS) });
  }
  return overlays;
}

export function availabilityOverlays(
  data: VenueAvailability,
  range: { date: string; days: number },
  { label, formatWindow, formatTimes = formatWindow }: { label: string; formatWindow: (start: string, end: string) => string; formatTimes?: (start: string, end: string) => string },
): CalendarOverlay[] {
  const overlays = closedHourOverlays(data.venues.map((venue) => venue.operatingHours), range);

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

// One venue's active blocks as overlays across the day column, red where a
// booking's or hold's occupied time overlaps them (developer request of 31
// October 2026). Only for a single venue: a block covers its own venue, and
// an overlay spans the whole column.
export function blockOverlays(data: VenueAvailability, formatWindow: (start: string, end: string) => string): CalendarOverlay[] {
  if (data.venues.length !== 1) return [];
  const [venue] = data.venues;
  const blocks = venue.entries.filter((entry) => entry.type === "BLOCK" && entry.blocking);
  const others = venue.entries.filter((entry) => entry.type !== "BLOCK" && entry.blocking);
  const overlays: CalendarOverlay[] = [];
  for (const block of blocks) {
    overlays.push({
      id: `block-${block.entryId}`,
      tone: "block",
      start: block.occupiedStart,
      end: block.occupiedEnd,
      label: block.reasonLabel ? `${block.label} · ${block.reasonLabel}` : block.label,
      detail: [formatWindow(block.occupiedStart, block.occupiedEnd), ...(block.note ? [`Note: ${block.note}`] : [])].join("\n"),
    });
    for (const other of others) {
      const from = Math.max(Date.parse(block.occupiedStart), Date.parse(other.occupiedStart));
      const to = Math.min(Date.parse(block.occupiedEnd), Date.parse(other.occupiedEnd));
      if (from < to) overlays.push({ id: `block-conflict-${block.entryId}-${other.entryId}`, tone: "conflict", start: iso(from), end: iso(to) });
    }
  }
  return overlays;
}

// SPM-76: the organiser's calendar for one chosen venue, drawn as coloured
// blocks without words. It shows only the organiser's own times: blue behind
// for their other chosen venues, yellow for the time being edited (draggable
// when `resize` is given), red over it when the backend's check found the venue
// unavailable then, and grey outside opening hours. Other bookings, holds and
// blocks are never drawn, so it shows nothing about when they are (SPM-76 AC3,
// TC-VS-003; developer request of 1 November 2026).
export function requestCalendar(
  venue: { venueId: number; name: string; operatingHours: string | null },
  range: { date: string; days: number },
  { requested, otherChoices = [], unavailable = false, resize }: {
    requested: { start: string; end: string } | null;
    otherChoices?: Array<{ start: string; end: string }>;
    unavailable?: boolean;
    resize?: CalendarOverlay["resize"];
  },
): { lanes: CalendarCoordinator[]; overlays: CalendarOverlay[] } {
  const lanes: CalendarCoordinator[] = [{ coordinatorId: venue.venueId, name: venue.name, events: [] }];
  const overlays = [
    ...closedHourOverlays([venue.operatingHours], range),
    ...otherChoices.map((choice, index): CalendarOverlay => ({ id: `other-${index}`, tone: "other", start: choice.start, end: choice.end })),
  ];
  if (!requested) return { lanes, overlays };
  overlays.push({ id: "request", tone: "request", start: requested.start, end: requested.end, resize });
  if (unavailable) overlays.push({ id: "conflict", tone: "conflict", start: requested.start, end: requested.end });
  return { lanes, overlays };
}

// The calendar's drag step (RESIZE_STEP_MS in calendar-view).
const STEP_MS = 15 * MINUTE_MS;

// Keeps a dragged edge inside the event and at least one step from the other edge.
export function resizeWithin(
  current: { start: string; end: string },
  bounds: { start: string; end: string },
  edge: "start" | "end",
  instant: number,
): { start: string; end: string } {
  const [min, max] = [Date.parse(bounds.start), Date.parse(bounds.end)];
  const [start, end] = [Date.parse(current.start), Date.parse(current.end)];
  if (edge === "start") return { start: iso(Math.max(min, Math.min(instant, end - STEP_MS))), end: current.end };
  return { start: current.start, end: iso(Math.min(max, Math.max(instant, start + STEP_MS))) };
}
