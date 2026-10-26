import { apiRequest } from "@/lib/api";

// The signed-in attendee's own profile (SPM-270). Name and email come from the
// user record and are read-only here; only the two preference fields are
// written.

export interface AttendeeProfile {
  // Null until the attendee first saves (no attendee_profile row yet).
  attendeeId: number | null;
  userId: number;
  name: string;
  email: string;
  // Returned by the backend but not shown: attendees sign up without a phone
  // number and email is their contact (SPM-270 requirement correction).
  phone: string | null;
  dietaryRestrictions: string | null;
  accessibilityRequirements: string | null;
  // Null before the first save; afterwards the version to send with the next save.
  version: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AttendeeProfileSave {
  dietaryRestrictions: string | null;
  accessibilityRequirements: string | null;
  version: number | null;
}

// GET /api/attendee-profile/mine (ATTENDEE).
export function getMyAttendeeProfile(signal?: AbortSignal) {
  return apiRequest<{ profile: AttendeeProfile }>("/attendee-profile/mine", { signal });
}

// PUT /api/attendee-profile/mine (ATTENDEE). 201 on the first save, 200 after.
// 409 STALE_PROFILE when version is not the latest.
export function saveMyAttendeeProfile(body: AttendeeProfileSave) {
  return apiRequest<{ profile: AttendeeProfile }>("/attendee-profile/mine", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
