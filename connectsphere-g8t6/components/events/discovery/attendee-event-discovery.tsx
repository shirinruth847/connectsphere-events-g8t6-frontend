"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertBanner, Button, EmptyState, PageHeader, Skeleton } from "@/components/shared/primitives";
import type { AttendeeEventSummary } from "@/lib/api/discovery";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { DiscoveryIcon } from "./discovery-icon";
import { EventDetailsDialog } from "./event-details-dialog";
import { EventDiscoveryCard } from "./event-discovery-card";
import { useDiscoveryEvents } from "./use-discovery-events";

export interface AttendeeProfile {
  name: string;
  email: string;
}

export const ATTENDEE_SIGN_IN_PATH = `/login?next=${encodeURIComponent("/events")}`;

// Attendee Event Discovery at /events (SPM-34), from the "Event Discovery"
// Figma frame. Search, filters, capacity and registration actions are not
// built: the backend does not provide them yet.
export function AttendeeEventDiscovery({ profile }: { profile: AttendeeProfile }) {
  const router = useRouter();
  const discovery = useDiscoveryEvents();
  const [selected, setSelected] = useState<AttendeeEventSummary | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const sessionExpired = discovery.status === "error" && discovery.error?.status === 401;

  useEffect(() => {
    if (sessionExpired) router.replace(ATTENDEE_SIGN_IN_PATH);
  }, [sessionExpired, router]);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await getSupabaseBrowserClient().auth.signOut();
    } finally {
      router.replace(ATTENDEE_SIGN_IN_PATH);
    }
  };

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
    <main className="mx-auto w-full max-w-[1232px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        eyebrow="Attendee experience portal"
        title="Event Discovery"
        description="Browse confirmed events open to attendees. Open an event to see its full details and registration availability."
        action={
          <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
            <span className="flex min-w-0 flex-col text-left sm:text-right">
              <span className="truncate text-sm font-semibold text-on-surface">{profile.name}</span>
              <span className="text-xs text-on-surface-variant">Attendee</span>
            </span>
            <Button variant="danger" onClick={signOut} disabled={signingOut} className="max-lg:min-h-11">
              <DiscoveryIcon name="logout" />
              {signingOut ? "Logging out…" : "Log out"}
            </Button>
          </div>
        }
      />

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
              Upcoming events
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
            {discovery.error?.message}
            <div className="mt-3">
              <Button variant="danger" onClick={discovery.retry} className="max-lg:min-h-11">
                Try again
              </Button>
            </div>
          </AlertBanner>
        ) : null}

        {discovery.status === "ready" && discovery.events.length === 0 ? (
          <EmptyState
            title="No events to discover right now"
            description="There are no confirmed events open to attendees at the moment. Newly published events will be listed here, so check back later."
          />
        ) : null}

        {discovery.status === "ready" && discovery.events.length > 0 ? (
          <>
            <ul className="flex flex-col gap-3" aria-labelledby="discovery-list-heading">
              {discovery.events.map((event) => (
                <li key={event.eventId}>
                  <EventDiscoveryCard event={event} onViewDetails={openDetails} />
                </li>
              ))}
            </ul>

            {discovery.loadMoreError ? (
              <AlertBanner tone="error" title="Could not load more events">
                {discovery.loadMoreError.message}
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
        onClose={() => setSelected(null)}
        onClosed={restoreFocus}
        onLoaded={discovery.patchEvent}
        onNotFound={discovery.removeEvent}
      />
    </main>
  );
}
