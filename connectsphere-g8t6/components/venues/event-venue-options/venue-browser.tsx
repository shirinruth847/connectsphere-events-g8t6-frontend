"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlertBanner, Button, EmptyState, FormLabel, Skeleton, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { SortOrderToggle } from "@/components/venues/sort-order-toggle";
import { VenueAvailabilityCalendar } from "@/components/venues/venue-availability";
import { VENUE_OPTION_SORT_OPTIONS, type VenueOptionSort } from "@/components/venues/venue-queries";
import { ApiError } from "@/lib/api";
import type { EventVenueOption, VenueOptionsQuery, VenueOptionsResult } from "@/lib/api/event-venues";
import { VenueOptionCard } from "./venue-option-card";
import { VenueOptionPanel } from "./venue-option-panel";
import { DEFAULT_VENUE_PAGE_SIZE, VENUE_PAGE_SIZES, showMoreCount, venueById, type VenuePageSize } from "./venue-option-model";

type OptionsState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string; fields?: Record<string, string> };

type Filters = Required<Pick<VenueOptionsQuery, "search" | "minCapacity" | "layout" | "facility" | "accessibility" | "requiredFacilities">>;

const EMPTY_FILTERS: Filters = { search: "", minCapacity: "", layout: "", facility: "", accessibility: "", requiredFacilities: "" };
const FILTER_FIELDS: { key: keyof Filters; label: string; placeholder: string; inputMode?: "numeric" }[] = [
  { key: "search", label: "Search", placeholder: "Venue name or location" },
  { key: "minCapacity", label: "Minimum capacity", placeholder: "e.g. 100", inputMode: "numeric" },
  { key: "layout", label: "Layout", placeholder: "e.g. Theater" },
  { key: "facility", label: "Facility", placeholder: "e.g. Projector" },
  { key: "accessibility", label: "Accessibility", placeholder: "e.g. Step-free" },
  { key: "requiredFacilities", label: "Required facilities", placeholder: "e.g. Projector, Stage" },
];

export interface VenueCalendarWindow {
  date: Date;
  check: { date: string; startTime: string; endTime: string } | null;
}

interface VenueBrowserProps<T extends VenueOptionsResult> {
  // Loads the venues for the applied filters. Called again when reloadKey
  // changes, e.g. when the organiser edits the date or attendance.
  load: (query: VenueOptionsQuery) => Promise<T>;
  reloadKey: string;
  // Every load's result, e.g. for the coordinator's "can select" permission.
  onLoaded?: (data: T) => void;
  // The event window for the availability calendar; coordinators only.
  calendar?: VenueCalendarWindow | null;
  badge?: (venue: EventVenueOption) => ReactNode;
  action?: (venue: EventVenueOption, place: "card" | "panel") => ReactNode;
}

// Search, filter, sort, view, compare and (coordinator) check the calendar
// for the available venues (SPM-72/74/76). Requirement matching comes from the
// backend. No <form>: it sits inside the organiser's request form, so Enter
// in a filter applies the filters instead of submitting the request.
export function VenueBrowser<T extends VenueOptionsResult>({ load, reloadKey, onLoaded, calendar, badge, action }: VenueBrowserProps<T>) {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<VenueOptionSort>("match");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState<VenuePageSize>(DEFAULT_VENUE_PAGE_SIZE);
  const [shown, setShown] = useState<number>(DEFAULT_VENUE_PAGE_SIZE);
  const [state, setState] = useState<OptionsState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [viewId, setViewId] = useState<number | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareId, setCompareId] = useState<number | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const panelsRef = useRef<HTMLDivElement>(null);
  const loadRef = useRef(load);
  const loadedRef = useRef(onLoaded);
  const filtered = Object.values(applied).some((value) => value.trim());

  useEffect(() => {
    loadRef.current = load;
    loadedRef.current = onLoaded;
  });

  useEffect(() => {
    let alive = true;
    loadRef.current({ ...applied, sort, order })
      .then((data) => {
        if (!alive) return;
        setState({ status: "ready", data });
        loadedRef.current?.(data);
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        setState({
          status: "error",
          message: caught instanceof Error ? caught.message : "Venues could not be loaded.",
          fields: caught instanceof ApiError && Object.keys(caught.fields ?? {}).length ? caught.fields : undefined,
        });
      });
    return () => { alive = false; };
  }, [reloadKey, applied, sort, order, attempt]);

  const reload = (next?: Partial<{ applied: Filters; sort: VenueOptionSort; order: "asc" | "desc" }>) => {
    setState({ status: "loading" });
    setShown(pageSize);
    if (next?.applied) setApplied(next.applied);
    if (next?.sort) setSort(next.sort);
    if (next?.order) setOrder(next.order);
  };
  const apply = () => reload({ applied: draft });
  const clear = () => {
    setDraft(EMPTY_FILTERS);
    reload({ applied: EMPTY_FILTERS });
  };
  const applyOnEnter = (keyEvent: KeyboardEvent<HTMLInputElement>) => {
    if (keyEvent.key !== "Enter") return;
    keyEvent.preventDefault();
    apply();
  };

  const venues = state.status === "ready" ? state.data.venues : [];
  const viewing = venueById(venues, viewId);
  const comparing = venueById(venues, compareId);
  const calendarVenueIds = [viewing?.venueId, compareOpen ? comparing?.venueId : undefined].filter((id): id is number => id !== undefined);
  const more = showMoreCount(shown, venues.length, pageSize);
  const scrollToPanels = () => panelsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // minmax(0, 1fr) tracks keep long venue names from widening the page; the
  // container queries fit three cards per row wherever the browser is placed.
  return (
    <section aria-label="Venue search" className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div role="search" aria-label="Search and filter venues" className="grid gap-3 rounded-panel bg-surface-container-low p-4 @lg:grid-cols-2 @2xl:grid-cols-3">
        {FILTER_FIELDS.map((field) => (
          <div key={field.key} className="min-w-0">
            <FormLabel htmlFor={`venue-option-${field.key}`}>{field.label}</FormLabel>
            <input
              id={`venue-option-${field.key}`}
              className={fieldClasses}
              value={draft[field.key]}
              placeholder={field.placeholder}
              inputMode={field.inputMode}
              onKeyDown={applyOnEnter}
              onChange={(changeEvent) => setDraft((current) => ({ ...current, [field.key]: changeEvent.target.value }))}
            />
            {state.status === "error" && state.fields?.[field.key] ? <p className="mt-1 text-xs text-error">{state.fields[field.key]}</p> : null}
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2 @lg:col-span-2 @2xl:col-span-3">
          <Button type="button" onClick={apply}><Icon name="check" size={16} />Apply filters</Button>
          <Button type="button" variant="quiet" onClick={clear} disabled={!filtered && !Object.values(draft).some((value) => value.trim())}>Clear filters</Button>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <div>
              <FormLabel htmlFor="venue-option-sort">Sort by</FormLabel>
              <select id="venue-option-sort" className={fieldClasses} value={sort} onChange={(changeEvent) => reload({ sort: changeEvent.target.value as VenueOptionSort })}>
                {VENUE_OPTION_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <SortOrderToggle order={order} onChange={(next) => reload({ order: next })} />
            <div>
              <FormLabel htmlFor="venue-option-page-size">Show</FormLabel>
              <select
                id="venue-option-page-size"
                className={fieldClasses}
                value={pageSize}
                onChange={(changeEvent) => {
                  const size = Number(changeEvent.target.value) as VenuePageSize;
                  setPageSize(size);
                  setShown(size);
                }}
              >
                {VENUE_PAGE_SIZES.map((size) => <option key={size} value={size}>{size} venues</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {state.status === "ready" && venues.length ? (
        <div className="grid min-w-0 scroll-mt-4 grid-cols-[minmax(0,1fr)] gap-4" ref={panelsRef}>
          <div>
            <Button type="button" variant="secondary" aria-pressed={compareOpen} onClick={() => { setCompareOpen((open) => !open); if (compareOpen) setCompareId(null); }}>
              <Icon name="layout" size={16} />{compareOpen ? "Hide comparison view" : "Show comparison view"}
            </Button>
          </div>
          {viewing || compareOpen ? (
            <div className={`grid items-start gap-4 grid-cols-[minmax(0,1fr)] ${compareOpen ? "@2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`}>
              <VenueOptionPanel
                label="Venue details"
                venue={viewing}
                venues={venues}
                onChoose={setViewId}
                onClose={compareOpen ? undefined : () => { setViewId(null); setCalendarOpen(false); }}
                badge={viewing ? badge?.(viewing) : undefined}
                action={viewing ? action?.(viewing, "panel") : undefined}
              />
              {compareOpen ? (
                <VenueOptionPanel
                  label="Compare with"
                  venue={comparing}
                  venues={venues}
                  onChoose={setCompareId}
                  onClose={() => { setCompareOpen(false); setCompareId(null); }}
                  badge={comparing ? badge?.(comparing) : undefined}
                  action={comparing ? action?.(comparing, "panel") : undefined}
                />
              ) : null}
            </div>
          ) : null}
          {calendar ? (
            <div className="grid min-w-0 gap-3">
              <div>
                <Button type="button" variant="secondary" aria-pressed={calendarOpen} disabled={!calendarVenueIds.length} onClick={() => setCalendarOpen((open) => !open)}>
                  <Icon name="calendar" size={16} />{calendarOpen ? "Hide availability calendar" : "Show availability calendar"}
                </Button>
              </div>
              {calendarOpen && calendarVenueIds.length ? (
                <div className="min-w-0 overflow-x-auto">
                  <VenueAvailabilityCalendar key={calendarVenueIds.join(",")} fixed={{ venueIds: calendarVenueIds, date: calendar.date, check: calendar.check }} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {state.status === "loading" ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @lg:grid-cols-2 @2xl:grid-cols-3" aria-busy="true" aria-label="Loading venues">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      {state.status === "error" ? (
        <AlertBanner tone="error" title="Unable to load venues">
          {state.fields ? Object.values(state.fields).join(" ") : state.message}
          <div className="mt-3">
            <Button type="button" variant="secondary" onClick={() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }}><Icon name="refresh" size={16} />Retry</Button>
          </div>
        </AlertBanner>
      ) : null}

      {state.status === "ready" ? (
        <>
          {!state.data.detailsAvailable ? (
            <AlertBanner tone="info" title="Error loading venue details">
              Capacity and rooms come from the venue records; layout, facility and accessibility requirements cannot be checked right now.
              {state.data.filtersNotChecked.length ? ` The ${state.data.filtersNotChecked.join(", ")} filter could not be checked.` : ""}
            </AlertBanner>
          ) : null}
          {!state.data.availabilityChecked && venues.length ? (
            <AlertBanner tone="warning" title="Error checking availability">No venue is shown as available. Try again shortly.</AlertBanner>
          ) : null}
          {venues.length === 0 ? (
            filtered ? (
              <EmptyState title="No venues match these filters" description="Try a different search or clear the filters to see every available venue." action={<Button type="button" variant="secondary" onClick={clear}>Clear filters</Button>} />
            ) : (
              <EmptyState title="No venues are currently available" description="There are no available venues to consider at this time." />
            )
          ) : (
            <>
              <p className="text-sm text-on-surface-variant" aria-live="polite">
                {venues.length} {venues.length === 1 ? "venue" : "venues"}{filtered ? " match your filters" : " available"}
                {((met) => ` · ${met} ${met === 1 ? "meets" : "meet"} every requirement`)(venues.filter((venue) => venue.allRequirementsMet).length)}
              </p>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @lg:grid-cols-2 @2xl:grid-cols-3">
                {venues.slice(0, shown).map((venue) => (
                  <VenueOptionCard
                    key={venue.venueId}
                    venue={venue}
                    viewing={venue.venueId === viewId}
                    comparing={compareOpen && venue.venueId === compareId}
                    compareOpen={compareOpen}
                    badge={badge?.(venue)}
                    action={action?.(venue, "card")}
                    onView={() => { setViewId(venue.venueId); scrollToPanels(); }}
                    onCompare={() => { setCompareId(venue.venueId); scrollToPanels(); }}
                  />
                ))}
              </div>
              {more ? (
                <div className="flex justify-center">
                  <Button type="button" variant="secondary" onClick={() => setShown((value) => value + pageSize)}>Show more venues ({more} more)</Button>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
