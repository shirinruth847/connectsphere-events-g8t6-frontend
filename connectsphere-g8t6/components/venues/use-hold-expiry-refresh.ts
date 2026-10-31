"use client";

import { useEffect, useState } from "react";
import type { VenueHoldRequest } from "@/lib/api/venue-holds";

// The current time, refreshed every minute, so a hold's countdown (SPM-188 AC8)
// keeps counting between refreshes; one timer per list.
export function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

// Refresh at the next active expiry and on return to the page. The local clock
// also removes expired actions immediately, even if that refresh fails.
export function useHoldExpiryRefresh(requests: VenueHoldRequest[], refresh: () => void) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => { setNow(Date.now()); refresh(); };
    window.addEventListener("focus", update);
    const deadlines = requests.flatMap(({ hold }) => {
      const expiry = hold?.status === "ACTIVE" && hold.expiresAt ? Date.parse(hold.expiresAt) : NaN;
      return Number.isFinite(expiry) && expiry > now ? [expiry] : [];
    });
    const timer = deadlines.length ? window.setTimeout(update, Math.min(2147483647, Math.max(0, Math.min(...deadlines) - Date.now()))) : null;
    return () => {
      window.removeEventListener("focus", update);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [requests, refresh, now]);
  return now;
}
