"use client";

import type { ComponentType } from "react";
import type { AuthenticatedUser } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/permissions/roles";
import { CoordinatorDashboard } from "./CoordinatorDashboard";
import { OrganiserDashboard } from "./OrganiserDashboard";
import { TechSupportDashboard } from "./TechSupportDashboard";
import { VenueStaffDashboard } from "./VenueStaffDashboard";

export type DashboardProps = { user: AuthenticatedUser };

// Role -> dashboard content. Each dashboard is self-contained so it can be
// redesigned without touching auth, session or routing code.
const DASHBOARDS: Partial<Record<Role, ComponentType<DashboardProps>>> = {
  [ROLES.ORGANISER]: OrganiserDashboard,
  [ROLES.COORDINATOR]: CoordinatorDashboard,
  [ROLES.VENUE_STAFF]: VenueStaffDashboard,
  [ROLES.TECH_SUPPORT]: TechSupportDashboard,
};

export function DashboardView() {
  // PortalGate renders this only for a backend-verified user.
  const { user } = useAuth();
  if (!user) return null;

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
