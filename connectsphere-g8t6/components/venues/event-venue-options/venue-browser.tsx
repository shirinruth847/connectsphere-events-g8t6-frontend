"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlertBanner, Button, EmptyState, Skeleton, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { SortOrderToggle } from "@/components/venues/sort-order-toggle";
import { VenueAvailabilityCalendar } from "@/components/venues/venue-availability";
import { VENUE_OPTION_SORT_OPTIONS, type AvailabilityParams, type VenueOptionSort } from "@/components/venues/venue-queries";
import { ApiError } from "@/lib/api";
import type { EventVenueOption, VenueOptionsQuery, VenueOptionsResult } from "@/lib/api/event-venues";
import { VenueOptionCard } from "./venue-option-card";
import { VenueOptionPanel } from "./venue-option-panel";
import { DEFAULT_VENUE_PAGE_SIZE, EMPTY_FILTER_CHOICES, VENUE_PAGE_SIZES, showMoreCount, venueById, venueFilterChoices, type VenuePageSize } from "./venue-option-model";

type OptionsState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string; fields?: Record<string, string> };

type Filters = Required<Pick<VenueOptionsQuery, "search" | "minCapacity" | "layout" | "facility" | "accessibility" | "requiredFacilities">>;
type FilterField = { key: keyof Filters; label: string; placeholder: string; inputMode?: "numeric" };

const EMPTY_FILTERS: Filters = { search: "", minCapacity: "", layout: "", facility: "", accessibility: "", requiredFacilities: "" };
// Search and capacity share the first line; the detail filters the second.
const SEARCH_FIELD: FilterField = { key: "search", label: "Search", placeholder: "Search by venue name or location" };
const CAPACITY_FIELD: FilterField = { key: "minCapacity", label: "Minimum capacity", placeholder: "Min. capacity", inputMode: "numeric" };
// The detail filters are dropdowns of the values the venues carry; each
// placeholder is the empty choice.
const LAYOUT_FIELD: FilterField = { key: "layout", label: "Layout", placeholder: "Layout" };
const FACILITY_FIELD: FilterField = { key: "facility", label: "Facility", placeholder: "Has facility" };
const ACCESSIBILITY_FIELD: FilterField = { key: "accessibility", label: "Accessibility", placeholder: "Accessibility" };
const RANK_FIELD: FilterField = { key: "requiredFacilities", label: "Required facilities", placeholder: "Rank by facilities" };
// The backend ranks by at most this many facilities.
const MAX_RANKED_FACILITIES = 10;
const splitFacilities = (value: string) => value.split(",").map((term) => term.trim()).filter(Boolean);
// The shared field style without its full width, for the toolbar selects.
const compactSelect = `${fieldClasses.replace("w-full", "w-auto")} py-2`;

export interface VenueCalendarWindow {
  date: Date;
  check: AvailabilityParams["check"];
}

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
// for the available venues (SPM-72/74/75). Requirement matching comes from
// the backend. The cards scroll inside a window two rows of three tall, so the
// page stays short (developer request of 23 October 2026).
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
  const [choices, setChoices] = useState(EMPTY_FILTER_CHOICES);
  const [rankOpen, setRankOpen] = useState(false);
  const rankRef = useRef<HTMLDivElement>(null);
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

  // The facility checklist closes on an outside click or Escape.
  useEffect(() => {
    if (!rankOpen) return;
    const closeOutside = (pointer: PointerEvent) => {
      if (!rankRef.current?.contains(pointer.target as Node)) setRankOpen(false);
    };
    const closeOnEscape = (key: globalThis.KeyboardEvent) => {
      if (key.key === "Escape") setRankOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [rankOpen]);

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
  const fieldErrors = state.status === "error" ? state.fields : undefined;
  const scrollToPanels = () => panelsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Labels are visually hidden (each placeholder says what its box is for) so
  // the box stays two lines tall.
  const input = (field: FilterField, className: string) => (
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
  // A chosen value stays listed even if no loaded venue still carries it.
  const dropdown = (field: FilterField, values: string[]) => {
    const current = draft[field.key];
    const listed = current && !values.some((value) => value.toLowerCase() === current.toLowerCase()) ? [current, ...values] : values;
    return (
      <div key={field.key} className="min-w-0">
        <label htmlFor={`venue-option-${field.key}`} className="sr-only">{field.label}</label>
        <select
          id={`venue-option-${field.key}`}
          className={`${fieldClasses} py-2`}
          value={current}
          title={field.label}
          aria-invalid={Boolean(fieldErrors?.[field.key])}
          onChange={(changeEvent) => setDraft((draftNow) => ({ ...draftNow, [field.key]: changeEvent.target.value }))}
        >
          <option value="">{field.placeholder}</option>
          {listed.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
    );
  };
  const ranked = splitFacilities(draft.requiredFacilities);
  const rankChoices = [...ranked.filter((term) => !choices.facilities.some((value) => value.toLowerCase() === term.toLowerCase())), ...choices.facilities];
  const toggleRanked = (facility: string, checked: boolean) => setDraft((current) => {
    const terms = splitFacilities(current.requiredFacilities).filter((term) => term.toLowerCase() !== facility.toLowerCase());
    return { ...current, requiredFacilities: (checked ? [...terms, facility] : terms).join(", ") };
  });

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
            <Button type="button" variant="quiet" onClick={clear} disabled={!filtered && !Object.values(draft).some((value) => value.trim())}>Clear filters</Button>
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 @md:grid-cols-2 @xl:grid-cols-4">
          {dropdown(LAYOUT_FIELD, choices.layouts)}
          {dropdown(FACILITY_FIELD, choices.facilities)}
          {dropdown(ACCESSIBILITY_FIELD, choices.accessibility)}
          <div className="relative min-w-0" ref={rankRef}>
            <button
              type="button"
              id={`venue-option-${RANK_FIELD.key}`}
              className={`${fieldClasses} flex items-center justify-between gap-2 py-2 text-left`}
              aria-label={RANK_FIELD.label}
              aria-expanded={rankOpen}
              aria-controls="venue-option-rank-list"
              title={RANK_FIELD.label}
              onClick={() => setRankOpen((open) => !open)}
            >
              <span className="truncate">{ranked.length ? `Rank by ${ranked.join(", ")}` : RANK_FIELD.placeholder}</span>
              <span aria-hidden="true" className="text-xs text-on-surface-variant">▾</span>
            </button>
            {rankOpen ? (
              <fieldset id="venue-option-rank-list" className="absolute right-0 z-20 mt-1 grid max-h-64 w-full min-w-56 gap-1 overflow-y-auto rounded-control border border-outline-variant bg-surface-container-lowest p-2 shadow-elevation-2">
                <legend className="sr-only">{RANK_FIELD.label}</legend>
                {rankChoices.length ? rankChoices.map((facility) => {
                  const checked = ranked.some((term) => term.toLowerCase() === facility.toLowerCase());
                  return (
                    <label key={facility} className="flex min-h-9 items-center gap-2 rounded-control px-2 text-sm text-on-surface hover:bg-surface-container-low">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={checked}
                        disabled={!checked && ranked.length >= MAX_RANKED_FACILITIES}
                        onChange={(changeEvent) => toggleRanked(facility, changeEvent.target.checked)}
                      />
                      {facility}
                    </label>
                  );
                }) : <p className="px-2 py-1 text-sm text-on-surface-variant">No facilities recorded</p>}
              </fieldset>
            ) : null}
          </div>
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
          <label htmlFor="venue-option-page-size" className="text-xs font-semibold text-on-surface-variant">Show</label>
          <select
            id="venue-option-page-size"
            className={compactSelect}
            value={pageSize}
            onChange={(changeEvent) => {
              const size = Number(changeEvent.target.value) as VenuePageSize;
              setPageSize(size);
              setShown(size);
            }}
          >
            {VENUE_PAGE_SIZES.map((size) => <option key={size} value={size}>{size} venues</option>)}
          </select>
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
          {calendar && calendarVenueIds.length ? (
            <div className="grid min-w-0 gap-3">
              <div>
                <Button type="button" variant="secondary" aria-pressed={calendarOpen} onClick={() => setCalendarOpen((open) => !open)}>
                  <Icon name="calendar" size={16} />{calendarOpen ? "Hide availability calendar" : "Show availability calendar"}
                </Button>
              </div>
              {calendarOpen ? (
                <div className="min-w-0 overflow-x-auto">
                  <VenueAvailabilityCalendar key={calendarVenueIds.join(",")} fixed={{ venueIds: calendarVenueIds, date: calendar.date, check: calendar.check }} />
                </div>
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
            // screen below the sticky header; the cards scroll inside it.
            <div
              role="region"
              aria-label="Venue list"
              tabIndex={0}
              className="max-h-[min(52rem,calc(100dvh-7rem))] overflow-y-auto overscroll-contain rounded-panel border border-outline-variant bg-surface-container-low p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
                    onCompare={() => { setCompareId(venue.venueId); scrollToPanels(); }}
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
