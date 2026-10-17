"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSessionUser } from "@/components/auth/auth-gate";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageContent } from "@/components/layout/page-content";
import { EventRequestDashboard } from "@/components/events/event-request-dashboard";
import { AlertBanner, SectionCard } from "@/components/shared/primitives";
import { ROLE_LABELS, ROUTES } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type AssignedEvent = { eventId: number; title: string; status: string; startDatetime?: string };
// Compatibility for feature branches; new pages use DashboardWorkspace.
export { DashboardShell as StaffShell } from "@/components/layout/dashboard-shell";
function CoordinatorEvents() {
  const [events, setEvents] = useState<AssignedEvent[]>([]); const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { let alive = true;
    void apiRequest<{ events: AssignedEvent[] }>("/events/assigned").then(data => { if (alive) setEvents(data.events); }).catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return <><h2 className="text-xl font-semibold">Your assigned events</h2>{error && <AlertBanner tone="error">{error}</AlertBanner>}{loading ? <p>Loading assigned events…</p> : events.length ? events.map(event => <SectionCard key={event.eventId}><h3 className="font-semibold">{event.title}</h3><p>{event.status.replaceAll("_", " ")}</p>{event.startDatetime && <p>{new Date(event.startDatetime).toLocaleString()}</p>}</SectionCard>) : <p>No events are currently assigned to you.</p>}</>;
}
export function RoleDashboard() {
  const user = useSessionUser(); const router = useRouter();
  useEffect(() => { if (user?.role === "ATTENDEE") router.replace(ROUTES.registrations); }, [router, user]);
  if (!user || user.role === "ATTENDEE") return null;
  return <DashboardShell>{user.role === "ORGANISER" ? <EventRequestDashboard /> : <PageContent title={`${ROLE_LABELS[user.role]} dashboard`} eyebrow={ROLE_LABELS[user.role]}>
    {user.role === "COORDINATOR" ? <CoordinatorEvents /> : <SectionCard><h2 className="text-xl font-semibold">Your workspace</h2><p>{user.role === "VENUE_STAFF" ? "Manage venue operations within your permitted venue scope." : user.role === "TECH_SUPPORT" ? "Review technical requirements within your assigned event scope." : "Coordinator assignment tools are not available in this workspace."}</p></SectionCard>}
  </PageContent>}</DashboardShell>;
}
