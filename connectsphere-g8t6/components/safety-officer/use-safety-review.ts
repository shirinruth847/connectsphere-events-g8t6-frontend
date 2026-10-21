"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { getEventSafetyReviews, getSafetyPanel, type SafetyPanel, type SafetyRound } from "@/lib/api/safety-reviews";
import { pickOfficerRound } from "@/lib/safety-review";

export type SafetyReviewState =
  | { status: "loading" }
  | { status: "ready"; panel: SafetyPanel; refreshing: boolean }
  | { status: "not-found" }
  | { status: "error"; message: string };

// The officer's round for an event: the event's rounds give the review ID (the
// newest round in the officer's scope), then the panel loads that round.
export function useSafetyReview(eventId: number, officerId: number) {
  const [state, setState] = useState<SafetyReviewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { reviews } = await getEventSafetyReviews<SafetyRound>(eventId);
      const round = pickOfficerRound(reviews, officerId);
      if (!round) return null;
      return getSafetyPanel(round.reviewId);
    })()
      .then((panel) => {
        if (alive) setState(panel ? { status: "ready", panel, refreshing: false } : { status: "not-found" });
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        if (caught instanceof ApiError && (caught.status === 404 || caught.status === 403)) setState({ status: "not-found" });
        else setState({ status: "error", message: caught instanceof ApiError ? caught.message : "The safety review could not be loaded." });
      });
    return () => {
      alive = false;
    };
  }, [eventId, officerId, attempt]);

  // Retry after a failure: shows the loading state again.
  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  // Re-read after an action, keeping the current review on screen meanwhile.
  const refresh = useCallback(() => {
    setState((current) => (current.status === "ready" ? { ...current, refreshing: true } : current));
    setAttempt((value) => value + 1);
  }, []);

  return { state, reload, refresh };
}
