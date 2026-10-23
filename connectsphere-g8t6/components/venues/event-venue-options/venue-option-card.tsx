"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import type { EventVenueOption } from "@/lib/api/event-venues";
import { AvailabilityChip, RequirementChip } from "./venue-requirement-chips";
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
}

// Compact so two rows of three fit the list window (developer request of
// 23 October 2026); the details panel has everything else.
export function VenueOptionCard({ venue, viewing, comparing = false, compareOpen = false, badge, action, onView, onCompare }: VenueOptionCardProps) {
  return (
    <article
      aria-label={venue.name}
      className={`grid min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] overflow-hidden rounded-panel border bg-surface-container-lowest shadow-elevation-1 ${viewing || comparing ? "border-primary" : "border-outline-variant"}`}
    >
      <div className="relative min-w-0">
        <EventVenuePhoto venueId={venue.venueId} photoId={venue.coverPhotoId} alt="" className="aspect-[5/2] w-full" />
        {/* Badges sit on the photo so they cost no height. */}
        {badge || venue.allRequirementsMet ? (
          <div className="absolute inset-x-2 top-2 flex flex-wrap gap-1">
            {badge}
            {venue.allRequirementsMet ? <VenueBadge tone="success"><Icon name="check" size={16} />Meets every requirement</VenueBadge> : null}
          </div>
        ) : null}
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2 p-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-on-surface" title={venue.name}>{venue.name}</h3>
          <p className="truncate text-xs text-on-surface-variant" title={venue.address}>{venue.address}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-on-surface">
          <AvailabilityChip availability={venue.availability} />
          <span>Capacity {venue.maxCapacity.toLocaleString()}</span>
          {venue.setupMinutes != null && venue.turnaroundMinutes != null ? (
            <span>Setup {venue.setupMinutes} · Turnaround {venue.turnaroundMinutes} min</span>
          ) : null}
        </div>
        <ul className="flex flex-wrap gap-1" aria-label="Requirements">
          {venue.requirements.map((item) => <RequirementChip key={item.key} requirement={item} />)}
        </ul>
        <div className="mt-auto flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={onView} aria-pressed={viewing}>View details</Button>
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
