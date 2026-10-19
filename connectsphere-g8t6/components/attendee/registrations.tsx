"use client";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageContent } from "@/components/layout/page-content";
import { AlertBanner, Button, SectionCard } from "@/components/shared/primitives";
import { apiRequest } from "@/lib/api";
type Registration = { registration_id: number; registration_status: string; event: { title: string; description?: string; start_datetime?: string; attendee_status: string; venue?: { name: string; address: string } | null } };
export function Registrations() {
  const [items, setItems] = useState<Registration[]>([]); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => { let alive = true;
    const load = async () => { const all: Registration[] = []; let offset: number | null = 0;
      do { const page: { registrations: Registration[]; page: { next_offset: number | null } } = await apiRequest(`/registrations/mine?limit=100&offset=${offset}`); all.push(...page.registrations); offset = page.page.next_offset; } while (offset !== null);
      if (alive) setItems(all);
    };
    void load().catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [retry]);
  return <DashboardShell><PageContent title="My Registrations" eyebrow="Attendee">{error && <AlertBanner tone="error">{error}<Button type="button" onClick={() => { setError(""); setLoading(true); setRetry(v => v + 1); }}>Retry</Button></AlertBanner>}{loading ? <p>Loading registrations…</p> : items.length ? items.map(item => <SectionCard key={item.registration_id}><h2 className="text-xl font-semibold">{item.event.title}</h2><p>{item.registration_status === "WAITLISTED" ? "Waitlisted · a place is not yet confirmed" : "Registered"}</p><p>{item.event.attendee_status === "PENDING_CONFIRMATION" ? "Event confirmation pending" : item.event.attendee_status.replaceAll("_", " ")}</p>{item.event.description && <p>{item.event.description}</p>}{item.event.start_datetime && <p>{new Date(item.event.start_datetime).toLocaleString()}</p>}{item.event.venue && <p>{item.event.venue.name} · {item.event.venue.address}</p>}</SectionCard>) : <p>You have no registrations or waitlist entries.</p>}</PageContent></DashboardShell>;
}
