// Event times are shown in Singapore time, matching the coordinator calendar.
// Formatting runs in the browser after data loads, so there is no
// server/client hydration mismatch.
const TIME_ZONE = "Asia/Singapore";
const ZONE_LABEL = "SGT";

const dateFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });
const tileMonthFormat = new Intl.DateTimeFormat("en-SG", { timeZone: TIME_ZONE, month: "short" });
const tileDayFormat = new Intl.DateTimeFormat("en-SG", { timeZone: TIME_ZONE, day: "numeric" });
const stampFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const parse = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// "Wed, 28 Oct 2026", or both dates when the event spans several days.
export function formatEventDate(start?: string | null, end?: string | null) {
  const from = parse(start);
  if (!from) return "Date to be announced";
  const to = parse(end);
  if (!to || dayKeyFormat.format(from) === dayKeyFormat.format(to)) return dateFormat.format(from);
  return `${dateFormat.format(from)} – ${dateFormat.format(to)}`;
}

// "09:00 – 17:00 SGT"
export function formatEventTime(start?: string | null, end?: string | null) {
  const from = parse(start);
  if (!from) return "Time to be announced";
  const to = parse(end);
  return to
    ? `${timeFormat.format(from)} – ${timeFormat.format(to)} ${ZONE_LABEL}`
    : `${timeFormat.format(from)} ${ZONE_LABEL}`;
}

// Month and day for the card's date tile, e.g. { month: "OCT", day: "28" }.
export function formatDateTile(start?: string | null) {
  const from = parse(start);
  return from ? { month: tileMonthFormat.format(from).toUpperCase(), day: tileDayFormat.format(from) } : null;
}

// "28 Oct 2026, 09:00 SGT" for registration window values.
export function formatTimestamp(value?: string | null) {
  const date = parse(value);
  return date ? `${stampFormat.format(date)} ${ZONE_LABEL}` : null;
}
