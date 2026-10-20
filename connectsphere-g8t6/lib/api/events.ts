import { apiRequest } from "@/lib/api";

export type ApiEvent = {
  eventId: number;
  requestId: string;
  status: string;
  title: string;
  startDatetime: string;
  endDatetime: string;
  expectedAttendance: number;
  organisation?: { organisationId: number; name: string } | null;
  createdAt: string;
};

export type CoordinatorAvailability = {
  coordinatorId: number;
  name: string;
  events: ApiEvent[];
};

export type LeadAssignment = ApiEvent & {
  coordinatorId: number;
  coordinatorName: string;
};

export function getUnassignedEvents() {
  return apiRequest<{ events: ApiEvent[] }>("/events/unassigned");
}

export function getCoordinatorAvailability() {
  return apiRequest<{ coordinators: CoordinatorAvailability[] }>(
    "/events/coordinator-availability",
  );
}

export function getLeadAssignments() {
  return apiRequest<{ assignments: LeadAssignment[] }>("/events/assignments");
}

export function assignCoordinator(eventId: number, coordinatorId: number) {
  return apiRequest<{ event: ApiEvent }>(`/events/${eventId}/coordinator`, {
    // Lead-only initial assignment; expectedCoordinatorId selects reassignment.
    method: "PATCH",
    body: JSON.stringify({ coordinatorId }),
  });
}

export function reassignCoordinator(eventId: number, coordinatorId: number, expectedCoordinatorId: number) {
  return apiRequest<{ event: ApiEvent }>(`/events/${eventId}/coordinator`, {
    method: "PATCH",
    body: JSON.stringify({ coordinatorId, expectedCoordinatorId }),
  });
}

export function getCurrentUser() {
  return apiRequest<{ user: { user_id: number; email: string; name: string; role: string } }>(
    "/auth/me",
  );
}
