"use client";

import { useCallback, useEffect, useEffectEvent, useReducer, useRef } from "react";
import { ApiError } from "@/lib/api";
import { listDiscoveryEvents, type AttendeeEventDetail } from "@/lib/api/discovery";
import { discoveryReducer, initialDiscoveryState } from "./discovery-state";

export const DISCOVERY_PAGE_SIZE = 10;

export const toApiError = (error: unknown) =>
  error instanceof ApiError
    ? error
    : new ApiError(error instanceof Error ? error.message : "The request could not be completed.", 0);

// Attendee discovery list with cursor paging. Data stays in this hook (no
// global store); it refetches the first page when the tab becomes visible
// again, unless the attendee has already loaded more pages.
export function useDiscoveryEvents() {
  const [state, dispatch] = useReducer(discoveryReducer, initialDiscoveryState);
  const listRequest = useRef<AbortController | null>(null);
  const moreRequest = useRef<AbortController | null>(null);

  const fetchFirstPage = useCallback(async ({ background }: { background: boolean }) => {
    listRequest.current?.abort();
    moreRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    try {
      const page = await listDiscoveryEvents({ limit: DISCOVERY_PAGE_SIZE, signal: controller.signal });
      if (!controller.signal.aborted) dispatch({ type: "loaded", events: page.events, nextCursor: page.nextCursor });
    } catch (error) {
      if (!controller.signal.aborted) dispatch({ type: "failed", error: toApiError(error), background });
    }
  }, []);

  useEffect(() => {
    void fetchFirstPage({ background: false });
    return () => {
      listRequest.current?.abort();
      moreRequest.current?.abort();
    };
  }, [fetchFirstPage]);

  const onVisible = useEffectEvent(() => {
    if (document.visibilityState !== "visible") return;
    if (state.pagesLoaded > 1 || state.loadingMore || state.status === "loading") return;
    void fetchFirstPage({ background: true });
  });

  useEffect(() => {
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const retry = () => {
    dispatch({ type: "reload" });
    void fetchFirstPage({ background: false });
  };

  const loadMore = async () => {
    if (!state.nextCursor || state.loadingMore) return;
    const controller = new AbortController();
    moreRequest.current = controller;
    dispatch({ type: "moreStarted" });
    try {
      const page = await listDiscoveryEvents({
        limit: DISCOVERY_PAGE_SIZE,
        cursor: state.nextCursor,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) dispatch({ type: "moreLoaded", events: page.events, nextCursor: page.nextCursor });
    } catch (error) {
      if (!controller.signal.aborted) dispatch({ type: "moreFailed", error: toApiError(error) });
    }
  };

  return {
    ...state,
    retry,
    loadMore,
    patchEvent: (event: AttendeeEventDetail) => dispatch({ type: "patched", event }),
    removeEvent: (eventId: number) => dispatch({ type: "removed", eventId }),
  };
}
