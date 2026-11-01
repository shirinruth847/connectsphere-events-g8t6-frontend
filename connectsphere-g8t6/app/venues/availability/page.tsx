import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { VenuesWorkspace } from "@/components/venues/venues-workspace";

export const metadata: Metadata = { title: "Venue Availability | ConnectSphere" };

// Venue Staff: the availability calendar, its own page so the navigation
// panel's Availability Calendar tab follows it. ?venueId= opens one venue.
export default function VenueAvailabilityPage() {
  return (
    <DashboardWorkspace role="VENUE_STAFF">
      <Suspense fallback={null}>
        <VenuesWorkspace view="availability" />
      </Suspense>
    </DashboardWorkspace>
  );
}
