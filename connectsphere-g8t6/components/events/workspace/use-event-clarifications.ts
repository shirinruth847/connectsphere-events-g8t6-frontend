"use client";

import { useCallback, useEffect, useState } from "react";
import { getEventClarifications, markClarificationRead, type ClarificationRound } from "@/lib/api/event-workspace";

export type ClarificationsState =
  | { status: "loading" }
  | { status: "ready"; rounds: ClarificationRound[] }
  | { status: "error"; message: string };

const messageOf = (caught: unknown) => (caught instanceof Error ? caught.message : "Could not load the clarification requests.");

// Every clarification thread for one event (SPM-41); `refreshKey` changes after
// a request, amendment or completion so the latest threads appear.
export function useEventClarifications(eventId: number, refreshKey: number) {
  const [state, setState] = useState<ClarificationsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    getEventClarifications(eventId)
      .then(({ clarifications }) => {
        if (!alive) return;
        // A malformed response shows the panel's error state instead of breaking the page.
        if (!Array.isArray(clarifications)) {
          setState({ status: "error", message: "Could not load the clarification requests." });
          return;
        }
        setState({ status: "ready", rounds: clarifications });
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

  // Shows a thread the backend just returned (e.g. with a new message) without a reload.
  const replaceRound = useCallback((updated: ClarificationRound) => {
    setState((current) =>
      current.status === "ready"
        ? { status: "ready", rounds: current.rounds.map((round) => (round.clarificationId === updated.clarificationId ? updated : round)) }
        : current,
    );
  }, []);

  // Opening a thread marks it read for the owner and the assigned coordinator
  // (whose unreadCount is a number), so their next message notification is not
  // held back. Best effort: a failure only delays that.
  const markRead = useCallback((round: ClarificationRound) => {
    if (typeof round.unreadCount !== "number") return;
    markClarificationRead(eventId, round.round).catch(() => {});
    if (round.unreadCount) replaceRound({ ...round, unreadCount: 0 });
  }, [eventId, replaceRound]);

  return { state, retry, replaceRound, markRead };
}

export const openRound = (state: ClarificationsState) =>
  state.status === "ready" ? state.rounds.find((round) => round.status === "OPEN") ?? null : null;
