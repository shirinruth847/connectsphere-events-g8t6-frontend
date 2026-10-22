"use client";

import { useEffect, useEffectEvent, useId, useRef } from "react";
import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import type { AttendeeEventDetail, AttendeeEventSummary } from "@/lib/api/discovery";
import { DiscoveryIcon } from "./discovery-icon";
import { discoveryErrorMessage } from "./discovery-state";
import { EventDetailsBody, RegistrationActionFooter } from "./event-details-content";
import { RegistrationAvailabilityChip } from "./registration-availability-chip";
import { useDiscoveryEvent } from "./use-discovery-event";

interface EventDetailsDialogProps {
  // The list row that was opened; null when the dialog is closed.
  event: AttendeeEventSummary | null;
  onClose: () => void;
  // Runs after the dialog has closed, to put focus back where it belongs.
  onClosed: () => void;
  onLoaded: (event: AttendeeEventDetail) => void;
  onNotFound: (eventId: number) => void;
}

// Attendee-facing event details in a native <dialog>: showModal() traps focus
// and makes the page inert, Escape closes it, and focus is restored on close.
export function EventDetailsDialog({ event, onClose, onClosed, onLoaded, onNotFound }: EventDetailsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = event !== null;
  const handleClosed = useEffectEvent(onClosed);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) {
      dialog.close();
      handleClosed();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(cancelEvent) => {
        cancelEvent.preventDefault();
        onClose();
      }}
      // A click on the dialog element itself is a click on its backdrop.
      onClick={(clickEvent) => {
        if (clickEvent.target === clickEvent.currentTarget) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(640px,calc(100vw-32px))] rounded-panel bg-surface-container-lowest p-0 text-on-surface shadow-elevation-1 backdrop:bg-on-surface/40 backdrop:backdrop-blur-sm open:flex open:flex-col"
    >
      {event ? (
        <EventDetailsContent
          key={event.eventId}
          summary={event}
          titleId={titleId}
          onClose={onClose}
          onLoaded={onLoaded}
          onNotFound={onNotFound}
        />
      ) : null}
    </dialog>
  );
}

function EventDetailsContent({
  summary,
  titleId,
  onClose,
  onLoaded,
  onNotFound,
}: {
  summary: AttendeeEventSummary;
  titleId: string;
  onClose: () => void;
  onLoaded: (event: AttendeeEventDetail) => void;
  onNotFound: (eventId: number) => void;
}) {
  const { state, retry } = useDiscoveryEvent(summary.eventId, { onLoaded, onNotFound });
  const shown = state.status === "ready" ? state.event : summary;
  // After a 404 the event is no longer attendee-visible, so nothing from the
  // list row is shown in its place (SPM-44).
  const hidden = state.status === "not-found";

  return (
    <>
      <header className="flex items-start justify-between gap-4 border-b border-outline-variant/60 px-5 py-4">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-label text-tertiary">Event details</span>
          <h2 id={titleId} className="text-xl font-bold leading-7 tracking-[-0.025em] text-on-surface [overflow-wrap:anywhere]">
            {hidden ? "Event unavailable" : shown.title}
          </h2>
          {!hidden ? <RegistrationAvailabilityChip value={shown.registrationAvailability} /> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <DiscoveryIcon name="close" size={20} label="Close event details" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" aria-busy={state.status === "loading"}>
        {state.status === "loading" ? (
          <div className="space-y-3" role="status" aria-label="Loading the latest event details">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-36 w-full" />
          </div>
        ) : null}

        {state.status === "not-found" ? (
          <AlertBanner tone="warning" title="This event is no longer available">
            It may have been unpublished or rescheduled. It has been removed from your list.
          </AlertBanner>
        ) : null}

        {state.status === "error" && state.error.status === 401 ? (
          // apiRequest reports the 401 to AuthGate, which sends the attendee to sign in.
          <AlertBanner tone="info" title="Your session has ended">Taking you to sign in…</AlertBanner>
        ) : null}

        {state.status === "error" && state.error.status === 403 ? (
          <AlertBanner tone="error" title="Attendee access required">
            Event details are available to attendee accounts only.
          </AlertBanner>
        ) : null}

        {state.status === "error" && state.error.status !== 401 && state.error.status !== 403 ? (
          <AlertBanner tone="error" title="Could not load the event details">
            {discoveryErrorMessage(state.error, "event details")}
            <div className="mt-3">
              <Button variant="danger" onClick={retry} className="max-lg:min-h-11">
                Try again
              </Button>
            </div>
          </AlertBanner>
        ) : null}

        {state.status === "ready" ? <EventDetailsBody event={state.event} /> : null}
      </div>

      {state.status === "ready" ? (
        <RegistrationActionFooter event={state.event} className="border-t border-outline-variant/60 px-5 py-4" />
      ) : null}
    </>
  );
}
