import { useId } from "react";
import { JoinWaitlistAction } from "@/components/attendee/registration-actions/join-waitlist-action";
import { Button } from "@/components/shared/primitives";
import type { AttendeeEventDetail } from "@/lib/api/discovery";
import { DiscoveryDetailsPanel, type DiscoveryDetailRow } from "./discovery-details-panel";
import { LOCATION_PENDING_LABEL } from "./event-discovery-card";
import { formatEventDate, formatEventTime, formatTimestamp } from "./format-event-time";
import { getRegistrationAction, isRegistrationEnabled } from "./registration-availability";

// Attendee event details shared by the details dialog on /events and the
// /events/[eventId] page. Both render only a GET /api/events/discovery/:id
// response, never list data.

// Read out as the disabled action's description. It explains why the action
// is unavailable without contradicting the availability chip.
export const REGISTRATION_UNAVAILABLE_NOTE = "Online sign-up isn't available in ConnectSphere yet.";

// Shows the one registration action for this event. Join Waitlist works
// (SPM-163); Register Now and the notify action stay unavailable until
// SPM-134. Those use aria-disabled rather than disabled so keyboard and
// screen-reader users can still reach them and hear why; they have no click
// handler.
// The shared Button's disabled: style only matches the disabled attribute, so
// the same classes are applied through aria-disabled: instead.
export function RegistrationActionFooter({ event, className = "" }: { event: AttendeeEventDetail; className?: string }) {
  const helperId = useId();
  const action = getRegistrationAction(event);
  if (!action) return null;
  if (event.registrationAvailability === "FULL_WAITLIST") {
    return (
      <footer className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-4 ${className}`}>
        <JoinWaitlistAction eventId={event.eventId} title={event.title} />
      </footer>
    );
  }

  return (
    <footer className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-4 ${className}`}>
      <p id={helperId} className="text-xs text-on-surface-variant sm:order-first">
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

export function EventDetailsBody({ event }: { event: AttendeeEventDetail }) {
  const rows: DiscoveryDetailRow[] = [
    { label: "Date", icon: "calendar", value: formatEventDate(event.startDatetime, event.endDatetime) },
    { label: "Time", icon: "schedule", value: formatEventTime(event.startDatetime, event.endDatetime) },
    { label: "Location", icon: "venue", value: event.location ?? LOCATION_PENDING_LABEL },
  ];
  if (event.organisationName) {
    rows.push({ label: "Organised by", icon: "organisation", value: event.organisationName });
  }
  // Events without attendee registration carry no registration wording (SPM-34 AC4).
  if (isRegistrationEnabled(event.registrationAvailability)) {
    rows.push(
      { label: "Registration opens", icon: "registration", value: formatTimestamp(event.registrationOpenAt) ?? "Immediately" },
      { label: "Registration closes", icon: "registration", value: formatTimestamp(event.registrationCloseAt) ?? "No closing date" },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
        {event.description?.trim() || "No description provided."}
      </p>
      <DiscoveryDetailsPanel rows={rows} />
    </div>
  );
}
