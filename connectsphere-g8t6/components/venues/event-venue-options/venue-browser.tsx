"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlertBanner, Button, EmptyState, Skeleton, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { SortOrderToggle } from "@/components/venues/sort-order-toggle";
import { VENUE_OPTION_SORT_OPTIONS, type VenueOptionSort } from "@/components/venues/venue-queries";
import { ApiError } from "@/lib/api";
import type { EventVenueOption, VenueOptionsQuery, VenueOptionsResult } from "@/lib/api/event-venues";
import type { VenueCalendarWindow } from "./venue-details";
import { VenueMultiSelect } from "./venue-multi-select";
import { VenueOptionCard } from "./venue-option-card";
import { VenueOptionPanel } from "./venue-option-panel";
import { DEFAULT_VENUE_PAGE_SIZE, EMPTY_FILTER_CHOICES, MAX_VENUE_PAGE_SIZE, parsePageSize, showMoreCount, venueById, venueFilterChoices } from "./venue-option-model";

type OptionsState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string; fields?: Record<string, string> };

// Search and capacity are typed; layout, facility and accessibility are
// multi-selects of the values the venues carry (developer request of 25
// October 2026): any of the layouts, all of the facilities and features.
type Filters = { search: string; minCapacity: string; layout: string[]; facility: string[]; accessibility: string[] };
type TextField = { key: "search" | "minCapacity"; label: string; placeholder: string; inputMode?: "numeric" };

const EMPTY_FILTERS: Filters = { search: "", minCapacity: "", layout: [], facility: [], accessibility: [] };
const hasValue = (filters: Filters) => Object.values(filters).some((value) => (Array.isArray(value) ? value.length > 0 : Boolean(value.trim())));
// Search and capacity share the first line; the detail filters the second.
const SEARCH_FIELD: TextField = { key: "search", label: "Search", placeholder: "Search by venue name or location" };
const CAPACITY_FIELD: TextField = { key: "minCapacity", label: "Minimum capacity", placeholder: "Min. capacity", inputMode: "numeric" };
// The shared field style without its full width, for the toolbar selects.
const compactSelect = `${fieldClasses.replace("w-full", "w-auto")} py-2`;

interface VenueBrowserProps<T extends VenueOptionsResult> {
  // Loads the venues for the applied filters; called again when reloadKey changes.
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
// for the available venues (SPM-72/74/75); each details panel has its own
// calendar button (developer request of 25 October 2026). Requirement matching comes from
// the backend. The cards scroll inside a window two rows of three tall
// (developer request of 23 October 2026); the event page opens this in a popup.
export function VenueBrowser<T extends VenueOptionsResult>({ load, reloadKey, onLoaded, calendar, badge, action }: VenueBrowserProps<T>) {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<VenueOptionSort>("match");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState(DEFAULT_VENUE_PAGE_SIZE);
  const [pageSizeText, setPageSizeText] = useState(String(DEFAULT_VENUE_PAGE_SIZE));
  const [shown, setShown] = useState(DEFAULT_VENUE_PAGE_SIZE);
  const [state, setState] = useState<OptionsState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [viewId, setViewId] = useState<number | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareId, setCompareId] = useState<number | null>(null);
  const [choices, setChoices] = useState(EMPTY_FILTER_CHOICES);
  const panelsRef = useRef<HTMLDivElement>(null);
  const loadRef = useRef(load);
  const loadedRef = useRef(onLoaded);
  const filtered = hasValue(applied);

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
        setChoices((current) => venueFilterChoices(data.venues, current));
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
  const more = showMoreCount(shown, venues.length, pageSize);
  const fieldErrors = state.status === "error" ? state.fields : undefined;
  const scrollToPanels = () => panelsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  // A related venue (e.g. a room of this hall) opens in the details panel. One
  // the filters hide is shown after clearing them; every related venue the
  // backend returns can be chosen.
  const openVenue = (venueId: number) => {
    if (!venues.some((venue) => venue.venueId === venueId)) {
      setDraft(EMPTY_FILTERS);
      reload({ applied: EMPTY_FILTERS });
    }
    setViewId(venueId);
    scrollToPanels();
  };

  // Labels are visually hidden (each placeholder says what its box is for) so
  // the box stays two lines tall.
  const input = (field: TextField, className: string) => (
    <div key={field.key} className={className}>
      <label htmlFor={`venue-option-${field.key}`} className="sr-only">{field.label}</label>
      <input
        id={`venue-option-${field.key}`}
        className={`${fieldClasses} py-2`}
        value={draft[field.key]}
        placeholder={field.placeholder}
        title={field.label}
        inputMode={field.inputMode}
        aria-invalid={Boolean(fieldErrors?.[field.key])}
        onKeyDown={applyOnEnter}
        onChange={(changeEvent) => setDraft((current) => ({ ...current, [field.key]: changeEvent.target.value }))}
      />
    </div>
  );
  const multiSelect = (key: "layout" | "facility" | "accessibility", label: string, values: string[]) => (
    <VenueMultiSelect
      label={label}
      values={values}
      selected={draft[key]}
      invalid={Boolean(fieldErrors?.[key])}
      onChange={(selected) => setDraft((current) => ({ ...current, [key]: selected }))}
    />
  );

  // minmax(0, 1fr) tracks keep long venue names from widening the page; the
  // container queries fit three cards per row wherever the browser is placed.
  return (
    <section aria-label="Venue search" className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div role="search" aria-label="Search and filter venues" className="grid gap-2 rounded-panel border border-outline-variant bg-surface-container-low p-3">
        <div className="flex flex-wrap gap-2">
          {input(SEARCH_FIELD, "min-w-0 flex-[3_1_14rem]")}
          {input(CAPACITY_FIELD, "min-w-0 flex-[1_1_8rem]")}
          <div className="flex gap-2">
            <Button type="button" onClick={apply}><Icon name="check" size={16} />Apply filters</Button>
            <Button type="button" variant="quiet" onClick={clear} disabled={!filtered && !hasValue(draft)}>Clear filters</Button>
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 @md:grid-cols-3">
          {multiSelect("layout", "Layout", choices.layouts)}
          {multiSelect("facility", "Facility", choices.facilities)}
          {multiSelect("accessibility", "Accessibility", choices.accessibility)}
        </div>
        {fieldErrors ? <p className="text-xs text-error" role="alert">{Object.values(fieldErrors).join(" ")}</p> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-on-surface-variant" aria-live="polite">
          {state.status === "ready" && venues.length ? (
            <>
              {venues.length} {venues.length === 1 ? "venue" : "venues"}{filtered ? " match your filters" : " available"}
              {((met) => ` · ${met} ${met === 1 ? "meets" : "meet"} every requirement`)(venues.filter((venue) => venue.allRequirementsMet).length)}
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="venue-option-sort" className="text-xs font-semibold text-on-surface-variant">Sort by</label>
          <select id="venue-option-sort" className={compactSelect} value={sort} onChange={(changeEvent) => reload({ sort: changeEvent.target.value as VenueOptionSort })}>
            {VENUE_OPTION_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <SortOrderToggle order={order} onChange={(next) => reload({ order: next })} />
          {/* "Show x results": a typed number from 1 to 100; an unfinished or
              invalid entry keeps the last size and is put back on blur. */}
          <label htmlFor="venue-option-page-size" className="text-xs font-semibold text-on-surface-variant">Show</label>
          <input
            id="venue-option-page-size"
            type="number"
            min={1}
            max={MAX_VENUE_PAGE_SIZE}
            step={1}
            inputMode="numeric"
            className={`${fieldClasses.replace("w-full", "w-20")} py-2`}
            value={pageSizeText}
            aria-describedby="venue-option-page-size-unit"
            onChange={(changeEvent) => {
              setPageSizeText(changeEvent.target.value);
              const size = parsePageSize(changeEvent.target.value);
              if (size === null) return;
              setPageSize(size);
              setShown(size);
            }}
            onBlur={() => setPageSizeText(String(pageSize))}
          />
          <span id="venue-option-page-size-unit" className="text-xs font-semibold text-on-surface-variant">results</span>
          {state.status === "ready" && venues.length ? (
            <Button type="button" variant="secondary" aria-pressed={compareOpen} onClick={() => { setCompareOpen((open) => !open); if (compareOpen) setCompareId(null); }}>
              <Icon name="layout" size={16} />{compareOpen ? "Hide comparison view" : "Show comparison view"}
            </Button>
          ) : null}
        </div>
      </div>

      {state.status === "ready" && venues.length && (viewing || compareOpen) ? (
        <div className="grid min-w-0 scroll-mt-4 grid-cols-[minmax(0,1fr)] gap-3" ref={panelsRef}>
          {viewing || compareOpen ? (
            <div className={`grid items-start gap-3 grid-cols-[minmax(0,1fr)] ${compareOpen ? "@2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`}>
              <VenueOptionPanel
                label="Venue details"
                venue={viewing}
                venues={venues}
                onChoose={setViewId}
                onClose={compareOpen ? undefined : () => setViewId(null)}
                excludeId={compareOpen ? compareId : null}
                onOpenVenue={openVenue}
                calendar={calendar}
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
                  excludeId={viewId}
                  onOpenVenue={(venueId) => (venues.some((venue) => venue.venueId === venueId) ? setCompareId(venueId) : openVenue(venueId))}
                  calendar={calendar}
                  badge={comparing ? badge?.(comparing) : undefined}
                  action={comparing ? action?.(comparing, "panel") : undefined}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {state.status === "loading" ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 @lg:grid-cols-2 @2xl:grid-cols-3" aria-busy="true" aria-label="Loading venues">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
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
              <EmptyState title="No venues are currently available" description="There are no available venues to consider for this event at this time." />
            )
          ) : (
            // A window up to two rows of three cards tall, never taller than the
            // screen; the cards scroll inside it. relative: the cards' sr-only
            // text is clipped with them; without it, text of cards scrolled out
            // of the window stretched the page below the app frame.
            <div
              role="region"
              aria-label="Venue list"
              tabIndex={0}
              className="relative max-h-[min(52rem,calc(100dvh-7rem))] overflow-y-auto overscroll-contain rounded-panel border border-outline-variant bg-surface-container-low p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <div className="grid grid-cols-[minmax(0,1fr)] gap-3 @lg:grid-cols-2 @2xl:grid-cols-3">
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
                    // A venue is never compared with itself.
                    onCompare={venue.venueId === viewId ? undefined : () => { setCompareId(venue.venueId); scrollToPanels(); }}
                  />
                ))}
              </div>
              {more ? (
                <div className="mt-3 flex justify-center">
                  <Button type="button" variant="secondary" onClick={() => setShown((value) => value + pageSize)}>Show more venues ({more} more)</Button>
                </div>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
