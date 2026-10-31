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

// A row of GET /api/registrations/mine. waitlistPosition and offer are as on
// myRegistration (SPM-163). The event values follow the same snapshot rules as
// GET /mine/:eventId (SPM-141): withheld ones are null, and venue is set only
// when there is exactly one attendee-visible approved venue.
export interface MyRegistrationRow {
  registration_id: number;
  registration_status: string;
  registered_at: string | null;
  waitlistPosition: number | null;
  offer: AttendeeRegistration["offer"];
  event: {
    event_id: number;
    title: string;
    description: string | null;
    start_datetime: string | null;
    end_datetime: string | null;
    attendee_status: string;
    venue: { name: string | null; address: string | null } | null;
  };
}

interface MyRegistrationsPage {
  registrations: MyRegistrationRow[];
  page: { next_offset: number | null };
}

// Every page of the attendee's active places (REGISTERED or WAITLISTED;
// withdrawn places are not returned), in the backend's order (newest
// registration first); My Events sorts them with orderMyEvents.
export async function listMyRegistrations(signal?: AbortSignal): Promise<MyRegistrationRow[]> {
  const rows: MyRegistrationRow[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const page: MyRegistrationsPage = await apiRequest<MyRegistrationsPage>(`/registrations/mine?limit=100&offset=${offset}`, { signal });
    rows.push(...page.registrations);
    offset = page.page.next_offset;
  }
  return rows;
}

export const toAttendeeRegistration = (row: MyRegistrationRow): AttendeeRegistration => ({
  status: row.registration_status,
  registeredAt: row.registered_at,
  waitlistPosition: row.waitlistPosition ?? null,
  offer: row.offer ?? null,
});

// The attendee's active places keyed by event ID. Event Discovery carries no
// "you are registered" field, so this is the source of the attendee's
// registered and waitlisted state.
export async function listMyPlaces(signal?: AbortSignal): Promise<Map<number, AttendeeRegistration>> {
  const rows = await listMyRegistrations(signal);
  return new Map(rows.map((row) => [row.event.event_id, toAttendeeRegistration(row)]));
}
