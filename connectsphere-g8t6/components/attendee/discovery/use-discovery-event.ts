"use client";

import { useEffect, useEffectEvent, useState } from "react";
import type { ApiError } from "@/lib/api";
import { getDiscoveryEvent, type AttendeeEventDetail } from "@/lib/api/discovery";
import { toApiError } from "./use-discovery-events";

type DetailState =
  | { status: "loading" }
  | { status: "ready"; event: AttendeeEventDetail }
  | { status: "not-found" }
  | { status: "error"; error: ApiError };

interface DetailCallbacks {
  onLoaded?: (event: AttendeeEventDetail) => void;
  onNotFound?: (eventId: number) => void;
}

// Fetches one event's attendee view every time it is opened, so the details
// shown are the latest published ones (SPM-34 AC6). Mount it with a `key` per
// event: a new event starts in the loading state.
export function useDiscoveryEvent(eventId: number, { onLoaded, onNotFound }: DetailCallbacks = {}) {
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const handleLoaded = useEffectEvent((event: AttendeeEventDetail) => onLoaded?.(event));
  const handleNotFound = useEffectEvent((id: number) => onNotFound?.(id));

  useEffect(() => {
    const controller = new AbortController();
    getDiscoveryEvent(eventId, controller.signal)
      .then(({ event }) => {
        if (controller.signal.aborted) return;
        setState({ status: "ready", event });
        handleLoaded(event);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        const error = toApiError(caught);
        if (error.status === 404) {
          setState({ status: "not-found" });
          handleNotFound(eventId);
        } else {
          setState({ status: "error", error });
        }
      });
    return () => controller.abort();
  }, [eventId, attempt]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  };

  return { state, retry };
}
