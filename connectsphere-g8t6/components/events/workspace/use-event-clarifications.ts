"use client";

import { useCallback, useEffect, useState } from "react";
import { getEventClarifications, type ClarificationRound } from "@/lib/api/event-workspace";

export type ClarificationsState =
  | { status: "loading" }
  | { status: "ready"; rounds: ClarificationRound[] }
  | { status: "error"; message: string };

const messageOf = (caught: unknown) => (caught instanceof Error ? caught.message : "Could not load the clarification requests.");

// Every clarification round for one event (SPM-41); `refreshKey` changes after a
// request or resubmission so the new round appears.
export function useEventClarifications(eventId: number, refreshKey: number) {
  const [state, setState] = useState<ClarificationsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    getEventClarifications(eventId)
      .then(({ clarifications }) => {
        if (!alive) return;
        // A malformed response shows the panel's error state instead of breaking the page.
        setState(
          Array.isArray(clarifications)
            ? { status: "ready", rounds: clarifications }
            : { status: "error", message: "Could not load the clarification requests." },
        );
      })
      .catch((caught: unknown) => {
        if (alive) setState({ status: "error", message: messageOf(caught) });
      });
    return () => {
      alive = false;
    };
  }, [eventId, refreshKey, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  return { state, retry };
}

export const openRound = (state: ClarificationsState) =>
  state.status === "ready" ? state.rounds.find((round) => round.status === "OPEN") ?? null : null;
