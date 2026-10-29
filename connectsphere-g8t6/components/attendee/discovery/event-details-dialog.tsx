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
import type { AttendeeEventView, AttendeeRegistration } from "@/lib/api/my-events";
import { canRegister } from "@/components/attendee/registration/registration-form";
import { discoveryErrorMessage } from "./discovery-state";
import { DiscoveryIcon } from "./discovery-icon";
import { DiscoveryDetailsPanel } from "./discovery-details-panel";
import { LOCATION_PENDING_LABEL } from "./event-discovery-card";
import { formatEventDate, formatEventTime } from "./format-event-time";
import { RegistrationAvailabilityChip } from "./registration-availability-chip";
import {
  useAttendeeEvent,
  type EventDetailsSource,
} from "@/components/attendee/event-details/use-attendee-event";

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
  // Event Discovery only (SPM-134): the attendee's places, which the discovery
  // endpoint does not include, and the shared registration form. Null places
  // (not loaded) offer no Register Now.
  places?: ReadonlyMap<number, AttendeeRegistration> | null;
  onRegister?: (event: AttendeeEventView, trigger: HTMLButtonElement) => void;
  // Bumped to read the open event again (after a registration or a refusal).
  refreshKey?: number;
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
  places = null,
  onRegister,
  refreshKey = 0,
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
          key={`${event.eventId}:${refreshKey}`}
          summary={event}
          titleId={titleId}
          detailsFrom={detailsFrom}
          onClose={onClose}
          onLoaded={onLoaded}
          onNotFound={onNotFound}
          notFoundDescription={notFoundDescription}
          places={places}
          onRegister={onRegister}
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
  places,
  onRegister,
}: {
  summary: EventDetailsTarget;
  titleId: string;
  detailsFrom: EventDetailsSource;
  onClose: () => void;
  onLoaded?: (event: AttendeeEventView) => void;
  onNotFound?: (eventId: number) => void;
  notFoundDescription: string;
  places: ReadonlyMap<number, AttendeeRegistration> | null;
  onRegister?: (event: AttendeeEventView, trigger: HTMLButtonElement) => void;
}) {
  // Event Discovery reads its own endpoint; My Events reads the attendee's registration.
  const { state, retry } = useAttendeeEvent(summary.eventId, detailsFrom, {
    onLoaded,
    onNotFound,
  });
  const event = state.status === "ready" ? state.event : null;
  const withheld = Boolean(event?.detailsWithheld);
  // My Events reads the place with the event; Event Discovery adds it from the places.
  const myRegistration = event?.myRegistration ?? (detailsFrom === "discovery" ? places?.get(summary.eventId) ?? null : null);
  // Availability is for deciding whether to sign up, so it is not shown to
  // someone who already holds a place, or when the details are held back.
  const availability = event
    ? event.registrationAvailability
    : summary.registrationAvailability;
  const showAvailability =
    state.status !== "not-found" &&
    !withheld &&
    !myRegistration &&
    availability;

  return (
    <>
      <header className="flex items-center justify-between gap-3 border-b border-outline-variant/40 bg-surface-container-lowest px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {showAvailability ? (
            <RegistrationAvailabilityChip value={availability} />
          ) : null}
          {event ? <AttendeeStatusChip status={event.attendeeStatus} /> : null}
          {myRegistration ? (
            <MyPlaceChip registration={myRegistration} />
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
            {state.status === "not-found" ? "Event unavailable" : event?.title ?? summary.title}
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
          <AlertBanner tone="info" title="Your session has ended">Taking you to sign in…</AlertBanner>
        ) : state.status === "error" && state.error.status === 403 ? (
          <AlertBanner tone="error" title="Attendee access required">
            Event details are available to attendee accounts only.
          </AlertBanner>
        ) : state.status === "error" ? (
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

      {event ? (
        <EventDetailsFooter
          event={{ ...event, myRegistration }}
          register={onRegister && detailsFrom === "discovery" ? {
            canRegister: canRegister(event.registrationAvailability, places, event.eventId),
            onRegister: (trigger) => onRegister(event, trigger),
          } : undefined}
        />
      ) : null}
    </>
  );
}

// The frame's abstract, then schedule and venue side by side.
function EventSummaryBody({ event }: { event: AttendeeEventDetail }) {
  return (
    <>
      <section aria-labelledby="event-about-heading" className="flex flex-col gap-3">
        <SectionLabel id="event-about-heading">About this event</SectionLabel>
        <div className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
          <p className="max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
            {event.description?.trim() || "No description provided."}
          </p>
        </div>
      </section>
      <div className="grid gap-6 md:grid-cols-12">
        <section aria-labelledby="event-schedule-heading" className="flex flex-col gap-3 md:col-span-7">
          <SectionLabel id="event-schedule-heading">Schedule</SectionLabel>
          <DiscoveryDetailsPanel rows={scheduleRows(event)} />
        </section>
        <section aria-labelledby="event-venue-heading" className="flex flex-col gap-3 md:col-span-5">
          <SectionLabel id="event-venue-heading">Venue and organiser</SectionLabel>
          <DiscoveryDetailsPanel rows={placeRows(event)} />
        </section>
      </div>
    </>
  );
}
