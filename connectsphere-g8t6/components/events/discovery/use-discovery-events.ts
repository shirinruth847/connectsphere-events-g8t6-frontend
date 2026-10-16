"use client";

import { useCallback, useEffect, useEffectEvent, useReducer, useRef } from "react";
import { ApiError } from "@/lib/api";
import { listDiscoveryEvents, type AttendeeEventDetail, type AttendeeEventSummary } from "@/lib/api/discovery";

export const DISCOVERY_PAGE_SIZE = 10;

interface DiscoveryState {
  status: "loading" | "ready" | "error";
  events: AttendeeEventSummary[];
  nextCursor: string | null;
  pagesLoaded: number;
  error: ApiError | null;
  loadingMore: boolean;
  loadMoreError: ApiError | null;
}

type DiscoveryAction =
  | { type: "reload" }
  | { type: "loaded"; events: AttendeeEventSummary[]; nextCursor: string | null }
  | { type: "failed"; error: ApiError; background: boolean }
  | { type: "moreStarted" }
  | { type: "moreLoaded"; events: AttendeeEventSummary[]; nextCursor: string | null }
  | { type: "moreFailed"; error: ApiError }
  | { type: "patched"; event: AttendeeEventDetail }
  | { type: "removed"; eventId: number };

const initialState: DiscoveryState = {
  status: "loading",
  events: [],
  nextCursor: null,
  pagesLoaded: 0,
  error: null,
  loadingMore: false,
  loadMoreError: null,
};

// Keyset pages are ordered by start_datetime, then event_id, so an event
// rescheduled between two page requests can come back twice. Keep the first copy.
const appendUnique = (current: AttendeeEventSummary[], next: AttendeeEventSummary[]) => {
  const seen = new Set(current.map((event) => event.eventId));
  return [...current, ...next.filter((event) => !seen.has(event.eventId))];
};

// A detail response refreshes its list row with the latest published values.
const toSummary = (event: AttendeeEventDetail): AttendeeEventSummary => ({
  eventId: event.eventId,
  title: event.title,
  description: event.description,
  startDatetime: event.startDatetime,
  endDatetime: event.endDatetime,
  organisationName: event.organisationName,
  location: event.location,
  registrationAvailability: event.registrationAvailability,
});

function reducer(state: DiscoveryState, action: DiscoveryAction): DiscoveryState {
  switch (action.type) {
    case "reload":
      return { ...initialState };
    case "loaded":
      return { ...initialState, status: "ready", events: action.events, nextCursor: action.nextCursor, pagesLoaded: 1 };
    case "failed":
      // A background refresh that fails leaves the list the attendee is reading.
      if (action.background && state.status === "ready") return state;
      return { ...initialState, status: "error", error: action.error };
    case "moreStarted":
      return { ...state, loadingMore: true, loadMoreError: null };
    case "moreLoaded":
      return {
        ...state,
        events: appendUnique(state.events, action.events),
        nextCursor: action.nextCursor,
        pagesLoaded: state.pagesLoaded + 1,
        loadingMore: false,
      };
    case "moreFailed":
      return { ...state, loadingMore: false, loadMoreError: action.error };
    case "patched": {
      const summary = toSummary(action.event);
      return {
        ...state,
        events: state.events.map((event) => (event.eventId === summary.eventId ? summary : event)),
      };
    }
    case "removed":
      return { ...state, events: state.events.filter((event) => event.eventId !== action.eventId) };
  }
}

export const toApiError = (error: unknown) =>
  error instanceof ApiError
    ? error
    : new ApiError(error instanceof Error ? error.message : "The request could not be completed.", 0);

// Attendee discovery list with cursor paging. Data stays in this hook (no
// global store); it refetches the first page when the tab becomes visible
// again, unless the attendee has already loaded more pages.
export function useDiscoveryEvents() {
  const [state, dispatch] = useReducer(reducer, initialState);
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
