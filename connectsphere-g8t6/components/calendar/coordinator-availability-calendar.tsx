"use client";

import {
  CalendarView,
  type CalendarCoordinator,
  type CalendarEvent,
} from "@/components/calendar/calendar-view";
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
  return (
    <div className={styles.scope}>
      <section className="calendar-panel" aria-label="Coordinator availability calendar">
        <div className="calendar-panel-header">
          <strong>Coordinator availability</strong>
          <span>Live data from the backend</span>
        </div>
        <CalendarView
          coordinators={coordinators}
          defaultView="month"
          selectedEvent={selectedEvent}
          selectedCoordinatorId={selectedCoordinatorId}
          onSelectCoordinator={onSelectCoordinator}
        />
      </section>
      </div>
  );
}
