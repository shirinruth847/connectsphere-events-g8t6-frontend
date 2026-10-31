"use client";

import {
  CalendarView,
  type CalendarCoordinator,
  type CalendarEvent,
} from "@/components/calendar/calendar-view";
import { calendarDate } from "@/lib/coordinator-calendar";
import styles from "@/components/calendar/calendar-view.module.css";

type CoordinatorAvailabilityCalendarProps = {
  coordinators: CalendarCoordinator[];
  selectedEvent?: CalendarEvent;
  selectedCoordinatorId?: number | null;
  onSelectCoordinator?: (id: number) => void;
};

/** Shared calendar surface for the lead calendar page and assignment queue. */
export function CoordinatorAvailabilityCalendar({
  coordinators,
  selectedEvent,
  selectedCoordinatorId,
  onSelectCoordinator,
}: CoordinatorAvailabilityCalendarProps) {
  // An assignment is assessed against the event's own week, not the week the
  // Lead happened to be viewing when opening the assignment dialog.
  const eventStart = selectedEvent ? new Date(selectedEvent.startDatetime) : null;
  const eventDate = eventStart && !Number.isNaN(eventStart.getTime()) ? calendarDate(eventStart) : undefined;

  return (
    <div className={styles.scope}>
      <section className="calendar-panel" aria-label="Coordinator availability calendar">
        <div className="calendar-panel-header">
          <strong>Coordinator availability</strong>
          <span>Live data from the backend</span>
        </div>
        <CalendarView
          coordinators={coordinators}
          key={`${selectedEvent?.eventId ?? "availability"}:${selectedEvent?.startDatetime ?? ""}`}
          defaultView={selectedEvent ? "week" : "month"}
          defaultCurrentDate={eventDate}
          selectedEvent={selectedEvent}
          selectedCoordinatorId={selectedCoordinatorId}
          onSelectCoordinator={onSelectCoordinator}
        />
      </section>
    </div>
  );
}
