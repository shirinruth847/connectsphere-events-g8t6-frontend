"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertBanner, Button, EmptyState, ReferenceIdTag, Skeleton, StatusChip } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { BookingStatusChip } from "@/components/venue-staff/booking-requests/booking-status-chip";
import { ROUTES } from "@/lib/auth";
import { getEquipmentSchedule, type EquipmentSchedule } from "@/lib/api/technical-requests";
import { technicalStatusLabel } from "@/lib/technical-requests";
import {
  currentScheduleMonth,
  scheduleDayLabel,
  scheduleMonthLabel,
  scheduleTimeLabel,
  shiftScheduleMonth,
} from "@/lib/equipment-schedule";

type ScheduleState =
  | { status: "loading" }
  | { status: "ready"; data: EquipmentSchedule }
  | { status: "error"; message: string };

// Technical Support's equipment schedule: one month at a time, only the
// Singapore dates that have events with pending or approved equipment. Each
// date lists its events (time, venue) and their equipment with quantity and
// status. A single column on phones; dates beside their events from md up.
export function EquipmentScheduleView() {
  const [month, setMonth] = useState(() => currentScheduleMonth());
  const [state, setState] = useState<ScheduleState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  // `alive` drops a slower response for a month the user has moved past.
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: "loading" });
    getEquipmentSchedule(month)
      .then((data) => { if (alive) setState({ status: "ready", data }); })
      .catch((caught: unknown) => {
        if (alive) setState({ status: "error", message: caught instanceof Error ? caught.message : "The schedule could not be loaded." });
      });
    return () => { alive = false; };
  }, [month, attempt]);

  const days = state.status === "ready" ? state.data.days.filter((day) => day.events.length) : [];
  const label = scheduleMonthLabel(month);

  return (
    <div className="grid min-w-0 gap-4">
      <nav aria-label="Schedule month" className="flex flex-wrap items-center justify-between gap-2 rounded-panel bg-surface-container-lowest p-3 shadow-elevation-1">
        <Button variant="secondary" aria-label="Previous month" onClick={() => setMonth((value) => shiftScheduleMonth(value, -1))}>
          <Icon name="arrow-back" size={16} /><span className="max-sm:sr-only">Previous</span>
        </Button>
        <h2 className="text-base font-semibold text-on-surface sm:text-lg" aria-live="polite">{label}</h2>
        <div className="flex gap-2">
          <Button variant="quiet" disabled={month === currentScheduleMonth()} onClick={() => setMonth(currentScheduleMonth())}>This month</Button>
          <Button variant="secondary" aria-label="Next month" onClick={() => setMonth((value) => shiftScheduleMonth(value, 1))}>
            <span className="max-sm:sr-only">Next</span><Icon name="arrow-forward" size={16} />
          </Button>
        </div>
      </nav>

      {state.status === "loading" ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Loading schedule"><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div>
      ) : state.status === "error" ? (
        <AlertBanner tone="error" title="Could not load the schedule">
          {state.message}
          <div className="mt-3"><Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}><Icon name="refresh" size={16} />Try again</Button></div>
        </AlertBanner>
      ) : days.length === 0 ? (
        <EmptyState title={`No equipment booked in ${label}`} description="Dates appear here once an event has pending or approved equipment." />
      ) : (
        <ol className="grid gap-4" aria-label={`Dates in ${label}`}>
          {days.map((day) => (
            <li key={day.date} aria-labelledby={`schedule-${day.date}`} className="grid min-w-0 gap-3 rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 md:grid-cols-[11rem_minmax(0,1fr)]">
              <h3 id={`schedule-${day.date}`} className="flex items-center gap-2 text-sm font-semibold text-on-surface md:block">
                <Icon name="calendar" size={16} className="text-primary md:mb-1" />
                <time dateTime={day.date} className="md:block">{scheduleDayLabel(day.date)}</time>
                <span className="text-xs font-normal text-on-surface-variant md:block">{day.events.length} {day.events.length === 1 ? "event" : "events"}</span>
              </h3>
              <ul className="grid min-w-0 gap-3">
                {day.events.map((event) => (
                  <li key={event.eventId} aria-label={event.title} className="grid min-w-0 gap-2 rounded-control bg-surface-container-low p-3 [overflow-wrap:anywhere]">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-on-surface">{event.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
                          <span className="inline-flex items-center gap-1"><Icon name="schedule" size={16} />{scheduleTimeLabel(day.date, event.start, event.end)}</span>
                          <span className="inline-flex items-center gap-1"><Icon name="venue" size={16} />{event.venue?.name ?? "No venue booked yet"}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2"><ReferenceIdTag value={event.requestId} /><StatusChip status={event.status} /></div>
                    </div>
                    <ul className="grid gap-1.5" aria-label={`Equipment for ${event.title}`}>
                      {event.equipment.map((item) => (
                        <li key={`${item.equipmentId}-${item.technicalRequestId ?? "line"}`} className="flex flex-wrap items-center justify-between gap-2 text-sm text-on-surface">
                          <span className="min-w-0">
                            {item.name} × {item.quantity}
                            {item.technicalRequestId ? (
                              <Link href={`${ROUTES.technicalRequests}/${item.technicalRequestId}`} className="ml-2 text-xs font-semibold text-primary underline underline-offset-2">Request #{item.technicalRequestId}</Link>
                            ) : null}
                          </span>
                          <BookingStatusChip status={item.status} label={technicalStatusLabel(item.status)} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
