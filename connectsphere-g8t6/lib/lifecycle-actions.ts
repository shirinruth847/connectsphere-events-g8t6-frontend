// SPM-173: which coordinator lifecycle actions to offer for an event, and how to
// explain a refusal. Presentation only: the backend rechecks status, version,
// readiness, safety approval and the event's end under the event lock.

import type { LifecycleAction, ReadinessFailure } from "./api/event-workspace";

export interface LifecycleActionOption {
  action: LifecycleAction;
  label: string;
  // Shown under the button when it is disabled.
  disabledReason: string | null;
}

// The event has ended (database time decides; this only hides a button that would be refused).
const hasEnded = (endDatetime: string | null, now: number) =>
  Boolean(endDatetime) && Date.parse(endDatetime as string) <= now;

const completeOption = (endDatetime: string | null, now: number): LifecycleActionOption => ({
  action: "complete",
  label: "Mark as completed",
  disabledReason: hasEnded(endDatetime, now) ? null : "Available after the event has ended.",
});

// Submit and confirm wait for a loaded readiness result; null means it is
// still loading or could not be loaded.
const readinessReasonFor = (ready: boolean | null) => {
  if (ready === null) return "Available once readiness has loaded.";
  return ready ? null : "Resolve the readiness items first.";
};

// Master v1.1 section 5.2, the coordinator's actions owned by SPM-173.
export function lifecycleActionsFor(
  status: string,
  endDatetime: string | null,
  ready: boolean | null,
  now = Date.now(),
): LifecycleActionOption[] {
  const readinessReason = readinessReasonFor(ready);
  switch (status) {
    case "UNDER_REVIEW":
      return [{ action: "acceptFeasibility", label: "Approve request", disabledReason: null }];
    case "REJECTED":
    case "CANCELLED":
      return [{ action: "acceptFeasibility", label: "Approve request", disabledReason: `This event request is ${status.toLowerCase()} and cannot be approved.` }];
    case "PLANNING":
      return [{ action: "submitForSafetyReview", label: "Submit for safety review", disabledReason: readinessReason }];
    case "SAFETY_REVIEW":
      return [{ action: "confirm", label: "Confirm event", disabledReason: readinessReason }];
    case "CONFIRMED":
      return [
        { action: "startPreparation", label: "Start preparation", disabledReason: null },
        completeOption(endDatetime, now),
      ];
    case "PREPARATION":
      return [completeOption(endDatetime, now)];
    default:
      return [];
  }
}

// Readiness matters while the event is heading for safety review or confirmation.
export const showsReadiness = (status: string) => status === "PLANNING" || status === "SAFETY_REVIEW";

// Whether a failed action may already have been applied, so a retry must reuse
// its Idempotency-Key and be replayed rather than applied again (AC5). The
// backend commits the action before it reloads the event for the response, so
// a network error, timeout, rate limit or server error can follow a committed
// action. Any other 4xx is a definitive refusal and the next attempt gets a new key.
export function keepsIdempotencyKey(error: { status?: number; code?: string } | null | undefined): boolean {
  if (typeof error?.status !== "number") return true;
  if (error.code === "IDEMPOTENCY_IN_PROGRESS") return true;
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
}

export interface LifecycleRefusal {
  message: string;
  failures: ReadinessFailure[];
}

// Refusals the panel explains in its own words; any other refusal shows the
// backend's message (which names the current status for TRANSITION_NOT_ALLOWED).
const REFUSAL_MESSAGES = new Map<string | undefined, string>([
  ["READINESS_BLOCKED", "The event is not ready yet. Resolve these items, then try again."],
  ["SAFETY_APPROVAL_REQUIRED", "The event needs a safety approval for its current arrangements before you can confirm it."],
  ["EVENT_NOT_ENDED", "The event can be completed only after it has ended."],
  ["EVENT_VERSION_CONFLICT", "This event changed after you opened it. Review the latest details, then try again."],
]);

const fallbackMessage = (code?: string) =>
  code === "TRANSITION_NOT_ALLOWED"
    ? "This action is not allowed in the event's current status."
    : "The action could not be completed. Try again.";

// Turns an ApiError-like value (code, message, details) into what the panel shows.
export function describeLifecycleRefusal(error: {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}): LifecycleRefusal {
  const failures = Array.isArray(error.details?.failures) ? (error.details.failures as ReadinessFailure[]) : [];
  const message = REFUSAL_MESSAGES.get(error.code) ?? (error.message || fallbackMessage(error.code));
  return { message, failures };
}
