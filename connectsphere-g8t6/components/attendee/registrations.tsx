"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EventDetailsDialog } from "@/components/attendee/discovery/event-details-dialog";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageContent } from "@/components/layout/page-content";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { AlertBanner, Button, SectionCard } from "@/components/shared/primitives";
import { apiRequest } from "@/lib/api";
import { ROUTES } from "@/lib/auth";
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
  return <DashboardShell><PageContent title="My Registrations" eyebrow="Attendee" action={<NotificationsBell />}>{error && <AlertBanner tone="error">{error}<Button type="button" onClick={() => { setError(""); setLoading(true); setRetry(v => v + 1); }}>Retry</Button></AlertBanner>}{loading ? <p>Loading registrations…</p> : <RegistrationCards items={items} />}</PageContent></DashboardShell>;
}

// /my-registrations?eventId=<id> opens that event's details (SPM-155 AC4, AC5),
// from "Go to Event" on a notification or View Event Details on a card. The
// card behind the dialog is outlined and scrolled into view; closing removes
// the parameter and returns focus. Rendered inside the shell, whose Suspense
// boundary covers useSearchParams.
function RegistrationCards({ items }: { items: Registration[] }) {
  const router = useRouter();
  const requested = Number(useSearchParams().get("eventId"));
  const eventId = Number.isSafeInteger(requested) && requested > 0 ? requested : null;
  const match = eventId === null ? undefined : items.find(item => item.event.event_id === eventId);
  const highlighted = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const closedEventId = useRef<number | null>(null);
  useEffect(() => {
    if (!match) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    highlighted.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [match]);
  const openDetails = (id: number, button: HTMLElement) => {
    opener.current = button;
    router.push(`${ROUTES.registrations}?eventId=${id}`, { scroll: false });
  };
  const closeDetails = () => {
    closedEventId.current = eventId;
    router.replace(ROUTES.registrations, { scroll: false });
  };
  // Back to the button that opened it, or else to the event's card.
  const restoreFocus = () => {
    if (opener.current?.isConnected) opener.current.focus();
    else document.getElementById(`registration-event-${closedEventId.current}`)?.focus();
    opener.current = null;
  };
  return <>
    {items.length ? items.map(item => {
      const id = item.event.event_id;
      const isMatch = match === item;
      return <div key={item.registration_id} id={id ? `registration-event-${id}` : undefined} ref={isMatch ? highlighted : undefined} tabIndex={id ? -1 : undefined} aria-current={isMatch ? "true" : undefined} data-highlighted={isMatch ? "true" : undefined} className={isMatch ? "rounded-panel outline-2 outline-offset-2 outline-primary" : "rounded-panel focus:outline-2 focus:outline-offset-2 focus:outline-primary"}>
        <SectionCard>{isMatch && <span className="mb-2 inline-flex rounded-pill bg-primary-fixed px-3 py-1 text-[11px] font-semibold uppercase tracking-label text-primary">Opened from your notification</span>}<h2 className="text-xl font-semibold">{item.event.title}</h2><p>{item.registration_status === "WAITLISTED" ? "Waitlisted · a place is not yet confirmed" : "Registered"}</p><p>{item.event.attendee_status === "PENDING_CONFIRMATION" ? "Event confirmation pending" : item.event.attendee_status.replaceAll("_", " ")}</p>{item.event.description && <p>{item.event.description}</p>}{item.event.start_datetime && <p>{new Date(item.event.start_datetime).toLocaleString()}</p>}{item.event.venue && <p>{item.event.venue.name} · {item.event.venue.address}</p>}
          {id ? <div className="mt-4"><Button type="button" variant="secondary" aria-label={`View Event Details: ${item.event.title}`} onClick={event => openDetails(id, event.currentTarget)} className="max-lg:min-h-11">View Event Details</Button></div> : null}
        </SectionCard>
      </div>;
    }) : <p>You have no registrations or waitlist entries.</p>}
    <EventDetailsDialog
      event={eventId === null ? null : { eventId, title: match?.event.title ?? "Event details" }}
      detailsFrom="my-events"
      onClose={closeDetails}
      onClosed={restoreFocus}
      notFoundDescription="You may have withdrawn, or this event is no longer available to you."
    />
  </>;
}
