import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { LeadAssignments } from "@/components/coordinator-lead/lead-assignments";

export default function AssignmentsPage() {
  return (
    <DashboardWorkspace role="COORDINATOR_LEAD">
      <LeadAssignments />
    </DashboardWorkspace>
  );
}
