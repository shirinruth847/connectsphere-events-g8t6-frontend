"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const threadAttempt = useRef(0);

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

  // Reopening a request must fetch replies posted since the event page loaded.
  const refreshThread = useCallback(async (round: ClarificationRound) => {
    const attempt = ++threadAttempt.current;
    const { clarifications } = await getEventClarifications(eventId);
    const latest = Array.isArray(clarifications)
      ? clarifications.find((entry) => entry.clarificationId === round.clarificationId)
      : null;
    if (!latest) throw new Error("This clarification request is no longer available. Refresh the event to see its current status.");
    if (threadAttempt.current === attempt) replaceRound(latest);
  }, [eventId, replaceRound]);

  // Acknowledge only a rendered snapshot. The database returns false when a
  // newer reply arrived meanwhile; failed acknowledgements keep their unread state.
  const markRead = useCallback((round: ClarificationRound) => {
    if (typeof round.unreadCount !== "number") return;
    const lastMessageId = Math.max(0, ...round.messages.map((message) => message.messageId));
    // The next GET supplies authoritative unread counts, including raced replies.
    markClarificationRead(eventId, round.round, lastMessageId).catch(() => {});
  }, [eventId]);

  return { state, retry, replaceRound, refreshThread, markRead };
}

export const openRound = (state: ClarificationsState) =>
  state.status === "ready" ? state.rounds.find((round) => round.status === "OPEN") ?? null : null;
