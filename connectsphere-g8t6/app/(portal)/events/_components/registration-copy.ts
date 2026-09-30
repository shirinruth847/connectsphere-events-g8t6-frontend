import type { AttendeeRegistrationSummary } from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import type { ButtonVariant } from "@/components/shared/Button";
import type { IconName } from "@/components/shared/Icon";

interface RegistrationNote {
  icon: IconName | null;
  text: string;
  className: string;
}

/** One-line explanation of what the attendee can do next. Presentation only. */
export function getRegistrationNote(registration: AttendeeRegistrationSummary): RegistrationNote {
  const opensAt = registration.registration_open_at;
  const closesAt = registration.registration_close_at;

  switch (registration.availability) {
    case "OPEN":
      return {
        icon: "verified",
        text: closesAt ? `Registration closes ${formatDate(closesAt)}` : "Registration is open",
        className: "text-success",
      };
    case "FULL":
      return {
        icon: "hourglass-top",
        text: "Places are offered to the waiting list in the order people joined",
        className: "text-on-surface-variant",
      };
    case "NOT_YET_OPEN":
      return {
        icon: "schedule",
        text: opensAt ? `Registration opens ${formatDate(opensAt)}` : "Registration opens soon",
        className: "text-primary",
      };
    case "CLOSED":
      return {
        icon: "lock",
        text: closesAt ? `Registration closed ${formatDate(closesAt)}` : "Registration has closed",
        className: "text-on-surface-variant",
      };
    case "NOT_ENABLED":
      return {
        icon: "lock",
        text: "Attendee registration isn't offered for this event",
        className: "text-on-surface-variant",
      };
  }
}

interface RegistrationAction {
  label: string;
  variant: ButtonVariant;
  icon: IconName;
  iconPosition: "start" | "end";
}

/** The registration call to action, or null when the event offers none (SPM-34 AC4). */
export function getRegistrationAction(
  registration: AttendeeRegistrationSummary,
): RegistrationAction | null {
  if (registration.availability === "OPEN") {
    return { label: "Register Now", variant: "primary", icon: "arrow-forward", iconPosition: "end" };
  }
  if (registration.availability === "FULL") {
    return { label: "Join Waiting List", variant: "tertiary", icon: "hourglass-bottom", iconPosition: "start" };
  }
  return null;
}

export function hasSeatFigures(
  registration: AttendeeRegistrationSummary,
): registration is AttendeeRegistrationSummary & {
  registration_capacity: number;
  allocated_count: number;
} {
  return (
    registration.is_registration_enabled &&
    registration.registration_capacity !== null &&
    registration.allocated_count !== null
  );
}
