"use client";

import { Suspense, type ComponentType } from "react";
import { EventRequestDashboard } from "@/components/events/event-request-dashboard";
import { ListSkeleton } from "@/components/ui/Skeleton";
import type { AuthenticatedUser } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/permissions/roles";
import { CoordinatorDashboard } from "./CoordinatorDashboard";
import { TechSupportDashboard } from "./TechSupportDashboard";
import { VenueStaffDashboard } from "./VenueStaffDashboard";

export type DashboardProps = { user: AuthenticatedUser };

// Role -> dashboard content. Each dashboard is self-contained so it can be
// redesigned without touching auth, session or routing code.
const DASHBOARDS: Partial<Record<Role, ComponentType<DashboardProps>>> = {
  [ROLES.COORDINATOR]: CoordinatorDashboard,
  [ROLES.VENUE_STAFF]: VenueStaffDashboard,
  [ROLES.TECH_SUPPORT]: TechSupportDashboard,
};

export function DashboardView() {
  // PortalGate renders this only for a backend-verified user.
  const { user } = useAuth();
  if (!user) return null;

  // The organiser event-request dashboard (SPM-35) has its own page heading
  // and reads the ?saved= / ?submitted= notices the request wizard returns with.
  if (user.role === ROLES.ORGANISER) {
    return (
      <Suspense fallback={<ListSkeleton label="Loading event requests" />}>
        <EventRequestDashboard />
      </Suspense>
    );
  }

  const Dashboard = DASHBOARDS[user.role];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Welcome, {user.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">{ROLE_LABELS[user.role] ?? user.role} dashboard</p>
      </div>
      {Dashboard && <Dashboard user={user} />}
    </div>
  );
}
