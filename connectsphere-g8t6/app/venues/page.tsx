import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { VenuesWorkspace } from "@/components/venues/venues-workspace";

export const metadata: Metadata = { title: "Venues | ConnectSphere" };

// Venue Staff: venue management. Coordinators and Leads browse venues inside
// each event (SPM-72/74). The backend enforces each API.
export default async function VenuesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // The calendar used to be /venues?view=availability; old links still open it.
  const params = await searchParams;
  if (params.view === "availability") {
    const kept = new URLSearchParams();
    for (const key of ["venueId", "from"]) {
      const value = params[key];
      if (typeof value === "string") kept.set(key, value);
    }
    redirect(`/venues/availability${kept.size ? `?${kept.toString()}` : ""}`);
  }
  return (
    <DashboardWorkspace role="VENUE_STAFF">
      <Suspense fallback={null}>
        <VenuesWorkspace view="manage" />
      </Suspense>
    </DashboardWorkspace>
  );
}
