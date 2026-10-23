"use client";

import { Button } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import type { EventVenueOption } from "@/lib/api/event-venues";
import { AvailabilityChip, RequirementChip } from "./venue-requirement-chips";
import { EventVenuePhoto } from "./venue-photo-carousel";
import { suggestionBlocker } from "./venue-option-model";

interface VenueOptionCardProps {
  eventId: number;
  venue: EventVenueOption;
  viewing: boolean;
  comparing: boolean;
  compareOpen: boolean;
  suggested: boolean;
  canSuggest: boolean;
  onView: () => void;
  onCompare: () => void;
  onSuggest: () => void;
}

export function VenueOptionCard({ eventId, venue, viewing, comparing, compareOpen, suggested, canSuggest, onView, onCompare, onSuggest }: VenueOptionCardProps) {
  const blocker = suggestionBlocker(venue);
  return (
    <article
      aria-label={venue.name}
      className={`grid min-w-0 grid-cols-[minmax(0,1fr)] content-start overflow-hidden rounded-panel border bg-surface-container-lowest shadow-elevation-1 ${viewing || comparing ? "border-primary" : "border-outline-variant"}`}
    >
      <EventVenuePhoto eventId={eventId} venueId={venue.venueId} photoId={venue.coverPhotoId} alt="" className="aspect-[16/9] w-full" />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-on-surface [overflow-wrap:anywhere]">{venue.name}</h3>
            <p className="text-sm text-on-surface-variant [overflow-wrap:anywhere]">{venue.address}</p>
          </div>
          <AvailabilityChip availability={venue.availability} />
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
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onView} aria-pressed={viewing}>View details</Button>
          {compareOpen ? <Button variant="secondary" onClick={onCompare} aria-pressed={comparing}>Compare</Button> : null}
          {suggested ? (
            <span className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[#166534]"><Icon name="check" size={16} />Suggested</span>
          ) : canSuggest ? (
            <Button onClick={onSuggest} disabled={Boolean(blocker)} title={blocker ?? undefined}>Select</Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
