import type { AttendeeEvent } from "@/lib/api/types";
import { formatDate, formatTimeRange } from "@/lib/format";
import { getStatusPresentation } from "@/lib/status";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import { Icon } from "@/components/shared/Icon";
import { MediaThumbnail } from "@/components/shared/MediaThumbnail";
import { StatusChip } from "@/components/shared/StatusChip";
import { Tag } from "@/components/shared/Tag";
import { RegistrationButton, RegistrationCapacity, RegistrationNote } from "./RegistrationParts";

interface DiscoveryEventCardProps {
  event: AttendeeEvent;
  onOpenDetails: (eventId: string) => void;
  preloadImage?: boolean;
}

export function DiscoveryEventCard({ event, onOpenDetails, preloadImage }: DiscoveryEventCardProps) {
  const { registration, venue } = event;
  const { tone } = getStatusPresentation("registrationAvailability", registration.availability);
  const titleId = `event-${event.event_id}-title`;
  const openDetails = () => onOpenDetails(event.event_id);

  return (
    <Card as="article" tone={tone} className="flex flex-col gap-2" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <StatusChip domain="registrationAvailability" status={registration.availability} />
          {venue ? <Tag tone="primary">{venue.name}</Tag> : null}
        </div>
        <p className="flex items-center gap-1 text-label font-bold text-on-surface-variant">
          <Icon name="schedule" />
          {formatTimeRange(event.start_datetime, event.end_datetime)}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <MediaThumbnail
          src={event.image_url}
          label={venue?.name ?? event.title}
          sizes="(min-width: 640px) 176px, 100vw"
          preload={preloadImage}
          className="aspect-3/2 w-full sm:aspect-auto sm:h-32 sm:w-44 sm:shrink-0"
        />
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="line-clamp-2 text-title font-bold text-on-surface">
              {event.title}
            </h2>
            <p className="line-clamp-2 max-w-[70ch] text-body text-on-surface-variant">
              {event.description}
            </p>
          </div>
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-body-sm text-on-surface-variant">
            <li className="flex items-center gap-1 font-medium text-on-surface">
              <Icon name="calendar-today" className="text-primary" />
              <time dateTime={event.start_datetime}>{formatDate(event.start_datetime)}</time>
            </li>
            {venue ? (
              <li className="flex items-center gap-1">
                <Icon name="location-on" />
                {venue.address}
              </li>
            ) : null}
            {registration.registration_capacity !== null ? (
              <li className="flex items-center gap-1">
                <Icon name="groups" />
                {registration.registration_capacity} seats
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <RegistrationCapacity registration={registration} />

      <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <RegistrationNote registration={registration} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" size="sm" onClick={openDetails}>
            View Event Details<span className="sr-only"> for {event.title}</span>
          </Button>
          <RegistrationButton
            registration={registration}
            eventTitle={event.title}
            onClick={openDetails}
          />
        </div>
      </div>
    </Card>
  );
}
