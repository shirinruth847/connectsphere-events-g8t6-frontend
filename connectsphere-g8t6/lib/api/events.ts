import { MOCK_ATTENDEE_EVENTS } from "./mocks/attendee-events";
import type { AttendeeEvent } from "./types";

/**
 * Confirmed, published events an attendee may discover (master §5.3).
 *
 * INTEGRATION (SPM-77): replace the mock with the backend discovery route once it exists,
 * attaching the Supabase access token from lib/auth and fetching with `cache: "no-store"`
 * so updated event details are always current (SPM-34 AC6). Publication and availability
 * filtering stay on the backend; the browser never decides what is discoverable.
 */
export async function getAttendeeEvents(): Promise<AttendeeEvent[]> {
  return MOCK_ATTENDEE_EVENTS;
}
