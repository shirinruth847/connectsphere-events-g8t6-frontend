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

// Master v1.1 section 5.2, the coordinator's actions owned by SPM-173.
export function lifecycleActionsFor(
  status: string,
  endDatetime: string | null,
  ready: boolean | null,
  now = Date.now(),
): LifecycleActionOption[] {
  const readinessReason = ready === false ? "Resolve the readiness items first." : null;
  switch (status) {
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

export interface LifecycleRefusal {
  message: string;
  failures: ReadinessFailure[];
}

// Turns an ApiError-like value (code, message, details) into what the panel shows.
export function describeLifecycleRefusal(error: {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}): LifecycleRefusal {
  const failures = Array.isArray(error.details?.failures) ? (error.details.failures as ReadinessFailure[]) : [];
  switch (error.code) {
    case "READINESS_BLOCKED":
      return { message: "The event is not ready yet. Resolve these items, then try again.", failures };
    case "SAFETY_APPROVAL_REQUIRED":
      return { message: "The event needs a safety approval for its current arrangements before you can confirm it.", failures };
    case "EVENT_NOT_ENDED":
      return { message: "The event can be completed only after it has ended.", failures };
    case "EVENT_VERSION_CONFLICT":
      return { message: "This event changed after you opened it. Review the latest details, then try again.", failures };
    case "TRANSITION_NOT_ALLOWED":
      return { message: error.message || "This action is not allowed in the event's current status.", failures };
    default:
      return { message: error.message || "The action could not be completed. Try again.", failures };
  }
}
