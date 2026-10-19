import { RoleEventContent } from "@/components/events/role-event-content";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";

export default async function EventRequestPage({ params }: PageProps<"/events/[id]">) {
  const { id } = await params;
  return <DashboardWorkspace><RoleEventContent id={id} /></DashboardWorkspace>;
}
