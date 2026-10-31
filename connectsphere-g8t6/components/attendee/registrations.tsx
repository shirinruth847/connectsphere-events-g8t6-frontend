"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DiscoveryDetailsPanel, type DiscoveryDetailRow } from "@/components/attendee/discovery/discovery-details-panel";
import { discoveryErrorMessage } from "@/components/attendee/discovery/discovery-state";
import { EventDetailsDialog } from "@/components/attendee/discovery/event-details-dialog";
import { LOCATION_PENDING_LABEL } from "@/components/attendee/discovery/event-discovery-card";
import { formatEventDate, formatEventTime } from "@/components/attendee/discovery/format-event-time";
import { toApiError } from "@/components/attendee/discovery/use-discovery-events";
import { AttendeeStatusChip } from "@/components/attendee/event-details/event-details-parts";
import { actionSuccessMessage, attendeeStatusLabel, orderMyEvents, placeLabel } from "@/components/attendee/registration-actions/registration-action-rules";
import { RegistrationActions, type RegistrationChange } from "@/components/attendee/registration-actions/registration-actions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageContent } from "@/components/layout/page-content";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { AlertBanner, Button, EmptyState, SectionCard, buttonClasses } from "@/components/shared/primitives";
import type { ApiError } from "@/lib/api";
import type { AttendeeRegistration } from "@/lib/api/my-events";
import { listMyRegistrations, toAttendeeRegistration, type MyRegistrationRow } from "@/lib/api/registrations";
import { ROUTES } from "@/lib/auth";

// The attendee's place and the event's own status are separate rows, so a
// cancelled event is never read as a withdrawal (SPM-141 AC1). Dates are the
// backend's, in SGT; withheld ones say so rather than being guessed. A
// cancelled event whose details are withheld shows neither.
function myEventRows({ event }: MyRegistrationRow, registration: AttendeeRegistration): DiscoveryDetailRow[] {
  const rows: DiscoveryDetailRow[] = [
    { label: "Your place", icon: "registration", value: placeLabel(registration) },
    { label: "Event status", icon: "info", value: attendeeStatusLabel(event.attendee_status) },
  ];
  const withheld = event.attendee_status === "CANCELLED";
  if (event.start_datetime || !withheld) {
    rows.push(
      { label: "Date", icon: "calendar", value: formatEventDate(event.start_datetime, event.end_datetime) },
      { label: "Time", icon: "schedule", value: formatEventTime(event.start_datetime, event.end_datetime) },
    );
  }
  const location = event.venue ? [event.venue.name, event.venue.address].filter(Boolean).join(", ") : "";
  if (location || !withheld) rows.push({ label: "Location", icon: "venue", value: location || LOCATION_PENDING_LABEL });
  return rows;
}
export function Registrations() {
  const [items, setItems] = useState<MyRegistrationRow[]>([]); const [error, setError] = useState<ApiError | null>(null); const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  // The last confirmed change to a place, announced politely. The list is then
  // reloaded in the background so it shows the backend's latest places.
  const [flash, setFlash] = useState("");
  const flashRef = useRef<HTMLDivElement>(null);
  const onRegistrationChange = (change: RegistrationChange, focusMessage: boolean) => {
    setFlash(change.result ? actionSuccessMessage(change.kind, change.title) : `Your place for ${change.title} had changed. Showing its latest status.`);
    setRetry(v => v + 1);
    // The card may be gone or redrawn, so focus moves to the message instead of the page top.
    if (focusMessage) requestAnimationFrame(() => flashRef.current?.focus());
  };
  // Every page of the attendee's active places; upcoming events first.
  useEffect(() => { const controller = new AbortController();
    listMyRegistrations(controller.signal)
      .then(rows => { if (!controller.signal.aborted) { setItems(orderMyEvents(rows)); setError(null); } })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(toApiError(caught)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  return <DashboardShell><PageContent title="My Registrations" eyebrow="Attendee" action={<NotificationsBell />}>
    <div ref={flashRef} tabIndex={-1} aria-live="polite" className="mb-4 rounded-control empty:hidden focus:outline-2 focus:outline-offset-2 focus:outline-primary">{flash ? <AlertBanner tone="success" live={false}>{flash}</AlertBanner> : null}</div>
    {/* The backend's wording is never shown; a 401 is handled by the shared session expiry. */}
    {error && error.status !== 401 && <AlertBanner tone="error">{discoveryErrorMessage(error, "registrations")}<Button type="button" onClick={() => { setError(null); setLoading(true); setRetry(v => v + 1); }}>Retry</Button></AlertBanner>}
    {/* After a failed read neither the empty state nor the last list (with its actions) is shown, so nothing unconfirmed appears (SPM-141 TC-MYE-024). */}
    {loading ? <p>Loading registrations…</p> : <RegistrationCards items={error ? null : items} onRegistrationChange={onRegistrationChange} />}</PageContent></DashboardShell>;
}

// /my-registrations?eventId=<id> opens that event's details (SPM-155 AC4, AC5),
// from "Go to Event" on a notification (which adds from=notification) or View
// Event Details on a card. The card behind the dialog is outlined and scrolled
// into view; closing removes the parameters and returns focus. Rendered inside
// the shell, whose Suspense boundary covers useSearchParams.
// items is null when the list could not be read; the details dialog still
// opens from a link, because it reads its own event.
function RegistrationCards({ items, onRegistrationChange }: { items: MyRegistrationRow[] | null; onRegistrationChange: (change: RegistrationChange, focusMessage: boolean) => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = Number(searchParams.get("eventId"));
  const fromNotification = searchParams.get("from") === "notification";
  const eventId = Number.isSafeInteger(requested) && requested > 0 ? requested : null;
  const match = eventId === null ? undefined : items?.find(item => item.event.event_id === eventId);
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
    // A refusal (the place had changed) closes only the confirmation, whose
    // opener may be redrawn by the reload; on the list, focus goes to the
    // message. In an open details dialog it stays there.
    const refusedOnList = change.result === null && eventId !== change.eventId;
    onRegistrationChange(change, leftList || refusedOnList);
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
    {items === null ? null : items.length ? <div className="flex flex-col gap-5">{items.map(item => {
      const id = item.event.event_id;
      const isMatch = match === item;
      const registration = toAttendeeRegistration(item);
      return <div key={item.registration_id} id={id ? `registration-event-${id}` : undefined} ref={isMatch ? highlighted : undefined} tabIndex={id ? -1 : undefined} aria-current={isMatch ? "true" : undefined} data-highlighted={isMatch ? "true" : undefined} className={isMatch ? "rounded-panel outline-2 outline-offset-2 outline-primary" : "rounded-panel focus:outline-2 focus:outline-offset-2 focus:outline-primary"}>
        <SectionCard>{isMatch && fromNotification && <span className="mb-2 inline-flex rounded-pill bg-primary-fixed px-3 py-1 text-[11px] font-semibold uppercase tracking-label text-primary">Opened from your notification</span>}
          <div className="flex flex-col gap-2"><AttendeeStatusChip status={item.event.attendee_status} /><h2 className="text-xl font-semibold [overflow-wrap:anywhere]">{item.event.title}</h2></div>
          {item.event.description && <p className="mt-1 max-w-readable text-sm text-on-surface-variant [overflow-wrap:anywhere]">{item.event.description}</p>}
          <div className="mt-3"><DiscoveryDetailsPanel rows={myEventRows(item, registration)} /></div>
          {item.registration_status === "WAITLISTED" && <p className="mt-2 text-sm text-on-surface-variant">A place is not yet confirmed.</p>}
          {id ? <div className="mt-4 flex flex-col gap-3"><Button type="button" variant="secondary" aria-label={`View Event Details: ${item.event.title}`} onClick={event => openDetails(id, event.currentTarget)} className="w-fit max-lg:min-h-11 max-sm:w-full">View Event Details</Button>
            <RegistrationActions eventId={id} title={item.event.title} place={{ registration, attendeeStatus: item.event.attendee_status }} onChange={handleChange} /></div> : null}
        </SectionCard>
      </div>;
    })}</div> : <EmptyState title="You are not registered for any events yet." action={<Link href={ROUTES.events} className={`${buttonClasses("primary")} max-lg:min-h-11 max-sm:w-full`}>Explore events</Link>} />}
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
