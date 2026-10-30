import type { RegistrationAvailability } from "@/lib/api/discovery";
import type { AttendeeRegistration } from "@/lib/api/my-events";

// The one map from the backend's registrationAvailability to its presentation.
// The chip, its dot and the card's top border all read from here. The backend
// decides the state (SPM-134, Master 5.6); nothing here recalculates it.
interface AvailabilityPresentation {
  label: string;
  chip: string;
  dot: string;
  border: string;
}

const AVAILABILITY: Record<RegistrationAvailability, AvailabilityPresentation> = {
  NOT_YET_OPEN: {
    label: "Not Yet Open",
    chip: "bg-primary-fixed text-primary",
    dot: "bg-primary",
    border: "border-t-primary",
  },
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
  // Neutral: it is neither full nor closed, and the reason is not the attendee's concern.
  UNAVAILABLE: {
    label: "Unavailable",
    chip: "bg-surface-container-high text-on-surface-variant",
    dot: "bg-outline",
    border: "border-t-outline-variant",
  },
};

// Returns null for any value the backend adds later, so an unmapped value is
// never guessed into a colour.
export function getAvailabilityPresentation(value: string): AvailabilityPresentation | null {
  return Object.prototype.hasOwnProperty.call(AVAILABILITY, value)
    ? AVAILABILITY[value as keyof typeof AVAILABILITY]
    : null;
}

// Whether the event's registration start and end times are worth showing:
// every state but UNAVAILABLE (whose times may be missing) and unknown values.
export const showsRegistrationWindow = (value: string) =>
  value !== "UNAVAILABLE" && getAvailabilityPresentation(value) !== null;

// What an event surface shows in its registration area (SPM-134): Register
// Now, the attendee's own place, or a disabled state saying why they cannot
// register. Shared by the Event Discovery card, the event details dialog and
// the /events/[eventId] page.
export type RegistrationState =
  | { kind: "register"; label: "Register Now" }
  | { kind: "place" | "unavailable"; label: string };

const DISABLED_LABELS: Record<Exclude<RegistrationAvailability, "OPEN">, string> = {
  NOT_YET_OPEN: "Registration Not Yet Open",
  FULL_WAITLIST: "Registration Full",
  CLOSED: "Registration Closed",
  UNAVAILABLE: "Registration Unavailable",
};

// A held place wins over availability. Register Now needs OPEN and the
// attendee's places loaded with none for this event; while the places are
// unknown (loading or failed) an OPEN event shows nothing, because the
// attendee may already hold a place. Any value the backend adds later is
// shown as unavailable, never as open.
export function getRegistrationState(
  availability: string,
  place: AttendeeRegistration | null,
  placesKnown: boolean,
): RegistrationState | null {
  if (place) return { kind: "place", label: place.status === "WAITLISTED" ? "On the waitlist" : "Registered" };
  if (availability === "OPEN") return placesKnown ? { kind: "register", label: "Register Now" } : null;
  const label = Object.prototype.hasOwnProperty.call(DISABLED_LABELS, availability)
    ? DISABLED_LABELS[availability as keyof typeof DISABLED_LABELS]
    : DISABLED_LABELS.UNAVAILABLE;
  return { kind: "unavailable", label };
}
