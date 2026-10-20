import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { VenuesWorkspace } from "@/components/venues/venues-workspace";

export const metadata: Metadata = { title: "Venues | ConnectSphere" };

// Coordinators, Coordinator Leads and Venue Staff; the view shown depends on the
// role (catalogue, management, availability). The backend enforces each API.
export default function VenuesPage() {
  return (
    <DashboardWorkspace>
      <Suspense fallback={null}>
        <VenuesWorkspace />
      </Suspense>
    </DashboardWorkspace>
  );
}
