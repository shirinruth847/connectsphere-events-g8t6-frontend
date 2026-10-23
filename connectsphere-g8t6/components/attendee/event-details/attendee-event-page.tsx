"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DiscoveryDetailsPanel } from "@/components/attendee/discovery/discovery-details-panel";
import { DiscoveryIcon } from "@/components/attendee/discovery/discovery-icon";
import { LOCATION_PENDING_LABEL } from "@/components/attendee/discovery/event-discovery-card";
import { formatEventDate, formatEventTime } from "@/components/attendee/discovery/format-event-time";
import { RegistrationAvailabilityChip } from "@/components/attendee/discovery/registration-availability-chip";
import { PageContent } from "@/components/layout/page-content";
import { Icon } from "@/components/shared/icon";
import { AlertBanner, Button, Skeleton, buttonClasses } from "@/components/shared/primitives";
import type { AttendeeEventView } from "@/lib/api/my-events";
import { eventBackLink, eventDetailsSource, type EventDetailsSource } from "./event-details-links";
import {
  AttendeeStatusChip,
  EventDetailsFooter,
  HeroChip,
  MyPlaceCard,
  MyPlaceChip,
  PendingDetails,
  SectionLabel,
  LastConfirmedNotice,
  WithheldNotice,
  placeRows,
  scheduleRows,
} from "./event-details-parts";
import { useAttendeeEvent } from "./use-attendee-event";

// The full attendee event page at /events/<id> (SPM-155), frame 282:1271 at page
// width. Data comes from Event Discovery's endpoint when opened from there, and
// otherwise from the attendee's own registration (eventDetailsSource).
// Sections the frame shows but ConnectSphere has no data for (photo, track,
// seats, speakers, agenda, amenities) are labelled "Not available yet" by
// decision; pricing is left out (Master 3.3). Render inside DashboardWorkspace.
export function AttendeeEventPage({ eventId: rawEventId }: { eventId: string }) {
  const from = useSearchParams().get("from");
  const back = eventBackLink(from);
  const source = eventDetailsSource(from);
  const eventId = /^[1-9]\d{0,9}$/.test(rawEventId) ? Number(rawEventId) : null;
  const backLink = (
    <Link href={back.href} className={`${buttonClasses("secondary")} max-lg:min-h-11`}>
      <Icon name="arrow-back" size={18} />
      {back.label}
    </Link>
  );

  if (eventId === null) return <NotAvailable backLink={backLink} />;
  return <LoadedEventPage key={`${eventId}-${source}`} eventId={eventId} source={source} backLink={backLink} />;
}

function NotAvailable({ backLink }: { backLink: ReactNode }) {
  return (
    <PageContent title="Event details" eyebrow="Event details" action={backLink}>
      <AlertBanner tone="warning" title="This event is no longer available">
        You may have withdrawn, or this event is no longer available to you.
      </AlertBanner>
    </PageContent>
  );
}

function LoadedEventPage({ eventId, source, backLink }: { eventId: number; source: EventDetailsSource; backLink: ReactNode }) {
  const { state, retry } = useAttendeeEvent(eventId, source);
  if (state.status === "not-found") return <NotAvailable backLink={backLink} />;
  const event = state.status === "ready" ? state.event : null;

  return (
    <PageContent title={event?.title ?? "Event details"} eyebrow="Event details" action={backLink}>
      {state.status === "loading" ? (
        <div className="flex flex-col gap-4" role="status" aria-label="Loading the latest event details">
          <Skeleton className="h-12 w-full rounded-panel" />
          <Skeleton className="h-56 w-full rounded-panel" />
          <Skeleton className="h-32 w-full rounded-panel" />
        </div>
      ) : null}
      {state.status === "error" ? (
        <AlertBanner tone="error" title="Could not load the event details">
          {state.error.message}
          <div className="mt-3">
            <Button variant="danger" onClick={retry} className="max-lg:min-h-11">
              Try again
            </Button>
          </div>
        </AlertBanner>
      ) : null}
      {event ? <EventPageBody event={event} /> : null}
    </PageContent>
  );
}

function EventPageBody({ event }: { event: AttendeeEventView }) {
  const withheld = Boolean(event.detailsWithheld);
  // Being reconfirmed or cancelled: the last confirmed details (Master 5.7).
  const lastConfirmedAt = !withheld ? event.lastConfirmedAt ?? null : null;
  const myRegistration = event.myRegistration ?? null;

  return (
    <div className="flex flex-col gap-6">
      {/* The frame's header bar: status, track and hall chips, then the time. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel bg-surface-container-lowest px-4 py-3 shadow-elevation-1 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {!withheld && !myRegistration ? <RegistrationAvailabilityChip value={event.registrationAvailability} /> : null}
          <AttendeeStatusChip status={event.attendeeStatus} />
          {myRegistration ? <MyPlaceChip registration={myRegistration} /> : null}
          {!withheld ? (
            <>
              {!lastConfirmedAt ? (
                <span data-pending="track" className="inline-flex items-center rounded-tag bg-surface-container-high px-2.5 py-1 text-xs font-medium text-on-surface-variant">
                  Track: Not available yet
                </span>
              ) : null}
              <span className="inline-flex items-center rounded-tag bg-primary-fixed px-2.5 py-1 text-xs font-medium text-primary">
                {event.location ?? LOCATION_PENDING_LABEL}
              </span>
            </>
          ) : null}
        </div>
        {!withheld && event.startDatetime ? (
          <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant">
            <DiscoveryIcon name="schedule" />
            {formatEventTime(event.startDatetime, event.endDatetime)}
          </span>
        ) : null}
      </div>

      {withheld ? (
        <>
          <WithheldNotice attendeeStatus={event.attendeeStatus} />
          {myRegistration ? <MyPlaceCard registration={myRegistration} /> : null}
        </>
      ) : lastConfirmedAt ? (
        <LastConfirmedSections event={event} lastConfirmedAt={lastConfirmedAt} />
      ) : (
        <ConfirmedEventSections event={event} />
      )}
    </div>
  );
}

// An event being reconfirmed or cancelled: its last confirmed description,
// schedule and venue under a notice saying so. The frame's sections without
// data are left out; there is nothing more to come for this version.
function LastConfirmedSections({ event, lastConfirmedAt }: { event: AttendeeEventView; lastConfirmedAt: string }) {
  const myRegistration = event.myRegistration ?? null;
  return (
    <>
      <LastConfirmedNotice attendeeStatus={event.attendeeStatus} lastConfirmedAt={lastConfirmedAt} />
      {myRegistration ? <MyPlaceCard registration={myRegistration} /> : null}
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

function ConfirmedEventSections({ event }: { event: AttendeeEventView }) {
  const myRegistration = event.myRegistration ?? null;
  return (
    <>
      {/* The frame's photo banner. There is no event imagery, so the lavender
          fallback carries the date and venue and says there is no photo. */}
      <section aria-label="Event photo" className="flex min-h-56 flex-col justify-between gap-6 rounded-panel bg-gradient-to-br from-primary-fixed to-tertiary-fixed p-5 sm:p-6">
        <span data-pending="photo" className="w-fit rounded-pill bg-surface-container-lowest/80 px-3 py-1 text-xs font-semibold text-on-surface-variant">
          Event photo not available yet
        </span>
        <div className="flex flex-wrap gap-2">
          <HeroChip icon="calendar">{formatEventDate(event.startDatetime, event.endDatetime)}</HeroChip>
          <HeroChip icon="venue">{event.location ?? LOCATION_PENDING_LABEL}</HeroChip>
        </div>
      </section>

      <div className={`grid gap-6 ${myRegistration ? "md:grid-cols-2" : ""}`}>
        {myRegistration ? <MyPlaceCard registration={myRegistration} /> : null}
        <section aria-labelledby="event-capacity-heading" className="flex flex-col gap-3 rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
          <SectionLabel id="event-capacity-heading">Capacity</SectionLabel>
          {!myRegistration ? <RegistrationAvailabilityChip value={event.registrationAvailability} /> : null}
          <PendingDetails name="capacity">Seat numbers are not available in ConnectSphere yet.</PendingDetails>
        </section>
      </div>

      <section aria-labelledby="event-about-heading" className="flex flex-col gap-3">
        <SectionLabel id="event-about-heading">About this event</SectionLabel>
        <div className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
          <p className="max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
            {event.description?.trim() || "No description provided."}
          </p>
        </div>
      </section>

      <section aria-labelledby="event-speakers-heading" className="flex flex-col gap-3">
        <SectionLabel id="event-speakers-heading">Featured speakers</SectionLabel>
        <PendingDetails name="speakers">Speaker information is not available in ConnectSphere yet.</PendingDetails>
      </section>

      <div className="grid gap-6 md:grid-cols-12">
        <section aria-labelledby="event-schedule-heading" className="flex flex-col gap-3 md:col-span-7">
          <SectionLabel id="event-schedule-heading">Session agenda and schedule</SectionLabel>
          <DiscoveryDetailsPanel rows={scheduleRows(event)} />
          <PendingDetails name="agenda">A session agenda is not available in ConnectSphere yet.</PendingDetails>
        </section>
        <section aria-labelledby="event-venue-heading" className="flex flex-col gap-3 md:col-span-5">
          <SectionLabel id="event-venue-heading">Venue and on-site amenities</SectionLabel>
          <DiscoveryDetailsPanel rows={placeRows(event)} />
          <PendingDetails name="amenities">On-site amenity information is not available in ConnectSphere yet.</PendingDetails>
        </section>
      </div>

      <div className="overflow-hidden rounded-panel shadow-elevation-1 empty:hidden">
        <EventDetailsFooter event={event} />
      </div>
    </>
  );
}
