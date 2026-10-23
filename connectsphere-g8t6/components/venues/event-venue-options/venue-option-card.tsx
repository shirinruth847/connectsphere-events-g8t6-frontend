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
  // e.g. "Preference 2" or "Suggested", shown above the name.
  badge?: ReactNode;
  // The caller's button for this venue: Select (coordinator) or Add (organiser).
  action?: ReactNode;
  onView: () => void;
  onCompare?: () => void;
}

export function VenueOptionCard({ venue, viewing, comparing = false, compareOpen = false, badge, action, onView, onCompare }: VenueOptionCardProps) {
  return (
    <article
      aria-label={venue.name}
      className={`grid min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] overflow-hidden rounded-panel border bg-surface-container-lowest shadow-elevation-1 ${viewing || comparing ? "border-primary" : "border-outline-variant"}`}
    >
      <EventVenuePhoto venueId={venue.venueId} photoId={venue.coverPhotoId} alt="" className="aspect-[16/9] w-full" />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3 p-4">
        {badge ? <div className="flex flex-wrap gap-1.5">{badge}</div> : null}
        <div className="grid min-w-0 gap-1">
          <h3 className="font-semibold text-on-surface [overflow-wrap:anywhere]">{venue.name}</h3>
          <p className="text-sm text-on-surface-variant [overflow-wrap:anywhere]">{venue.address}</p>
          <div><AvailabilityChip availability={venue.availability} /></div>
        </div>
        <p className="text-sm text-on-surface">
          Capacity {venue.maxCapacity.toLocaleString()}
          {venue.setupMinutes != null && venue.turnaroundMinutes != null ? ` · ${venue.setupMinutes} min setup · ${venue.turnaroundMinutes} min turnaround` : ""}
        </p>
        {venue.allRequirementsMet ? (
          <p className="inline-flex items-center gap-1 text-xs font-semibold text-[#166534]"><Icon name="check" size={16} />Meets every requirement</p>
        ) : null}
        <ul className="flex flex-wrap gap-1.5" aria-label="Requirements">
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

// A badge for a card or panel: the organiser's rank, or the coordinator's suggestion.
export function VenueBadge({ tone = "neutral", children }: { tone?: "neutral" | "success"; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-[11px] font-semibold uppercase tracking-label ${tone === "success" ? "bg-[#DCFCE7] text-[#166534]" : "bg-primary-fixed text-primary"}`}>
      {children}
    </span>
  );
}
