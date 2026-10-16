"use client";

import { useCallback, useEffect, useState } from "react";
import { CoordinatorShell } from "@/components/layout/coordinator-shell";
import { getCurrentUser } from "@/lib/api/events";
import { getVenueCatalogue, type Venue } from "@/lib/api/venues";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";

const formatValue = (value: string | string[] | null | undefined) => {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None listed";
  return value || "Not listed";
};

function VenueCatalogueContent() {
  const router = useRouter();
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
    const client = getSupabaseBrowserClient();
    client.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (!session?.access_token) {
        router.replace("/");
        return;
      }
      try {
        const result = await getCurrentUser(session.access_token);
        const permitted = ["COORDINATOR", "COORDINATOR_LEAD", "VENUE_STAFF", "SAFETY_OFFICER"].includes(result.user.role);
        if (!permitted) {
          setState("forbidden");
          return;
        }
        await load();
      } catch (caught) {
        const typed = caught as Error & { status?: number };
        setState(typed.status === 403 ? "forbidden" : "error");
        setError(typed.message || "The venue catalogue could not be loaded.");
      }
    });
    return () => { mounted = false; };
  }, [load, router]);

  if (state === "loading") return <div className="empty-state"><h2>Loading venue catalogue…</h2></div>;
  if (state === "forbidden") return <div className="access-denied"><div className="access-card"><h1>Catalogue access required</h1><p>Your account does not have permission to view available venues.</p></div></div>;
  if (state === "error") return <div className="access-denied"><div className="access-card"><h1>Unable to load venues</h1><p>{error}</p><button className="button button-primary" onClick={() => void load()}>Retry</button></div></div>;

  return <>
    <section className="section-heading"><div><span className="eyebrow">VENUE PLANNING</span><h1>Venue Catalogue</h1><p>Review venues currently available for event planning.</p></div></section>
    {venues.length === 0 ? <div className="empty-state"><span className="empty-icon">⌂</span><h2>No venues are currently available</h2><p>There are no available venues to consider at this time.</p></div> : <div className="request-list">
      {venues.map((venue) => <article className="request-card" key={venue.venueId}>
        <div className="card-top"><span className="status-chip status-chip--primary">AVAILABLE</span><span className="reference-tag">VENUE-{venue.venueId}</span></div>
        <div className="request-main"><div><h2>{venue.name}</h2><p className="description">{venue.address}</p></div><span className="submitted">Read-only catalogue</span></div>
        <div className="details-panel"><div><span className="detail-label">CAPACITY</span><strong>{venue.maxCapacity.toLocaleString()} people</strong></div><div><span className="detail-label">OPERATING HOURS</span><strong>{venue.operatingHours || "Not listed"}</strong></div><div><span className="detail-label">ACCESSIBILITY</span><strong>{formatValue(venue.accessibilityFeatures)}</strong></div><div><span className="detail-label">ROOMS</span><strong>{venue.rooms.length ? venue.rooms.map((room) => `${room.layoutType} (${room.capacity})`).join(", ") : "None listed"}</strong></div></div>
        <div className="card-footer"><span className="next-action">Facilities: {formatValue(venue.facilities)}</span><span className="next-action">Details: {venue.detailStatus === "CURRENT" ? "Current" : "Not checked"}</span></div>
      </article>)}
    </div>}
  </>;
}

export default function VenueCataloguePage() {
  return <CoordinatorShell userName="Event Coordinator" userEmail="coordinator@connectsphere.test"><VenueCatalogueContent /></CoordinatorShell>;
}
