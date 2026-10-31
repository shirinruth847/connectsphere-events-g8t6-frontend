"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EventDetailsDialog } from "@/components/attendee/discovery/event-details-dialog";
import { actionSuccessMessage, placeLabel } from "@/components/attendee/registration-actions/registration-action-rules";
import { RegistrationActions, type RegistrationChange } from "@/components/attendee/registration-actions/registration-actions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageContent } from "@/components/layout/page-content";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { AlertBanner, Button, SectionCard } from "@/components/shared/primitives";
import { apiRequest } from "@/lib/api";
import type { PlaceOffer } from "@/lib/api/my-events";
import { ROUTES } from "@/lib/auth";
// MOCK CONTRACT (SPM-163): waitlist_position and offer are not in the live list yet.
type Registration = { registration_id: number; registration_status: string; waitlist_position?: number | null; offer?: PlaceOffer | null; event: { event_id?: number; title: string; description?: string; start_datetime?: string; attendee_status: string; venue?: { name: string; address: string } | null } };
export function Registrations() {
  const [items, setItems] = useState<Registration[]>([]); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  // The last confirmed change to a place, announced politely. The list is then
  // reloaded in the background so it shows the backend's latest places.
  const [flash, setFlash] = useState("");
  const flashRef = useRef<HTMLDivElement>(null);
  const onRegistrationChange = (change: RegistrationChange, leftList: boolean) => {
    setFlash(change.result ? actionSuccessMessage(change.kind, change.title) : `Your place for ${change.title} had changed. Showing its latest status.`);
    setRetry(v => v + 1);
    // The card may be gone, so focus moves to the message instead of the page top.
    if (leftList) requestAnimationFrame(() => flashRef.current?.focus());
  };
  useEffect(() => { let alive = true;
    const load = async () => { const all: Registration[] = []; let offset: number | null = 0;
      do { const page: { registrations: Registration[]; page: { next_offset: number | null } } = await apiRequest(`/registrations/mine?limit=100&offset=${offset}`); all.push(...page.registrations); offset = page.page.next_offset; } while (offset !== null);
      if (alive) setItems(all);
    };
    void load().catch(e => { if (alive) setError(e.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [retry]);
  return <DashboardShell><PageContent title="My Registrations" eyebrow="Attendee" action={<NotificationsBell />}>
    <div ref={flashRef} tabIndex={-1} aria-live="polite" className="mb-4 rounded-control empty:hidden focus:outline-2 focus:outline-offset-2 focus:outline-primary">{flash ? <AlertBanner tone="success" live={false}>{flash}</AlertBanner> : null}</div>
    {error && <AlertBanner tone="error">{error}<Button type="button" onClick={() => { setError(""); setLoading(true); setRetry(v => v + 1); }}>Retry</Button></AlertBanner>}{loading ? <p>Loading registrations…</p> : <RegistrationCards items={items} onRegistrationChange={onRegistrationChange} />}</PageContent></DashboardShell>;
}

// /my-registrations?eventId=<id> opens that event's details (SPM-155 AC4, AC5),
// from "Go to Event" on a notification (which adds from=notification) or View
// Event Details on a card. The card behind the dialog is outlined and scrolled
// into view; closing removes the parameters and returns focus. Rendered inside
// the shell, whose Suspense boundary covers useSearchParams.
function RegistrationCards({ items, onRegistrationChange }: { items: Registration[]; onRegistrationChange: (change: RegistrationChange, leftList: boolean) => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = Number(searchParams.get("eventId"));
  const fromNotification = searchParams.get("from") === "notification";
  const eventId = Number.isSafeInteger(requested) && requested > 0 ? requested : null;
  const match = eventId === null ? undefined : items.find(item => item.event.event_id === eventId);
  const highlighted = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const closedEventId = useRef<number | null>(null);
  // Set when a change already moved focus to the page's status message.
  const focusHandled = useRef(false);
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
  // Leaving, declining or withdrawing removes the event from My Events, so its
  // open details close; an accepted offer stays open and reloads.
  const handleChange = (change: RegistrationChange) => {
    const leftList = change.result !== null && change.kind !== "accept";
    if (leftList && eventId === change.eventId) {
      focusHandled.current = true;
      closeDetails();
    }
    onRegistrationChange(change, leftList);
  };
  // Back to the button that opened it, or else to the event's card.
  const restoreFocus = () => {
    if (focusHandled.current) {
      focusHandled.current = false;
      opener.current = null;
      return;
    }
    if (opener.current?.isConnected) opener.current.focus();
    else document.getElementById(`registration-event-${closedEventId.current}`)?.focus();
    opener.current = null;
  };
  return <>
    {items.length ? items.map(item => {
      const id = item.event.event_id;
      const isMatch = match === item;
      return <div key={item.registration_id} id={id ? `registration-event-${id}` : undefined} ref={isMatch ? highlighted : undefined} tabIndex={id ? -1 : undefined} aria-current={isMatch ? "true" : undefined} data-highlighted={isMatch ? "true" : undefined} className={isMatch ? "rounded-panel outline-2 outline-offset-2 outline-primary" : "rounded-panel focus:outline-2 focus:outline-offset-2 focus:outline-primary"}>
        <SectionCard>{isMatch && fromNotification && <span className="mb-2 inline-flex rounded-pill bg-primary-fixed px-3 py-1 text-[11px] font-semibold uppercase tracking-label text-primary">Opened from your notification</span>}<h2 className="text-xl font-semibold">{item.event.title}</h2><p className="font-semibold">{placeLabel({ status: item.registration_status, waitlistPosition: item.waitlist_position })}</p>{item.registration_status === "WAITLISTED" && <p className="text-sm text-on-surface-variant">A place is not yet confirmed.</p>}<p>{item.event.attendee_status === "PENDING_CONFIRMATION" ? "Event confirmation pending" : item.event.attendee_status.replaceAll("_", " ")}</p>{item.event.description && <p>{item.event.description}</p>}{item.event.start_datetime && <p>{new Date(item.event.start_datetime).toLocaleString()}</p>}{item.event.venue && <p>{item.event.venue.name} · {item.event.venue.address}</p>}
          {id ? <div className="mt-4 flex flex-col gap-3"><Button type="button" variant="secondary" aria-label={`View Event Details: ${item.event.title}`} onClick={event => openDetails(id, event.currentTarget)} className="w-fit max-lg:min-h-11 max-sm:w-full">View Event Details</Button>
            <RegistrationActions eventId={id} title={item.event.title} place={{ registration: { status: item.registration_status, waitlistPosition: item.waitlist_position, offer: item.offer }, startDatetime: item.event.start_datetime, attendeeStatus: item.event.attendee_status }} onChange={handleChange} /></div> : null}
        </SectionCard>
      </div>;
    }) : <p>You have no registrations or waitlist entries.</p>}
    <EventDetailsDialog
      event={eventId === null ? null : { eventId, title: match?.event.title ?? "Event details" }}
      detailsFrom="my-events"
      onClose={closeDetails}
      onClosed={restoreFocus}
      notFoundDescription="You may have withdrawn, or this event is no longer available to you."
      onRegistrationChange={handleChange}
    />
  </>;
}
