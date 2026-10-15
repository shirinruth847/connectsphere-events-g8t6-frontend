import { SessionGate } from "@/components/auth/session-gate";
import { RoleDashboard } from "@/components/dashboard/role-dashboard";

export default function DashboardPage() {
  return (
    <SessionGate>
      <RoleDashboard />
    </SessionGate>
  );
}
