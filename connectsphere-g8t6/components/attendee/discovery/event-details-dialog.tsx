"use client";

import { useEffect, useEffectEvent, useId, useRef } from "react";
import {
  AttendeeStatusChip,
  EventDetailsFooter,
  HeroChip,
  MyPlaceCard,
  MyPlaceChip,
  SectionLabel,
  LastConfirmedNotice,
  WithheldNotice,
  placeRows,
  scheduleRows,
} from "@/components/attendee/event-details/event-details-parts";
import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import type {
  AttendeeEventDetail,
  AttendeeEventSummary,
} from "@/lib/api/discovery";
import {
  DiscoveryDetailsPanel,
  type DiscoveryDetailRow,
} from "./discovery-details-panel";
import { DiscoveryIcon } from "./discovery-icon";
import { LOCATION_PENDING_LABEL } from "./event-discovery-card";
import {
  formatEventDate,
  formatEventTime,
  formatTimestamp,
} from "./format-event-time";
import {
  getRegistrationAction,
  isRegistrationEnabled,
} from "./registration-availability";
import { RegistrationAvailabilityChip } from "./registration-availability-chip";
import {
  useAttendeeEvent,
  type EventDetailsSource,
} from "@/components/attendee/event-details/use-attendee-event";

export { REGISTRATION_UNAVAILABLE_NOTE } from "@/components/attendee/event-details/event-details-parts";

// What opens the dialog: a discovery row, or just an ID and title from My Events.
export type EventDetailsTarget = Pick<
  AttendeeEventSummary,
  "eventId" | "title"
> &
  Partial<Pick<AttendeeEventSummary, "registrationAvailability">>;

interface EventDetailsDialogProps {
  // The event that was opened; null when the dialog is closed.
  event: EventDetailsTarget | null;
  // Where the dialog lives, which decides the endpoint it reads.
  detailsFrom: EventDetailsSource;
  onClose: () => void;
  // Runs after the dialog has closed, to put focus back where it belongs.
  onClosed: () => void;
  onLoaded?: (event: AttendeeEventView) => void;
  onNotFound?: (eventId: number) => void;
  // Explains a 404 in the opener's terms.
  notFoundDescription?: string;
}

const DISCOVERY_NOT_FOUND =
  "It may have been unpublished or rescheduled. It has been removed from your list.";

// The event summary shared by Event Discovery (SPM-34) and My Events (SPM-155),
// laid out from the event details frame (282:1271). A native <dialog>:
// showModal() traps focus and makes the page inert, Escape closes it, and
// focus is restored on close.
export function EventDetailsDialog({
  event,
  detailsFrom,
  onClose,
  onClosed,
  onLoaded,
  onNotFound,
  notFoundDescription = DISCOVERY_NOT_FOUND,
}: EventDetailsDialogProps) {
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
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(896px,calc(100vw-32px))] overflow-hidden rounded-panel border-t-4 border-t-primary bg-surface-container-lowest p-0 text-on-surface shadow-elevation-4 backdrop:bg-on-surface/40 backdrop:backdrop-blur-sm open:flex open:flex-col"
    >
      {event ? (
        <EventDetailsContent
          key={event.eventId}
          summary={event}
          titleId={titleId}
          detailsFrom={detailsFrom}
          onClose={onClose}
          onLoaded={onLoaded}
          onNotFound={onNotFound}
          notFoundDescription={notFoundDescription}
        />
      ) : null}
    </dialog>
  );
}

function EventDetailsContent({
  summary,
  titleId,
  detailsFrom,
  onClose,
  onLoaded,
  onNotFound,
  notFoundDescription,
}: {
  summary: EventDetailsTarget;
  titleId: string;
  detailsFrom: EventDetailsSource;
  onClose: () => void;
  onLoaded?: (event: AttendeeEventView) => void;
  onNotFound?: (eventId: number) => void;
  notFoundDescription: string;
}) {
  const { state, retry } = useDiscoveryEvent(summary.eventId, {
    onLoaded,
    onNotFound,
  });
  const shown = state.status === "ready" ? state.event : summary;

  return (
    <>
      <header className="flex items-start justify-between gap-4 border-b border-outline-variant/60 px-5 py-4">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-label text-tertiary">
            Event details
          </span>
          <h2
            id={titleId}
            className="text-xl font-bold leading-7 tracking-[-0.025em] text-on-surface [overflow-wrap:anywhere]"
          >
            {shown.title}
          </h2>
          {state.status !== "not-found" ? (
            <RegistrationAvailabilityChip
              value={shown.registrationAvailability}
            />
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {event && !withheld && event.startDatetime ? (
            <span className="hidden items-center gap-1 text-xs text-on-surface-variant sm:inline-flex">
              <DiscoveryIcon name="schedule" />
              {formatEventTime(event.startDatetime, event.endDatetime)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-control text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <DiscoveryIcon name="close" size={20} label="Close event details" />
          </button>
        </div>
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto bg-surface px-4 py-5 sm:px-8 sm:py-6"
        aria-busy={state.status === "loading"}
      >
        {/* The frame's photo banner; without event imagery it uses the lavender fallback. */}
        <section className="flex min-h-40 flex-col justify-end gap-3 rounded-panel bg-gradient-to-br from-primary-fixed to-tertiary-fixed p-5 sm:p-6">
          <span className="text-[11px] font-bold uppercase tracking-label text-primary">
            Event details
          </span>
          <h2
            id={titleId}
            className="text-2xl font-bold leading-tight tracking-[-0.025em] text-on-surface [overflow-wrap:anywhere] sm:text-[28px]"
          >
            {event?.title ?? summary.title}
          </h2>
          {event && !withheld ? (
            <div className="flex flex-wrap gap-2">
              <HeroChip icon="calendar">
                {formatEventDate(event.startDatetime, event.endDatetime)}
              </HeroChip>
              <HeroChip icon="venue">
                {event.location ?? LOCATION_PENDING_LABEL}
              </HeroChip>
            </div>
          ) : null}
        </section>

        {state.status === "loading" ? (
          <div
            className="space-y-3"
            role="status"
            aria-label="Loading the latest event details"
          >
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-36 w-full" />
          </div>
        ) : null}

        {state.status === "not-found" ? (
          <AlertBanner tone="warning" title="This event is no longer available">
            {notFoundDescription}
          </AlertBanner>
        ) : null}

        {state.status === "error" && state.error.status === 401 ? (
          // apiRequest reports the 401 to AuthGate, which sends the attendee to sign in.
          <AlertBanner tone="info" title="Your session has ended">
            Taking you to sign in…
          </AlertBanner>
        ) : null}

        {state.status === "error" && state.error.status === 403 ? (
          <AlertBanner tone="error" title="Attendee access required">
            Event details are available to attendee accounts only.
          </AlertBanner>
        ) : null}

        {state.status === "error" &&
        state.error.status !== 401 &&
        state.error.status !== 403 ? (
          <AlertBanner tone="error" title="Could not load the event details">
            {discoveryErrorMessage(state.error, "event details")}
            <div className="mt-3">
              <Button
                variant="danger"
                onClick={retry}
                className="max-lg:min-h-11"
              >
                Try again
              </Button>
            </div>
          </AlertBanner>
        ) : null}

        {event && withheld ? (
          <WithheldNotice attendeeStatus={event.attendeeStatus} />
        ) : null}
        {event && !withheld && event.lastConfirmedAt ? (
          <LastConfirmedNotice
            attendeeStatus={event.attendeeStatus}
            lastConfirmedAt={event.lastConfirmedAt}
          />
        ) : null}
        {myRegistration ? <MyPlaceCard registration={myRegistration} /> : null}
        {event && !withheld ? <EventSummaryBody event={event} /> : null}
      </div>

      {state.status === "ready" ? (
        <RegistrationActionFooter event={state.event} />
      ) : null}
    </>
  );
}

// Read out as the disabled action's description. It explains why the action
// is unavailable without contradicting the availability chip.
export const REGISTRATION_UNAVAILABLE_NOTE =
  "Online sign-up isn't available in ConnectSphere yet.";

// Shows the one registration action for this event, as unavailable: there are
// no register, waitlist or notify endpoints yet (separate ticket). It uses
// aria-disabled rather than disabled so keyboard and screen-reader users can
// still reach it and hear why it is unavailable. It has no click handler.
// The shared Button's disabled: style only matches the disabled attribute, so
// the same classes are applied through aria-disabled: instead.
function RegistrationActionFooter({ event }: { event: AttendeeEventDetail }) {
  const helperId = useId();
  const action = getRegistrationAction(event);
  if (!action) return null;

  return (
    <footer className="flex flex-col gap-2 border-t border-outline-variant/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
      <p
        id={helperId}
        className="text-xs text-on-surface-variant sm:order-first"
      >
        {REGISTRATION_UNAVAILABLE_NOTE}
      </p>
      <Button
        type="button"
        variant={action.variant}
        aria-disabled="true"
        aria-describedby={helperId}
        className="w-full aria-disabled:pointer-events-none aria-disabled:opacity-55 max-lg:min-h-11 sm:w-auto"
      >
        {action.label}
      </Button>
    </footer>
  );
}

function EventDetailsBody({ event }: { event: AttendeeEventDetail }) {
  const rows: DiscoveryDetailRow[] = [
    {
      label: "Date",
      icon: "calendar",
      value: formatEventDate(event.startDatetime, event.endDatetime),
    },
    {
      label: "Time",
      icon: "schedule",
      value: formatEventTime(event.startDatetime, event.endDatetime),
    },
    {
      label: "Location",
      icon: "venue",
      value: event.location ?? LOCATION_PENDING_LABEL,
    },
  ];
  if (event.organisationName) {
    rows.push({
      label: "Organised by",
      icon: "organisation",
      value: event.organisationName,
    });
  }
  // Events without attendee registration carry no registration wording (AC4).
  if (isRegistrationEnabled(event.registrationAvailability)) {
    rows.push(
      {
        label: "Registration opens",
        icon: "registration",
        value: formatTimestamp(event.registrationOpenAt) ?? "Immediately",
      },
      {
        label: "Registration closes",
        icon: "registration",
        value: formatTimestamp(event.registrationCloseAt) ?? "No closing date",
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
        {event.description?.trim() || "No description provided."}
      </p>
      <DiscoveryDetailsPanel rows={rows} />
    </div>
  );
}
