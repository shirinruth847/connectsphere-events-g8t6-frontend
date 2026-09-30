import type { IconName } from "@/components/shared/Icon";

/**
 * The single source of status presentation. Chips, card top borders and timeline blocks
 * all read from here, so a status never gets re-colored per screen.
 * Codes follow ConnectSphere-Master.md; add a code here before rendering it anywhere.
 */
export type StatusTone = "neutral" | "primary" | "tertiary" | "success" | "error";

export interface StatusPresentation {
  label: string;
  tone: StatusTone;
  /** Replaces the tone dot, e.g. a lock for read-only states. */
  icon?: IconName;
}

export const TONE_STYLES: Record<
  StatusTone,
  { chip: string; dot: string; border: string }
> = {
  neutral: {
    chip: "bg-surface-container-high text-on-surface-variant",
    dot: "bg-on-surface-variant",
    border: "border-t-on-surface-variant",
  },
  primary: {
    chip: "bg-primary-fixed text-primary",
    dot: "bg-primary",
    border: "border-t-primary",
  },
  tertiary: {
    chip: "bg-tertiary-fixed text-tertiary",
    dot: "bg-tertiary",
    border: "border-t-tertiary-container",
  },
  success: {
    chip: "bg-success-container/60 text-success",
    dot: "bg-success",
    border: "border-t-success",
  },
  error: {
    chip: "bg-error-container text-on-error-container",
    dot: "bg-error",
    border: "border-t-error",
  },
};

export const STATUS_CONFIG = {
  // Event lifecycle (master §5.2). There is deliberately no APPROVED state.
  event: {
    DRAFT: { label: "Draft", tone: "neutral" },
    SUBMITTED: { label: "Submitted", tone: "primary" },
    UNDER_REVIEW: { label: "Under Review", tone: "primary" },
    AWAITING_CLARIFICATION: { label: "Clarification Needed", tone: "error" },
    PLANNING: { label: "Planning", tone: "tertiary" },
    CONFIRMED: { label: "Confirmed", tone: "success" },
    COMPLETED: { label: "Completed", tone: "success" },
    REJECTED: { label: "Rejected", tone: "error" },
    CANCELLED: { label: "Cancelled", tone: "error" },
  },
  // A person's own registration record (master §5.6).
  registration: {
    REGISTERED: { label: "Registered", tone: "success" },
    WAITLISTED: { label: "Waitlisted", tone: "tertiary" },
    INVITED: { label: "Place Offered", tone: "tertiary" },
    WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
    CANCELLED: { label: "Cancelled", tone: "neutral" },
  },
  // Attendee-facing availability of a published event, as decided by the backend.
  registrationAvailability: {
    OPEN: { label: "Registration Open", tone: "success" },
    FULL: { label: "Capacity Reached — Waitlist Open", tone: "error" },
    NOT_YET_OPEN: { label: "Registration Opens Soon", tone: "primary" },
    CLOSED: { label: "Registration Closed", tone: "neutral" },
    NOT_ENABLED: { label: "View Only", tone: "neutral", icon: "lock" },
  },
} satisfies Record<string, Record<string, StatusPresentation>>;

export type StatusDomain = keyof typeof STATUS_CONFIG;
export type StatusCode<D extends StatusDomain> = keyof (typeof STATUS_CONFIG)[D];

export function getStatusPresentation<D extends StatusDomain>(
  domain: D,
  status: StatusCode<D>,
): StatusPresentation {
  return STATUS_CONFIG[domain][status] as StatusPresentation;
}
