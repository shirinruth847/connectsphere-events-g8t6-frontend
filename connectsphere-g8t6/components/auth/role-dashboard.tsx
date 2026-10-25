"use client";

import { useEffect, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { useSessionUser } from "@/components/auth/auth-gate";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { OrganiserDashboard } from "@/components/organiser/dashboard";
import { CoordinatorDashboard } from "@/components/coordinator/dashboard";
import { CoordinatorLeadDashboard } from "@/components/coordinator-lead/dashboard";
import { VenueStaffDashboard } from "@/components/venue-staff/dashboard";
import { TechSupportDashboard } from "@/components/tech-support/dashboard";
import { SafetyOfficerDashboard } from "@/components/safety-officer/dashboard";
import { ROUTES, type UserRole } from "@/lib/auth";

// Compatibility for feature branches; new pages use DashboardWorkspace.
export { DashboardShell as StaffShell } from "@/components/layout/dashboard-shell";

const dashboards: Record<Exclude<UserRole, "ATTENDEE">, ComponentType> = {
  ORGANISER: OrganiserDashboard,
  COORDINATOR: CoordinatorDashboard,
  COORDINATOR_LEAD: CoordinatorLeadDashboard,
  VENUE_STAFF: VenueStaffDashboard,
  TECH_SUPPORT: TechSupportDashboard,
  SAFETY_OFFICER: SafetyOfficerDashboard,
};

// Dispatch only. Role-specific features belong in their own component folders.
export function RoleDashboard() {
  const user = useSessionUser();
  const router = useRouter();
  useEffect(() => {
    if (user?.role === "ATTENDEE") router.replace(ROUTES.registrations);
  }, [router, user]);
  if (!user || user.role === "ATTENDEE") return null;
  const Dashboard = dashboards[user.role];
  return <DashboardShell><Dashboard /></DashboardShell>;
}
