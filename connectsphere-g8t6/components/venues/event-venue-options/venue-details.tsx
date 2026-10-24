"use client";

import type { ReactNode } from "react";
import { ReferenceIdTag } from "@/components/shared/primitives";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import type { EventVenueOption, VenueRequirement } from "@/lib/api/event-venues";
import { RequirementRow } from "./venue-requirement-chips";
import { VenuePhotoCarousel } from "./venue-photo-carousel";

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

interface VenueDetailsProps {
  venue: EventVenueOption;
  // e.g. "Organiser's choice 1", "Suggested".
  badge?: ReactNode;
  // The caller's action for this venue (Select this venue…).
  action?: ReactNode;
  // Opens a related venue; without it, related venues are listed as text.
  onOpenVenue?: (venueId: number) => void;
}

// One venue's details, read-only (SPM-72 AC4). Once there is room, the photos
// and the venue's name sit in the left third and the checks and details in
// the right two thirds, so a venue fits one screen (developer request of
// 24 October 2026). Description, emergency access and known restrictions are
// left out here; the safety review still reads them (Master 5.9).
export function VenueDetails({ venue, badge, action, onOpenVenue }: VenueDetailsProps) {
  const has = (key: string) => venue.requirements.some((item) => item.key === key || item.key.startsWith(`${key}-`));
  const related = venue.relatedVenues;
  const rows: [string, ReactNode][] = [
    ...(has("capacity") ? [] : [["Capacity", `${venue.maxCapacity.toLocaleString()} people`] as [string, ReactNode]]),
    ["Operating hours", venue.operatingHours || NONE],
    ["Setup time", minutes(venue.setupMinutes, venue)],
    ["Turnaround time", minutes(venue.turnaroundMinutes, venue)],
    ...(has("layout") ? [] : [["Supported layouts", listText(venue.supportedLayouts, venue)] as [string, ReactNode]]),
    ["Facilities", listText(venue.facilities, venue)],
    ...(has("accessibility") ? [] : [["Accessibility", listText(venue.accessibilityFeatures, venue)] as [string, ReactNode]]),
  ];

  return (
    <div className="@container grid min-w-0">
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="grid min-w-0 content-start gap-3">
          <VenuePhotoCarousel key={venue.venueId} venueId={venue.venueId} venueName={venue.name} />
          <div className="grid min-w-0 gap-1.5">
            {badge ? <div className="flex flex-wrap gap-1.5">{badge}</div> : null}
            <h3 className="text-lg font-semibold leading-tight text-on-surface [overflow-wrap:anywhere]">{venue.name}</h3>
            <p className="text-sm text-on-surface-variant">{venue.address}</p>
            <div><ReferenceIdTag value={`VENUE-${venue.venueId}`} /></div>
          </div>
        </div>

        <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3">
          <div className="grid gap-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-label text-on-surface-variant">Event requirements</h4>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5 @lg:grid-cols-2">
              {venue.requirements.map((item) => <RequirementRow key={item.key} requirement={item} venueValue={venueValue(item, venue)} />)}
            </ul>
            {venue.availability.conflicts.length ? (
              <ul className="grid gap-1 text-sm text-on-surface" aria-label="Conflicts">
                {venue.availability.conflicts.map((conflict, index) => (
                  <li key={`${conflict.type}-${index}`} className="rounded-control bg-[#FEF2F2] px-3 py-1.5">
                    {conflict.label}{conflict.reasonLabel ? ` · ${conflict.reasonLabel}` : ""}: {formatEventWindow(conflict.occupiedStart, conflict.occupiedEnd)}
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
              <dt className="text-xs font-semibold uppercase tracking-label text-on-surface-variant">Related venues</dt>
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

          {action}
        </div>
      </div>
    </div>
  );
}
