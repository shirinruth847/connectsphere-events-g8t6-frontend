"use client";

import { useCallback, useEffect, useState } from "react";
import { getEventHistory, markHistoryViewed, type EventHistoryEntry } from "@/lib/api/event-workspace";
import type { HistoryBaseline } from "@/lib/event-history";

const PAGE_SIZE = 20;

type HistoryState =
  | { status: "loading" }
  | { status: "ready"; entries: EventHistoryEntry[]; nextCursor: string | null }
  | { status: "error"; message: string };

const messageOf = (caught: unknown) => (caught instanceof Error ? caught.message : "Could not load the change history.");

// First page of an event's history; `refreshKey` changes after a save so the new
// entry appears. The baseline for "new since your last visit" comes from the
// first load and is kept for the whole visit; every load then records the view
// on the server (best effort: a failure only means the next visit shows more as new).
export function useEventHistory(eventId: number, refreshKey: number) {
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const [baseline, setBaseline] = useState<HistoryBaseline | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");

  useEffect(() => {
    let alive = true;
    getEventHistory(eventId, { limit: PAGE_SIZE })
      .then((page) => {
        if (!alive) return;
        setState({ status: "ready", entries: page.history, nextCursor: page.nextCursor });
        setBaseline((current) =>
          current ?? { lastViewedAt: page.lastViewedAt ?? null, newestSeenId: page.history[0]?.historyId ?? null },
        );
        markHistoryViewed(eventId).catch(() => {});
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

  return { state, baseline, retry, loadMore, loadingMore, moreError };
}
