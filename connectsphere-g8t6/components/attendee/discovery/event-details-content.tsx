import type { AttendeeEventDetail } from "@/lib/api/discovery";
import { DiscoveryDetailsPanel, type DiscoveryDetailRow } from "./discovery-details-panel";
import { LOCATION_PENDING_LABEL } from "./event-discovery-card";
import { formatEventDate, formatEventTime, formatTimestamp } from "./format-event-time";
import { isRegistrationEnabled } from "./registration-availability";

// The body of the /events/[eventId] page, from a GET /api/events/discovery/:id
// response, never list data. Its registration action is the shared
// RegistrationActionBar (SPM-134).

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
