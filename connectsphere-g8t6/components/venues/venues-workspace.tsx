"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSessionUser } from "@/components/auth/auth-gate";
import { PageContent } from "@/components/layout/page-content";
import { AlertBanner } from "@/components/shared/primitives";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { BackButton } from "@/components/shared/back-button";
import { VenueManagementList } from "@/components/venue-staff/venue-management/venue-management-list";
import { ROLE_LABELS, ROUTES, type UserRole } from "@/lib/auth";
import { VenueAvailabilityCalendar } from "./venue-availability";

export type VenuesView = "manage" | "availability";
type View = VenuesView;

// Venue Staff only. Coordinators and Leads browse venues, details and
// availability inside each event's venue section (SPM-72/74).
const VIEWS: Partial<Record<UserRole, { id: View; label: string }[]>> = {
  VENUE_STAFF: [{ id: "manage", label: "Manage venues" }, { id: "availability", label: "Availability" }],
};

const TITLES: Record<View, { title: string; description: string }> = {
  manage: { title: "My Venues", description: "Manage venue records, status, details and setup/turnaround times." },
  availability: { title: "Venue Availability", description: "Bookings, operational blocks and setup/turnaround time for the venues and dates you choose." },
};

// /venues (manage) and /venues/availability: what each role may do with
// venues. Each view is its own path, so the navigation panel follows it.
// Navigation is presentation only; every API enforces the same roles.
export function VenuesWorkspace({ view }: { view: View }) {
  const user = useSessionUser();
  const searchParams = useSearchParams();
  const views = user ? VIEWS[user.role] : undefined;

  if (!user) return null;
  if (!views) {
    return (
      <PageContent title="Venue access required" eyebrow="VENUE PLANNING">
        <AlertBanner tone="error">Your account does not have permission to view this page. Coordinators find venues in each event&apos;s venue section.</AlertBanner>
      </PageContent>
    );
  }

  const rawVenueId = searchParams.get("venueId");
  const venueId = rawVenueId && /^[1-9]\d{0,9}$/.test(rawVenueId) ? rawVenueId : null;
  // Opened from a venue's page: "Manage venues" goes back to that venue (SPM-186).
  const fromVenue = searchParams.get("from") === "venue" && venueId !== null;
  const hrefFor = (id: View) => {
    if (id === "manage") return fromVenue ? `/venues/${venueId}` : ROUTES.venues;
    return `${ROUTES.venueAvailability}${venueId ? `?venueId=${venueId}` : ""}${venueId && fromVenue ? "&from=venue" : ""}`;
  };

  return (
    <PageContent
      title={TITLES[view].title}
      eyebrow={ROLE_LABELS[user.role]}
      description={TITLES[view].description} action={<NotificationsBell />}
      // One venue's calendar was opened from a venue or the venue list; the
      // whole calendar is a main page reached from the navigation.
      back={view === "availability" && venueId ? <BackButton fallback={fromVenue ? `/venues/${venueId}` : "/venues"} /> : undefined}
    >
      {views.length > 1 ? (
        <nav aria-label="Venue views" className="flex flex-wrap gap-2">
          {views.map((item) => (
            <Link
              key={item.id}
              href={hrefFor(item.id)}
              aria-current={item.id === view ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-pill px-4 text-sm font-semibold transition-colors ${item.id === view ? "bg-primary text-on-primary" : "bg-surface-container-low text-primary hover:bg-surface-container-high"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
      {view === "manage" ? <VenueManagementList /> : null}
      {view === "availability" ? <VenueAvailabilityCalendar key={venueId ?? "all"} /> : null}
    </PageContent>
  );
}
