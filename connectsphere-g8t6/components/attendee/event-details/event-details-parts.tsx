"use client";

import { useId, type ReactNode } from "react";
import { DiscoveryIcon } from "@/components/attendee/discovery/discovery-icon";
import type { DiscoveryDetailRow } from "@/components/attendee/discovery/discovery-details-panel";
import { LOCATION_PENDING_LABEL } from "@/components/attendee/discovery/event-discovery-card";
import { formatEventDate, formatEventTime, formatTimestamp } from "@/components/attendee/discovery/format-event-time";
import { getRegistrationAction, isRegistrationEnabled } from "@/components/attendee/discovery/registration-availability";
import { JoinWaitlistAction } from "@/components/attendee/registration-actions/join-waitlist-action";
import { placeActions, placeLabel } from "@/components/attendee/registration-actions/registration-action-rules";
import { RegistrationActions, type RegistrationChange } from "@/components/attendee/registration-actions/registration-actions";
import { AlertBanner, Button } from "@/components/shared/primitives";
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

// Date, time and (when attendees can sign up) the registration window, in SGT.
export function scheduleRows(event: AttendeeEventDetail): DiscoveryDetailRow[] {
  const rows: DiscoveryDetailRow[] = [
    { label: "Date", icon: "calendar", value: formatEventDate(event.startDatetime, event.endDatetime) },
    { label: "Time", icon: "schedule", value: formatEventTime(event.startDatetime, event.endDatetime) },
  ];
  // Events without attendee registration carry no registration wording (SPM-34 AC4).
  if (isRegistrationEnabled(event.registrationAvailability)) {
    rows.push(
      { label: "Registration opens", icon: "registration", value: formatTimestamp(event.registrationOpenAt) ?? "Immediately" },
      { label: "Registration closes", icon: "registration", value: formatTimestamp(event.registrationCloseAt) ?? "No closing date" },
    );
  }
  return rows;
}

export function placeRows(event: AttendeeEventDetail): DiscoveryDetailRow[] {
  const rows: DiscoveryDetailRow[] = [{ label: "Location", icon: "venue", value: event.location ?? LOCATION_PENDING_LABEL }];
  if (event.organisationName) rows.push({ label: "Organised by", icon: "organisation", value: event.organisationName });
  return rows;
}

// Read out as the disabled action's description. It explains why the action
// is unavailable without contradicting the availability chip.
export const REGISTRATION_UNAVAILABLE_NOTE = "Online sign-up isn't available in ConnectSphere yet.";

const footerClasses =
  "flex flex-col gap-2 border-t border-outline-variant/60 bg-surface-container-lowest px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3";

// The footer from the frame. Someone who holds a place gets the actions on it
// (SPM-163 offers and Leave Waitlist, SPM-147 withdrawal) when the opener
// handles changes. Otherwise it offers the one sign-up action: Join Waitlist
// for a full event (SPM-163); Register Now and the notify action stay
// unavailable until SPM-134, with the note on the left. Those use
// aria-disabled rather than disabled so keyboard and screen-reader users can
// still reach them and hear why. The shared Button's disabled: style only
// matches the disabled attribute, so the same classes go through aria-disabled:.
export function EventDetailsFooter({
  event,
  onRegistrationChange,
}: {
  event: AttendeeEventView;
  onRegistrationChange?: (change: RegistrationChange) => void;
}) {
  const helperId = useId();
  if (event.myRegistration) {
    const place = { registration: event.myRegistration, startDatetime: event.startDatetime, attendeeStatus: event.attendeeStatus };
    if (!onRegistrationChange || !placeActions(place).length) return null;
    return (
      <footer className={footerClasses}>
        <RegistrationActions eventId={event.eventId} title={event.title} place={place} onChange={onRegistrationChange} className="w-full sm:items-end" />
      </footer>
    );
  }
  const action = event.detailsWithheld ? null : getRegistrationAction(event);
  if (!action) return null;
  if (event.registrationAvailability === "FULL_WAITLIST") {
    return (
      <footer className={footerClasses}>
        <JoinWaitlistAction eventId={event.eventId} title={event.title} />
      </footer>
    );
  }

  return (
    <footer className={footerClasses}>
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
