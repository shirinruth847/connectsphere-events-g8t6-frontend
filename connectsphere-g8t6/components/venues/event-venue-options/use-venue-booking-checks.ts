"use client";

import { useEffect, useState } from "react";
import { checkEventVenueBookings, type VenueBookingCheckResult, type VenueBookingRequestItem } from "@/lib/api/event-venues";

// Changes settle this long before the form is checked, so each keystroke is not a request.
const CHECK_DELAY_MS = 500;

export type VenueBookingChecksState = {
  // One result per section, by index; empty until the first answer.
  results: VenueBookingCheckResult[];
  checking: boolean;
  // The checks could not be loaded; the request still checks again when sent.
  failed: boolean;
};

// Each section's checks for its own venue and window (SPM-186 AC17), from the
// same rules the request applies. The whole form is checked in one call about
// half a second after it changes; an answer for an older form is dropped.
// `items` is null while no section has a venue and both times yet.
export function useVenueBookingChecks(eventId: number, items: VenueBookingRequestItem[] | null): VenueBookingChecksState {
  const body = items ? JSON.stringify(items) : null;
  const [answer, setAnswer] = useState<{ body: string; results: VenueBookingCheckResult[]; failed: boolean } | null>(null);

  useEffect(() => {
    if (!body) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      checkEventVenueBookings(eventId, JSON.parse(body) as VenueBookingRequestItem[])
        .then((result) => { if (alive) setAnswer({ body, results: result.bookings, failed: false }); })
        .catch(() => { if (alive) setAnswer({ body, results: [], failed: true }); });
    }, CHECK_DELAY_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [eventId, body]);

  if (!body) return { results: [], checking: false, failed: false };
  // While a newer form is being checked, the last answer stays on screen.
  return { results: answer?.results ?? [], checking: answer?.body !== body, failed: answer?.body === body && answer.failed };
}
