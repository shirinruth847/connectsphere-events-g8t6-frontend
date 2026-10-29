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

const checkKey = (venueId: number | null, start: string, end: string) =>
  venueId != null && periodCheckInputs(start, end) ? `${venueId}|${start}|${end}` : null;

// Advisory availability of one venue section's period (SPM-74's "check a
// period", which excludes this event's own bookings and holds and adds the
// venue's setup and turnaround time). The server checks again under the venue
// lock when the request is sent, and its answer is final (SPM-179 AC15).
export function useBookingPeriodCheck(eventId: number, venueId: number | null, start: string, end: string): PeriodCheckState {
  const requestKey = checkKey(venueId, start, end);
  const [result, setResult] = useState<{ key: string; state: PeriodCheckState } | null>(null);

  useEffect(() => {
    const key = checkKey(venueId, start, end);
    const inputs = periodCheckInputs(start, end);
    if (!key || !inputs || venueId == null) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      getVenueAvailability({ eventId, date: inputs.date, days: inputs.days, venueIds: [venueId], check: inputs.check })
        .then((data) => {
          if (!alive) return;
          const check = data.venues.find((venue) => venue.venueId === venueId)?.check ?? null;
          setResult({ key, state: check ? { status: "ready", check } : { status: "unavailable" } });
        })
        .catch(() => {
          if (alive) setResult({ key, state: { status: "unavailable" } });
        });
    }, CHECK_DELAY_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [eventId, venueId, start, end]);

  if (!requestKey) return { status: "idle" };
  return result?.key === requestKey ? result.state : { status: "checking" };
}
