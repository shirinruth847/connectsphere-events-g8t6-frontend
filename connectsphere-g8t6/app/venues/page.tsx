"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { PageContent } from "@/components/layout/page-content";
import { AlertBanner, Button, EmptyState, ReferenceIdTag, SectionCard, Skeleton } from "@/components/shared/primitives";
import { useSessionUser } from "@/components/auth/auth-gate";
import { getVenueCatalogue, type Venue } from "@/lib/api/venues";

const formatValue = (value: string | string[] | null | undefined) => {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None listed";
  return value || "Not listed";
};

function VenueCatalogueContent() {
  const router = useRouter();
  const user = useSessionUser();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setState("loading");
      setError("");
      const result = await getVenueCatalogue();
      setVenues(result.venues);
      setState("ready");
    } catch (caught) {
      const typed = caught as Error & { status?: number };
      if (typed.status === 401) {
        router.replace("/");
        return;
      }
      setState(typed.status === 403 ? "forbidden" : "error");
      setError(typed.message || "The venue catalogue could not be loaded.");
    }
  }, [router]);

  useEffect(() => {
    let mounted = true;
    const permitted = user ? ["COORDINATOR", "COORDINATOR_LEAD", "VENUE_STAFF"].includes(user.role) : false;
    if (!mounted) return;
    if (!user) {
      setState("loading");
      return;
    }
    if (!permitted) {
      setState("forbidden");
      return;
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [load, user]);

  if (state === "loading") {
    return (
      <PageContent title="Venue Catalogue" eyebrow="VENUE PLANNING" description="Review venues currently available for event planning.">
        <Skeleton className="h-32 w-full" />
      </PageContent>
    );
  }

  if (state === "forbidden") {
    return (
      <PageContent title="Catalogue access required" eyebrow="VENUE PLANNING">
        <AlertBanner tone="error">Your account does not have permission to view available venues.</AlertBanner>
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
          {venues.map((venue) => (
            <SectionCard key={venue.venueId} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-on-surface sm:text-xl">{venue.name}</h2>
                  <p className="mt-1 text-sm text-on-surface-variant">{venue.address}</p>
                </div>
                <div className="flex items-center gap-2">
                  <ReferenceIdTag value={VENUE-} />
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
                  <p className="mt-1 text-sm font-medium text-on-surface">{formatValue(venue.accessibilityFeatures)}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-label text-on-surface-variant">Rooms</span>
                  <p className="mt-1 text-sm font-medium text-on-surface">
                    {venue.rooms.length
                      ? venue.rooms.map((room) => ${room.layoutType} ()).join(", ")
                      : "None listed"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-on-surface-variant">
                <span>Facilities: {formatValue(venue.facilities)}</span>
                <span>Details: {venue.detailStatus === "CURRENT" ? "Current" : "Not checked"}</span>
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
