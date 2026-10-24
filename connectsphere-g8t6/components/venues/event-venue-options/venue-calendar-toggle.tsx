"use client";

import { useState } from "react";
import { Button } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { VenueAvailabilityCalendar } from "@/components/venues/venue-availability";
import type { AvailabilityParams } from "@/components/venues/venue-queries";

export interface VenueCalendarWindow {
  date: Date;
  check: AvailabilityParams["check"];
  // Names the event's period on the calendar, e.g. its request ID.
  label?: string;
}

// The coordinator's availability calendar for the venues being viewed, opened
// on the event window (SPM-74). It sits under the details panel, both for the
// organiser's choices and in the venue search.
export function VenueCalendarToggle({ calendar, venueIds }: { calendar: VenueCalendarWindow; venueIds: number[] }) {
  const [open, setOpen] = useState(false);
  if (!venueIds.length) return null;
  return (
    <div className="grid min-w-0 gap-3">
      <div>
        <Button type="button" variant="secondary" aria-pressed={open} onClick={() => setOpen((value) => !value)}>
          <Icon name="calendar" size={16} />{open ? "Hide availability calendar" : "Show availability calendar"}
        </Button>
      </div>
      {open ? (
        <div className="min-w-0 overflow-x-auto">
          <VenueAvailabilityCalendar key={venueIds.join(",")} fixed={{ venueIds, date: calendar.date, check: calendar.check, label: calendar.label }} />
        </div>
      ) : null}
    </div>
  );
}
