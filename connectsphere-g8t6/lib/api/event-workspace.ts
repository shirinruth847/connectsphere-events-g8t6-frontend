// SPM-33: role-scoped event view, coordinator edits and change history.
//
// Types follow the backend routes on feature/SPM-33-event-view-edit-history
// (see the backend README, "Role-Scoped Event View, Direct Edits and History").
// Field names, codes and statuses are the backend's; do not rename them here.
// Every call goes through apiRequest, which adds the /api prefix, the Supabase
// access token and the ApiError normalisation.

import { apiRequest } from "@/lib/api";

export type ViewerRelationship = "OWNER" | "ORGANISATION_MEMBER" | "ASSIGNED_COORDINATOR";

export type HistoryAudience = "OWNER_ONLY" | "ORGANISER_SAFE" | "STAFF_ONLY";

// The fields a coordinator may change directly (backend EVENT_FIELD_GROUPS.ORDINARY).
export const IDENTITY_FIELDS = ["title", "purpose", "description"] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];

export interface EventPermissions {
  canEdit: boolean;
  // API field names; the owner of a draft gets every draft field, the
  // assigned coordinator only IDENTITY_FIELDS in editable statuses.
  editableFields: string[];
  canViewDraftHistory: boolean;
  canViewStaffHistory: boolean;
}

export interface EventView {
  eventId: number;
  requestId: string;
  // Stored state. Typed as string because the live enum can hold values the
  // frontend does not know (e.g. APPROVED); render those as unknown, never guess.
  status: string;
  statusLabel: string;
  // What the request is waiting for, e.g. "Waiting for a coordinator".
  statusNote?: string | null;
  title: string;
  purpose: string | null;
  description: string | null;
  startDatetime: string | null;
  endDatetime: string | null;
  expectedAttendance: number | null;
  preferredLayoutType: string | null;
  accessibilityNeeds: string[];
  venuePreferences: number[];
  equipmentRequirements: Array<{ equipmentId: number; quantity: number }>;
  isRegistrationEnabled: boolean | null;
  registrationCapacity: number | null;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  coordinatorName?: string | null;
  // Send back unchanged when saving; a save against an older version is refused.
  version: number;
  organisation: { organisationId: number; name: string } | null;
  isAssignedToCoordinator: boolean;
  isOwner: boolean;
  viewerRelationship: ViewerRelationship;
  permissions: EventPermissions;
  // Only returned to the assigned coordinator.
  coordinatorId?: number | null;
  organiser?: { userId: number; name: string; email: string | null } | null;
}

export interface EventHistoryChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface EventHistoryEntry {
  historyId: number;
  action: string;
  actor: { userId: number | null; name: string | null; role: string | null };
  occurredAt: string;
  summary: string | null;
  changes: EventHistoryChange[];
  audience: HistoryAudience;
}

export interface EventHistoryPage {
  history: EventHistoryEntry[];
  nextCursor: string | null;
}

export interface AssignedEvent {
  eventId: number;
  requestId: string;
  status: string;
  statusLabel: string;
  title: string;
  startDatetime: string | null;
  endDatetime: string | null;
  expectedAttendance: number | null;
  organisation: { organisationId: number; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export type IdentityChanges = Partial<Record<IdentityField, string>>;

// accessibility_needs is stored as text: a JSON list when saved through the event
// forms, but older rows hold plain text or null, which the API passes through.
type RawEventView = Omit<EventView, "accessibilityNeeds"> & { accessibilityNeeds: string[] | string | null };

const toEventView = (raw: RawEventView): EventView => ({
  ...raw,
  accessibilityNeeds: Array.isArray(raw.accessibilityNeeds)
    ? raw.accessibilityNeeds
    : typeof raw.accessibilityNeeds === "string" && raw.accessibilityNeeds.trim()
      ? [raw.accessibilityNeeds.trim()]
      : [],
});

// Use on error bodies too: a 409 EVENT_VERSION_CONFLICT carries the current event.
export const parseEventView = (value: unknown): EventView | null =>
  value && typeof value === "object" && "eventId" in value ? toEventView(value as RawEventView) : null;

// GET /api/events/:id — any signed-in user; 404 outside the viewer's scope.
export async function getEventView(eventId: number): Promise<{ event: EventView }> {
  const { event } = await apiRequest<{ event: RawEventView }>(`/events/${eventId}`);
  return { event: toEventView(event) };
}

// PUT /api/events/:id — the loaded version in the body and an Idempotency-Key
// header (both required). A retry of the same save must reuse the same key.
export async function saveEventDetails(
  eventId: number,
  changes: IdentityChanges,
  version: number,
  idempotencyKey: string,
): Promise<{ message: string; event: EventView }> {
  const result = await apiRequest<{ message: string; event: RawEventView }>(`/events/${eventId}`, {
    method: "PUT",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ ...changes, version }),
  });
  return { message: result.message, event: toEventView(result.event) };
}

// GET /api/events/:id/history — newest first, cursor paging (limit 1–100).
export function getEventHistory(
  eventId: number,
  options: { cursor?: string | null; limit?: number } = {},
): Promise<EventHistoryPage> {
  const query = new URLSearchParams({ limit: String(options.limit ?? 20) });
  if (options.cursor) query.set("cursor", options.cursor);
  return apiRequest<EventHistoryPage>(`/events/${eventId}/history?${query}`);
}

// GET /api/events/assigned — COORDINATOR only; soonest event first.
export function listAssignedEvents(): Promise<{ events: AssignedEvent[] }> {
  return apiRequest<{ events: AssignedEvent[] }>("/events/assigned");
}
