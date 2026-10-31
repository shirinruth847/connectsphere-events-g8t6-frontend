import type { ApiError } from "@/lib/api";
import type { AttendeeRegistration, PlaceOffer } from "@/lib/api/my-events";

// Which waitlist, offer and withdrawal actions to offer the attendee
// (SPM-163, SPM-147), and what to say when the backend refuses one. Pure, so
// the unit tests can load it. These only decide which controls to render; the
// backend enforces every rule.

export type RegistrationActionKind = "accept" | "decline" | "leave" | "withdraw";

// The parts of an event that decide its actions, from either the My Events
// list or the details dialog.
export interface PlaceContext {
  registration: Pick<AttendeeRegistration, "status" | "waitlistPosition" | "offer">;
  attendeeStatus: string | null | undefined;
}

// Cancelled and completed events have no place left to change.
const CLOSED_STATUSES = new Set(["CANCELLED", "COMPLETED"]);

// The open offer, exactly as the backend returned it. The backend omits an
// offer once it is answered or past its deadline; the browser clock never
// hides one, because a late answer is refused (OFFER_EXPIRED) and the place
// is then read again.
export function openOffer(registration: PlaceContext["registration"]): PlaceOffer | null {
  return registration.status === "WAITLISTED" && registration.offer ? registration.offer : null;
}

// The actions for this place, in the order the buttons appear. Withdraw is
// offered on every registered place of an event still going ahead; the
// backend refuses it once the event has started (EVENT_STARTED), whatever the
// browser clock says.
export function placeActions({ registration, attendeeStatus }: PlaceContext): RegistrationActionKind[] {
  if (attendeeStatus && CLOSED_STATUSES.has(attendeeStatus)) return [];
  if (registration.status === "REGISTERED") return ["withdraw"];
  if (registration.status === "WAITLISTED") return openOffer(registration) ? ["accept", "decline"] : ["leave"];
  return [];
}

// My Events order: events still going ahead first, soonest start first, with
// a held-back date after them; then cancelled and completed events. From the
// backend's status and start time only, never the browser clock. Stable for
// equal keys, so the backend's own order is kept between them.
export function orderMyEvents<T extends { event: { start_datetime: string | null; attendee_status: string } }>(rows: readonly T[]): T[] {
  const startOf = (row: T) => {
    const start = row.event.start_datetime ? new Date(row.event.start_datetime).getTime() : Number.NaN;
    return Number.isFinite(start) ? start : Number.POSITIVE_INFINITY;
  };
  const closed = (row: T) => (CLOSED_STATUSES.has(row.event.attendee_status) ? 1 : 0);
  return [...rows].sort((a, b) => closed(a) - closed(b) || startOf(a) - startOf(b) || 0);
}

// "On the waitlist · Position 3". Not "Waitlisted", which Event Discovery uses
// for a full event (SPM-44 AC3). The position is left out until the backend
// returns it.
export function placeLabel(registration: Pick<AttendeeRegistration, "status" | "waitlistPosition">) {
  if (registration.status === "REGISTERED") return "Registered";
  if (registration.status === "WAITLISTED") {
    return registration.waitlistPosition ? `On the waitlist · Position ${registration.waitlistPosition}` : "On the waitlist";
  }
  return "Registration withdrawn";
}

// One message per refusal the backend can give. A 409 means the place changed
// since the page loaded, so the surface also refreshes it.
const CONFLICT_MESSAGES: Record<string, string> = {
  ALREADY_REGISTERED: "You're already registered for this event.",
  ALREADY_WAITLISTED: "You're already on the waitlist for this event.",
  PLACES_AVAILABLE: "This event has places available again, so there is no waitlist to join.",
  REGISTRATION_NOT_YET_OPEN: "Registration for this event hasn't opened yet.",
  REGISTRATION_CLOSED: "Registration for this event is closed.",
  REGISTRATION_UNAVAILABLE: "Registration for this event is currently unavailable.",
  NOT_WAITLISTED: "You're no longer on the waitlist for this event.",
  OFFER_EXPIRED: "This offer has expired.",
  OFFER_NOT_OPEN: "This offer has already been answered.",
  REGISTRATION_FULL: "This event is full, so the offered place is no longer available.",
  NOT_REGISTERED: "You're not registered for this event.",
  EVENT_STARTED: "Cannot withdraw registration for past events",
  EVENT_NOT_ACTIVE: "This event is no longer going ahead.",
  IDEMPOTENCY_IN_PROGRESS: "Your request is still being processed. Try again in a moment.",
  // Closing and starting again sends a new key.
  IDEMPOTENCY_KEY_REUSED: "This request couldn't be matched to your earlier attempt. Close this and try again.",
};

export interface ActionErrorPresentation {
  message: string;
  // True when retrying the same request may succeed; false when the place
  // has changed and the attendee should look again.
  retryable: boolean;
}

export function actionErrorPresentation(error: Pick<ApiError, "status" | "code" | "message">): ActionErrorPresentation {
  if (error.status === 409) {
    const message = CONFLICT_MESSAGES[error.code];
    if (message) return { message, retryable: error.code === "IDEMPOTENCY_IN_PROGRESS" };
    return { message: "Your place has changed since this page loaded. Close this and check its latest status.", retryable: false };
  }
  if (error.status === 404) {
    return {
      message: error.code === "OFFER_NOT_FOUND" ? "This offer is no longer available." : "This event is no longer available to you.",
      retryable: false,
    };
  }
  if (error.status === 403) return { message: "Only attendee accounts can change event places.", retryable: false };
  if (error.status === 401) return { message: "Your session has ended. Taking you to sign in…", retryable: false };
  if (error.status === 400) return { message: "Some details need correcting before this can be sent.", retryable: true };
  if (error.status === 0) return { message: error.message, retryable: true };
  return { message: "Something went wrong on our side. Nothing was changed. Try again.", retryable: true };
}

// The status line after a confirmed change, named by event.
export function actionSuccessMessage(kind: RegistrationActionKind, title: string) {
  switch (kind) {
    case "accept":
      return `You're registered for ${title}.`;
    case "decline":
      return `You declined the place for ${title} and left its waitlist.`;
    case "leave":
      return `You left the waitlist for ${title}.`;
    case "withdraw":
      return `Your registration for ${title} has been withdrawn.`;
  }
}
