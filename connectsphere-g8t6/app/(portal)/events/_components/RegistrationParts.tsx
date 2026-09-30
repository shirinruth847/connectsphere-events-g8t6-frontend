import type { ComponentProps } from "react";
import type { AttendeeRegistrationSummary } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { Button } from "@/components/shared/Button";
import { CapacityBar } from "@/components/shared/CapacityBar";
import { Icon } from "@/components/shared/Icon";
import { getRegistrationAction, getRegistrationNote, hasSeatFigures } from "./registration-copy";

export function RegistrationNote({ registration }: { registration: AttendeeRegistrationSummary }) {
  const note = getRegistrationNote(registration);
  return (
    <p className="flex items-center gap-2 text-body-sm text-on-surface-variant">
      {note.icon ? <Icon name={note.icon} className={note.className} /> : null}
      {note.text}
    </p>
  );
}

export function RegistrationCapacity({ registration }: { registration: AttendeeRegistrationSummary }) {
  if (!hasSeatFigures(registration)) return null;
  const queue =
    registration.availability === "FULL" && registration.waitlist_count !== null
      ? `Queue: ${registration.waitlist_count} on Waitlist`
      : undefined;
  return (
    <CapacityBar
      filled={registration.allocated_count}
      total={registration.registration_capacity}
      aside={queue}
    />
  );
}

interface RegistrationButtonProps extends Omit<ComponentProps<"button">, "children"> {
  registration: AttendeeRegistrationSummary;
  /** Visually hidden context so repeated buttons stay distinguishable. */
  eventTitle: string;
}

export function RegistrationButton({
  registration,
  eventTitle,
  className,
  ...props
}: RegistrationButtonProps) {
  const action = getRegistrationAction(registration);
  if (!action) return null;
  const icon = <Icon name={action.icon} />;
  return (
    <Button variant={action.variant} size="sm" className={cn("px-5", className)} {...props}>
      {action.iconPosition === "start" ? icon : null}
      {action.label}
      <span className="sr-only"> for {eventTitle}</span>
      {action.iconPosition === "end" ? icon : null}
    </Button>
  );
}
