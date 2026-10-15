// The one status map for stored event states (Master section 5.2). Colours come
// from the theme tokens in app/globals.css, so a status re-dresses its chip and
// its card's top border together.

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

export type EventStatus = keyof typeof EVENT_STATUS_CONFIG;
export type StatusTone = (typeof EVENT_STATUS_CONFIG)[EventStatus]["tone"] | "unknown";

export function isMappedEventStatus(status: string): status is EventStatus {
  return Object.prototype.hasOwnProperty.call(EVENT_STATUS_CONFIG, status);
}

const TONE_CLASSES: Record<StatusTone, { chip: string; border: string }> = {
  neutral: { chip: "bg-surface-container-high text-on-surface-variant", border: "border-t-on-surface-variant" },
  primary: { chip: "bg-primary-fixed text-primary", border: "border-t-primary" },
  error: { chip: "bg-error-container text-on-error-container", border: "border-t-error" },
  tertiary: { chip: "bg-tertiary-fixed text-tertiary", border: "border-t-tertiary-container" },
  success: { chip: "bg-success-container text-success", border: "border-t-success" },
  muted: { chip: "bg-surface-container-high text-error", border: "border-t-outline-variant" },
  // A value the lifecycle does not define (e.g. APPROVED in the live enum):
  // shown as its raw code on a neutral chip rather than guessed into a colour.
  unknown: { chip: "bg-surface-container-high text-on-surface-variant outline-1 outline-dashed outline-outline-variant", border: "border-t-outline-variant" },
};

export function getStatusPresentation(status: string) {
  const known = isMappedEventStatus(status);
  const tone: StatusTone = known ? EVENT_STATUS_CONFIG[status].tone : "unknown";
  return {
    known,
    label: known ? EVENT_STATUS_CONFIG[status].label : status,
    tone,
    ...TONE_CLASSES[tone],
  };
}

// `label` overrides the stored-state label, e.g. with the organiser-facing
// label the backend computes (Master section 3.5).
export function StatusChip({ status, label }: { status: string; label?: string }) {
  const presentation = getStatusPresentation(status);
  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center rounded-tag px-2 py-0.5 text-[11px] font-semibold uppercase leading-5 tracking-[0.05em] ${presentation.chip}`}
      title={presentation.known ? undefined : `Status "${status}" is not part of the ConnectSphere lifecycle`}
    >
      {label || presentation.label}
    </span>
  );
}
