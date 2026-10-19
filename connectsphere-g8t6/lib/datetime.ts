// Event times are shown in Singapore time, matching the coordinator calendar
// and availability views.
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

// "Sat, 14 Nov 2026 · 08:00–18:30 SGT", or both dates when the window crosses midnight.
export function formatEventWindow(start?: string | null, end?: string | null) {
  const from = parse(start);
  if (!from) return "Date not set";
  const to = parse(end);
  if (!to) return `${dateFormat.format(from)} · ${timeFormat.format(from)} ${ZONE_LABEL}`;
  if (dayKeyFormat.format(from) === dayKeyFormat.format(to)) {
    return `${dateFormat.format(from)} · ${timeFormat.format(from)}–${timeFormat.format(to)} ${ZONE_LABEL}`;
  }
  return `${dateFormat.format(from)} ${timeFormat.format(from)} – ${dateFormat.format(to)} ${timeFormat.format(to)} ${ZONE_LABEL}`;
}

// "10h 30m"; empty when either end is missing or the range is invalid.
export function formatDuration(start?: string | null, end?: string | null) {
  const from = parse(start);
  const to = parse(end);
  if (!from || !to || to <= from) return "";
  const minutes = Math.round((to.getTime() - from.getTime()) / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours}h` : "", rest ? `${rest}m` : ""].filter(Boolean).join(" ");
}

// "13 Oct 2026, 10:20" for audit timestamps.
export function formatTimestamp(value?: string | null) {
  const date = parse(value);
  return date ? `${stampFormat.format(date)} ${ZONE_LABEL}` : "Unknown time";
}
