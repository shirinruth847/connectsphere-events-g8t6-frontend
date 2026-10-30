import { ApiError, apiRequest } from "@/lib/api";

export type ApiEvent = {
  eventId: number;
  requestId: string;
  status: string;
  title: string;
  startDatetime: string;
  endDatetime: string;
  expectedAttendance: number;
  purpose?: string | null;
  venuePreferences?: number[];
  equipmentRequirements?: Array<{ equipmentId: number; quantity: number }>;
  organisation?: { organisationId: number; name: string } | null;
  createdAt: string;
  submittedAt?: string | null;
};

export type CoordinatorAvailability = {
  coordinatorId: number;
  name: string;
  events: ApiEvent[];
};

export type LeadAssignment = ApiEvent & {
  coordinatorId: number;
  coordinatorName: string;
  supervisingLeadId: number | null;
  hasScheduleConflict: boolean;
};

export function getLeadAssignments() {
  return apiRequest<{ assignments: LeadAssignment[] }>("/events/assignments");
}

export async function reassignCoordinator(eventId: number, coordinatorId: number, expectedCoordinatorId: number, idempotencyKey: string) {
  const result = await apiRequest<{ event: { eventId: number; coordinatorId: number }; coordinator: { coordinatorId: number; name: string }; replayed: boolean }>(`/events/${eventId}/coordinator`, {
    method: "PATCH",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ coordinatorId, expectedCoordinatorId }),
  });
  if (result?.event?.eventId !== eventId || result.event.coordinatorId !== coordinatorId
    || result.coordinator?.coordinatorId !== coordinatorId || typeof result.coordinator.name !== "string"
    || typeof result.replayed !== "boolean") {
    throw new ApiError("The reassignment response could not be confirmed. Retry the previous reassignment.", 0, "INVALID_RESPONSE");
  }
  return result;
}

export function getUnassignedEvents() {
  return apiRequest<{ events: ApiEvent[] }>("/events/unassigned");
}

export function getCoordinatorAvailability() {
  return apiRequest<{ coordinators: CoordinatorAvailability[] }>("/events/coordinator-availability");
}

export function assignCoordinator(eventId: number, coordinatorId: number) {
  return apiRequest<{ event: ApiEvent }>(`/events/${eventId}/coordinator`, {
    method: "PATCH",
    body: JSON.stringify({ coordinatorId }),
  });
}

export function getCurrentUser() {
  return apiRequest<{ user: { user_id: number; email: string; name: string; role: string } }>("/auth/me");
}
