import { MyPlaceChip } from "@/components/attendee/event-details/event-details-parts";
import { Button } from "@/components/shared/primitives";
import type { AttendeeEventSummary } from "@/lib/api/discovery";
import type { AttendeeRegistration } from "@/lib/api/my-events";
import { DiscoveryIcon } from "./discovery-icon";
import { formatDateTile, formatEventDate, formatEventTime } from "./format-event-time";
import { getAvailabilityPresentation, getRegistrationState } from "./registration-availability";
import { RegistrationAvailabilityChip } from "./registration-availability-chip";
import { RegistrationStateControl } from "./registration-state-control";

// The backend does not expose the primary venue yet, so location is null; this
// says nothing about whether the venue itself is confirmed.
export const LOCATION_PENDING_LABEL = "Location details coming soon";

interface EventDiscoveryCardProps {
  event: AttendeeEventSummary;
  onViewDetails: (event: AttendeeEventSummary, trigger: HTMLButtonElement) => void;
  // The attendee's own place on this event, from their registrations (SPM-134).
  place?: AttendeeRegistration | null;
  // Whether the attendee's places have loaded; Register Now waits for them.
  placesKnown?: boolean;
  onRegister?: (event: AttendeeEventSummary, trigger: HTMLButtonElement) => void;
}

// List-row card from the "Event Discovery" Figma frame (282:346), limited to
// fields the backend returns: no photos, tracks, speakers or capacity numbers.
export function EventDiscoveryCard({ event, onViewDetails, place = null, placesKnown = false, onRegister }: EventDiscoveryCardProps) {
  const availability = getAvailabilityPresentation(event.registrationAvailability);
  const registrationState = onRegister ? getRegistrationState(event.registrationAvailability, place, placesKnown) : null;
  const tile = formatDateTile(event.startDatetime);
  const titleId = `discovery-event-${event.eventId}-title`;

  return (
    <article
      aria-labelledby={titleId}
      className={`flex flex-col gap-3 rounded-panel border-t-4 bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5 ${availability ? availability.border : "border-t-transparent"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {/* Availability is for deciding whether to sign up, so a held place replaces it. */}
          {place ? <MyPlaceChip registration={place} /> : <RegistrationAvailabilityChip value={event.registrationAvailability} />}
          <span className="inline-flex items-center gap-1 rounded-tag bg-surface-container-high px-2 py-0.5 text-[11px] font-bold leading-[14px] tracking-[0.04em] text-primary">
            <DiscoveryIcon name="venue" size={16} />
            <span className="sr-only">Location: </span>
            {event.location ?? LOCATION_PENDING_LABEL}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-bold leading-[14px] tracking-[0.04em] text-on-surface-variant">
          <DiscoveryIcon name="schedule" size={16} />
          <span className="sr-only">Time: </span>
          {formatEventTime(event.startDatetime, event.endDatetime)}
        </span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Gradient stand-in for an event photo; the backend returns no images. */}
        <div
          aria-hidden="true"
          className="flex aspect-[3/2] w-full shrink-0 items-center justify-center overflow-hidden rounded-control bg-gradient-to-br from-primary-fixed to-tertiary-fixed sm:aspect-auto sm:h-32 sm:w-44"
        >
          {tile ? (
            <span className="flex flex-col items-center leading-none text-primary">
              <span className="text-xs font-bold tracking-label">{tile.month}</span>
              <span className="mt-1 text-[32px] font-extrabold tracking-tight">{tile.day}</span>
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h3 id={titleId} className="line-clamp-2 text-xl font-bold leading-7 tracking-[-0.025em] text-on-surface [overflow-wrap:anywhere]">
              {event.title}
            </h3>
            <p className="line-clamp-2 max-w-[70ch] text-sm leading-5 text-on-surface-variant">
              {event.description?.trim() || "No description provided."}
            </p>
          </div>
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs leading-4">
            <li className="flex items-center gap-1 font-medium text-on-surface">
              <DiscoveryIcon name="calendar" className="text-on-surface-variant" />
              <span className="sr-only">Date: </span>
              {formatEventDate(event.startDatetime, event.endDatetime)}
            </li>
            {event.organisationName ? (
              <li className="flex items-center gap-1 text-on-surface-variant">
                <DiscoveryIcon name="organisation" />
                <span className="sr-only">Organised by: </span>
                {event.organisationName}
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-outline-variant/40 pt-3 sm:flex-row sm:justify-end">
        <Button
          variant="secondary"
          className="w-full max-lg:min-h-11 sm:w-auto"
          aria-label={`View event details for ${event.title}`}
          onClick={(clickEvent) => onViewDetails(event, clickEvent.currentTarget)}
        >
          View Event Details
        </Button>
        {registrationState && onRegister ? (
          <RegistrationStateControl
            state={registrationState}
            eventTitle={event.title}
            onRegister={(trigger) => onRegister(event, trigger)}
          />
        ) : null}
      </div>
    </article>
  );
}
