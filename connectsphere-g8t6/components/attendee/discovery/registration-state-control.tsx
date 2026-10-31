"use client";

import { useId } from "react";
import { Button } from "@/components/shared/primitives";
import type { RegistrationState } from "./registration-availability";

// The registration area's control (SPM-134), the same on the Event Discovery
// card, the event details dialog and the /events/[eventId] page. Register Now
// opens the shared registration form; every other state is a visible control
// that does nothing. aria-disabled rather than disabled keeps it reachable by
// keyboard and screen readers, and the shared Button's disabled: style only
// matches the attribute, so the same classes go through aria-disabled:.
export function RegistrationStateControl({
  state,
  eventTitle,
  onRegister,
  note,
}: {
  state: RegistrationState;
  eventTitle: string;
  onRegister: (trigger: HTMLButtonElement) => void;
  // Shown beside a disabled state, such as when registration opens.
  note?: string | null;
}) {
  const noteId = useId();

  if (state.kind === "register") {
    return (
      <Button
        type="button"
        aria-label={`Register now for ${eventTitle}`}
        onClick={(clickEvent) => onRegister(clickEvent.currentTarget)}
        className="w-full max-lg:min-h-11 sm:w-auto"
      >
        {state.label}
      </Button>
    );
  }

  return (
    <>
      {note ? (
        <p id={noteId} className="text-xs text-on-surface-variant sm:order-first sm:mr-auto">
          {note}
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        aria-disabled="true"
        aria-label={`${state.label} for ${eventTitle}`}
        aria-describedby={note ? noteId : undefined}
        className="w-full aria-disabled:pointer-events-none aria-disabled:opacity-55 max-lg:min-h-11 sm:w-auto"
      >
        {state.label}
      </Button>
    </>
  );
}
