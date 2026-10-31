import { apiRequest } from "@/lib/api";

// The attendee's own waitlist, place-offer and withdrawal actions (SPM-163,
// SPM-147). The attendee comes from the session; the backend decides the
// queue position, offers, deadlines and every refusal.

export interface RegistrationActionResult {
  registrationId: number;
  status: "REGISTERED" | "WAITLISTED" | "WITHDRAWN" | (string & {});
  waitlistPosition: number | null;
  registeredAt: string | null;
  withdrawnAt: string | null;
  event: { eventId: number; title: string; startDatetime: string | null; endDatetime: string | null };
}

// Both answers are always sent: text, or null to leave blank (as SPM-134's
// registration form). They apply to this event only, not the profile.
export interface WaitlistAnswers {
  dietaryRestrictions: string | null;
  accessibilityRequirements: string | null;
}

// One key per confirmed intent, reused when the attendee retries it, so a
// lost response never joins, accepts or withdraws twice.
export const newIdempotencyKey = () => crypto.randomUUID();

const post = (eventId: number, action: string, body: object, idempotencyKey: string) =>
  apiRequest<{ registration: RegistrationActionResult }>(
    `/registrations/mine/${encodeURIComponent(String(eventId))}/${action}`,
    { method: "POST", body: JSON.stringify(body), headers: { "Idempotency-Key": idempotencyKey } },
  ).then(({ registration }) => registration);

// 201 with the queue position. 409 ALREADY_REGISTERED, ALREADY_WAITLISTED,
// PLACES_AVAILABLE, REGISTRATION_NOT_YET_OPEN, REGISTRATION_CLOSED,
// REGISTRATION_UNAVAILABLE, EVENT_NOT_ACTIVE. Every action can also return
// 409 IDEMPOTENCY_KEY_REUSED or IDEMPOTENCY_IN_PROGRESS.
export const joinWaitlist = (eventId: number, answers: WaitlistAnswers, key: string) => post(eventId, "waitlist", answers, key);

// 409 NOT_WAITLISTED. An open offer counts as declined.
export const leaveWaitlist = (eventId: number, key: string) => post(eventId, "waitlist/leave", {}, key);

// 200 REGISTERED. 409 OFFER_EXPIRED, OFFER_NOT_OPEN, REGISTRATION_FULL.
export const acceptOffer = (eventId: number, offerId: number, key: string) => post(eventId, "offer/accept", { offerId }, key);

// 409 OFFER_NOT_OPEN.
export const declineOffer = (eventId: number, offerId: number, key: string) => post(eventId, "offer/decline", { offerId }, key);

// 200 WITHDRAWN. 409 NOT_REGISTERED, EVENT_STARTED, EVENT_NOT_ACTIVE.
export const withdrawRegistration = (eventId: number, key: string) => post(eventId, "withdraw", {}, key);
