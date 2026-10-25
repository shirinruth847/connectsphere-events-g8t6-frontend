"use client";

import Link from "next/link";
import { useSessionUser } from "@/components/auth/auth-gate";
import { EventRequestDetails } from "@/components/events/event-request-details";
import { AlertBanner, Button, buttonClasses, EmptyState, Skeleton } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { homeForRole, ROUTES } from "@/lib/auth";
import { SafetyReviewView } from "@/components/safety-officer/review-view";
import { VenueStaffEventView } from "@/components/venue-staff/booking-requests/venue-staff-event-view";
import { CoordinatorEventView } from "./coordinator-event-view";
import { useEventView } from "./use-event-view";

const parseEventId = (raw: string) => (/^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null);

// Why an event the user once saw may have gone, by role; coordinators lose an
// event on reassignment, Safety Officers when its review leaves their scope.
const UNAVAILABLE_REASONS: Partial<Record<string, string>> = {
  SAFETY_OFFICER: "If another Safety Officer claimed its review, or the review was closed, it no longer appears in your workspace.",
};
const DEFAULT_UNAVAILABLE_REASON = "If it was reassigned to another coordinator, it no longer appears in your workspace.";

function EventUnavailable({ home, reason }: { home: string; reason: string }) {
  return (
    <EmptyState
      title="Event not available"
      description={`This event does not exist, or it is not shared with you. ${reason}`}
      action={<Link href={home} className={buttonClasses("secondary")}><Icon name="arrow-back" size={16} />Back to your workspace</Link>}
    />
  );
}

function LoadedWorkspace({ eventId, home, reason }: { eventId: number; home: string; reason: string }) {
  const { state, reload, refresh, replaceEvent } = useEventView(eventId);

  if (state.status === "loading") {
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Loading event">
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 xl:grid-cols-12">
          <Skeleton className="h-72 xl:col-span-8" />
          <Skeleton className="h-72 xl:col-span-4" />
        </div>
      </div>
    );
  }
  if (state.status === "not-found") return <EventUnavailable home={home} reason={reason} />;
  if (state.status === "error") {
    return (
      <AlertBanner tone="error" title="Could not load this event">
        {state.message}
        <div className="mt-3"><Button variant="secondary" onClick={reload}><Icon name="refresh" size={16} />Try again</Button></div>
      </AlertBanner>
    );
  }
  if (state.event.viewerRelationship === "ASSIGNED_COORDINATOR") {
    return <CoordinatorEventView event={state.event} onEventChange={replaceEvent} onAccessChanged={refresh} />;
  }
  if (state.event.viewerRelationship === "SAFETY_OFFICER") {
    return <SafetyReviewView event={state.event} onEventChanged={refresh} />;
  }
  return <EventRequestDetails event={state.event} />;
}

// /events/[eventId]: the role-aware event workspace (SPM-33). Render inside
// DashboardWorkspace; what it shows comes from the relationship the backend
// reports for this event, and unrelated events answer "not found".
export function EventWorkspace({ eventId: rawEventId }: { eventId: string }) {
  const user = useSessionUser();
  const eventId = parseEventId(rawEventId);
  const home = user ? homeForRole(user.role) : ROUTES.dashboard;
  const reason = (user && UNAVAILABLE_REASONS[user.role]) || DEFAULT_UNAVAILABLE_REASON;
  if (eventId === null) return <EventUnavailable home={home} reason={reason} />;
  // Venue Staff reach events only through their venue bookings (SPM-181).
  if (user?.role === "VENUE_STAFF") return <VenueStaffEventView key={eventId} eventId={eventId} />;
  return <LoadedWorkspace key={eventId} eventId={eventId} home={home} reason={reason} />;
}
