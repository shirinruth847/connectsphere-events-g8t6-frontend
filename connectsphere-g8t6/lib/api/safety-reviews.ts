// SPM-243: Safety Officer review queue, claim, hand-back, progress, panel and
// decision, plus the per-role outcome list (SPM-251).
//
// Types follow the backend README, "Safety Reviews (SPM-243)". Field names,
// codes and statuses are the backend's; do not rename them here. Every call goes
// through apiRequest (the /api prefix, the Supabase token and ApiError).

import { apiRequest } from "@/lib/api";
import type { EventHistoryEntry } from "@/lib/api/event-workspace";
import type {
  ChecklistEntry,
  DecisionOutcome,
  RoundStatus,
  SafetyChecklist,
} from "@/lib/safety-review";

export type { ChecklistEntry, DecisionOutcome, RoundStatus, SafetyChecklist };

// A row of "Awaiting review" or "My reviews".
export interface SafetyReviewSummary {
  reviewId: number;
  eventId: number;
  requestId: string;
  title: string;
  startDatetime: string | null;
  endDatetime: string | null;
  expectedAttendance: number | null;
  venues: string[];
  roundNumber: number;
  submittedAt: string;
  claimedAt: string | null;
}

export interface RejectedBooking {
  bookingId: number;
  reason: string;
}

// The full round: the claimant, the coordinator and other Safety Officers.
export interface SafetyRound {
  reviewId: number;
  eventId: number;
  roundNumber: number;
  status: RoundStatus;
  arrangementVersion: number;
  submittedAt: string;
  claimedBy: number | null;
  claimedAt: string | null;
  checklist: SafetyChecklist | null;
  organiserComment: string | null;
  internalNotes: string | null;
  requestedChanges: string[] | null;
  rejectedBookings: RejectedBooking[];
  decidedBy: number | null;
  decidedAt: string | null;
  supersededAt: string | null;
}

// What the organiser sees of a round (SPM-243 AC15). Leads and Technical
// Support get the same without the comment; Venue Staff add their own bookings.
export interface SafetyOutcome {
  roundNumber: number;
  status: RoundStatus;
  decidedAt: string | null;
  organiserComment?: string | null;
  rejectedBookings?: RejectedBooking[];
}

export interface PanelBooking {
  bookingId: number;
  label: string | null;
  status: string;
  startDatetime: string;
  endDatetime: string;
  expectedAttendance: number | null;
  layoutType: string | null;
  venue: { venueId: number; name: string; address: string | null; capacity: number | null } | null;
}

export interface PanelEquipment {
  requestId: number;
  name: string | null;
  category: string | null;
  quantity: number;
  startDatetime: string | null;
  endDatetime: string | null;
  status: string;
  // The technical notes until technical request lines exist.
  placement: string | null;
}

export interface VenueSafetyDetail {
  venueId: number;
  found: boolean;
  emergencyAccess: string | null;
  knownRestrictions: string[];
}

export interface SafetyPanel {
  review: SafetyRound;
  event: {
    eventId: number;
    requestId: string;
    title: string;
    status: string;
    startDatetime: string | null;
    endDatetime: string | null;
    expectedAttendance: number | null;
    registeredCount: number;
    preferredLayoutType: string | null;
    // Normalised by getSafetyPanel; the API may send a list, plain text or null.
    accessibilityNeeds: string[];
    arrangementVersion: number;
  };
  bookings: PanelBooking[];
  equipment: PanelEquipment[];
  history: EventHistoryEntry[];
  rounds: SafetyRound[];
  // False when MongoDB venue_details could not be read; decisions are refused then.
  venueDetailsAvailable: boolean;
  venueDetails: VenueSafetyDetail[];
}

export interface SafetyProgress {
  checklist?: SafetyChecklist;
  organiserComment?: string | null;
  internalNotes?: string | null;
  requestedChanges?: string[] | null;
}

export interface SafetyDecision {
  outcome: DecisionOutcome;
  checklist: SafetyChecklist;
  arrangementVersion: number;
  organiserComment?: string;
  internalNotes?: string;
  requestedChanges?: string[];
  rejectedBookings?: RejectedBooking[];
}

const reviewPath = (reviewId: number, action: string) => `/safety-reviews/${reviewId}/${action}`;

// GET /api/safety-reviews/queue: open, unclaimed rounds, oldest submission first.
export const listSafetyQueue = () => apiRequest<{ reviews: SafetyReviewSummary[] }>("/safety-reviews/queue");

// GET /api/safety-reviews/mine: open rounds the caller holds.
export const listMySafetyReviews = () => apiRequest<{ reviews: SafetyReviewSummary[] }>("/safety-reviews/mine");

// POST .../claim: 409 ROUND_NOT_CLAIMABLE when another officer got there first.
export const claimSafetyReview = (reviewId: number) =>
  apiRequest<{ message: string; review: SafetyRound }>(reviewPath(reviewId, "claim"), { method: "POST", body: "{}" });

// POST .../hand-back: clears saved progress; 403 NOT_CLAIMANT, 409 ROUND_NOT_OPEN.
export const handBackSafetyReview = (reviewId: number, note: string) =>
  apiRequest<{ message: string; review: SafetyRound }>(reviewPath(reviewId, "hand-back"), {
    method: "POST",
    body: JSON.stringify(note.trim() ? { note: note.trim() } : {}),
  });

// PUT .../progress: a partial checklist is allowed; 400 names checklist.<factor>.
export const saveSafetyProgress = (reviewId: number, progress: SafetyProgress) =>
  apiRequest<{ message: string; review: SafetyRound }>(reviewPath(reviewId, "progress"), {
    method: "PUT",
    body: JSON.stringify(progress),
  });

// GET .../panel: 404 outside the caller's scope.
// accessibility_needs is stored as text: a JSON list when saved through the event
// forms, but older rows hold plain text or null, which the API passes through.
const toAccessibilityList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string" && value.trim()
      ? [value.trim()]
      : [];

export async function getSafetyPanel(reviewId: number): Promise<SafetyPanel> {
  const panel = await apiRequest<SafetyPanel>(reviewPath(reviewId, "panel"));
  return { ...panel, event: { ...panel.event, accessibilityNeeds: toAccessibilityList(panel.event.accessibilityNeeds) } };
}

// POST .../decision with an Idempotency-Key. A retry of the same decision must
// reuse its key. 409 ARRANGEMENTS_CHANGED means the round was superseded instead.
export const decideSafetyReview = (reviewId: number, decision: SafetyDecision, idempotencyKey: string) =>
  apiRequest<{ message: string; review: SafetyRound; event: { eventId: number; status: string } }>(
    reviewPath(reviewId, "decision"),
    { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(decision) },
  );

// GET /api/events/:id/safety-reviews (SPM-251): every round, shaped for the
// caller (full rounds for the coordinator and Safety Officers); 404 otherwise.
export const getEventSafetyReviews = <T extends SafetyOutcome | SafetyRound = SafetyOutcome | SafetyRound>(eventId: number) =>
  apiRequest<{ reviews: T[] }>(`/events/${eventId}/safety-reviews`);
