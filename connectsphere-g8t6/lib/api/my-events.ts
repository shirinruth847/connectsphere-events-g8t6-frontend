import { apiRequest } from "@/lib/api";
import type { AttendeeEventDetail } from "@/lib/api/discovery";

// An event the attendee holds a place on (SPM-155 AC4, AC5), from
// GET /api/registrations/mine/:eventId. Event Discovery keeps its own endpoint
// and rules (GET /api/events/discovery/:id).

// An open offer of a freed place to a waitlisted attendee (SPM-163 AC5). The
// backend omits it once it is answered, cancelled or past expiresAt.
export interface PlaceOffer {
  offerId: number;
  expiresAt: string;
}

// The attendee's own place. waitlistPosition counts from 1 while waitlisted
// and is null otherwise; offer is set only while an offer is open (SPM-163).
export interface AttendeeRegistration {
  status: "REGISTERED" | "WAITLISTED" | (string & {});
  registeredAt: string | null;
  waitlistPosition: number | null;
  offer: PlaceOffer | null;
}

// A display status, never the lifecycle state.
export type AttendeeStatus = "CONFIRMED" | "PENDING_CONFIRMATION" | "CANCELLED" | "COMPLETED" | (string & {});

export interface MyRegisteredEvent {
  // The discovery detail fields. detailsWithheld is true when the date, time,
  // venue and description are held back because they may not be the confirmed
  // ones; those fields are then null. lastConfirmedAt is set when an event
  // being reconfirmed or cancelled shows its last confirmed details (SPM-173's
  // confirmation snapshot, Master 5.7) instead of its current ones.
  event: AttendeeEventDetail & { attendeeStatus: AttendeeStatus; detailsWithheld: boolean; lastConfirmedAt: string | null };
  myRegistration: AttendeeRegistration;
}

// What the shared event details dialog and page render: a discovery detail
// (no extras), or the attendee's own event with their place.
export interface AttendeeEventView extends AttendeeEventDetail {
  attendeeStatus?: AttendeeStatus;
  detailsWithheld?: boolean;
  lastConfirmedAt?: string | null;
  myRegistration?: AttendeeRegistration | null;
}

// 404 unless the attendee is registered or waitlisted for the event, without
// saying whether it exists.
export function getMyRegisteredEvent(eventId: number, signal?: AbortSignal) {
  return apiRequest<MyRegisteredEvent>(`/registrations/mine/${encodeURIComponent(String(eventId))}`, { signal });
}

export const toEventView = ({ event, myRegistration }: MyRegisteredEvent): AttendeeEventView => ({ ...event, myRegistration });
