import { Suspense } from "react";
import { EventRequestWizard } from "@/components/events/event-request-wizard";
import { OrganiserWorkspace } from "@/components/layout/organiser-workspace";

export default function NewEventPage() {
  return <OrganiserWorkspace><Suspense fallback={<p className="text-sm text-on-surface-variant">Loading form…</p>}><EventRequestWizard /></Suspense></OrganiserWorkspace>;
}
