"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { VenueAvailabilityCalendar } from "@/components/venues/venue-availability";
import type { AvailabilityParams } from "@/components/venues/venue-queries";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import type { EventVenueOption, VenueRequirement } from "@/lib/api/event-venues";
import { RequirementRow } from "./venue-requirement-chips";
import { VenuePhotoCarousel } from "./venue-photo-carousel";

// The event window the coordinator's availability calendar opens on (SPM-74).
export interface VenueCalendarWindow {
  eventId: number;
  date: Date;
  check: AvailabilityParams["check"];
  // Names the event's period on the calendar, e.g. its request ID.
  label?: string;
}

// A detail the venue does not record shows "-"; "Not checked" stays, because
// then the detail service could not be read (Master 5.4.5, M4).
const NONE = "-";
const notRecorded = (venue: EventVenueOption) => (venue.detailStatus === "NOT_CHECKED" ? "Not checked" : NONE);
const listText = (value: string[] | null | undefined, venue: EventVenueOption) => {
  if (value == null) return notRecorded(venue);
  return value.length ? value.join(", ") : NONE;
};
const minutes = (value: number | null | undefined, venue: EventVenueOption) =>
  value == null ? notRecorded(venue) : `${value} min`;

// What the venue has for a requirement, shown in its row (developer request of
// 24 October 2026: no separate rows repeating the checks).
const venueValue = (requirement: VenueRequirement, venue: EventVenueOption) => {
  if (requirement.key === "layout") return listText(venue.supportedLayouts, venue);
  if (requirement.key.startsWith("accessibility")) return listText(venue.accessibilityFeatures, venue);
  if (requirement.key.startsWith("facility")) return listText(venue.facilities, venue);
  return undefined;
};

const text = (value: string | null | undefined, venue: EventVenueOption) => value?.trim() || notRecorded(venue);

// The checks and details of one venue, read-only (SPM-72 AC4). Coordinators
// leave out description, emergency access and known restrictions; the safety
// review still reads them (Master 5.9). The organiser's venue step shows them
// (SPM-76 AC4), and names linked rooms as such: a room booked on its own is
// its own venue, linked to its hall (T31).
export function VenueFacts({ venue, onOpenVenue, onFindAlternatives, organiser = false }: {
  venue: EventVenueOption;
  onOpenVenue?: (venueId: number) => void;
  // Opens the venue search for venues large enough for the event (SPM-198 AC4).
  onFindAlternatives?: () => void;
  organiser?: boolean;
}) {
  const has = (key: string) => venue.requirements.some((item) => item.key === key || item.key.startsWith(`${key}-`));
  const tooSmall = venue.requirements.some((item) => item.assessment?.level === "INSUFFICIENT");
  const related = venue.relatedVenues;
  const rows: [string, ReactNode][] = [
    ...(has("capacity") ? [] : [["Capacity", `${venue.maxCapacity.toLocaleString()} people`] as [string, ReactNode]]),
    ["Operating hours", venue.operatingHours || NONE],
    ["Setup time", minutes(venue.setupMinutes, venue)],
    ["Turnaround time", minutes(venue.turnaroundMinutes, venue)],
    ...(has("layout") ? [] : [["Supported layouts", listText(venue.supportedLayouts, venue)] as [string, ReactNode]]),
    ["Facilities", listText(venue.facilities, venue)],
    ...(has("accessibility") ? [] : [["Accessibility", listText(venue.accessibilityFeatures, venue)] as [string, ReactNode]]),
    ...(organiser
      ? [
          ["Emergency access", text(venue.emergencyAccess, venue)],
          ["Known restrictions", listText(venue.knownRestrictions, venue)],
          ["Description", text(venue.description, venue)],
        ] as [string, ReactNode][]
      : []),
  ];

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3">
      <div className="grid gap-1.5">
        <h4 className="text-xs font-semibold uppercase tracking-label text-on-surface-variant">Event requirements</h4>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5 @lg:grid-cols-2">
          {venue.requirements.map((item) => <RequirementRow key={item.key} requirement={item} venueValue={venueValue(item, venue)} />)}
        </ul>
        {tooSmall && onFindAlternatives ? (
          <div>
            <Button type="button" variant="secondary" aria-haspopup="dialog" onClick={onFindAlternatives}>
              <Icon name="venue" size={16} />Find Alternative Venues
            </Button>
          </div>
        ) : null}
        {/* The event's own occupied time at this venue (SPM-185 AC1); without
            recorded setup/turnaround it would be just the event window. */}
        {venue.availability.occupiedStart && venue.availability.occupiedEnd && venue.setupMinutes != null && venue.turnaroundMinutes != null ? (
          <p className="text-sm text-on-surface-variant">
            Occupied {formatEventWindow(venue.availability.occupiedStart, venue.availability.occupiedEnd)} with setup and turnaround
          </p>
        ) : null}
        {venue.availability.conflicts.length ? (
          <ul className="grid gap-1 text-sm text-on-surface" aria-label="Conflicts">
            {venue.availability.conflicts.map((conflict, index) => (
              <li key={`${conflict.type}-${index}`} className="rounded-control bg-[#FEF2F2] px-3 py-1.5">
                {conflict.message
                  || [
                    `${conflict.label}${conflict.reasonLabel ? ` · ${conflict.reasonLabel}` : ""}`,
                    conflict.occupiedStart && conflict.occupiedEnd ? formatEventWindow(conflict.occupiedStart, conflict.occupiedEnd) : null,
                  ].filter(Boolean).join(": ")}
                {conflict.holdExpiresAt ? ` · hold expires ${formatTimestamp(conflict.holdExpiresAt)}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        {venue.availability.operatingHoursWarning ? (
          <p className="rounded-control bg-[#FEF3C7] px-3 py-1.5 text-sm text-[#92400E]">{venue.availability.operatingHoursWarning.message}</p>
        ) : null}
      </div>

      <dl className="grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-2 @sm:grid-cols-2 @2xl:grid-cols-3">
        {rows.map(([term, value]) => (
          <div key={term} className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-label text-on-surface-variant">{term}</dt>
            <dd className="mt-0.5 text-sm text-on-surface [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
        <div className="col-span-full min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-label text-on-surface-variant">{organiser ? "Rooms and related venues" : "Related venues"}</dt>
          <dd className="mt-0.5 text-sm text-on-surface">
            {related == null ? notRecorded(venue) : related.length ? (
              <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Related venues">
                {related.map((item) => (
                  <li key={item.venueId}>
                    {onOpenVenue ? (
                      <button type="button" className="min-h-8 text-left font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" onClick={() => onOpenVenue(item.venueId)}>
                        {item.name}
                      </button>
                    ) : item.name}
                  </li>
                ))}
              </ul>
            ) : NONE}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// The venue's name and address, set above its photos.
export function VenueTitle({ venue }: { venue: EventVenueOption }) {
  return (
    <div className="min-w-0">
      <h3 className="text-lg font-semibold leading-tight text-on-surface [overflow-wrap:anywhere]">{venue.name}</h3>
      <p className="text-sm text-on-surface-variant">{venue.address}</p>
    </div>
  );
}

// The coordinator's calendar button and, while open, the calendar for one
// venue on the event window (SPM-74). The button sits at the foot of the photo
// column; the calendar takes the card's full width.
export function useVenueCalendar(calendar: VenueCalendarWindow | null | undefined, venueId: number) {
  // Open for one venue only, so changing the venue (e.g. in a booking section) closes it.
  const [openFor, setOpenFor] = useState<number | null>(null);
  const open = openFor === venueId;
  if (!calendar) return { button: null, panel: null };
  return {
    button: (
      <Button type="button" variant="secondary" aria-pressed={open} onClick={() => setOpenFor(open ? null : venueId)}>
        <Icon name="calendar" size={16} />{open ? "Hide availability calendar" : "Show availability calendar"}
      </Button>
    ),
    panel: open ? (
      <div className="col-span-full min-w-0 overflow-x-auto">
        <VenueAvailabilityCalendar key={venueId} fixed={{ eventId: calendar.eventId, venueIds: [venueId], date: calendar.date, check: calendar.check, label: calendar.label }} />
      </div>
    ) : null,
  };
}

interface VenueDetailsProps {
  venue: EventVenueOption;
  // e.g. "Organiser's choice 1", "Suggested"; shown under the photos.
  badge?: ReactNode;
  // The caller's action for this venue (Select this venue…).
  action?: ReactNode;
  onOpenVenue?: (venueId: number) => void;
  onFindAlternatives?: () => void;
  calendar?: VenueCalendarWindow | null;
  // The organiser's venue step: adds the details coordinators leave out (SPM-76 AC4).
  organiser?: boolean;
}

// One venue's details in the search popup and the related-venue popup: name
// and photos left with the status and calendar button under them, checks and
// details right (developer requests of 24 and 25 October 2026).
export function VenueDetails({ venue, badge, action, onOpenVenue, onFindAlternatives, calendar, organiser }: VenueDetailsProps) {
  const { button, panel } = useVenueCalendar(calendar, venue.venueId);
  return (
    <div className="@container grid min-w-0">
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="grid min-w-0 content-start gap-3">
          <VenueTitle venue={venue} />
          <VenuePhotoCarousel key={venue.venueId} venueId={venue.venueId} venueName={venue.name} />
          {badge ? <div className="flex flex-wrap gap-1.5">{badge}</div> : null}
          {button ? <div>{button}</div> : null}
        </div>
        <div className="grid min-w-0 content-start gap-3">
          <VenueFacts venue={venue} onOpenVenue={onOpenVenue} onFindAlternatives={onFindAlternatives} organiser={organiser} />
          {action}
        </div>
        {panel}
      </div>
    </div>
  );
}
