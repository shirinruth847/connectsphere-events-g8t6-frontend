"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { getEventView, type EventView } from "@/lib/api/event-workspace";
import { withEquipmentNames } from "@/lib/technical-requests";
import { useRefreshOnReturn } from "./use-refresh-on-return";

export type EventViewState =
  | { status: "loading" }
  | { status: "ready"; event: EventView; refreshError?: string }
  // 404 outside the viewer's scope; 403 is treated the same until SPM-38 settles which one the backend returns.
  | { status: "not-found" }
  | { status: "error"; message: string };

export function useEventView(eventId: number) {
  const [state, setState] = useState<EventViewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);

  // Only the newest read may update the state; a committed mutation also
  // invalidates reads already in flight (see replaceEvent).
  const read = useCallback((isMounted: () => boolean) => {
    const requestGeneration = ++generation.current;
    const isCurrent = () => isMounted() && requestGeneration === generation.current;
    return getEventView(eventId)
      .then(({ event }) => {
        if (isCurrent()) setState({ status: "ready", event });
      })
      .catch((caught: unknown) => {
        if (!isCurrent()) return;
        if (caught instanceof ApiError && (caught.status === 404 || caught.status === 403)) {
          setState({ status: "not-found" });
        } else {
          const message = caught instanceof Error ? caught.message : "Could not load this event.";
          setState(current => current.status === "ready" && current.event.eventId === eventId
            ? { ...current, refreshError: message }
            : { status: "error", message });
        }
      });
  }, [eventId]);

  useEffect(() => {
    let alive = true;
    void read(() => alive);
    return () => {
      alive = false;
    };
  }, [read, attempt]);

  useRefreshOnReturn(() => read(() => true));

  // Retry after a failure: shows the loading state again.
  const reload = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  // Re-read in the background (e.g. after a save was refused because permissions changed).
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  const shown = useRef<EventView | null>(null);
  useEffect(() => { shown.current = state.status === "ready" ? state.event : null; }, [state]);

  // Use the event a save returned instead of fetching it again. Save responses
  // leave equipment names null: keep the names already shown, and re-read the
  // event when a line is still unnamed (newly chosen equipment).
  const replaceEvent = useCallback((event: EventView) => {
    // A read started before this committed mutation must not restore old state.
    generation.current += 1;
    const equipmentRequirements = withEquipmentNames(event.equipmentRequirements ?? [], shown.current?.equipmentRequirements ?? []);
    setState({ status: "ready", event: { ...event, equipmentRequirements } });
    if (equipmentRequirements.some((item) => !item.name)) setAttempt((value) => value + 1);
  }, []);

  return { state, reload, refresh, replaceEvent };
}
