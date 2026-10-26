import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { VenuesWorkspace } from "@/components/venues/venues-workspace";

export const metadata: Metadata = { title: "Venues | ConnectSphere" };

// Venue Staff: management and availability. Coordinators and Leads browse
// venues inside each event (SPM-72/74). The backend enforces each API.
export default function VenuesPage() {
  return (
    <DashboardWorkspace role="VENUE_STAFF">
      <Suspense fallback={null}>
        <VenuesWorkspace />
      </Suspense>
    </DashboardWorkspace>
  );
}
