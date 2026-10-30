"use client";

import Link from "next/link";
import { PageContent } from "@/components/layout/page-content";
import { Icon } from "@/components/shared/icon";
import { AlertBanner, Button, buttonClasses, EmptyState, SectionCard, Skeleton } from "@/components/shared/primitives";
import { ROLE_LABELS, ROUTES } from "@/lib/auth";
import { discoveryErrorMessage } from "./discovery-state";
import { EventDetailsBody, RegistrationActionFooter } from "./event-details-content";
import { RegistrationAvailabilityChip } from "./registration-availability-chip";
import { useDiscoveryEvent } from "./use-discovery-event";

const backLink = (
  <Link href={ROUTES.events} className={`${buttonClasses("secondary")} max-lg:min-h-11`}>
    <Icon name="arrow-back" size={16} />
    Back to Event Discovery
  </Link>
);

// /events/[eventId] for attendees (SPM-44). Reads only
// GET /api/events/discovery/:id; the staff workspace endpoint
// GET /api/events/:id is never called for this role. A 404 means the event is
// not attendee-visible (unknown, unpublished or not CONFIRMED) and nothing
// about it is shown.
export function AttendeeEventDetailsPage({ eventId }: { eventId: number | null }) {
  if (eventId === null) return <EventNotAvailable />;
  return <LoadedEventDetails key={eventId} eventId={eventId} />;
}

function EventNotAvailable() {
  return (
    <PageContent eyebrow={ROLE_LABELS.ATTENDEE} title="Event details" action={backLink}>
      <section aria-labelledby="attendee-event-unavailable" className="flex flex-col gap-3">
        <h2 id="attendee-event-unavailable" className="sr-only">Event unavailable</h2>
        <EmptyState
          title="This event is not available"
          description="It does not exist, or it is not currently open to attendees. Browse Event Discovery for events you can view."
        />
      </section>
    </PageContent>
  );
}

function LoadedEventDetails({ eventId }: { eventId: number }) {
  const { state, retry } = useDiscoveryEvent(eventId);

  if (state.status === "not-found") return <EventNotAvailable />;

  if (state.status === "ready") {
    const { event } = state;
    return (
      <PageContent eyebrow={ROLE_LABELS.ATTENDEE} title={event.title} action={backLink}>
        <SectionCard className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="h-5 w-1 rounded-pill bg-primary" />
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-on-surface">Event information</h2>
            </div>
            <RegistrationAvailabilityChip value={event.registrationAvailability} />
          </div>
          <EventDetailsBody event={event} />
          <RegistrationActionFooter event={event} className="border-t border-outline-variant/40 pt-4" />
        </SectionCard>
      </PageContent>
    );
  }

  return (
    <PageContent eyebrow={ROLE_LABELS.ATTENDEE} title="Event details" action={backLink}>
      {state.status === "loading" ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading event details">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-40 w-full rounded-panel" />
        </div>
      ) : state.error.status === 401 ? (
        // apiRequest reports the 401 to AuthGate, which sends the attendee to sign in.
        <AlertBanner tone="info" title="Your session has ended">Taking you to sign in…</AlertBanner>
      ) : state.error.status === 403 ? (
        <AlertBanner tone="error" title="Attendee access required">
          Event details on this page are available to attendee accounts only.
        </AlertBanner>
      ) : (
        <AlertBanner tone="error" title="Could not load the event details">
          {discoveryErrorMessage(state.error, "event details")}
          <div className="mt-3">
            <Button variant="danger" onClick={retry} className="max-lg:min-h-11">
              Try again
            </Button>
          </div>
        </AlertBanner>
      )}
    </PageContent>
  );
}
