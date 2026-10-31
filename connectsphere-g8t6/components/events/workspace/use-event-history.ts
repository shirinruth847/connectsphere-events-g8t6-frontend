"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getEventHistory, markHistoryViewed, type EventHistoryEntry } from "@/lib/api/event-workspace";
import { mergeNewestPage, type HistoryBaseline } from "@/lib/event-history";
import { useRefreshOnReturn } from "./use-refresh-on-return";

const PAGE_SIZE = 20;

type HistoryState =
  | { status: "loading" }
  | { status: "ready"; entries: EventHistoryEntry[]; nextCursor: string | null }
  | { status: "error"; message: string };

export type HistoryPage = { history: EventHistoryEntry[]; nextCursor: string | null; lastViewedAt?: string | null };
export type HistoryLoader = (options: { limit: number; cursor?: string }) => Promise<HistoryPage>;

const messageOf = (caught: unknown) => (caught instanceof Error ? caught.message : "Could not load the change history.");

// First page of a history from `load`, which must be stable between renders;
// `refreshKey` changes after a save so the new entry appears. The baseline for
// "new since your last visit" comes from the first load and is kept for the
// whole visit; `onLoaded` runs after each first-page load. With
// `refreshOnReturn`, returning to the tab adds newer entries without running
// `onLoaded`, so they still count as unseen on the next visit.
export function useHistory(
  load: HistoryLoader,
  refreshKey: number,
  onLoaded?: () => void,
  { refreshOnReturn = false }: { refreshOnReturn?: boolean } = {},
) {
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const [baseline, setBaseline] = useState<HistoryBaseline | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const generation = useRef(0);

  useRefreshOnReturn(async () => {
    if (state.status === "error") {
      setState({ status: "loading" });
      setAttempt((value) => value + 1);
      return;
    }
    if (state.status !== "ready") return;
    const requestGeneration = generation.current;
    // A failed background read keeps the loaded history on screen.
    const page = await load({ limit: PAGE_SIZE });
    if (requestGeneration !== generation.current) return;
    setState((current) => (current.status === "ready" ? mergeNewestPage(current, page) : current));
  }, refreshOnReturn);

  useEffect(() => {
    let alive = true;
    generation.current += 1;
    load({ limit: PAGE_SIZE })
      .then((page) => {
        if (!alive) return;
        setState({ status: "ready", entries: page.history, nextCursor: page.nextCursor });
        setBaseline((current) =>
          current ?? { lastViewedAt: page.lastViewedAt ?? null, newestSeenId: page.history[0]?.historyId ?? null },
        );
        onLoaded?.();
      })
      .catch((caught: unknown) => {
        if (alive) setState({ status: "error", message: messageOf(caught) });
      });
    return () => {
      alive = false;
    };
    // onLoaded is a side effect of the load, not an input to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshKey, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  const loadMore = useCallback(async () => {
    if (state.status !== "ready" || !state.nextCursor) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const page = await load({ cursor: state.nextCursor, limit: PAGE_SIZE });
      setState((current) => current.status === "ready"
        ? { ...current, entries: [...current.entries, ...page.history], nextCursor: page.nextCursor }
        : current);
    } catch (caught) {
      setMoreError(messageOf(caught));
    } finally {
      setLoadingMore(false);
    }
  }, [load, state]);

  return { state, baseline, retry, loadMore, loadingMore, moreError };
}

// An event's history; every load records the view on the server (best effort:
// a failure only means the next visit shows more as new).
export function useEventHistory(eventId: number, refreshKey: number) {
  const load = useCallback<HistoryLoader>((options) => getEventHistory(eventId, options), [eventId]);
  const markViewed = useCallback(() => {
    markHistoryViewed(eventId).catch(() => {});
  }, [eventId]);
  return useHistory(load, refreshKey, markViewed, { refreshOnReturn: true });
}
