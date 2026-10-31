// The Technical Support equipment schedule (GET /api/equipment/schedule). Pure
// and free of runtime imports, so the unit tests can load it directly. Months
// and dates are Singapore calendar dates.

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

// "2030-03": the Singapore month containing `now`.
export const currentScheduleMonth = (now = new Date()) => new Date(now.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 7);

export const isScheduleMonth = (value: string | null | undefined): value is string => Boolean(value && MONTH.test(value));

export function shiftScheduleMonth(month: string, by: number) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

// The first and last date of the month; at most 31 days, inside the backend's 62.
export function scheduleRange(month: string) {
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export const scheduleQuery = (month: string) => `?${new URLSearchParams(scheduleRange(month))}`;

const monthFormat = new Intl.DateTimeFormat("en-SG", { timeZone: "UTC", month: "long", year: "numeric" });
const dayFormat = new Intl.DateTimeFormat("en-SG", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// "March 2030"
export const scheduleMonthLabel = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00Z`));

// "Sun, 10 Mar 2030" for a calendar date (no time zone shift).
export const scheduleDayLabel = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`));

// "09:00–17:00 SGT"; an event that starts or ends on another date says so.
export function scheduleTimeLabel(date: string, start: string | null, end: string | null) {
  if (!start || !end) return "Time not set";
  const sgtDate = (value: string) => new Date(Date.parse(value) + SGT_OFFSET_MS).toISOString().slice(0, 10);
  const from = sgtDate(start) === date ? timeFormat.format(new Date(start)) : `${scheduleDayLabel(sgtDate(start))} ${timeFormat.format(new Date(start))}`;
  const to = sgtDate(end) === date ? timeFormat.format(new Date(end)) : `${scheduleDayLabel(sgtDate(end))} ${timeFormat.format(new Date(end))}`;
  return `${from}–${to} SGT`;
}
