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

type ApiError = Error & { status?: number; code?: string; fields?: Record<string, string> };

function getBackendUrl() {
  return process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.BACKEND_URL ?? "http://localhost:8000";
}

async function request<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getBackendUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      fields?: Record<string, string>;
    };
    const error = new Error(body.error || `Request failed with status ${response.status}`) as ApiError;
    error.status = response.status;
    error.code = body.code;
    error.fields = body.fields;
    throw error;
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export function getUnassignedEvents(accessToken: string) {
  return request<{ events: ApiEvent[] }>("/api/events/unassigned", accessToken);
}

export function getCoordinatorAvailability(accessToken: string) {
  return request<{ coordinators: CoordinatorAvailability[] }>(
    "/api/events/coordinator-availability",
    accessToken,
  );
}

export function assignCoordinator(eventId: number, coordinatorId: number, accessToken: string) {
  return request<{ event: ApiEvent }>(`/api/events/${eventId}/coordinator`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ coordinatorId }),
  });
}

export function getCurrentUser(accessToken: string) {
  return request<{ user: { user_id: number; email: string; name: string; role: string } }>(
    "/api/auth/me",
    accessToken,
  );
}
