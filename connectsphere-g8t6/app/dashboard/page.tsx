import { Suspense } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { RoleDashboard } from "@/components/auth/role-dashboard";

export default function DashboardPage() {
  return <AuthGate><Suspense fallback={<p>Loading dashboard…</p>}><RoleDashboard /></Suspense></AuthGate>;
}
