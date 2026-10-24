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
  // SPM-41 clarification threads. When absent the controls stay hidden.
  canRequestClarification?: boolean;
  canPostClarificationMessage?: boolean;
  canSaveAmendments?: boolean;
  canCompleteClarification?: boolean;
}

export interface EventView {
  eventId: number;
  requestId: string;
  // Stored state, returned only to the assigned coordinator (SPM-173 AC6);
  // organisers get statusLabel alone, read through eventDisplayStatus. Typed as
  // string because the live enum can hold values the frontend does not know
  // (e.g. APPROVED); render those as unknown, never guess.
  status?: string;
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
  organiser?: { userId: number; name: string } | null;
  // SPM-173: counts changes to venue bookings, technical arrangements and
  // attendance; a safety approval is valid only for the version it reviewed.
  arrangementVersion?: number;
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
  // When this viewer last marked the history viewed; null before their first view (SPM-41).
  lastViewedAt?: string | null;
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

// POST /api/events/:id/history/viewed — records that this viewer saw the history now.
export function markHistoryViewed(eventId: number): Promise<{ lastViewedAt: string }> {
  return apiRequest<{ lastViewedAt: string }>(`/events/${eventId}/history/viewed`, { method: "POST" });
}

// ---------- SPM-173 coordinator lifecycle actions ----------
// Backend README, "Event Lifecycle (SPM-173)". Codes are the backend's.

export interface ReadinessFailure {
  code: string;
  message: string;
}

export interface EventReadiness {
  ready: boolean;
  failures: ReadinessFailure[];
  status: string;
  version: number;
  arrangementVersion: number;
}

export const LIFECYCLE_ACTION_PATHS = {
  submitForSafetyReview: "submit-for-safety-review",
  confirm: "confirm",
  startPreparation: "start-preparation",
  complete: "complete",
} as const;
export type LifecycleAction = keyof typeof LIFECYCLE_ACTION_PATHS;

// GET /api/events/:id/readiness — assigned coordinator only; 404 otherwise.
export function getEventReadiness(eventId: number): Promise<EventReadiness> {
  return apiRequest<EventReadiness>(`/events/${eventId}/readiness`);
}

// POST /api/events/:id/<action> with the loaded version and an Idempotency-Key.
// Errors: 403 TRANSITION_NOT_ALLOWED (details.currentStatus), 409
// EVENT_VERSION_CONFLICT (details.event), 409 READINESS_BLOCKED
// (details.failures), 409 SAFETY_APPROVAL_REQUIRED, 409 EVENT_NOT_ENDED.
export async function runLifecycleAction(
  eventId: number,
  action: LifecycleAction,
  version: number,
  idempotencyKey: string,
): Promise<{ message: string; event: EventView }> {
  const result = await apiRequest<{ message: string; event: RawEventView }>(
    `/events/${eventId}/${LIFECYCLE_ACTION_PATHS[action]}`,
    { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ version }) },
  );
  return { message: result.message, event: toEventView(result.event) };
}

/// ---------- SPM-41 clarification threads ----------
// Backend README, "Clarification Threads (SPM-41)". Codes are the backend's.

// Backend limit for the coordinator's question and every thread message.
export const CLARIFICATION_TEXT_LIMIT = 2000;

export interface ClarificationMessage {
  messageId: number;
  body: string;
  createdAt: string;
  author: { userId: number; name: string | null; role: string | null };
}

export interface ClarificationRound {
  clarificationId: number;
  round: number;
  status: "OPEN" | "COMPLETED";
  // The coordinator's opening question; also the thread's first message.
  message: string;
  requestedAt: string;
  requestedBy: { userId: number; name: string | null };
  completedAt: string | null;
  // The coordinator who completed it (or, for rounds closed before threads
  // existed, the organiser who resubmitted).
  completedBy: { userId: number; name: string | null } | null;
  // Oldest first.
  messages: ClarificationMessage[];
  // Messages from the other party since this viewer last opened the thread;
  // null for viewers whose reads are not tracked (same-organisation organisers).
  unreadCount: number | null;
}

// The submission fields an owner may amend while a thread is open
// (registration settings and organisation are not among them).
export interface AmendmentChanges {
  title?: string;
  purpose?: string | null;
  description?: string | null;
  startDatetime?: string | null;
  endDatetime?: string | null;
  expectedAttendance?: number | null;
  preferredLayoutType?: string;
  venuePreferences?: number[];
  accessibilityNeeds?: string[];
  equipmentRequirements?: Array<{ equipmentId: number; quantity: number }>;
}

// GET /api/events/:id/clarifications — owner, same-organisation organisers and
// the assigned coordinator; newest thread first.
export function getEventClarifications(eventId: number): Promise<{ clarifications: ClarificationRound[] }> {
  return apiRequest<{ clarifications: ClarificationRound[] }>(`/events/${eventId}/clarifications`);
}

// POST /api/events/:id/clarifications — assigned coordinator, UNDER_REVIEW only;
// opens a thread. Errors: 400 VALIDATION_FAILED (fields.message), 403
// TRANSITION_NOT_ALLOWED (details.currentStatus), 404 for another coordinator,
// 409 EVENT_VERSION_CONFLICT (details.event).
export async function requestClarification(
  eventId: number,
  message: string,
  version: number,
  idempotencyKey: string,
): Promise<{ event: EventView; clarification: ClarificationRound }> {
  const result = await apiRequest<{ event: RawEventView; clarification: ClarificationRound }>(`/events/${eventId}/clarifications`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ message, version }),
  });
  return { event: toEventView(result.event), clarification: result.clarification };
}

// POST /api/events/:id/clarifications/:round/messages — owner or assigned
// coordinator, open thread only. Errors: 400 VALIDATION_FAILED (fields.body),
// 403 EVENT_READ_ONLY, 404 CLARIFICATION_NOT_FOUND, 409 CLARIFICATION_CLOSED.
export function postClarificationMessage(
  eventId: number,
  round: number,
  body: string,
  idempotencyKey: string,
): Promise<{ message: string; clarification: ClarificationRound | null }> {
  return apiRequest<{ message: string; clarification: ClarificationRound | null }>(
    `/events/${eventId}/clarifications/${round}/messages`,
    { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ body }) },
  );
}

// POST /api/events/:id/clarifications/:round/read — lets the next message notify
// this viewer again. Stored only for the owner and the assigned coordinator.
export function markClarificationRead(eventId: number, round: number): Promise<void> {
  return apiRequest<void>(`/events/${eventId}/clarifications/${round}/read`, { method: "POST" });
}

// POST /api/events/:id/amendments — owner, open thread only; the event stays
// returned. Errors: 400 VALIDATION_FAILED (fields; fields.changes when nothing
// changed), 403 FIELD_NOT_EDITABLE / EVENT_READ_ONLY / TRANSITION_NOT_ALLOWED,
// 409 EVENT_VERSION_CONFLICT (details.event), CLARIFICATION_NOT_OPEN, or
// COORDINATOR_CONFLICT when amended dates clash with the coordinator's schedule.
export async function saveAmendments(
  eventId: number,
  changes: AmendmentChanges,
  version: number,
  idempotencyKey: string,
): Promise<{ message: string; event: EventView }> {
  const result = await apiRequest<{ message: string; event: RawEventView }>(`/events/${eventId}/amendments`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ changes, version }),
  });
  return { message: result.message, event: toEventView(result.event) };
}

// POST /api/events/:id/clarifications/:round/complete — assigned coordinator;
// returns the event to UNDER_REVIEW. A version from before the latest amendments
// is 409 EVENT_VERSION_CONFLICT (details.event); also 409 CLARIFICATION_CLOSED,
// 403 TRANSITION_NOT_ALLOWED.
export async function completeClarification(
  eventId: number,
  round: number,
  version: number,
  idempotencyKey: string,
): Promise<{ message: string; event: EventView; clarification: ClarificationRound | null }> {
  const result = await apiRequest<{ message: string; event: RawEventView; clarification: ClarificationRound | null }>(
    `/events/${eventId}/clarifications/${round}/complete`,
    { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ version }) },
  );
  return { message: result.message, event: toEventView(result.event), clarification: result.clarification };
}

// GET /api/events/assigned — COORDINATOR only; soonest event first.
export function listAssignedEvents(): Promise<{ events: AssignedEvent[] }> {
  return apiRequest<{ events: AssignedEvent[] }>("/events/assigned");
}
