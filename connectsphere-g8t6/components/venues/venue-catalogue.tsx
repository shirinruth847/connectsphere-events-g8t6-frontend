"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertBanner, Button, EmptyState, FormLabel, ReferenceIdTag, SectionCard, Skeleton, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { ApiError } from "@/lib/api";
import { getVenueCatalogue, type CatalogueFilters, type Venue } from "@/lib/api/venues";

const formatValue = (value: string | string[] | null | undefined) => {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None listed";
  return value || "Not listed";
};

// Detail fields are null both when nothing is recorded and when the detail
// service could not be read; detailStatus tells them apart.
const formatDetail = (venue: Venue, value: string | string[] | null) =>
  value === null && venue.detailStatus === "NOT_CHECKED" ? "Not checked" : formatValue(value);

const formatBuffers = (venue: Venue) => {
  if (venue.setupMinutes == null || venue.turnaroundMinutes == null) {
    return venue.detailStatus === "NOT_CHECKED" ? "Not checked" : "Not recorded";
  }
  return `${venue.setupMinutes} min setup · ${venue.turnaroundMinutes} min turnaround`;
};

type CatalogueState =
  | { status: "loading" }
  | { status: "ready"; venues: Venue[]; detailsAvailable: boolean; filtersNotChecked: string[] }
  | { status: "error"; message: string; fields?: Record<string, string> };

const EMPTY_FILTERS: CatalogueFilters = { search: "", minCapacity: "", layout: "", facility: "", accessibility: "" };
const FILTER_FIELDS: { key: keyof CatalogueFilters; label: string; placeholder: string; inputMode?: "numeric" }[] = [
  { key: "search", label: "Search", placeholder: "Venue name or location" },
  { key: "minCapacity", label: "Minimum capacity", placeholder: "e.g. 100", inputMode: "numeric" },
  { key: "layout", label: "Layout", placeholder: "e.g. Theater" },
  { key: "facility", label: "Facility", placeholder: "e.g. Projector" },
  { key: "accessibility", label: "Accessibility", placeholder: "e.g. Step-free" },
];

function VenueCard({ venue }: { venue: Venue }) {
  return (
    <SectionCard className="space-y-4">
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
        {[
          ["Capacity", `${venue.maxCapacity.toLocaleString()} people`],
          ["Operating Hours", venue.operatingHours || "Not listed"],
          ["Accessibility", formatDetail(venue, venue.accessibilityFeatures)],
          ["Rooms", venue.rooms.length ? venue.rooms.map((room) => `${room.layoutType} (${room.capacity})`).join(", ") : "None listed"],
          ["Setup & turnaround", formatBuffers(venue)],
          ["Supported layouts", formatDetail(venue, venue.supportedLayouts)],
        ].map(([label, value]) => (
          <div key={label}>
            <span className="text-xs font-semibold uppercase tracking-label text-on-surface-variant">{label}</span>
            <p className="mt-1 text-sm font-medium text-on-surface">{value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-on-surface-variant">
        <span>Facilities: {formatDetail(venue, venue.facilities)}</span>
        <span>
          Details: {venue.detailStatus === "CURRENT" ? "Current" : venue.detailStatus === "NOT_AVAILABLE" ? "Not available" : "Not checked"}
        </span>
      </div>
    </SectionCard>
  );
}

// The read-only Venue Catalogue (SPM-72) with search and filters. Filtering
// runs on the backend; the layout/facility/accessibility filters read the
// venue detail documents.
export function VenueCatalogue() {
  const router = useRouter();
  const [draft, setDraft] = useState<CatalogueFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<CatalogueFilters>(EMPTY_FILTERS);
  const [state, setState] = useState<CatalogueState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const filtered = Object.values(applied).some((value) => value?.trim());

  useEffect(() => {
    let alive = true;
    getVenueCatalogue(applied)
      .then((result) => {
        if (alive) setState({ status: "ready", ...result, filtersNotChecked: result.filtersNotChecked ?? [] });
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        if (caught instanceof ApiError && caught.status === 401) {
          router.replace("/");
          return;
        }
        setState({
          status: "error",
          message: caught instanceof Error ? caught.message : "The venue catalogue could not be loaded.",
          fields: caught instanceof ApiError ? caught.fields : undefined,
        });
      });
    return () => {
      alive = false;
    };
  }, [applied, attempt, router]);

  const apply = (next: CatalogueFilters) => {
    setState({ status: "loading" });
    setApplied(next);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    apply(draft);
  };
  const clear = () => {
    setDraft(EMPTY_FILTERS);
    apply(EMPTY_FILTERS);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} aria-label="Search and filter venues" className="grid gap-3 rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:grid-cols-2 xl:grid-cols-[2fr_repeat(4,minmax(0,1fr))]">
        {FILTER_FIELDS.map((field) => (
          <div key={field.key}>
            <FormLabel htmlFor={`catalogue-${field.key}`}>{field.label}</FormLabel>
            <input
              id={`catalogue-${field.key}`}
              className={fieldClasses}
              value={draft[field.key] ?? ""}
              placeholder={field.placeholder}
              inputMode={field.inputMode}
              onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}
            />
            {state.status === "error" && state.fields?.[field.key] ? (
              <p className="mt-1 text-xs text-error">{state.fields[field.key]}</p>
            ) : null}
          </div>
        ))}
        <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-5">
          <Button type="submit"><Icon name="check" size={16} />Apply filters</Button>
          <Button type="button" variant="quiet" onClick={clear} disabled={!filtered && !Object.values(draft).some((value) => value?.trim())}>
            Clear filters
          </Button>
        </div>
      </form>

      {state.status === "loading" ? (
        <div className="grid gap-4" aria-busy="true" aria-label="Loading venues">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : null}

      {state.status === "error" ? (
        <AlertBanner tone="error" title="Unable to load venues">
          {state.fields ? Object.values(state.fields).join(" ") : state.message}
          <div className="mt-3">
            <Button variant="secondary" onClick={() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }}>
              <Icon name="refresh" size={16} />Retry
            </Button>
          </div>
        </AlertBanner>
      ) : null}

      {state.status === "ready" ? (
        <>
          {!state.detailsAvailable ? (
            <AlertBanner tone="info" title="Venue details are temporarily unavailable">
              Availability and room information are shown from the venue catalogue. Descriptive details will appear when the detail service is available.
              {state.filtersNotChecked.length ? ` The ${state.filtersNotChecked.join(", ")} filter could not be checked.` : ""}
            </AlertBanner>
          ) : null}
          {state.venues.length === 0 ? (
            filtered ? (
              <EmptyState
                title="No venues match these filters"
                description="Try a different search or clear the filters to see every available venue."
                action={<Button variant="secondary" onClick={clear}>Clear filters</Button>}
              />
            ) : (
              <EmptyState title="No venues are currently available" description="There are no available venues to consider at this time." />
            )
          ) : (
            <>
              <p className="text-sm text-on-surface-variant" aria-live="polite">
                {state.venues.length} {state.venues.length === 1 ? "venue" : "venues"}{filtered ? " match your filters" : " available"}
              </p>
              {state.venues.map((venue) => <VenueCard key={venue.venueId} venue={venue} />)}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
