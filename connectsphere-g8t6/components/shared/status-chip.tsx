import { StatusChip as SharedStatusChip } from "@/components/shared/primitives";
import { STATUS_PRESENTATION } from "@/lib/events";

export const EVENT_STATUS_CONFIG = {
  DRAFT: { label: "Draft", tone: "neutral", cardTone: "neutral" },
  SUBMITTED: { label: "Submitted", tone: "primary", cardTone: "primary" },
  UNDER_REVIEW: { label: "Under review", tone: "primary", cardTone: "primary" },
  AWAITING_CLARIFICATION: { label: "Awaiting clarification", tone: "error", cardTone: "error" },
  PLANNING: { label: "Planning", tone: "tertiary", cardTone: "tertiary" },
  SAFETY_REVIEW: { label: "Safety review", tone: "error", cardTone: "error" },
  PREPARATION: { label: "Preparation", tone: "tertiary", cardTone: "tertiary" },
  CONFIRMED: { label: "Confirmed", tone: "success", cardTone: "success" },
  COMPLETED: { label: "Completed", tone: "success", cardTone: "success" },
  REJECTED: { label: "Rejected", tone: "muted", cardTone: "muted" },
  CANCELLED: { label: "Cancelled", tone: "muted", cardTone: "muted" },
} as const;

export type ReassignableEventStatus = keyof typeof EVENT_STATUS_CONFIG;

export function isMappedEventStatus(status: string): status is ReassignableEventStatus {
  return Object.prototype.hasOwnProperty.call(EVENT_STATUS_CONFIG, status);
}

export function StatusChip({ status }: { status: string }) {
  const config = isMappedEventStatus(status) ? EVENT_STATUS_CONFIG[status] : null;
  const knownToMain = Object.prototype.hasOwnProperty.call(STATUS_PRESENTATION, status);
  return <SharedStatusChip status={status} label={config?.label ?? (knownToMain ? undefined : status)} />;
}
