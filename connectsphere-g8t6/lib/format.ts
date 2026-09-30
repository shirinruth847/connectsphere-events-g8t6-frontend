/**
 * Display formatting for instants returned by the backend (ISO `timestamptz` strings).
 * A fixed display time zone keeps server and browser renders identical (no hydration
 * mismatch). Assumption: events are held in Singapore; revisit if venues span time zones.
 */
export const DISPLAY_TIME_ZONE = "Asia/Singapore";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});

const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const zoneFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  timeZoneName: "short",
});

// en-CA formats as YYYY-MM-DD, which compares correctly as a string.
const isoDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatDate(iso: string) {
  return dateFormatter.format(new Date(iso));
}

export function formatLongDate(iso: string) {
  return longDateFormatter.format(new Date(iso));
}

/** "08:30 – 17:00 GMT+8" */
export function formatTimeRange(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const zone =
    zoneFormatter.formatToParts(start).find((part) => part.type === "timeZoneName")
      ?.value ?? "";
  return `${timeFormatter.format(start)} – ${timeFormatter.format(new Date(endIso))} ${zone}`.trim();
}

/** Calendar day of an instant in the display time zone, as YYYY-MM-DD. */
export function toDisplayDay(iso: string) {
  return isoDayFormatter.format(new Date(iso));
}

/** Formats a YYYY-MM-DD day (e.g. from a date input) without shifting it across zones. */
export function formatDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, date)));
}
