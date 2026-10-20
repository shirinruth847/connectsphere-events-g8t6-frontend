import { apiRequest } from "@/lib/api";

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

export function reassignCoordinator(eventId: number, coordinatorId: number, expectedCoordinatorId: number) {
  return apiRequest<{ event: { eventId: number; coordinatorId: number }; coordinator: { coordinatorId: number; name: string } }>(`/events/${eventId}/coordinator`, {
    method: "PATCH",
    body: JSON.stringify({ coordinatorId, expectedCoordinatorId }),
  });
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
