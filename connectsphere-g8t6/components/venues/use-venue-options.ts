"use client";

import { useCallback, useEffect, useState } from "react";
import { listVenueOptions, type VenueOption } from "@/lib/api/venues";

// Every non-deleted venue for filters and pickers (SPM-181). Re-read whenever
// the page regains focus, so a venue added, renamed or deleted elsewhere shows
// up (or disappears) without a reload. `enabled` is false for roles that may
// not read the list (it is Venue Staff only).
export function useVenueOptions(enabled = true) {
  const [venues, setVenues] = useState<VenueOption[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    listVenueOptions()
      .then((result) => {
        setVenues(result.venues);
        setError("");
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Venues could not be loaded."));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, enabled]);

  return { venues, error, reload: load };
}
