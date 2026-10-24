"use client";

import type { ReactNode } from "react";
import { Button, FormLabel, ReferenceIdTag, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import type { EventVenueOption } from "@/lib/api/event-venues";
import { AvailabilityChip, RequirementRow } from "./venue-requirement-chips";
import { VenuePhotoCarousel } from "./venue-photo-carousel";

// A detail the venue does not record shows "-"; "Not checked" stays, because
// then the detail service could not be read (Master 5.4.5, M4).
const NONE = "-";
const listText = (value: string[] | null | undefined, venue: EventVenueOption) => {
  if (value == null) return venue.detailStatus === "NOT_CHECKED" ? "Not checked" : NONE;
  return value.length ? value.join(", ") : NONE;
};
const text = (value: string | null | undefined, venue: EventVenueOption) =>
  value || (venue.detailStatus === "NOT_CHECKED" ? "Not checked" : NONE);
const minutes = (value: number | null | undefined, venue: EventVenueOption) =>
  value == null ? (venue.detailStatus === "NOT_CHECKED" ? "Not checked" : NONE) : `${value} min`;

interface VenueOptionPanelProps {
  label: string;
  venue: EventVenueOption | null;
  venues: EventVenueOption[];
  onChoose: (venueId: number | null) => void;
  onClose?: () => void;
  badge?: ReactNode;
  // The caller's action for this venue (Select, Add as preference…).
  action?: ReactNode;
}

// One venue's details, read-only (SPM-72 AC4). Two of these sit
// side by side when venues are compared (SPM-72 AC7).
export function VenueOptionPanel({ label, venue, venues, onChoose, onClose, badge, action }: VenueOptionPanelProps) {
  const selectId = `venue-panel-${label.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <section aria-label={label} className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 rounded-panel border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <FormLabel htmlFor={selectId}>{label}</FormLabel>
          <select id={selectId} className={`${fieldClasses} min-w-0`} value={venue?.venueId ?? ""} onChange={(event) => onChoose(event.target.value ? Number(event.target.value) : null)}>
            <option value="">Choose a venue</option>
            {venues.map((item) => <option key={item.venueId} value={item.venueId}>{item.name}</option>)}
          </select>
        </div>
        {onClose ? <Button type="button" variant="quiet" aria-label={`Close ${label.toLowerCase()}`} onClick={onClose}><Icon name="close" size={16} /></Button> : null}
      </div>

      {!venue ? (
        <p className="rounded-control bg-surface-container-low p-4 text-sm text-on-surface-variant">Choose a venue from the list or the menu above to see its details.</p>
      ) : (
        <>
          <VenuePhotoCarousel key={venue.venueId} venueId={venue.venueId} venueName={venue.name} />

          <div className="grid gap-2">
            {badge ? <div className="flex flex-wrap gap-1.5">{badge}</div> : null}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-on-surface [overflow-wrap:anywhere]">{venue.name}</h3>
                <p className="text-sm text-on-surface-variant">{venue.address}</p>
              </div>
              <div className="shrink-0"><ReferenceIdTag value={`VENUE-${venue.venueId}`} /></div>
            </div>
            <div><AvailabilityChip availability={venue.availability} /></div>
            {venue.availability.conflicts.length ? (
              <ul className="grid gap-1 text-sm text-on-surface" aria-label="Conflicts">
                {venue.availability.conflicts.map((conflict, index) => (
                  <li key={`${conflict.type}-${index}`} className="rounded-control bg-[#FEF2F2] px-3 py-2">
                    {conflict.label}{conflict.reasonLabel ? ` · ${conflict.reasonLabel}` : ""}: {formatEventWindow(conflict.occupiedStart, conflict.occupiedEnd)}
                    {conflict.holdExpiresAt ? ` · hold expires ${formatTimestamp(conflict.holdExpiresAt)}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            {venue.availability.operatingHoursWarning ? (
              <p className="rounded-control bg-[#FEF3C7] px-3 py-2 text-sm text-[#92400E]">{venue.availability.operatingHoursWarning.message}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-label text-on-surface-variant">Event requirements</h4>
            <ul className="grid gap-1.5">{venue.requirements.map((item) => <RequirementRow key={item.key} requirement={item} />)}</ul>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            {([
              ["Capacity", `${venue.maxCapacity.toLocaleString()} people`],
              ["Operating hours", venue.operatingHours || NONE],
              ["Setup time", minutes(venue.setupMinutes, venue)],
              ["Turnaround time", minutes(venue.turnaroundMinutes, venue)],
              ["Rooms", venue.rooms.length ? venue.rooms.map((room) => `${room.layoutType} (${room.capacity})`).join(", ") : NONE],
              ["Supported layouts", listText(venue.supportedLayouts, venue)],
              ["Facilities", listText(venue.facilities, venue)],
              ["Accessibility", listText(venue.accessibilityFeatures, venue)],
              ["Emergency access", text(venue.emergencyAccess, venue)],
              ["Known restrictions", listText(venue.knownRestrictions, venue)],
            ] as const).map(([term, value]) => (
              <div key={term} className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-label text-on-surface-variant">{term}</dt>
                <dd className="mt-1 text-sm text-on-surface [overflow-wrap:anywhere]">{value}</dd>
              </div>
            ))}
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-label text-on-surface-variant">Description</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-on-surface [overflow-wrap:anywhere]">{text(venue.description, venue)}</dd>
            </div>
          </dl>

          {action}
        </>
      )}
    </section>
  );
}
