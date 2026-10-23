"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { toApiError } from "@/components/attendee/discovery/use-discovery-events";
import type { ApiError } from "@/lib/api";
import { getDiscoveryEvent } from "@/lib/api/discovery";
import { getMyRegisteredEvent, toEventView, type AttendeeEventView } from "@/lib/api/my-events";
import type { EventDetailsSource } from "./event-details-links";

type DetailState =
  | { status: "loading" }
  | { status: "ready"; event: AttendeeEventView }
  | { status: "not-found" }
  | { status: "error"; error: ApiError };

interface DetailCallbacks {
  onLoaded?: (event: AttendeeEventView) => void;
  onNotFound?: (eventId: number) => void;
}

const loadEvent = async (eventId: number, source: EventDetailsSource, signal: AbortSignal): Promise<AttendeeEventView> => {
  if (source !== "discovery") {
    try {
      return toEventView(await getMyRegisteredEvent(eventId, signal));
    } catch (caught) {
      // A direct visit by someone with no place falls back to Event Discovery.
      if (source === "my-events" || toApiError(caught).status !== 404) throw caught;
    }
  }
  return (await getDiscoveryEvent(eventId, signal)).event;
};

// The event details dialog's and page's data (SPM-155), fetched every time the
// event is opened so it is the latest. Mount it with a `key` per event.
export function useAttendeeEvent(eventId: number, source: EventDetailsSource, { onLoaded, onNotFound }: DetailCallbacks = {}) {
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const handleLoaded = useEffectEvent((event: AttendeeEventView) => onLoaded?.(event));
  const handleNotFound = useEffectEvent((id: number) => onNotFound?.(id));

  useEffect(() => {
    const controller = new AbortController();
    loadEvent(eventId, source, controller.signal)
      .then((event) => {
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
  }, [eventId, source, attempt]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  };

  return { state, retry };
}
