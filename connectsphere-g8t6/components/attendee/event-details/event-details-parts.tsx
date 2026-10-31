"use client";

import { useId, type ReactNode } from "react";
import { DiscoveryIcon } from "@/components/attendee/discovery/discovery-icon";
import type { DiscoveryDetailRow } from "@/components/attendee/discovery/discovery-details-panel";
import { LOCATION_PENDING_LABEL } from "@/components/attendee/discovery/event-discovery-card";
import { formatEventDate, formatEventTime, formatTimestamp } from "@/components/attendee/discovery/format-event-time";
import { getRegistrationState, showsRegistrationWindow } from "@/components/attendee/discovery/registration-availability";
import { RegistrationStateControl } from "@/components/attendee/discovery/registration-state-control";
import { placeActions, placeLabel } from "@/components/attendee/registration-actions/registration-action-rules";
import { RegistrationActions, type RegistrationChange } from "@/components/attendee/registration-actions/registration-actions";
import { AlertBanner } from "@/components/shared/primitives";
import type { AttendeeEventDetail } from "@/lib/api/discovery";
import type { AttendeeEventView, AttendeeRegistration } from "@/lib/api/my-events";

// Pieces of the event details dialog (frame 282:1271), shared by Event
// Discovery and My Events.

const STATUS_CHIPS: Record<string, { label: string; className: string }> = {
  PENDING_CONFIRMATION: { label: "Event confirmation pending", className: "bg-primary-fixed text-primary" },
  CANCELLED: { label: "Cancelled", className: "bg-error-container text-on-error-container" },
  COMPLETED: { label: "Completed", className: "bg-success-container text-on-success-container" },
};

// Confirmed events carry no extra chip; the other display statuses say what changed.
export function AttendeeStatusChip({ status }: { status?: string }) {
  const chip = status ? STATUS_CHIPS[status] : undefined;
  if (!chip) return null;
  return (
    <span className={`inline-flex w-fit items-center rounded-pill px-2.5 py-1 text-[11px] font-bold uppercase leading-[14px] tracking-[0.04em] ${chip.className}`}>
      {chip.label}
    </span>
  );
}

export function MyPlaceChip({ registration }: { registration: AttendeeRegistration }) {
  const waitlisted = registration.status === "WAITLISTED";
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-bold leading-[14px] tracking-[0.04em] ${
        waitlisted ? "bg-tertiary-fixed text-on-tertiary-fixed" : "bg-success-container text-on-success-container"
      }`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-pill ${waitlisted ? "bg-tertiary" : "bg-success"}`} />
      {/* Not "Waitlisted", which Event Discovery uses for a full event (SPM-44 AC3). */}
      {waitlisted ? "On the waitlist" : "Registered"}
    </span>
  );
}

export function HeroChip({ icon, children }: { icon: "calendar" | "venue"; children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-control bg-surface-container-lowest/80 px-3 py-1.5 text-xs font-medium text-on-surface">
      <DiscoveryIcon name={icon} className="text-primary" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </span>
  );
}

export function SectionLabel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="text-[11px] font-bold uppercase tracking-label text-on-surface-variant">
      {children}
    </h3>
  );
}

// Shown instead of the date, time and venue while they may not be the
// confirmed ones and there is no earlier confirmation to show (never
// confirmed, or not published). It states only what is known: no promised
// notification or organiser action.
const WITHHELD_NOTICES = {
  cancelled: { title: "This event has been cancelled", text: "Its date, time and venue are no longer shown." },
  confirming: { title: "This event's details are being confirmed", text: "Check back here for the latest information." },
} as const;

export function WithheldNotice({ attendeeStatus }: { attendeeStatus?: string }) {
  const cancelled = attendeeStatus === "CANCELLED";
  const notice = cancelled ? WITHHELD_NOTICES.cancelled : WITHHELD_NOTICES.confirming;
  return (
    <AlertBanner tone={cancelled ? "error" : "info"} title={notice.title}>
      {notice.text}
    </AlertBanner>
  );
}

// Shown above the details of an event being reconfirmed or cancelled, which
// are its last confirmed ones (Master 5.7), saying when they were confirmed.
// Like WithheldNotice, it states only what is known.
export function LastConfirmedNotice({ attendeeStatus, lastConfirmedAt }: { attendeeStatus?: string; lastConfirmedAt: string }) {
  const cancelled = attendeeStatus === "CANCELLED";
  const confirmedOn = formatTimestamp(lastConfirmedAt);
  return cancelled ? (
    <AlertBanner tone="error" title="This event has been cancelled">
      These are its details as last confirmed{confirmedOn ? ` on ${confirmedOn}` : ""}.
    </AlertBanner>
  ) : (
    <AlertBanner tone="info" title="This event's details are being confirmed">
      These are the details last confirmed{confirmedOn ? ` on ${confirmedOn}` : ""}. Check back here for the latest information.
    </AlertBanner>
  );
}

// The attendee's own place, where the frame shows the capacity meter.
export function MyPlaceCard({ registration }: { registration: AttendeeRegistration }) {
  const headingId = useId();
  const waitlisted = registration.status === "WAITLISTED";
  return (
    <section aria-labelledby={headingId} className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
      <SectionLabel id={headingId}>Your place</SectionLabel>
      <p className="mt-2 text-sm font-semibold text-on-surface">{placeLabel(registration)}</p>
      {waitlisted ? <p className="mt-1 text-xs text-on-surface-variant">A place is not yet confirmed.</p> : null}
      {registration.registeredAt ? (
        <p className="mt-1 text-xs text-on-surface-variant">Since {formatTimestamp(registration.registeredAt)}</p>
      ) : null}
    </section>
  );
}

// The registration start and end times, in SGT. None for UNAVAILABLE, whose
// times may be missing; a missing time is left out rather than read as
// "open immediately" or "no closing date", which it no longer means (SPM-134).
export function registrationWindowRows(event: AttendeeEventDetail): DiscoveryDetailRow[] {
  if (!showsRegistrationWindow(event.registrationAvailability)) return [];
  const rows: DiscoveryDetailRow[] = [];
  const opens = formatTimestamp(event.registrationOpenAt);
  const closes = formatTimestamp(event.registrationCloseAt);
  if (opens) rows.push({ label: "Registration opens", icon: "registration", value: opens });
  if (closes) rows.push({ label: "Registration closes", icon: "registration", value: closes });
  return rows;
}

// Date, time and the registration window, in SGT.
export function scheduleRows(event: AttendeeEventDetail): DiscoveryDetailRow[] {
  return [
    { label: "Date", icon: "calendar", value: formatEventDate(event.startDatetime, event.endDatetime) },
    { label: "Time", icon: "schedule", value: formatEventTime(event.startDatetime, event.endDatetime) },
    ...registrationWindowRows(event),
  ];
}

export function placeRows(event: AttendeeEventDetail): DiscoveryDetailRow[] {
  const rows: DiscoveryDetailRow[] = [{ label: "Location", icon: "venue", value: event.location ?? LOCATION_PENDING_LABEL }];
  if (event.organisationName) rows.push({ label: "Organised by", icon: "organisation", value: event.organisationName });
  return rows;
}

// How an event surface offers direct registration (SPM-134). placesKnown says
// whether the attendee's own registrations have loaded; onRegister opens the
// shared registration form.
export interface RegistrationEntry {
  placesKnown: boolean;
  onRegister: (trigger: HTMLButtonElement) => void;
  // Opens the Join Waitlist confirmation for a full event (SPM-163).
  onJoinWaitlist?: (trigger: HTMLButtonElement) => void;
}

// The registration area of an event, shared by the event details dialog and
// the /events/[eventId] page, with the same states as the Event Discovery card
// (getRegistrationState). On My Events, which handles changes to a place, it
// holds the actions on the attendee's own place: Accept Slot and Decline for
// an open offer, Leave Waitlist (SPM-163) or Withdraw Registration (SPM-147).
// Elsewhere a full event offers Join Waitlist once the attendee's places
// are known, as on the card (SPM-163). Withheld details get none.
export function RegistrationActionBar({
  event,
  register,
  onRegistrationChange,
  className,
}: {
  event: AttendeeEventView;
  register?: RegistrationEntry;
  onRegistrationChange?: (change: RegistrationChange) => void;
  className: string;
}) {
  const footerClasses = `flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3 ${className}`;
  if (event.myRegistration && onRegistrationChange) {
    const place = { registration: event.myRegistration, attendeeStatus: event.attendeeStatus };
    if (!placeActions(place).length) return null;
    return (
      <footer className={footerClasses}>
        <RegistrationActions eventId={event.eventId} title={event.title} place={place} onChange={onRegistrationChange} className="w-full sm:items-end" />
      </footer>
    );
  }
  if (!register || event.detailsWithheld) return null;
  const state = getRegistrationState(event.registrationAvailability, event.myRegistration ?? null, register.placesKnown);
  if (!state) return null;
  // When registration opens, from the backend's own start time; the state itself
  // stays the backend's NOT_YET_OPEN, never a comparison with the browser clock.
  const opensAt = state.kind === "unavailable" && event.registrationAvailability === "NOT_YET_OPEN" ? formatTimestamp(event.registrationOpenAt) : null;

  return (
    <footer className={footerClasses}>
      <RegistrationStateControl
        state={state}
        eventTitle={event.title}
        onRegister={register.onRegister}
        onJoinWaitlist={register.onJoinWaitlist}
        note={opensAt ? `Registration opens ${opensAt}.` : null}
      />
    </footer>
  );
}

// The dialog's footer from the frame (282:1271).
export function EventDetailsFooter({
  event,
  register,
  onRegistrationChange,
}: {
  event: AttendeeEventView;
  register?: RegistrationEntry;
  onRegistrationChange?: (change: RegistrationChange) => void;
}) {
  return (
    <RegistrationActionBar
      event={event}
      register={register}
      onRegistrationChange={onRegistrationChange}
      className="border-t border-outline-variant/60 bg-surface-container-lowest px-5 py-4"
    />
  );
}
