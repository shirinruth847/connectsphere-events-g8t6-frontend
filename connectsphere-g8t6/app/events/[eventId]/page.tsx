import type { Metadata } from "next";
import { EventWorkspace } from "@/components/events/workspace/event-workspace";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";

export const metadata: Metadata = { title: "Event workspace | ConnectSphere" };

// Every signed-in role may open the URL; the backend decides what, if anything,
// it shows (SPM-33 AC1), so no role restriction is applied here.
export default async function EventWorkspacePage({ params }: PageProps<"/events/[eventId]">) {
  const { eventId } = await params;
  return <DashboardWorkspace><EventWorkspace eventId={eventId} /></DashboardWorkspace>;
}
