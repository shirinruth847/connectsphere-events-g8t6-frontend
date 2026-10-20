import type { ApiEvent, CoordinatorAvailability } from "./api/events";

// Calendar dates are civil dates; clamp the day before moving into a shorter month.
export function shiftCalendarMonth(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

export function coordinatorConflicts(event: ApiEvent, coordinator: CoordinatorAvailability): ApiEvent[] {
  const start = Date.parse(event.startDatetime);
  const end = Date.parse(event.endDatetime);
  return coordinator.events.filter((other) => other.eventId !== event.eventId &&
    !["DRAFT", "COMPLETED", "REJECTED", "CANCELLED"].includes(other.status) &&
    start < Date.parse(other.endDatetime) && Date.parse(other.startDatetime) < end);
}
