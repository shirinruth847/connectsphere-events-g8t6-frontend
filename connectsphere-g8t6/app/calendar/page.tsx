"use client";

import { useEffect, useState } from "react";
import { CoordinatorAvailabilityCalendar } from "@/components/calendar/coordinator-availability-calendar";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { PageContent } from "@/components/layout/page-content";
import { AlertBanner, Button } from "@/components/shared/primitives";
import { getCoordinatorAvailability, type CoordinatorAvailability } from "@/lib/api/events";

function CoordinatorCalendar() {
  const [coordinators, setCoordinators] = useState<CoordinatorAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void getCoordinatorAvailability().then((result) => {
      if (alive) { setCoordinators(result.coordinators); setError(""); }
    }).catch((cause) => {
      if (alive) setError(cause instanceof Error ? cause.message : "Could not load availability.");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attempt]);
  return <PageContent title="Coordinator calendar" eyebrow="Coordinator Lead" description="Review scheduled events and availability in Singapore time.">
    {loading ? <p role="status">Loading calendar…</p> : error ? <AlertBanner tone="error" title="Unable to load calendar">{error}<Button variant="secondary" onClick={() => { setLoading(true); setAttempt((value) => value + 1); }}>Retry</Button></AlertBanner> : <CoordinatorAvailabilityCalendar coordinators={coordinators.map((coordinator) => ({ ...coordinator, events: coordinator.events.map((event) => ({ ...event, purpose: event.purpose ?? undefined, coordinatorId: coordinator.coordinatorId, coordinatorName: coordinator.name, organisation: event.organisation?.name ?? null })) }))} />}
  </PageContent>;
}

export default function CalendarPage() {
  return <DashboardWorkspace role="COORDINATOR_LEAD"><CoordinatorCalendar /></DashboardWorkspace>;
}
