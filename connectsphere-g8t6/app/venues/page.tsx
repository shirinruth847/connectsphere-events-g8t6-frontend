"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { PageContent } from "@/components/layout/page-content";
import { AlertBanner, Button, EmptyState, ReferenceIdTag, SectionCard, Skeleton } from "@/components/shared/primitives";
import { useSessionUser } from "@/components/auth/auth-gate";
import { ApiError } from "@/lib/api";
import { getVenueCatalogue, type Venue } from "@/lib/api/venues";

const formatValue = (value: string | string[] | null | undefined) => {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None listed";
  return value || "Not listed";
};

// Detail fields are null both when nothing is recorded and when the detail
// service could not be read; detailStatus tells them apart.
const formatDetail = (venue: Venue, value: string | string[] | null) =>
  value === null && venue.detailStatus === "NOT_CHECKED" ? "Not checked" : formatValue(value);

function VenueCatalogueContent() {
  const router = useRouter();
  const user = useSessionUser();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [detailsAvailable, setDetailsAvailable] = useState(true);
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setState("loading");
      setError("");
      const result = await getVenueCatalogue();
      setVenues(result.venues);
      setDetailsAvailable(result.detailsAvailable);
      setState("ready");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace("/");
        return;
      }
      setState(caught instanceof ApiError && caught.status === 403 ? "forbidden" : "error");
      setError(caught instanceof Error ? caught.message : "The venue catalogue could not be loaded.");
    }
  }, [router]);

  useEffect(() => {
    let mounted = true;
    const permitted = user ? ["COORDINATOR", "COORDINATOR_LEAD", "VENUE_STAFF"].includes(user.role) : false;
    if (!mounted) return;
    if (!user) return;
    if (!permitted) {
      return;
    }
    queueMicrotask(() => void load());
    return () => {
      mounted = false;
    };
  }, [load, user]);

  if (user && !["COORDINATOR", "COORDINATOR_LEAD", "VENUE_STAFF"].includes(user.role)) {
    return (
      <PageContent title="Catalogue access required" eyebrow="VENUE PLANNING">
        <AlertBanner tone="error">Your account does not have permission to view available venues.</AlertBanner>
      </PageContent>
    );
  }

  if (state === "loading") {
    return (
      <PageContent title="Venue Catalogue" eyebrow="VENUE PLANNING" description="Review venues currently available for event planning.">
        <Skeleton className="h-32 w-full" />
      </PageContent>
    );
  }

  if (state === "error") {
    return (
      <PageContent title="Venue Catalogue" eyebrow="VENUE PLANNING" description="Review venues currently available for event planning.">
        <AlertBanner tone="error" title="Unable to load venues">
          {error}
        </AlertBanner>
        <Button onClick={() => void load()}>Retry</Button>
      </PageContent>
    );
  }

  return (
    <PageContent title="Venue Catalogue" eyebrow="VENUE PLANNING" description="Review venues currently available for event planning.">
      {venues.length === 0 ? (
        <EmptyState
          title="No venues are currently available"
          description="There are no available venues to consider at this time."
        />
      ) : (
        <div className="space-y-4">
          {!detailsAvailable && (
            <AlertBanner tone="info" title="Venue details are temporarily unavailable">
              Availability and room information are shown from the venue catalogue. Descriptive details will appear when the detail service is available.
            </AlertBanner>
          )}
          {venues.map((venue) => (
            <SectionCard key={venue.venueId} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-on-surface sm:text-xl">{venue.name}</h2>
                  <p className="mt-1 text-sm text-on-surface-variant">{venue.address}</p>
                </div>
                <div className="flex items-center gap-2">
                  <ReferenceIdTag value={`VENUE-${venue.venueId}`} />
                  <span className="inline-flex rounded-chip bg-primary-fixed px-2 py-1 text-[11px] font-semibold uppercase tracking-label text-primary">
                    Read-only catalogue
                  </span>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-label text-on-surface-variant">Capacity</span>
                  <p className="mt-1 text-sm font-medium text-on-surface">{venue.maxCapacity.toLocaleString()} people</p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-label text-on-surface-variant">Operating Hours</span>
                  <p className="mt-1 text-sm font-medium text-on-surface">{venue.operatingHours || "Not listed"}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-label text-on-surface-variant">Accessibility</span>
                  <p className="mt-1 text-sm font-medium text-on-surface">{formatDetail(venue, venue.accessibilityFeatures)}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-label text-on-surface-variant">Rooms</span>
                  <p className="mt-1 text-sm font-medium text-on-surface">
                    {venue.rooms.length
                      ? venue.rooms.map((room) => `${room.layoutType} (${room.capacity})`).join(", ")
                      : "None listed"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-on-surface-variant">
                <span>Facilities: {formatDetail(venue, venue.facilities)}</span>
                <span>
                  Details: {venue.detailStatus === "CURRENT"
                    ? "Current"
                    : venue.detailStatus === "NOT_AVAILABLE"
                      ? "Not available"
                      : "Not checked"}
                </span>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </PageContent>
  );
}

export default function VenueCataloguePage() {
  return (
    <DashboardWorkspace>
      <VenueCatalogueContent />
    </DashboardWorkspace>
  );
}
