"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageContent } from "@/components/layout/page-content";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { AlertBanner, Button, SectionCard } from "@/components/shared/primitives";
import { apiRequest } from "@/lib/api";
type Registration = { registration_id: number; registration_status: string; event: { event_id?: number; title: string; description?: string; start_datetime?: string; attendee_status: string; venue?: { name: string; address: string } | null } };
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
  return <DashboardShell><PageContent title="My Registrations" eyebrow="Attendee" action={<NotificationsBell />}>{error && <AlertBanner tone="error">{error}<Button type="button" onClick={() => { setError(""); setLoading(true); setRetry(v => v + 1); }}>Retry</Button></AlertBanner>}{loading ? <p>Loading registrations…</p> : <RegistrationCards items={items} loaded={!error} />}</PageContent></DashboardShell>;
}

// "Go to Event" from a notification opens /my-registrations?eventId=<id>
// (SPM-155 AC4, AC5): that event's card is outlined, scrolled to and focused.
// Rendered inside the shell, whose Suspense boundary covers useSearchParams.
function RegistrationCards({ items, loaded }: { items: Registration[]; loaded: boolean }) {
  const requested = Number(useSearchParams().get("eventId"));
  const eventId = Number.isSafeInteger(requested) && requested > 0 ? requested : null;
  const highlighted = useRef<HTMLDivElement>(null);
  const match = eventId !== null && items.some(item => item.event.event_id === eventId);
  useEffect(() => {
    if (!match) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    highlighted.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    highlighted.current?.focus({ preventScroll: true });
  }, [match, eventId]);
  return <>
    {eventId !== null && loaded && !match && <AlertBanner tone="info" title="This event is no longer in My Registrations">You may have withdrawn, or the event is no longer available to you. Your other registrations are listed below.</AlertBanner>}
    {items.length ? items.map(item => {
      const isMatch = match && item.event.event_id === eventId;
      return <div key={item.registration_id} ref={isMatch ? highlighted : undefined} tabIndex={isMatch ? -1 : undefined} aria-current={isMatch ? "true" : undefined} data-highlighted={isMatch ? "true" : undefined} className={isMatch ? "rounded-panel outline-2 outline-offset-2 outline-primary" : undefined}>
        <SectionCard>{isMatch && <span className="mb-2 inline-flex rounded-pill bg-primary-fixed px-3 py-1 text-[11px] font-semibold uppercase tracking-label text-primary">From your notification</span>}<h2 className="text-xl font-semibold">{item.event.title}</h2><p>{item.registration_status === "WAITLISTED" ? "Waitlisted · a place is not yet confirmed" : "Registered"}</p><p>{item.event.attendee_status === "PENDING_CONFIRMATION" ? "Event confirmation pending" : item.event.attendee_status.replaceAll("_", " ")}</p>{item.event.description && <p>{item.event.description}</p>}{item.event.start_datetime && <p>{new Date(item.event.start_datetime).toLocaleString()}</p>}{item.event.venue && <p>{item.event.venue.name} · {item.event.venue.address}</p>}</SectionCard>
      </div>;
    }) : <p>You have no registrations or waitlist entries.</p>}
  </>;
}
