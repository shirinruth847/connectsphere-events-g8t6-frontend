"use client";

import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from "react";
import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import type { AttendeeEventDetail, AttendeeEventSummary, AttendeeRegistration } from "@/lib/api/discovery";
import { DiscoveryDetailsPanel, type DiscoveryDetailRow } from "./discovery-details-panel";
import { DiscoveryIcon } from "./discovery-icon";
import { LOCATION_PENDING_LABEL } from "./event-discovery-card";
import { formatEventDate, formatEventTime, formatTimestamp } from "./format-event-time";
import { getRegistrationAction, isRegistrationEnabled } from "./registration-availability";
import { RegistrationAvailabilityChip } from "./registration-availability-chip";
import { useDiscoveryEvent } from "./use-discovery-event";

// What opens the dialog: a discovery row, or just an ID and title from My Events.
export type EventDetailsTarget = Pick<AttendeeEventSummary, "eventId" | "title"> &
  Partial<Pick<AttendeeEventSummary, "registrationAvailability">>;

interface EventDetailsDialogProps {
  // The event that was opened; null when the dialog is closed.
  event: EventDetailsTarget | null;
  onClose: () => void;
  // Runs after the dialog has closed, to put focus back where it belongs.
  onClosed: () => void;
  onLoaded?: (event: AttendeeEventDetail) => void;
  onNotFound?: (eventId: number) => void;
  // Explains a 404 in the opener's terms.
  notFoundDescription?: string;
}

const DISCOVERY_NOT_FOUND = "It may have been unpublished or rescheduled. It has been removed from your list.";

// Attendee-facing event details, shared by Event Discovery (SPM-34) and My
// Events (SPM-155), laid out from the event details frame (282:1271). A native
// <dialog>: showModal() traps focus and makes the page inert, Escape closes it,
// and focus is restored on close. The frame's photo, track, speakers, agenda,
// amenities, pricing and seat counts have no data and are not shown.
export function EventDetailsDialog({
  event,
  onClose,
  onClosed,
  onLoaded,
  onNotFound,
  notFoundDescription = DISCOVERY_NOT_FOUND,
}: EventDetailsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = event !== null;
  const handleClosed = useEffectEvent(onClosed);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) {
      dialog.close();
      handleClosed();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(cancelEvent) => {
        cancelEvent.preventDefault();
        onClose();
      }}
      // A click on the dialog element itself is a click on its backdrop.
      onClick={(clickEvent) => {
        if (clickEvent.target === clickEvent.currentTarget) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(896px,calc(100vw-32px))] overflow-hidden rounded-panel border-t-4 border-t-primary bg-surface-container-lowest p-0 text-on-surface shadow-elevation-4 backdrop:bg-on-surface/40 backdrop:backdrop-blur-sm open:flex open:flex-col"
    >
      {event ? (
        <EventDetailsContent
          key={event.eventId}
          summary={event}
          titleId={titleId}
          onClose={onClose}
          onLoaded={onLoaded}
          onNotFound={onNotFound}
          notFoundDescription={notFoundDescription}
        />
      ) : null}
    </dialog>
  );
}

function EventDetailsContent({
  summary,
  titleId,
  onClose,
  onLoaded,
  onNotFound,
  notFoundDescription,
}: {
  summary: EventDetailsTarget;
  titleId: string;
  onClose: () => void;
  onLoaded?: (event: AttendeeEventDetail) => void;
  onNotFound?: (eventId: number) => void;
  notFoundDescription: string;
}) {
  const { state, retry } = useDiscoveryEvent(summary.eventId, { onLoaded, onNotFound });
  const event = state.status === "ready" ? state.event : null;
  const withheld = Boolean(event?.detailsWithheld);
  const myRegistration = event?.myRegistration ?? null;
  // Availability is for deciding whether to sign up, so it is not shown to
  // someone who already holds a place, or when the details are held back.
  const availability = event ? event.registrationAvailability : summary.registrationAvailability;
  const showAvailability = state.status !== "not-found" && !withheld && !myRegistration && availability;

  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b border-outline-variant/40 bg-surface-container-lowest px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {showAvailability ? <RegistrationAvailabilityChip value={availability} /> : null}
          {event ? <AttendeeStatusChip status={event.attendeeStatus} /> : null}
          {myRegistration ? <MyPlaceChip registration={myRegistration} /> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {event && !withheld && event.startDatetime ? (
            <span className="hidden items-center gap-1 text-xs text-on-surface-variant sm:inline-flex">
              <DiscoveryIcon name="schedule" />
              {formatEventTime(event.startDatetime, event.endDatetime)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <DiscoveryIcon name="close" size={20} label="Close event details" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto bg-surface px-4 py-5 sm:px-8 sm:py-6" aria-busy={state.status === "loading"}>
        {/* The frame's photo banner; without event imagery it uses the lavender fallback. */}
        <section className="flex min-h-40 flex-col justify-end gap-3 rounded-panel bg-gradient-to-br from-primary-fixed to-tertiary-fixed p-5 sm:p-6">
          <span className="text-[11px] font-bold uppercase tracking-label text-primary">Event details</span>
          <h2 id={titleId} className="text-2xl font-bold leading-tight tracking-[-0.025em] text-on-surface [overflow-wrap:anywhere] sm:text-[28px]">
            {event?.title ?? summary.title}
          </h2>
          {event && !withheld ? (
            <div className="flex flex-wrap gap-2">
              <HeroChip icon="calendar">{formatEventDate(event.startDatetime, event.endDatetime)}</HeroChip>
              <HeroChip icon="venue">{event.location ?? LOCATION_PENDING_LABEL}</HeroChip>
            </div>
          ) : null}
        </section>

        {state.status === "loading" ? (
          <div className="space-y-3" role="status" aria-label="Loading the latest event details">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-36 w-full" />
          </div>
        ) : null}

        {state.status === "not-found" ? (
          <AlertBanner tone="warning" title="This event is no longer available">
            {notFoundDescription}
          </AlertBanner>
        ) : null}

        {state.status === "error" ? (
          <AlertBanner tone="error" title="Could not load the event details">
            {state.error.message}
            <div className="mt-3">
              <Button variant="danger" onClick={retry} className="max-lg:min-h-11">
                Try again
              </Button>
            </div>
          </AlertBanner>
        ) : null}

        {event && withheld ? <WithheldNotice attendeeStatus={event.attendeeStatus} /> : null}
        {myRegistration ? <MyPlaceCard registration={myRegistration} /> : null}
        {event && !withheld ? <EventDetailsBody event={event} /> : null}
      </div>

      {event && !withheld && !myRegistration ? <RegistrationActionFooter event={event} /> : null}
      {/* TODO(SPM-163): Accept Slot and Decline for a waitlist offer go in this
          footer slot (tertiary Accept, secondary Decline) with the offer expiry,
          driven by myRegistration.offer. */}
    </>
  );
}

function HeroChip({ icon, children }: { icon: "calendar" | "venue"; children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-control bg-surface-container-lowest/80 px-3 py-1.5 text-xs font-medium text-on-surface">
      <DiscoveryIcon name={icon} className="text-primary" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </span>
  );
}

const STATUS_CHIPS: Record<string, { label: string; className: string }> = {
  PENDING_CONFIRMATION: { label: "Event confirmation pending", className: "bg-primary-fixed text-primary" },
  CANCELLED: { label: "Cancelled", className: "bg-error-container text-on-error-container" },
  COMPLETED: { label: "Completed", className: "bg-success-container text-on-success-container" },
};

// Confirmed events carry no extra chip; the other display statuses say what changed.
function AttendeeStatusChip({ status }: { status?: string }) {
  const chip = status ? STATUS_CHIPS[status] : undefined;
  if (!chip) return null;
  return (
    <span className={`inline-flex w-fit items-center rounded-pill px-2.5 py-1 text-[11px] font-bold uppercase leading-[14px] tracking-[0.04em] ${chip.className}`}>
      {chip.label}
    </span>
  );
}

function MyPlaceChip({ registration }: { registration: AttendeeRegistration }) {
  const waitlisted = registration.status === "WAITLISTED";
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-bold leading-[14px] tracking-[0.04em] ${
        waitlisted ? "bg-tertiary-fixed text-on-tertiary-fixed" : "bg-success-container text-on-success-container"
      }`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-pill ${waitlisted ? "bg-tertiary" : "bg-success"}`} />
      {waitlisted ? "Waitlisted" : "Registered"}
    </span>
  );
}

// Shown instead of the date, time and venue while they may not be the
// confirmed ones. TODO(SPM-173): show the last confirmation snapshot instead.
function WithheldNotice({ attendeeStatus }: { attendeeStatus?: string }) {
  if (attendeeStatus === "CANCELLED") {
    return (
      <AlertBanner tone="error" title="This event has been cancelled">
        Its date, time and venue are no longer shown. Your notifications have the organisers&apos; message about the cancellation.
      </AlertBanner>
    );
  }
  return (
    <AlertBanner tone="info" title="This event is being updated">
      The organisers are changing this event. Its date, time and venue will show here again once the changes are confirmed, and you will get a notification.
    </AlertBanner>
  );
}

// The attendee's own place, where the frame shows the capacity meter (seat
// counts are not shown to attendees).
function MyPlaceCard({ registration }: { registration: AttendeeRegistration }) {
  const waitlisted = registration.status === "WAITLISTED";
  return (
    <section aria-labelledby="my-place-heading" className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
      <h3 id="my-place-heading" className="text-[11px] font-bold uppercase tracking-label text-on-surface-variant">
        Your place
      </h3>
      <p className="mt-2 text-sm font-semibold text-on-surface">
        {waitlisted ? "Waitlisted · a place is not yet confirmed" : "Registered"}
      </p>
      {registration.registeredAt ? (
        <p className="mt-1 text-xs text-on-surface-variant">Since {formatTimestamp(registration.registeredAt)}</p>
      ) : null}
    </section>
  );
}

function SectionLabel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="text-[11px] font-bold uppercase tracking-label text-on-surface-variant">
      {children}
    </h3>
  );
}

// Read out as the disabled action's description. It explains why the action
// is unavailable without contradicting the availability chip.
export const REGISTRATION_UNAVAILABLE_NOTE = "Online sign-up isn't available in ConnectSphere yet.";

// Shows the one registration action for this event, as unavailable: there are
// no register, waitlist or notify endpoints yet (separate ticket). It uses
// aria-disabled rather than disabled so keyboard and screen-reader users can
// still reach it and hear why it is unavailable. It has no click handler.
// The shared Button's disabled: style only matches the disabled attribute, so
// the same classes are applied through aria-disabled: instead.
function RegistrationActionFooter({ event }: { event: AttendeeEventDetail }) {
  const helperId = useId();
  const action = getRegistrationAction(event);
  if (!action) return null;

  return (
    <footer className="flex flex-col gap-2 border-t border-outline-variant/60 bg-surface-container-lowest px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
      <p id={helperId} className="text-xs text-on-surface-variant sm:order-first sm:mr-auto">
        {REGISTRATION_UNAVAILABLE_NOTE}
      </p>
      <Button
        type="button"
        variant={action.variant}
        aria-disabled="true"
        aria-describedby={helperId}
        className="w-full aria-disabled:pointer-events-none aria-disabled:opacity-55 max-lg:min-h-11 sm:w-auto"
      >
        {action.label}
      </Button>
    </footer>
  );
}

// The frame's abstract, then its two columns: schedule on the left, venue and
// organiser on the right. Times are in SGT.
function EventDetailsBody({ event }: { event: AttendeeEventDetail }) {
  const schedule: DiscoveryDetailRow[] = [
    { label: "Date", icon: "calendar", value: formatEventDate(event.startDatetime, event.endDatetime) },
    { label: "Time", icon: "schedule", value: formatEventTime(event.startDatetime, event.endDatetime) },
  ];
  // Events without attendee registration carry no registration wording (SPM-34 AC4).
  if (isRegistrationEnabled(event.registrationAvailability)) {
    schedule.push(
      { label: "Registration opens", icon: "registration", value: formatTimestamp(event.registrationOpenAt) ?? "Immediately" },
      { label: "Registration closes", icon: "registration", value: formatTimestamp(event.registrationCloseAt) ?? "No closing date" },
    );
  }
  const place: DiscoveryDetailRow[] = [{ label: "Location", icon: "venue", value: event.location ?? LOCATION_PENDING_LABEL }];
  if (event.organisationName) {
    place.push({ label: "Organised by", icon: "organisation", value: event.organisationName });
  }

  return (
    <>
      <section aria-labelledby="event-about-heading" className="flex flex-col gap-3">
        <SectionLabel id="event-about-heading">About this event</SectionLabel>
        <div className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
          <p className="max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
            {event.description?.trim() || "No description provided."}
          </p>
        </div>
      </section>
      <div className="grid gap-6 md:grid-cols-12">
        <section aria-labelledby="event-schedule-heading" className="flex flex-col gap-3 md:col-span-7">
          <SectionLabel id="event-schedule-heading">Schedule</SectionLabel>
          <DiscoveryDetailsPanel rows={schedule} />
        </section>
        <section aria-labelledby="event-venue-heading" className="flex flex-col gap-3 md:col-span-5">
          <SectionLabel id="event-venue-heading">Venue and organiser</SectionLabel>
          <DiscoveryDetailsPanel rows={place} />
        </section>
      </div>
    </>
  );
}
