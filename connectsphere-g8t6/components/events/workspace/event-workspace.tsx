"use client";

import Link from "next/link";
import { useSessionUser } from "@/components/auth/auth-gate";
import { EventRequestDetails } from "@/components/events/event-request-details";
import { AlertBanner, Button, buttonClasses, EmptyState, Skeleton } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { homeForRole, ROUTES } from "@/lib/auth";
import { SafetyReviewView } from "@/components/safety-officer/review-view";
import { CoordinatorEventView } from "./coordinator-event-view";
import { useEventView } from "./use-event-view";

const parseEventId = (raw: string) => (/^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null);

function EventUnavailable({ home }: { home: string }) {
  return (
    <EmptyState
      title="Event not available"
      description="This event does not exist, or it is not shared with you. If it was reassigned to another coordinator, it no longer appears in your workspace."
      action={<Link href={home} className={buttonClasses("secondary")}><Icon name="arrow-back" size={16} />Back to your workspace</Link>}
    />
  );
}

function LoadedWorkspace({ eventId, home }: { eventId: number; home: string }) {
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
  if (state.status === "not-found") return <EventUnavailable home={home} />;
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
  return eventId === null ? <EventUnavailable home={home} /> : <LoadedWorkspace key={eventId} eventId={eventId} home={home} />;
}
