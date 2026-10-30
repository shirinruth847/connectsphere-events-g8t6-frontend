"use client";

import { useId, useState } from "react";
import { FormLabel, fieldClasses } from "@/components/shared/primitives";
import type { EventVenueOption } from "@/lib/api/event-venues";

interface VenuePickerProps {
  label: string;
  venues: EventVenueOption[];
  value: EventVenueOption | null;
  // The venue in the other panel, which cannot be picked twice.
  excludeId?: number | null;
  onChoose: (venueId: number | null) => void;
}

// Type to search the venues by name; picking a suggestion shows that venue.
// Starts blank when no venue is chosen (developer request of 24 October 2026).
// The parent keys it by the chosen venue so the text follows outside changes.
export function VenuePicker({ label, venues, value, excludeId = null, onChoose }: VenuePickerProps) {
  const id = useId();
  const [text, setText] = useState(value?.name ?? "");
  const choices = venues.filter((venue) => venue.venueId !== excludeId);

  const change = (next: string) => {
    setText(next);
    if (!next.trim()) return onChoose(null);
    const match = choices.find((venue) => venue.name.toLowerCase() === next.trim().toLowerCase());
    if (match) onChoose(match.venueId);
  };

  return (
    <div className="min-w-0 flex-1">
      <FormLabel htmlFor={id}>{label}</FormLabel>
      <input
        id={id}
        type="search"
        list={`${id}-venues`}
        className={`${fieldClasses} min-w-0`}
        placeholder="Search venues by name"
        autoComplete="off"
        value={text}
        onChange={(event) => change(event.target.value)}
      />
      <datalist id={`${id}-venues`}>
        {choices.map((venue) => <option key={venue.venueId} value={venue.name} />)}
      </datalist>
    </div>
  );
}
