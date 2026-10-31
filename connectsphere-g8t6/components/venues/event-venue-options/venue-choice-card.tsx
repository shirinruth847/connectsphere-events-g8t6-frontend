"use client";

import { useId, type ReactNode } from "react";
import { Icon } from "@/components/shared/icon";
import type { EventVenueOption } from "@/lib/api/event-venues";
import { RequirementChip } from "./venue-requirement-chips";
import { VenueFacts, VenueTitle, useVenueCalendar, type VenueCalendarWindow } from "./venue-details";
import { VenueBadge } from "./venue-option-card";
import { EventVenuePhoto, VenuePhotoCarousel } from "./venue-photo-carousel";

// Opens and closes its content with a height transition (none under
// prefers-reduced-motion); closed content is inert.
function Reveal({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  return (
    <div
      id={id}
      inert={!open}
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
    >
      <div className="min-h-0 min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}

interface VenueChoiceCardProps {
  venue: EventVenueOption;
  expanded: boolean;
  onToggle: () => void;
  // e.g. "Organiser's choice 1", "Suggested"; shown under the photo.
  badge?: ReactNode;
  // The caller's button, e.g. the coordinator's Select.
  action?: ReactNode;
  onOpenVenue?: (venueId: number) => void;
  onFindAlternatives?: () => void;
  calendar?: VenueCalendarWindow | null;
  // When the organiser wants this venue (SPM-76), under the badges.
  requested?: ReactNode;
}

// One of the organiser's choices, or the coordinator's suggestion (SPM-72),
// as a horizontal card: name, photo and status left; the checks right. View
// details opens the full details in place, with motion, and closes them again
// (developer requests of 24 and 25 October 2026).
export function VenueChoiceCard({ venue, expanded, onToggle, badge, action, onOpenVenue, onFindAlternatives, calendar, requested }: VenueChoiceCardProps) {
  const detailsId = useId();
  const { button: calendarButton, panel: calendarPanel } = useVenueCalendar(expanded ? calendar : null, venue.venueId);
  const hasCapacityCheck = venue.requirements.some((item) => item.key === "capacity");

  return (
    <article
      aria-label={venue.name}
      className={`@container grid min-w-0 rounded-panel border bg-surface-container-lowest p-4 shadow-elevation-1 transition-colors duration-150 ${expanded ? "border-primary" : "border-outline-variant"}`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="grid min-w-0 content-start gap-3">
          <VenueTitle venue={venue} />
          {expanded ? (
            <VenuePhotoCarousel key={venue.venueId} venueId={venue.venueId} venueName={venue.name} />
          ) : (
            <EventVenuePhoto venueId={venue.venueId} photoId={venue.coverPhotoId} alt="" className="aspect-video w-full rounded-control" />
          )}
          {badge || venue.allRequirementsMet ? (
            <div className="flex flex-wrap gap-1.5">
              {badge}
              {venue.allRequirementsMet ? <VenueBadge tone="success"><Icon name="check" size={16} />Meets every requirement</VenueBadge> : null}
            </div>
          ) : null}
          {requested}
          {calendarButton ? <div>{calendarButton}</div> : null}
        </div>

        <div className="grid min-w-0 content-start gap-3">
          <Reveal open={!expanded}>
            <div className="grid gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-surface">
                {hasCapacityCheck ? null : <span>Capacity {venue.maxCapacity.toLocaleString()}</span>}
                {venue.setupMinutes != null && venue.turnaroundMinutes != null ? (
                  <span>Setup {venue.setupMinutes} · Turnaround {venue.turnaroundMinutes} min</span>
                ) : null}
              </div>
              <ul className="flex flex-wrap gap-1" aria-label="Requirements">
                {venue.requirements.map((item) => (
                  <RequirementChip key={item.key} requirement={item} text={item.key === "capacity" ? `Capacity ${venue.maxCapacity.toLocaleString()}` : undefined} />
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal open={expanded} id={detailsId}>
            <VenueFacts venue={venue} onOpenVenue={onOpenVenue} onFindAlternatives={onFindAlternatives} />
          </Reveal>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-control bg-surface-container-low px-3 text-sm font-semibold text-primary transition-colors duration-150 hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-expanded={expanded}
              aria-controls={detailsId}
              onClick={onToggle}
            >
              {expanded ? "Hide details" : "View details"}
              <span aria-hidden="true" className={`inline-block transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}>▾</span>
            </button>
            {action}
          </div>
        </div>
        {calendarPanel}
      </div>
    </article>
  );
}
