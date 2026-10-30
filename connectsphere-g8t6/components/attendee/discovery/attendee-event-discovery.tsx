"use client";

import { useRef, useState } from "react";
import { useRegistration } from "@/components/attendee/registration/use-registration";
import { PageContent } from "@/components/layout/page-content";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { AlertBanner, Button, EmptyState, Skeleton } from "@/components/shared/primitives";
import { ROLE_LABELS } from "@/lib/auth";
import { getDiscoveryEvent, type AttendeeEventSummary } from "@/lib/api/discovery";
import type { AttendeeEventView } from "@/lib/api/my-events";
import { discoveryErrorMessage } from "./discovery-state";
import { EventDetailsDialog } from "./event-details-dialog";
import { EventDiscoveryCard } from "./event-discovery-card";
import { useDiscoveryEvents } from "./use-discovery-events";

// Attendee Event Discovery at /events (SPM-34), from the "Event Discovery"
// Figma frame. Render inside DashboardWorkspace. Search, filters and capacity
// are not built: the backend does not provide them yet. Register Now (SPM-134)
// opens the one registration form from a card or from the event details.
export function AttendeeEventDiscovery() {
  const discovery = useDiscoveryEvents();
  const [selected, setSelected] = useState<AttendeeEventSummary | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const [detailsRefresh, setDetailsRefresh] = useState(0);
  const registeringFor = useRef<number | null>(null);

  // After a registration or a refusal, read that event again: its availability
  // may have changed (full, closed), or it may no longer be shown at all.
  const refreshEvent = (eventId: number) => {
    getDiscoveryEvent(eventId)
      .then(({ event }) => discovery.patchEvent(event))
      .catch((caught: { status?: number }) => { if (caught?.status === 404) discovery.removeEvent(eventId); });
    setDetailsRefresh((value) => value + 1);
  };
  const registration = useRegistration({
    onEventChanged: refreshEvent,
    // Register Now goes once registered; focus that event's details button, or the list.
    focusFallback: () =>
      document.querySelector<HTMLElement>(`#discovery-event-${registeringFor.current}-title`)?.closest("article")?.querySelector<HTMLElement>("button") ?? listHeading.current,
  });
  const startRegistration = (event: Pick<AttendeeEventView, "eventId" | "title" | "startDatetime" | "endDatetime">, button: HTMLButtonElement) => {
    registeringFor.current = event.eventId;
    registration.open({ eventId: event.eventId, title: event.title, startDatetime: event.startDatetime, endDatetime: event.endDatetime }, button);
  };
  // apiRequest reports a 401 to AuthGate, which sends the attendee to sign in.
  const sessionExpired = discovery.status === "error" && discovery.error?.status === 401;

  const openDetails = (event: AttendeeEventSummary, button: HTMLButtonElement) => {
    trigger.current = button;
    setSelected(event);
  };

  // The opening button can be gone if the event was removed while open.
  const restoreFocus = () => {
    if (trigger.current?.isConnected) trigger.current.focus();
    else listHeading.current?.focus();
  };

  const countText = `Showing ${discovery.events.length} ${discovery.events.length === 1 ? "event" : "events"}${discovery.nextCursor ? " · more available" : ""}`;

  return (
    <PageContent
      eyebrow={ROLE_LABELS.ATTENDEE}
      title="Event Discovery"
      description="Browse confirmed events open to attendees. Open an event to see its full details and registration availability."
      action={<NotificationsBell />}
    >
      <section aria-labelledby="discovery-list-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="h-5 w-1 rounded-pill bg-primary" />
            <h2
              id="discovery-list-heading"
              ref={listHeading}
              tabIndex={-1}
              className="text-xl font-semibold tracking-[-0.01em] text-on-surface focus:outline-none"
            >
              Available events
            </h2>
          </div>
          {discovery.status === "ready" && discovery.events.length > 0 ? (
            <span aria-live="polite" className="text-[11px] font-bold uppercase tracking-label text-on-surface-variant">
              {countText}
            </span>
          ) : null}
        </div>

        {discovery.status === "loading" ? (
          <div className="flex flex-col gap-3" role="status" aria-label="Loading events">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-56 w-full rounded-panel" />
            ))}
          </div>
        ) : null}

        {discovery.status === "error" && sessionExpired ? (
          <AlertBanner tone="info" title="Your session has ended">
            Taking you to sign in…
          </AlertBanner>
        ) : null}

        {discovery.status === "error" && discovery.error?.status === 403 ? (
          <AlertBanner tone="error" title="Attendee access required">
            Event discovery is available to attendee accounts only. Sign in with an attendee account to browse events.
          </AlertBanner>
        ) : null}

        {discovery.status === "error" && !sessionExpired && discovery.error?.status !== 403 ? (
          <AlertBanner tone="error" title="Could not load events">
            {discovery.error ? discoveryErrorMessage(discovery.error, "events") : null}
            <div className="mt-3">
              <Button variant="danger" onClick={discovery.retry} className="max-lg:min-h-11">
                Try again
              </Button>
            </div>
          </AlertBanner>
        ) : null}

        {discovery.status === "ready" && discovery.events.length === 0 && !discovery.nextCursor ? (
          <EmptyState
            title="No events are available at the moment."
            description="There are no confirmed events open to attendees at the moment. Newly published events will be listed here, so check back later."
          />
        ) : null}

        {discovery.status === "ready" && registration.error && registration.error.status !== 401 ? (
          <AlertBanner tone="warning" title="Could not check your registrations">
            Register Now is hidden until your registrations load, so you are not offered a place you may already hold.
            <div className="mt-3">
              <Button variant="secondary" onClick={registration.refresh} className="max-lg:min-h-11">
                Try again
              </Button>
            </div>
          </AlertBanner>
        ) : null}

        {discovery.status === "ready" ? (
          <>
            {discovery.events.length > 0 ? (
              <ul className="flex flex-col gap-3" aria-labelledby="discovery-list-heading">
                {discovery.events.map((event) => (
                  <li key={event.eventId}>
                    <EventDiscoveryCard
                      event={event}
                      onViewDetails={openDetails}
                      place={registration.places?.get(event.eventId) ?? null}
                      placesKnown={registration.places !== null}
                      onRegister={startRegistration}
                    />
                  </li>
                ))}
              </ul>
            ) : null}

            {discovery.loadMoreError ? (
              <AlertBanner tone="error" title="Could not load more events">
                {discoveryErrorMessage(discovery.loadMoreError, "next events")}
                <div className="mt-3">
                  <Button variant="danger" onClick={discovery.loadMore} className="max-lg:min-h-11">
                    Try again
                  </Button>
                </div>
              </AlertBanner>
            ) : null}

            {discovery.nextCursor && !discovery.loadMoreError ? (
              <div className="flex justify-center pt-1">
                <Button
                  variant="secondary"
                  onClick={discovery.loadMore}
                  disabled={discovery.loadingMore}
                  className="w-full max-lg:min-h-11 sm:w-auto"
                >
                  {discovery.loadingMore ? "Loading more events…" : "Load more events"}
                </Button>
              </div>
            ) : null}

            {!discovery.nextCursor && discovery.pagesLoaded > 1 ? (
              <p className="text-center text-xs text-on-surface-variant">You have reached the end of the list.</p>
            ) : null}
          </>
        ) : null}
      </section>

      <EventDetailsDialog
        event={selected}
        detailsFrom="discovery"
        onClose={() => setSelected(null)}
        onClosed={restoreFocus}
        onLoaded={discovery.patchEvent}
        onNotFound={discovery.removeEvent}
        places={registration.places}
        onRegister={startRegistration}
        refreshKey={detailsRefresh}
      />
      {registration.dialog}
    </PageContent>
  );
}
