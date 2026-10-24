"use client";

import Link from "next/link";
import { useSessionUser } from "@/components/auth/auth-gate";
import { AttendeeEventDiscovery } from "@/components/attendee/discovery/attendee-event-discovery";
import { EventAssignmentQueue } from "@/components/coordinator-lead/event-assignment-queue";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { PageContent } from "@/components/layout/page-content";
import { AlertBanner } from "@/components/shared/primitives";
import { homeForRole } from "@/lib/auth";

function RoleEventContent() {
  const user = useSessionUser();
  if (user?.role === "ATTENDEE") return <AttendeeEventDiscovery />;
  if (user?.role === "COORDINATOR_LEAD") return <PageContent title="Unassigned requests" eyebrow="Coordinator Lead"><EventAssignmentQueue /></PageContent>;
  if (!user) return null;
  return <PageContent title="Access denied" eyebrow="Event workspace"><AlertBanner tone="error">This page is not available for your role. <Link className="underline" href={homeForRole(user.role)}>Go to your dashboard</Link></AlertBanner></PageContent>;
}

export default function EventsPage() {
  return <DashboardWorkspace><RoleEventContent /></DashboardWorkspace>;
}
