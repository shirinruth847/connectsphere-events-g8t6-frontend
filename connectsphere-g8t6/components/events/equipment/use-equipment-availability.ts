"use client";

import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/components/venues/use-debounced-value";
import { getEquipmentAvailability } from "@/lib/api/technical-requests";
import { availabilityWindow, type EquipmentAvailability } from "@/lib/technical-requests";

export type AvailabilityState =
  | { status: "loading"; data: EquipmentAvailability | null }
  | { status: "ready"; data: EquipmentAvailability }
  | { status: "error"; message: string; data: EquipmentAvailability | null };

// The catalogue with the quantity free for the event's time (SPM-286 AC1), or
// usable stock while the dates are incomplete (AC2). Dates being typed settle
// before a request is sent; the last answer stays on screen while the next loads.
export function useEquipmentAvailability(start: string | null | undefined, end: string | null | undefined, enabled = true) {
  const window = availabilityWindow(start, end);
  const key = useDebouncedValue(window ? `${window.start}|${window.end}` : "", 400);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AvailabilityState>({ status: "loading", data: null });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const [from, to] = key ? key.split("|") : [null, null];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((current) => ({ status: "loading", data: current.data }));
    getEquipmentAvailability(from, to, controller.signal)
      .then((data) => setState({ status: "ready", data }))
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setState((current) => ({
          status: "error",
          message: caught instanceof Error ? caught.message : "Equipment availability could not be loaded.",
          data: current.data,
        }));
      });
    return () => controller.abort();
  }, [key, attempt, enabled]);

  return { state, retry: () => setAttempt((value) => value + 1) };
}
