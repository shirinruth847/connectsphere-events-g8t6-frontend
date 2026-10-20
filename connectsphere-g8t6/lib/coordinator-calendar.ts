// The calendar's Date values represent Singapore civil dates. Event strings
// remain instants; compare them with these explicit half-open day bounds.
const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Singapore", year: "numeric", month: "numeric", day: "numeric",
});

export function calendarDate(instant: Date): Date {
  const parts = dateFormat.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((value) => value.type === type)?.value);
  return new Date(part("year"), part("month") - 1, part("day"));
}

export function calendarDayBounds(day: Date) {
  const start = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) - SINGAPORE_OFFSET_MS;
  return { start, end: start + DAY_MS };
}

export function overlapsCalendarDay(startDatetime: string, endDatetime: string, day: Date): boolean {
  const start = Date.parse(startDatetime);
  const end = Date.parse(endDatetime);
  const bounds = calendarDayBounds(day);
  return Number.isFinite(start) && Number.isFinite(end) && start < end && start < bounds.end && bounds.start < end;
}

export function shiftCalendarMonth(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

export function calendarLabelInstant(date: Date): Date {
  return new Date(calendarDayBounds(date).start + 12 * 60 * 60 * 1000);
}

export function calendarHourInstant(hour: number): Date {
  return new Date(Date.UTC(2020, 0, 1, hour) - SINGAPORE_OFFSET_MS);
}
