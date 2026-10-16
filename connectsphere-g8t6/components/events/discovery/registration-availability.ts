import type { RegistrationAvailability } from "@/lib/api/discovery";

// The one map from the backend's registrationAvailability to its presentation.
// The chip, its dot and the card's top border all read from here.
// NOT_ENABLED has no entry: an event without attendee registration shows no
// chip and no registration wording at all (SPM-34 AC4).
interface AvailabilityPresentation {
  label: string;
  chip: string;
  dot: string;
  border: string;
}

const AVAILABILITY: Record<Exclude<RegistrationAvailability, "NOT_ENABLED">, AvailabilityPresentation> = {
  OPEN: {
    label: "Registration Open",
    chip: "bg-success/10 text-success",
    dot: "bg-success",
    border: "border-t-success",
  },
  FULL_WAITLIST: {
    label: "Full - Waitlist",
    chip: "bg-tertiary-container/15 text-tertiary",
    dot: "bg-tertiary",
    border: "border-t-tertiary-container",
  },
  CLOSED: {
    label: "Registration Closed",
    chip: "bg-surface-container-high text-on-surface-variant",
    dot: "bg-on-surface-variant",
    border: "border-t-on-surface-variant",
  },
};

// Returns null for NOT_ENABLED and for any value the backend adds later, so an
// unmapped value is never guessed into a colour.
export function getAvailabilityPresentation(value: string): AvailabilityPresentation | null {
  return Object.prototype.hasOwnProperty.call(AVAILABILITY, value)
    ? AVAILABILITY[value as keyof typeof AVAILABILITY]
    : null;
}

export const isRegistrationEnabled = (value: string) => value !== "NOT_ENABLED";
