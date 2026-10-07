import { apiRequest } from "./client";
import type { AttendeeRegistration, Page } from "./types";

// GET /api/registrations/mine (ATTENDEE). Attendee-safe fields only.
export function listMyRegistrations(signal?: AbortSignal) {
  return apiRequest<{ registrations: AttendeeRegistration[]; page: Page }>("/api/registrations/mine", { signal });
}
