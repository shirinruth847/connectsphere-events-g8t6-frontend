"use client";

import { useId, type ReactNode } from "react";
import { Button } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import type { EventVenueOption } from "@/lib/api/event-venues";
import { RequirementChip } from "./venue-requirement-chips";
import { EventVenuePhoto } from "./venue-photo-carousel";

interface VenueOptionCardProps {
  venue: EventVenueOption;
  viewing: boolean;
  comparing?: boolean;
  compareOpen?: boolean;
  // e.g. "Organiser's choice 2" or "Suggested", shown above the name.
  badge?: ReactNode;
  // The caller's button for this venue, e.g. the coordinator's Select.
  action?: ReactNode;
  onView: () => void;
  onCompare?: () => void;
  // "row" puts the photo on the left, a third of the card, once the parent
  // @container is wide enough (the organiser's choices); "column" stacks it.
  layout?: "column" | "row";
  // Row cards expand in place: while viewing, these details replace the
  // summary and View details becomes Hide details.
  details?: ReactNode;
}

// Compact so two rows of three fit the list window (developer request of
// 23 October 2026); the details panel has everything else. The checks carry
// the venue's capacity, so it is not repeated, and the availability shows in
// its check, not as a separate chip (developer request of 24 October 2026).
export function VenueOptionCard({ venue, viewing, comparing = false, compareOpen = false, badge, action, onView, onCompare, layout = "column", details }: VenueOptionCardProps) {
  const detailsId = useId();
  const row = layout === "row";
  const expandable = details !== undefined;
  const expanded = row && viewing && expandable;
  const hasCapacityCheck = venue.requirements.some((item) => item.key === "capacity");
  const badges = badge || venue.allRequirementsMet ? (
    <>
      {badge}
      {venue.allRequirementsMet ? <VenueBadge tone="success"><Icon name="check" size={16} />Meets every requirement</VenueBadge> : null}
    </>
  ) : null;
  const viewButton = (
    <Button
      type="button"
      variant="secondary"
      onClick={onView}
      aria-pressed={expandable ? undefined : viewing}
      aria-expanded={expandable ? expanded : undefined}
      aria-controls={expanded ? detailsId : undefined}
    >
      {expanded ? <><Icon name="close" size={16} />Hide details</> : "View details"}
    </Button>
  );

  if (expanded) {
    return (
      <article aria-label={venue.name} className="grid min-w-0 gap-3 rounded-panel border border-primary bg-surface-container-lowest p-4 shadow-elevation-1">
        <div id={detailsId} className="min-w-0">{details}</div>
        <div className="flex flex-wrap gap-2">{viewButton}{action}</div>
      </article>
    );
  }

  return (
    <article
      aria-label={venue.name}
      className={`grid min-w-0 overflow-hidden rounded-panel border bg-surface-container-lowest shadow-elevation-1 ${row ? "grid-cols-[minmax(0,1fr)] @md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" : "grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr]"} ${viewing || comparing ? "border-primary" : "border-outline-variant"}`}
    >
      <div className="relative min-w-0">
        <EventVenuePhoto venueId={venue.venueId} photoId={venue.coverPhotoId} alt="" className={row ? "aspect-[5/2] w-full @md:aspect-auto @md:h-full @md:min-h-32" : "aspect-[5/2] w-full"} />
        {/* Stacked, the badges sit on the photo so they cost no height. */}
        {badges && !row ? <div className="absolute inset-x-2 top-2 flex flex-wrap gap-1">{badges}</div> : null}
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2 p-3">
        {badges && row ? <div className="flex flex-wrap gap-1">{badges}</div> : null}
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-on-surface" title={venue.name}>{venue.name}</h3>
          <p className="truncate text-xs text-on-surface-variant" title={venue.address}>{venue.address}</p>
        </div>
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
        <div className="mt-auto flex flex-wrap gap-2">
          {viewButton}
          {compareOpen && onCompare ? <Button type="button" variant="secondary" onClick={onCompare} aria-pressed={comparing}>Compare</Button> : null}
          {action}
        </div>
      </div>
    </article>
  );
}

// A badge for a card or panel: the organiser's rank, the coordinator's
// suggestion or "Meets every requirement".
export function VenueBadge({ tone = "neutral", children }: { tone?: "neutral" | "success"; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-[11px] font-semibold uppercase tracking-label shadow-elevation-1 ${tone === "success" ? "bg-[#DCFCE7] text-[#166534]" : "bg-primary-fixed text-primary"}`}>
      {children}
    </span>
  );
}
