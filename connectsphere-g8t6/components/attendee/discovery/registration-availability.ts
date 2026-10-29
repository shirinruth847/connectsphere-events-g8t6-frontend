import type { AttendeeEventDetail, RegistrationAvailability } from "@/lib/api/discovery";

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

// True only for the mapped values (OPEN, FULL_WAITLIST, CLOSED), so NOT_ENABLED
// and any unknown value show no registration wording.
export const isRegistrationEnabled = (value: string) => getAvailabilityPresentation(value) !== null;

export interface RegistrationAction {
  // register is direct registration (SPM-134); waitlist and notify have no
  // backend endpoints yet, so callers render them as unavailable with the note.
  kind: "register" | "waitlist" | "notify";
  label: string;
  // A shared Button variant.
  variant: "primary" | "secondary";
  // Why an unavailable action cannot be used; absent for register.
  unavailableNote?: string;
}

export const WAITLIST_UNAVAILABLE_NOTE = "Joining the waitlist isn't available in ConnectSphere yet.";
export const NOTIFY_UNAVAILABLE_NOTE = "Registration reminders aren't available in ConnectSphere yet.";

// The one action the event details offer for each availability. Only OPEN
// offers direct registration; whether the attendee already holds a place is
// decided by the caller from their registrations, not from availability.
export function getRegistrationAction(
  event: Pick<AttendeeEventDetail, "registrationAvailability" | "registrationOpenAt">,
  now: Date = new Date(),
): RegistrationAction | null {
  switch (event.registrationAvailability) {
    case "OPEN":
      return { kind: "register", label: "Register Now", variant: "primary" };
    case "FULL_WAITLIST":
      return { kind: "waitlist", label: "Join Waitlist", variant: "primary", unavailableNote: WAITLIST_UNAVAILABLE_NOTE };
    case "CLOSED": {
      // Closed because the window has not opened yet, as opposed to having ended.
      // This compares against the browser clock, which can be wrong. That is
      // acceptable because it only picks the wording of a disabled button: no
      // request depends on it, and the backend decides availability itself.
      const opensAt = event.registrationOpenAt ? new Date(event.registrationOpenAt).getTime() : Number.NaN;
      return opensAt > now.getTime()
        ? { kind: "notify", label: "Notify when registration opens", variant: "secondary", unavailableNote: NOTIFY_UNAVAILABLE_NOTE }
        : null;
    }
    default:
      // NOT_ENABLED, or a value the backend adds later: no action.
      return null;
  }
}
