import type { ApiError } from "@/lib/api";
import type { AttendeeEventDetail, AttendeeEventSummary } from "@/lib/api/discovery";

// List state for useDiscoveryEvents. Kept free of React and runtime imports so
// the unit tests can load it directly.

export interface DiscoveryState {
  status: "loading" | "ready" | "error";
  events: AttendeeEventSummary[];
  nextCursor: string | null;
  pagesLoaded: number;
  error: ApiError | null;
  loadingMore: boolean;
  loadMoreError: ApiError | null;
}

export type DiscoveryAction =
  | { type: "reload" }
  | { type: "loaded"; events: AttendeeEventSummary[]; nextCursor: string | null }
  | { type: "failed"; error: ApiError; background: boolean }
  | { type: "moreStarted" }
  | { type: "moreLoaded"; events: AttendeeEventSummary[]; nextCursor: string | null }
  | { type: "moreFailed"; error: ApiError }
  | { type: "patched"; event: AttendeeEventDetail }
  | { type: "removed"; eventId: number };

export const initialDiscoveryState: DiscoveryState = {
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
export const appendUnique = (current: AttendeeEventSummary[], next: AttendeeEventSummary[]) => {
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

export function discoveryReducer(state: DiscoveryState, action: DiscoveryAction): DiscoveryState {
  switch (action.type) {
    case "reload":
      return { ...initialDiscoveryState };
    case "loaded":
      return { ...initialDiscoveryState, status: "ready", events: action.events, nextCursor: action.nextCursor, pagesLoaded: 1 };
    case "failed":
      // A background refresh that fails leaves the list the attendee is reading.
      if (action.background && state.status === "ready") return state;
      return { ...initialDiscoveryState, status: "error", error: action.error };
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
