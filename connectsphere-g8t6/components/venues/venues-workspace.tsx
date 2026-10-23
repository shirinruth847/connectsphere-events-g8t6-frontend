"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSessionUser } from "@/components/auth/auth-gate";
import { PageContent } from "@/components/layout/page-content";
import { AlertBanner } from "@/components/shared/primitives";
import { VenueManagementList } from "@/components/venue-staff/venue-management/venue-management-list";
import { ROLE_LABELS, type UserRole } from "@/lib/auth";
import { VenueAvailabilityCalendar } from "./venue-availability";
import { VenueCatalogue } from "./venue-catalogue";

type View = "catalogue" | "manage" | "availability";

const VIEWS: Partial<Record<UserRole, { id: View; label: string }[]>> = {
  VENUE_STAFF: [{ id: "manage", label: "Manage venues" }, { id: "availability", label: "Availability" }],
  COORDINATOR: [{ id: "catalogue", label: "Catalogue" }, { id: "availability", label: "Availability" }],
  // SPM-74 limits the calendar to Event Coordinators and Venue Staff.
  COORDINATOR_LEAD: [{ id: "catalogue", label: "Catalogue" }],
};

const TITLES: Record<View, { title: string; description: string }> = {
  catalogue: { title: "Venue Catalogue", description: "Review venues currently available for event planning. Search by name or location and filter by capacity, layout, facilities or accessibility." },
  manage: { title: "My Venues", description: "Manage venue records, status, details and setup/turnaround times." },
  availability: { title: "Venue Availability", description: "Bookings, active holds, operational blocks and setup/turnaround time for the venues and dates you choose." },
};

// /venues: what each role may do with venues. Navigation is presentation only;
// every API enforces the same roles.
export function VenuesWorkspace() {
  const user = useSessionUser();
  const searchParams = useSearchParams();
  const views = user ? VIEWS[user.role] : undefined;

  if (!user) return null;
  if (!views) {
    return (
      <PageContent title="Catalogue access required" eyebrow="VENUE PLANNING">
        <AlertBanner tone="error">Your account does not have permission to view venues.</AlertBanner>
      </PageContent>
    );
  }

  const requested = searchParams.get("view");
  const view = views.find((item) => item.id === requested)?.id ?? views[0].id;
  const venueId = searchParams.get("venueId");

  return (
    <PageContent title={TITLES[view].title} eyebrow={ROLE_LABELS[user.role]} description={TITLES[view].description}>
      {views.length > 1 ? (
        <nav aria-label="Venue views" className="flex flex-wrap gap-2">
          {views.map((item) => (
            <Link
              key={item.id}
              href={item.id === views[0].id ? "/venues" : `/venues?view=${item.id}${venueId ? `&venueId=${venueId}` : ""}`}
              aria-current={item.id === view ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-pill px-4 text-sm font-semibold transition-colors ${item.id === view ? "bg-primary text-on-primary" : "bg-surface-container-low text-primary hover:bg-surface-container-high"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
      {view === "catalogue" ? <VenueCatalogue /> : null}
      {view === "manage" ? <VenueManagementList /> : null}
      {view === "availability" ? <VenueAvailabilityCalendar key={venueId ?? "all"} /> : null}
    </PageContent>
  );
}
