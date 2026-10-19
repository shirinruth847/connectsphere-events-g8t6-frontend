"use client";

import { useCallback, useEffect, useState } from "react";
import { getEventHistory, type EventHistoryEntry } from "@/lib/api/event-workspace";

const PAGE_SIZE = 20;

type HistoryState =
  | { status: "loading" }
  | { status: "ready"; entries: EventHistoryEntry[]; nextCursor: string | null }
  | { status: "error"; message: string };

const messageOf = (caught: unknown) => (caught instanceof Error ? caught.message : "Could not load the change history.");

// First page of an event's history; `refreshKey` changes after a save so the new entry appears.
export function useEventHistory(eventId: number, refreshKey: number) {
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");

  useEffect(() => {
    let alive = true;
    getEventHistory(eventId, { limit: PAGE_SIZE })
      .then((page) => {
        if (alive) setState({ status: "ready", entries: page.history, nextCursor: page.nextCursor });
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

  const loadMore = useCallback(async () => {
    if (state.status !== "ready" || !state.nextCursor) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const page = await getEventHistory(eventId, { cursor: state.nextCursor, limit: PAGE_SIZE });
      setState({ status: "ready", entries: [...state.entries, ...page.history], nextCursor: page.nextCursor });
    } catch (caught) {
      setMoreError(messageOf(caught));
    } finally {
      setLoadingMore(false);
    }
  }, [eventId, state]);

  return { state, retry, loadMore, loadingMore, moreError };
}
