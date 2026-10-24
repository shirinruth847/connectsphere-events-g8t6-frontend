import { Icon } from "@/components/shared/icon";
import type { RequirementStatus, VenueOptionAvailability, VenueRequirement } from "@/lib/api/event-venues";

// Met requirements are light green; unmet and not-checked ones light grey
// (SPM-72 AC5). The words always say which, so colour is never the only cue.
const REQUIREMENT_STYLES: Record<RequirementStatus, string> = {
  MET: "border-[#86EFAC] bg-[#DCFCE7] text-[#166534]",
  UNMET: "border-outline-variant bg-surface-container-low text-on-surface-variant",
  NOT_CHECKED: "border-outline-variant bg-surface-container-low text-on-surface-variant",
};
// Availability says itself why it is unchecked ("Error checking availability",
// "Enter the event date"); the detail-based requirements read "Error loading
// details" when the detail service is down (SPM-72 AC11).
export const requirementStatusWord = (requirement: VenueRequirement) => {
  if (requirement.status === "MET") return "Met";
  if (requirement.status === "UNMET") return "Not met";
  return requirement.key === "availability" ? "Not checked" : "Error loading details";
};
// Short chip text so a card stays compact: "Capacity" and "Availability"
// say themselves; a layout, accessibility or facility shows the need itself.
// The full "label: detail (status)" is the tooltip and what screen readers hear.
const chipText = (requirement: VenueRequirement) => {
  if (requirement.status === "NOT_CHECKED") {
    return requirement.key === "availability" ? requirement.detail : `${requirement.label}: ${requirementStatusWord(requirement)}`;
  }
  return requirement.key === "capacity" || requirement.key === "availability" ? requirement.label : requirement.detail;
};

// text replaces the chip's short wording, e.g. "Capacity 300".
export function RequirementChip({ requirement, text }: { requirement: VenueRequirement; text?: string }) {
  const met = requirement.status === "MET";
  const full = `${requirement.label}: ${requirement.detail} (${requirementStatusWord(requirement)})`;
  return (
    <li
      className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-chip border px-1.5 py-0.5 text-[11px] font-medium ${REQUIREMENT_STYLES[requirement.status]}`}
      title={full}
    >
      <Icon name={met ? "check" : requirement.status === "NOT_CHECKED" ? "info" : "close"} size={16} />
      <span aria-hidden="true" className="truncate">{text ?? chipText(requirement)}</span>
      <span className="sr-only">{full}</span>
    </li>
  );
}

// venueValue is what the venue has for this need, e.g. its layouts, so the
// details need no separate rows for them.
export function RequirementRow({ requirement, venueValue }: { requirement: VenueRequirement; venueValue?: string }) {
  return (
    <li className={`flex items-start justify-between gap-3 rounded-control border px-3 py-1.5 text-sm ${REQUIREMENT_STYLES[requirement.status]}`}>
      <span className="min-w-0">
        <span className="font-semibold">{requirement.label}</span>
        <span className="block [overflow-wrap:anywhere]">{requirement.detail}</span>
        {venueValue ? <span className="block text-xs [overflow-wrap:anywhere]">Venue has: {venueValue}</span> : null}
      </span>
      <span className="shrink-0 text-xs font-semibold uppercase tracking-label">{requirementStatusWord(requirement)}</span>
    </li>
  );
}

// Labels come from the backend; only AVAILABLE is green, so a venue whose
// availability could not be checked never looks free.
const AVAILABILITY_STYLES: Record<string, string> = {
  AVAILABLE: "bg-[#DCFCE7] text-[#166534]",
  AVAILABLE_WITH_WARNING: "bg-[#FEF3C7] text-[#92400E]",
  NOT_CHECKED: "bg-surface-container-high text-on-surface-variant",
  NO_DATES: "bg-surface-container-high text-on-surface-variant",
  NOT_BOOKABLE: "bg-surface-container-high text-on-surface-variant",
};

export function AvailabilityChip({ availability }: { availability: VenueOptionAvailability }) {
  return (
    <span className={`inline-flex rounded-chip px-2 py-1 text-[11px] font-semibold uppercase tracking-label ${AVAILABILITY_STYLES[availability.status] ?? "bg-[#FEE2E2] text-[#991B1B]"}`}>
      {availability.label}
    </span>
  );
}
