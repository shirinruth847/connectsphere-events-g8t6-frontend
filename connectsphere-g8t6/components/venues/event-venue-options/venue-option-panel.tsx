"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import type { EventVenueOption } from "@/lib/api/event-venues";
import { VenueDetails, type VenueCalendarWindow } from "./venue-details";
import { VenuePicker } from "./venue-picker";

interface VenueOptionPanelProps {
  label: string;
  venue: EventVenueOption | null;
  venues: EventVenueOption[];
  onChoose: (venueId: number | null) => void;
  onClose?: () => void;
  // The venue in the other comparison panel, which cannot be picked here too.
  excludeId?: number | null;
  badge?: ReactNode;
  // The caller's action for this venue (Select, Add as preference…).
  action?: ReactNode;
  onOpenVenue?: (venueId: number) => void;
  onFindAlternatives?: () => void;
  // The coordinator's calendar for the event window; null for the Lead.
  calendar?: VenueCalendarWindow | null;
}

// One venue's details in the venue search (SPM-72 AC4), with a search box to
// switch venue. Two of these sit side by side when venues are compared
// (SPM-72 AC7).
export function VenueOptionPanel({ label, venue, venues, onChoose, onClose, excludeId, badge, action, onOpenVenue, onFindAlternatives, calendar }: VenueOptionPanelProps) {
  return (
    <section aria-label={label} className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3 rounded-panel border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex items-end gap-2">
        <VenuePicker key={venue?.venueId ?? "none"} label={label} venues={venues} value={venue} excludeId={excludeId} onChoose={onChoose} />
        {onClose ? <Button type="button" variant="quiet" aria-label={`Close ${label.toLowerCase()}`} onClick={onClose}><Icon name="close" size={16} /></Button> : null}
      </div>

      {!venue ? (
        <p className="rounded-control bg-surface-container-low p-4 text-sm text-on-surface-variant">Search for a venue above, or choose one from the list, to see its details.</p>
      ) : (
        <VenueDetails key={venue.venueId} venue={venue} badge={badge} action={action} onOpenVenue={onOpenVenue} onFindAlternatives={onFindAlternatives} calendar={calendar} />
      )}
    </section>
  );
}
