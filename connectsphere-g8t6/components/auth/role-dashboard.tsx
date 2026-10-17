"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSessionUser } from "@/components/auth/auth-gate";
import { OrganiserShell } from "@/components/layout/organiser-shell";
import { EventRequestDashboard } from "@/components/events/event-request-dashboard";
import { AlertBanner, Button, SectionCard } from "@/components/shared/primitives";
import { ROLE_LABELS } from "@/lib/auth";
import { apiRequest } from "@/lib/api";
import { signOut } from "@/lib/session";

type AssignedEvent = { eventId: number; title: string; status: string; startDatetime?: string };
export function StaffShell({ children }: { children: ReactNode }) {
  const user = useSessionUser(); const router = useRouter();
  if (!user) return null;
  const logout = async () => {
    try { await signOut(); router.replace("/login"); }
    catch { router.replace("/login?reason=logout-unconfirmed"); }
  };
  return <main className="mx-auto min-h-screen max-w-5xl space-y-6 p-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><Link href={user.role === "ATTENDEE" ? "/my-registrations" : "/dashboard"} className="font-bold text-primary">ConnectSphere</Link><p>{user.name} · {ROLE_LABELS[user.role]}</p></div><Button type="button" variant="secondary" onClick={logout}>Logout</Button></header>
    {children}
  </main>;
}
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
  useEffect(() => { if (user?.role === "ATTENDEE") router.replace("/my-registrations"); }, [router, user]);
  if (!user || user.role === "ATTENDEE") return null;
  if (user.role === "ORGANISER") return <OrganiserShell><EventRequestDashboard /></OrganiserShell>;
  return <StaffShell><h1 className="text-3xl font-bold">{ROLE_LABELS[user.role]} dashboard</h1>{user.role === "COORDINATOR" ? <CoordinatorEvents /> : <SectionCard><h2 className="text-xl font-semibold">Your workspace</h2><p>{user.role === "VENUE_STAFF" ? "Manage venue operations within your permitted venue scope." : user.role === "TECH_SUPPORT" ? "Review technical requirements within your assigned event scope." : "Coordinator assignment tools are not available in this workspace."}</p></SectionCard>}</StaffShell>;
}
