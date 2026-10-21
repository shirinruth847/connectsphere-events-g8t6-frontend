import type { Metadata } from "next";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { EventRoleContent } from "./event-role-content";

// Neutral, since attendees open their event details here too (SPM-155).
export const metadata: Metadata = { title: "Event | ConnectSphere" };

// Every signed-in role may open the URL; the backend decides what, if anything,
// it shows (SPM-33 AC1), so no role restriction is applied here. Attendees get
// the event details page; other roles the event workspace.
export default async function EventWorkspacePage({ params }: PageProps<"/events/[eventId]">) {
  const { eventId } = await params;
  return <DashboardWorkspace><EventRoleContent eventId={eventId} /></DashboardWorkspace>;
}
