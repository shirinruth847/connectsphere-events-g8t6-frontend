import { apiRequest } from "@/lib/api";
import type { AttendeeRegistration } from "@/lib/api/my-events";

// Direct event registration (SPM-134) and the attendee's own places. The
// backend decides eligibility, capacity, duplicates and the confirmation number;
// the request carries only the two registration answers.

export interface RegistrationAnswers {
  // Both keys are always sent: text, or null to leave the answer blank.
  dietaryRestrictions: string | null;
  accessibilityRequirements: string | null;
}

export interface RegistrationConfirmation {
  registrationId: number;
  confirmationNumber: string;
  status: "REGISTERED" | (string & {});
  registeredAt: string;
  dietaryRestrictions: string | null;
  accessibilityRequirements: string | null;
  event: {
    eventId: number;
    title: string;
    startDatetime: string | null;
    endDatetime: string | null;
    organisationName: string | null;
  };
}

// Stable 409 codes for a refused registration (POST /api/registrations/mine/:eventId).
export const REGISTRATION_CONFLICT_CODES = [
  "REGISTRATION_NOT_YET_OPEN",
  "REGISTRATION_CLOSED",
  "REGISTRATION_FULL",
  "REGISTRATION_UNAVAILABLE",
  "ALREADY_REGISTERED",
  "ALREADY_WAITLISTED",
  "IDEMPOTENCY_KEY_REUSED",
  "IDEMPOTENCY_IN_PROGRESS",
] as const;
export type RegistrationConflictCode = (typeof REGISTRATION_CONFLICT_CODES)[number];

// POST /api/registrations/mine/:eventId (ATTENDEE). 201 with the confirmation.
// The Idempotency-Key makes a retried submission of the same answers safe: the
// backend replays the first result instead of registering twice.
export function registerForEvent(eventId: number, answers: RegistrationAnswers, idempotencyKey: string) {
  return apiRequest<{ registration: RegistrationConfirmation }>(
    `/registrations/mine/${encodeURIComponent(String(eventId))}`,
    { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(answers) },
  );
}

interface MyRegistrationsPage {
  registrations: { registration_status: string; registered_at: string | null; waitlistPosition: number | null; offer: AttendeeRegistration["offer"]; event: { event_id: number } }[];
  page: { next_offset: number | null };
}

// The attendee's active places (REGISTERED or WAITLISTED; withdrawn places are
// not returned), keyed by event ID, from every page of GET /api/registrations/mine.
// Event Discovery carries no "you are registered" field, so this is the source
// of the attendee's registered state.
export async function listMyPlaces(signal?: AbortSignal): Promise<Map<number, AttendeeRegistration>> {
  const places = new Map<number, AttendeeRegistration>();
  let offset: number | null = 0;
  while (offset !== null) {
    const page: MyRegistrationsPage = await apiRequest<MyRegistrationsPage>(`/registrations/mine?limit=100&offset=${offset}`, { signal });
    for (const item of page.registrations) {
      places.set(item.event.event_id, { status: item.registration_status, registeredAt: item.registered_at, waitlistPosition: item.waitlistPosition ?? null, offer: item.offer ?? null });
    }
    offset = page.page.next_offset;
  }
  return places;
}
