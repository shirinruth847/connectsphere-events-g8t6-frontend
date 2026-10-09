import { Suspense } from "react";
import { OrganiserWorkspace } from "@/components/layout/organiser-workspace";
import { EventRequestDashboard } from "@/components/events/event-request-dashboard";

export default function DashboardPage() {
  return <OrganiserWorkspace><Suspense fallback={<p className="text-sm text-on-surface-variant">Loading requests…</p>}><EventRequestDashboard /></Suspense></OrganiserWorkspace>;
}
