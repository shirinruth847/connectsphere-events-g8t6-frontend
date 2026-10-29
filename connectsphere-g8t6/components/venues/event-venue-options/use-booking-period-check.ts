"use client";

import { useEffect, useState } from "react";
import { getVenueAvailability, type PeriodCheck } from "@/lib/api/venues";
import { periodCheckInputs } from "./venue-booking-form-model";

export type PeriodCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ready"; check: PeriodCheck }
  | { status: "unavailable" };

// Typing a time waits this long before asking, so each keystroke is not a request.
const CHECK_DELAY_MS = 400;

// Advisory availability of one venue section's period (SPM-74's "check a
// period", which excludes this event's own bookings and holds and adds the
// venue's setup and turnaround time). The server checks again under the venue
// lock when the request is sent, and its answer is final (SPM-179 AC15).
export function useBookingPeriodCheck(eventId: number, venueId: number | null, start: string, end: string): PeriodCheckState {
  const inputs = venueId == null ? null : periodCheckInputs(start, end);
  const requestKey = inputs && venueId != null ? `${venueId}|${start}|${end}` : null;
  const [result, setResult] = useState<{ key: string; state: PeriodCheckState } | null>(null);

  useEffect(() => {
    if (!requestKey || !inputs || venueId == null) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      getVenueAvailability({ eventId, date: inputs.date, days: inputs.days, venueIds: [venueId], check: inputs.check })
        .then((data) => {
          if (!alive) return;
          const check = data.venues.find((venue) => venue.venueId === venueId)?.check ?? null;
          setResult({ key: requestKey, state: check ? { status: "ready", check } : { status: "unavailable" } });
        })
        .catch(() => {
          if (alive) setResult({ key: requestKey, state: { status: "unavailable" } });
        });
    }, CHECK_DELAY_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // inputs is derived from requestKey's parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, requestKey]);

  if (!requestKey) return { status: "idle" };
  return result?.key === requestKey ? result.state : { status: "checking" };
}
