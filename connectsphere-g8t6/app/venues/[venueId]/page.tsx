import type { Metadata } from "next";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { VenueDetailManager } from "@/components/venue-staff/venue-management/venue-detail";

export const metadata: Metadata = { title: "Manage venue | ConnectSphere" };

const parseVenueId = (raw: string) => (/^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null);

// Venue maintenance (SPM-73) is for Venue Staff only; the backend enforces it too.
export default async function ManageVenuePage({ params }: PageProps<"/venues/[venueId]">) {
  const { venueId } = await params;
  return (
    <DashboardWorkspace role="VENUE_STAFF">
      <VenueDetailManager venueId={parseVenueId(venueId)} />
    </DashboardWorkspace>
  );
}
