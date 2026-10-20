"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { getEventView, type EventView } from "@/lib/api/event-workspace";

export type EventViewState =
  | { status: "loading" }
  | { status: "ready"; event: EventView }
  // 404 outside the viewer's scope; 403 is treated the same until SPM-38 settles which one the backend returns.
  | { status: "not-found" }
  | { status: "error"; message: string };

export function useEventView(eventId: number) {
  const [state, setState] = useState<EventViewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    getEventView(eventId)
      .then(({ event }) => {
        if (alive) setState({ status: "ready", event });
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        if (caught instanceof ApiError && (caught.status === 404 || caught.status === 403)) {
          setState({ status: "not-found" });
        } else {
          setState({ status: "error", message: caught instanceof Error ? caught.message : "Could not load this event." });
        }
      });
    return () => {
      alive = false;
    };
  }, [eventId, attempt]);

  // Retry after a failure: shows the loading state again.
  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  // Re-read in the background (e.g. after a save was refused because permissions changed).
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  // Use the event a save returned instead of fetching it again.
  const replaceEvent = useCallback((event: EventView) => setState({ status: "ready", event }), []);

  return { state, reload, refresh, replaceEvent };
}
