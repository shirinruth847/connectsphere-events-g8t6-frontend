"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SessionGate, useSessionProfile, type SessionProfile } from "@/components/auth/session-gate";
import { EventRequestDetails } from "@/components/events/event-request-details";
import { CoordinatorShell } from "@/components/layout/coordinator-shell";
import { OrganiserShell } from "@/components/layout/organiser-shell";
import { AlertBanner, Button, buttonClasses, EmptyState, Skeleton } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { CoordinatorEventView } from "./coordinator-event-view";
import { useEventView } from "./use-event-view";

const parseEventId = (raw: string) => (/^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null);

const homeFor = (roles: string[]) => (roles.includes("COORDINATOR_LEAD") && !roles.includes("COORDINATOR") ? "/events" : "/dashboard");

// The signed-in role picks the shell; what the page shows inside it comes from
// the relationship the backend reports for this event.
export function WorkspaceShell({ profile, children }: { profile: SessionProfile; children: ReactNode }) {
  if (profile.roles.includes("COORDINATOR")) {
    return <CoordinatorShell navigation="coordinator" userName={profile.name} userEmail={profile.email}>{children}</CoordinatorShell>;
  }
  if (profile.roles.includes("COORDINATOR_LEAD")) {
    return <CoordinatorShell userName={profile.name} userEmail={profile.email}>{children}</CoordinatorShell>;
  }
  if (profile.roles.includes("ORGANISER")) {
    return <OrganiserShell profile={profile}>{children}</OrganiserShell>;
  }
  // Venue Staff, Technical Support and Attendees get no event detail here (SPM-33 AC5);
  // their own workspaces arrive with their tickets, so no role navigation is shown.
  return <main className="mx-auto w-full max-w-[1280px] px-4 py-5 sm:px-7 sm:py-7">{children}</main>;
}

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
  return <EventRequestDetails event={state.event} />;
}

function WorkspaceContent({ rawEventId }: { rawEventId: string }) {
  const profile = useSessionProfile();
  const eventId = parseEventId(rawEventId);
  const home = homeFor(profile.roles);
  return (
    <WorkspaceShell profile={profile}>
      {eventId === null ? <EventUnavailable home={home} /> : <LoadedWorkspace key={eventId} eventId={eventId} home={home} />}
    </WorkspaceShell>
  );
}

// /events/[eventId]: the role-aware event workspace (SPM-33).
export function EventWorkspace({ eventId }: { eventId: string }) {
  return (
    <SessionGate>
      <WorkspaceContent rawEventId={eventId} />
    </SessionGate>
  );
}
