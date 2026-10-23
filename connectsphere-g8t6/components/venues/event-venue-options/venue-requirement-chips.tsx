import { Icon } from "@/components/shared/icon";
import type { RequirementStatus, VenueOptionAvailability, VenueRequirement } from "@/lib/api/event-venues";

// Met requirements are light green; unmet and not-checked ones light grey
// (SPM-72 AC5). The words always say which, so colour is never the only cue.
const REQUIREMENT_STYLES: Record<RequirementStatus, string> = {
  MET: "border-[#86EFAC] bg-[#DCFCE7] text-[#166534]",
  UNMET: "border-outline-variant bg-surface-container-low text-on-surface-variant",
  NOT_CHECKED: "border-outline-variant bg-surface-container-low text-on-surface-variant",
};
const STATUS_WORDS: Record<RequirementStatus, string> = { MET: "Met", UNMET: "Not met", NOT_CHECKED: "Not checked" };

export function RequirementChip({ requirement }: { requirement: VenueRequirement }) {
  const met = requirement.status === "MET";
  return (
    <li
      className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-chip border px-2 py-1 text-xs font-medium ${REQUIREMENT_STYLES[requirement.status]}`}
      title={requirement.detail}
    >
      <Icon name={met ? "check" : requirement.status === "NOT_CHECKED" ? "info" : "close"} size={16} />
      <span className="truncate">{requirement.label}: {requirement.detail}</span>
      <span className="sr-only">({STATUS_WORDS[requirement.status]})</span>
    </li>
  );
}

export function RequirementRow({ requirement }: { requirement: VenueRequirement }) {
  return (
    <li className={`flex items-start justify-between gap-3 rounded-control border px-3 py-2 text-sm ${REQUIREMENT_STYLES[requirement.status]}`}>
      <span className="min-w-0">
        <span className="font-semibold">{requirement.label}</span>
        <span className="block [overflow-wrap:anywhere]">{requirement.detail}</span>
      </span>
      <span className="shrink-0 text-xs font-semibold uppercase tracking-label">{STATUS_WORDS[requirement.status]}</span>
    </li>
  );
}

// Labels come from the backend; only AVAILABLE is green, so a venue whose
// availability could not be checked never looks free.
const AVAILABILITY_STYLES: Record<string, string> = {
  AVAILABLE: "bg-[#DCFCE7] text-[#166534]",
  AVAILABLE_WITH_WARNING: "bg-[#FEF3C7] text-[#92400E]",
  NOT_CHECKED: "bg-surface-container-high text-on-surface-variant",
  NOT_BOOKABLE: "bg-surface-container-high text-on-surface-variant",
};

export function AvailabilityChip({ availability }: { availability: VenueOptionAvailability }) {
  return (
    <span className={`inline-flex rounded-chip px-2 py-1 text-[11px] font-semibold uppercase tracking-label ${AVAILABILITY_STYLES[availability.status] ?? "bg-[#FEE2E2] text-[#991B1B]"}`}>
      {availability.label}
    </span>
  );
}
