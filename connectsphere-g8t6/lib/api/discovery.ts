import { apiRequest } from "@/lib/api";

// Attendee event discovery (SPM-34). Only the fields the backend returns for
// attendees are typed here, so internal planning data cannot leak into the UI.

// Decided by the backend from database time, the registration start and end
// times and the primary venue's capacity (SPM-134, Master 5.6). UNAVAILABLE
// means the event's data is not complete enough to decide eligibility.
export const REGISTRATION_AVAILABILITY = ["NOT_YET_OPEN", "OPEN", "FULL_WAITLIST", "CLOSED", "UNAVAILABLE"] as const;

export type RegistrationAvailability = (typeof REGISTRATION_AVAILABILITY)[number];

export interface AttendeeEventSummary {
  eventId: number;
  title: string;
  description: string | null;
  startDatetime: string | null;
  endDatetime: string | null;
  organisationName: string | null;
  // The attendee-visible primary venue; null while the venue is not confirmed.
  location: string | null;
  // Kept as string so a value the backend adds later is shown as unavailable
  // rather than breaking the page.
  registrationAvailability: RegistrationAvailability | (string & {});
}

export interface AttendeeEventDetail extends AttendeeEventSummary {
  registrationOpenAt: string | null;
  registrationCloseAt: string | null;
}

export interface DiscoveryPage {
  events: AttendeeEventSummary[];
  nextCursor: string | null;
}

// GET /api/events/discovery (ATTENDEE). Published, confirmed events whose end
// time is still ahead; keyset-paged with nextCursor.
export function listDiscoveryEvents({
  limit,
  cursor,
  signal,
}: {
  limit: number;
  cursor?: string | null;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return apiRequest<DiscoveryPage>(`/events/discovery?${params}`, { signal });
}

// GET /api/events/discovery/:id (ATTENDEE). 404 for unknown, hidden or
// malformed IDs, without saying which.
export function getDiscoveryEvent(eventId: number, signal?: AbortSignal) {
  return apiRequest<{ event: AttendeeEventDetail }>(
    `/events/discovery/${encodeURIComponent(String(eventId))}`,
    { signal },
  );
}
