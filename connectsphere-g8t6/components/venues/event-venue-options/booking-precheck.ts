import { getVenueAvailability, type PeriodCheck } from "@/lib/api/venues";
import { formatEventWindow } from "@/lib/datetime";
import { periodCheckInputs, type BookingDraft } from "./venue-booking-form-model";

// A venue section whose period clashes with the venue's other arrangements.
export interface BookingConflict {
  index: number;
  venueName: string;
  messages: string[];
}

const ENTRY_NAMES: Record<string, string> = { BOOKING: "Another booking", HOLD: "A tentative hold", BLOCK: "An operational block" };

// The backend's explanation (SPM-185 AC2), or the conflicting occupied window.
export const conflictLine = (conflict: PeriodCheck["conflicts"][number]) =>
  conflict.message
  || `${ENTRY_NAMES[conflict.type] ?? "Another arrangement"} occupies this venue ${formatEventWindow(conflict.occupiedStart, conflict.occupiedEnd)}, including setup and turnaround.`;

// SPM-185: before a booking request is sent, each section's period is checked
// again with SPM-74's "check a period" (setup and turnaround included, this
// event's own arrangements excluded). A section whose check cannot be read is
// let through: the server checks again under the venue lock and its answer is
// final (SPM-179 AC15).
export async function findBookingConflicts(
  eventId: number,
  drafts: BookingDraft[],
  venueName: (venueId: number) => string,
): Promise<BookingConflict[]> {
  const results = await Promise.all(drafts.map(async (draft, index): Promise<BookingConflict | null> => {
    const inputs = periodCheckInputs(draft.start, draft.end);
    if (draft.venueId == null || !inputs) return null;
    try {
      const data = await getVenueAvailability({ eventId, date: inputs.date, days: inputs.days, venueIds: [draft.venueId], check: inputs.check });
      const check = data.venues.find((venue) => venue.venueId === draft.venueId)?.check;
      if (!check?.conflicts.length) return null;
      return { index, venueName: venueName(draft.venueId), messages: check.conflicts.map(conflictLine) };
    } catch {
      return null;
    }
  }));
  return results.filter((result): result is BookingConflict => result !== null);
}
