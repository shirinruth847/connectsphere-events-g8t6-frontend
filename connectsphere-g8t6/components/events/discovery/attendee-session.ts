// Shared by the attendee shell, the discovery page and the /events role switch.

export interface AttendeeProfile {
  name: string;
  email: string;
}

// Signing in again from here returns the attendee to Event Discovery rather than
// the organiser-only /dashboard that the login form defaults to.
export const ATTENDEE_SIGN_IN_PATH = `/login?next=${encodeURIComponent("/events")}`;
