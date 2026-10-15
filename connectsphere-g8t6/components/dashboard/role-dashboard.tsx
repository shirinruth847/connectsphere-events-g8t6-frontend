"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionProfile } from "@/components/auth/session-gate";
import { AssignedEventsList } from "@/components/events/assigned-events-list";
import { EventRequestDashboard } from "@/components/events/event-request-dashboard";
import { CoordinatorShell } from "@/components/layout/coordinator-shell";
import { OrganiserShell } from "@/components/layout/organiser-shell";
import { AlertBanner, Skeleton } from "@/components/shared/primitives";

// /dashboard is each role's hub (Master section 3.4). Roles without a dashboard
// yet are told so instead of being shown another role's page.
export function RoleDashboard() {
  const profile = useSessionProfile();
  const router = useRouter();
  const isCoordinator = profile.roles.includes("COORDINATOR");
  const isLead = profile.roles.includes("COORDINATOR_LEAD") && !isCoordinator;

  // The Lead's hub is still the unassigned queue at /events.
  useEffect(() => {
    if (isLead) router.replace("/events");
  }, [isLead, router]);

  if (isCoordinator) {
    return (
      <CoordinatorShell navigation="coordinator" userName={profile.name} userEmail={profile.email}>
        <AssignedEventsList />
      </CoordinatorShell>
    );
  }
  if (isLead) {
    return <main className="mx-auto w-full max-w-5xl p-6" aria-busy="true"><Skeleton className="h-48 w-full" /></main>;
  }
  if (profile.roles.includes("ORGANISER")) {
    return (
      <OrganiserShell profile={profile}>
        <Suspense fallback={<p className="text-sm text-on-surface-variant">Loading requests…</p>}>
          <EventRequestDashboard />
        </Suspense>
      </OrganiserShell>
    );
  }
  return (
    <main className="mx-auto mt-16 w-full max-w-xl p-5">
      <AlertBanner tone="info" title="Your dashboard is not available yet">
        ConnectSphere does not have a dashboard for your role yet. It will appear here once it is built.
      </AlertBanner>
    </main>
  );
}
