"use client";

import { useEffect, useState } from "react";
import { CalendarView, type CalendarCoordinator } from "@/components/calendar/calendar-view";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { useSessionUser } from "@/components/auth/auth-gate";
import { getCoordinatorAvailability } from "@/lib/api/events";

export default function CalendarPage() {
  return <DashboardWorkspace role="COORDINATOR_LEAD"><CalendarContent /></DashboardWorkspace>;
}

function CalendarContent() {
  const user = useSessionUser();
  const [coordinators, setCoordinators] = useState<CalendarCoordinator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user) return;
      try {
        const availability = await getCoordinatorAvailability();
        if (!active) return;
        setCoordinators(availability.coordinators.map((coordinator) => ({
          coordinatorId: coordinator.coordinatorId,
          name: coordinator.name,
          events: coordinator.events.map((event) => ({
            eventId: event.eventId,
            title: event.title,
            startDatetime: event.startDatetime,
            endDatetime: event.endDatetime,
            coordinatorId: coordinator.coordinatorId,
            coordinatorName: coordinator.name,
            isRequested: false,
            status: event.status,
            requestId: event.requestId,
            expectedAttendance: event.expectedAttendance,
            organisation: event.organisation?.name ?? null,
            createdAt: event.createdAt,
          })),
        })));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load coordinator availability.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [user]);

  return <section className="lead-page">
    <header className="lead-page-header"><div><span className="lead-eyebrow">COORDINATOR LEAD</span><h1>Coordinator calendar</h1><p>Review each coordinator’s scheduled events and availability.</p></div></header>
    {error ? <div className="lead-alert" role="alert">{error}</div> : null}
    {loading ? <div className="lead-empty">Loading coordinator calendar…</div> : <div className="calendar-panel"><CalendarView coordinators={coordinators} defaultView="month" /></div>}
  </section>;
}
