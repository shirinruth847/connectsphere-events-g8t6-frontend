import { Button } from "@/components/shared/primitives";
import type { AttendeeEventSummary } from "@/lib/api/discovery";
import { DiscoveryIcon } from "./discovery-icon";
import { formatDateTile, formatEventDate, formatEventTime } from "./format-event-time";
import { getAvailabilityPresentation } from "./registration-availability";
import { RegistrationAvailabilityChip } from "./registration-availability-chip";

export const VENUE_PENDING_LABEL = "Venue to be confirmed";

interface EventDiscoveryCardProps {
  event: AttendeeEventSummary;
  onViewDetails: (event: AttendeeEventSummary, trigger: HTMLButtonElement) => void;
}

// List-row card from the "Event Discovery" Figma frame (282:346), limited to
// fields the backend returns: no photos, tracks, speakers or capacity numbers.
export function EventDiscoveryCard({ event, onViewDetails }: EventDiscoveryCardProps) {
  const availability = getAvailabilityPresentation(event.registrationAvailability);
  const tile = formatDateTile(event.startDatetime);
  const titleId = `discovery-event-${event.eventId}-title`;

  return (
    <article
      aria-labelledby={titleId}
      className={`flex flex-col gap-3 rounded-panel border-t-4 bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5 ${availability ? availability.border : "border-t-transparent"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <RegistrationAvailabilityChip value={event.registrationAvailability} />
          <span className="inline-flex items-center gap-1 rounded-tag bg-surface-container-high px-2 py-0.5 text-[11px] font-bold leading-[14px] tracking-[0.04em] text-primary">
            <DiscoveryIcon name="venue" size={16} />
            <span className="sr-only">Location: </span>
            {event.location ?? VENUE_PENDING_LABEL}
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
          className="relative flex aspect-[3/2] w-full shrink-0 items-center justify-center overflow-hidden rounded-control bg-gradient-to-br from-primary-fixed to-tertiary-fixed sm:aspect-auto sm:h-32 sm:w-44"
        >
          {tile ? (
            <span className="flex flex-col items-center leading-none text-primary">
              <span className="text-xs font-bold tracking-label">{tile.month}</span>
              <span className="mt-1 text-[32px] font-extrabold tracking-tight">{tile.day}</span>
            </span>
          ) : null}
          <span className="absolute bottom-2 left-2 max-w-[calc(100%-16px)] truncate rounded-tag bg-on-surface/80 px-1.5 py-0.5 text-[11px] font-bold tracking-[0.04em] text-surface backdrop-blur-[2px]">
            {event.location ?? "Venue TBC"}
          </span>
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

      <div className="flex justify-end border-t border-outline-variant/40 pt-3">
        <Button
          variant="secondary"
          className="w-full max-lg:min-h-11 sm:w-auto"
          aria-label={`View event details for ${event.title}`}
          onClick={(clickEvent) => onViewDetails(event, clickEvent.currentTarget)}
        >
          View Event Details
        </Button>
      </div>
    </article>
  );
}
