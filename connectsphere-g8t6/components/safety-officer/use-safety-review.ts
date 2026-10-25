"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { getSafetyPanel, type SafetyPanel } from "@/lib/api/safety-reviews";

export type SafetyReviewState =
  | { status: "loading" }
  | { status: "ready"; panel: SafetyPanel; refreshing: boolean }
  | { status: "not-found" }
  | { status: "error"; message: string };

// The officer's round for an event: the backend names it on the event view
// (safetyReviewId, null when none is in their scope), and the panel loads it.
// A round that leaves their scope answers 404 and shows "not available".
export function useSafetyReview(reviewId: number | null) {
  const [state, setState] = useState<SafetyReviewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    (reviewId === null ? Promise.resolve(null) : getSafetyPanel(reviewId))
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
  }, [reviewId, attempt]);

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
