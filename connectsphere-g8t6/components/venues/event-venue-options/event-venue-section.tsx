"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, EmptyState, FormLabel, Skeleton, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { SortOrderToggle } from "@/components/venues/sort-order-toggle";
import { VenueAvailabilityCalendar } from "@/components/venues/venue-availability";
import { VENUE_OPTION_SORT_OPTIONS, type VenueOptionSort } from "@/components/venues/venue-queries";
import { ApiError } from "@/lib/api";
import { calendarDate } from "@/lib/coordinator-calendar";
import { formatTimestamp } from "@/lib/datetime";
import {
  getEventVenueOptions,
  suggestEventVenue,
  type EventVenueOption,
  type EventVenueOptions,
  type VenueOptionsQuery,
} from "@/lib/api/event-venues";
import type { EventView, VenueSuggestion } from "@/lib/api/event-workspace";
import { VenueOptionCard } from "./venue-option-card";
import { VenueOptionPanel } from "./venue-option-panel";
import { eventCalendarCheck, VENUE_PAGE_SIZE, venueById } from "./venue-option-model";

type OptionsState =
  | { status: "loading" }
  | { status: "ready"; data: EventVenueOptions }
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

interface EventVenueSectionProps {
  event: EventView;
  // Called after a suggestion is saved, e.g. to refresh the event history.
  onSuggested?: (suggestion: VenueSuggestion) => void;
  // Called when the suggestion changed elsewhere (409), to reload the event.
  onStale?: () => void;
}

// The venue section of an event request (SPM-72/74): search, filter and sort
// the available venues, see each one's details, photos and availability on the
// event date, compare two side by side, and (assigned coordinator only)
// suggest one to the organiser. Requirement matching comes from the backend.
export function EventVenueSection({ event, onSuggested, onStale }: EventVenueSectionProps) {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<VenueOptionSort>("match");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [state, setState] = useState<OptionsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState(VENUE_PAGE_SIZE);
  const [viewId, setViewId] = useState<number | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareId, setCompareId] = useState<number | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<VenueSuggestion | null>(event.venueSuggestion ?? null);
  const [confirming, setConfirming] = useState<EventVenueOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState<{ message: string; stale: boolean } | null>(null);
  const pendingKey = useRef<{ venueId: number; version: number; key: string } | null>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  const filtered = Object.values(applied).some((value) => value.trim());

  useEffect(() => {
    let alive = true;
    getEventVenueOptions(event.eventId, { ...applied, sort, order })
      .then((data) => { if (alive) setState({ status: "ready", data }); })
      .catch((caught: unknown) => {
        if (!alive) return;
        setState({
          status: "error",
          message: caught instanceof Error ? caught.message : "Venues could not be loaded.",
          fields: caught instanceof ApiError && Object.keys(caught.fields).length ? caught.fields : undefined,
        });
      });
    return () => { alive = false; };
  }, [event.eventId, applied, sort, order, attempt]);

  const reload = (next?: Partial<{ applied: Filters; sort: VenueOptionSort; order: "asc" | "desc" }>) => {
    setState({ status: "loading" });
    setShown(VENUE_PAGE_SIZE);
    if (next?.applied) setApplied(next.applied);
    if (next?.sort) setSort(next.sort);
    if (next?.order) setOrder(next.order);
  };
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    reload({ applied: draft });
  };
  const clear = () => {
    setDraft(EMPTY_FILTERS);
    reload({ applied: EMPTY_FILTERS });
  };

  const venues = state.status === "ready" ? state.data.venues : [];
  const canSuggest = state.status === "ready" && state.data.canSuggestVenue;
  const viewing = venueById(venues, viewId);
  const comparing = venueById(venues, compareId);
  const calendarCheck = eventCalendarCheck(event.startDatetime, event.endDatetime);
  const calendarVenueIds = [viewing?.venueId, compareOpen ? comparing?.venueId : undefined].filter((id): id is number => id !== undefined);

  const confirmSuggestion = async () => {
    if (!confirming) return;
    const version = suggestion?.version ?? 0;
    // A retry of the same choice reuses its key, so it cannot notify twice.
    const pending = pendingKey.current;
    const key = pending && pending.venueId === confirming.venueId && pending.version === version ? pending.key : crypto.randomUUID();
    pendingKey.current = { venueId: confirming.venueId, version, key };
    setSaving(true);
    setSaveError(null);
    try {
      const result = await suggestEventVenue(event.eventId, confirming.venueId, version, key);
      pendingKey.current = null;
      setSuggestion(result.suggestion);
      setNotice(`${result.message} It is recorded in the event history.`);
      setConfirming(null);
      onSuggested?.(result.suggestion);
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : undefined;
      if (code && code !== "NETWORK_ERROR") pendingKey.current = null;
      setSaveError({
        message: caught instanceof Error ? caught.message : "The venue could not be suggested.",
        stale: code === "VENUE_SUGGESTION_VERSION_CONFLICT" || code === "VENUE_NOT_SELECTABLE",
      });
    } finally {
      setSaving(false);
    }
  };

  // minmax(0, 1fr) tracks keep long venue names from widening the page.
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div aria-live="polite" role="status">
        {notice ? <AlertBanner tone="success" title="Venue suggested" live={false}>{notice}</AlertBanner> : null}
      </div>
      {suggestion ? (
        <p className="flex flex-wrap items-center gap-2 rounded-control border border-[#86EFAC] bg-[#DCFCE7] px-3 py-2 text-sm text-[#166534]">
          <Icon name="venue" size={16} />
          <span><span className="font-semibold">Suggested to the organiser:</span> {suggestion.name ?? `Venue ${suggestion.venueId}`}</span>
          <span className="text-xs">{suggestion.suggestedBy ? `by ${suggestion.suggestedBy}, ` : ""}{formatTimestamp(suggestion.suggestedAt)}</span>
        </p>
      ) : null}
      {state.status === "ready" && !canSuggest ? (
        <p className="text-sm text-on-surface-variant">
          {event.viewerRelationship === "ASSIGNED_COORDINATOR"
            ? "A venue can be selected while the event is under review or in planning."
            : "Read-only: only the assigned coordinator can select a venue."}
        </p>
      ) : null}

      <form onSubmit={submit} aria-label="Search and filter venues" className="grid gap-3 rounded-panel bg-surface-container-low p-4 sm:grid-cols-2 lg:grid-cols-3">
        {FILTER_FIELDS.map((field) => (
          <div key={field.key}>
            <FormLabel htmlFor={`venue-option-${field.key}`}>{field.label}</FormLabel>
            <input
              id={`venue-option-${field.key}`}
              className={fieldClasses}
              value={draft[field.key]}
              placeholder={field.placeholder}
              inputMode={field.inputMode}
              onChange={(changeEvent) => setDraft((current) => ({ ...current, [field.key]: changeEvent.target.value }))}
            />
            {state.status === "error" && state.fields?.[field.key] ? <p className="mt-1 text-xs text-error">{state.fields[field.key]}</p> : null}
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="submit"><Icon name="check" size={16} />Apply filters</Button>
          <Button type="button" variant="quiet" onClick={clear} disabled={!filtered && !Object.values(draft).some((value) => value.trim())}>Clear filters</Button>
          <div className="ml-auto flex items-end gap-2">
            <div>
              <FormLabel htmlFor="venue-option-sort">Sort by</FormLabel>
              <select id="venue-option-sort" className={fieldClasses} value={sort} onChange={(changeEvent) => reload({ sort: changeEvent.target.value as VenueOptionSort })}>
                {VENUE_OPTION_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <SortOrderToggle order={order} onChange={(next) => reload({ order: next })} />
          </div>
        </div>
        <p className="text-xs text-on-surface-variant sm:col-span-2 lg:col-span-3">
          Venues meeting every requirement of this request come first. Requirements met are shown in green, the rest in grey. Required facilities rank venues without hiding any.
        </p>
      </form>

      {state.status === "ready" && venues.length ? (
        <div className="grid min-w-0 scroll-mt-4 grid-cols-[minmax(0,1fr)] gap-3" ref={panelsRef}>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" aria-pressed={compareOpen} onClick={() => { setCompareOpen((open) => !open); if (compareOpen) setCompareId(null); }}>
              <Icon name="layout" size={16} />{compareOpen ? "Hide comparison" : "Compare side by side"}
            </Button>
            {event.viewerRelationship === "ASSIGNED_COORDINATOR" ? (
              <Button variant="quiet" aria-pressed={calendarOpen} disabled={!calendarVenueIds.length} onClick={() => setCalendarOpen((open) => !open)}>
                <Icon name="calendar" size={16} />{calendarOpen ? "Hide availability calendar" : "Show availability calendar"}
              </Button>
            ) : null}
          </div>
          {viewing || compareOpen ? <div className={`grid items-start gap-4 grid-cols-[minmax(0,1fr)] ${compareOpen ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`}>
            <VenueOptionPanel
              eventId={event.eventId}
              label="Venue details"
              venue={viewing}
              venues={venues}
              onChoose={setViewId}
              onClose={compareOpen ? undefined : () => { setViewId(null); setCalendarOpen(false); }}
              canSuggest={canSuggest}
              suggestedVenueId={suggestion?.venueId ?? null}
              onSuggest={setConfirming}
            />
            {compareOpen ? (
              <VenueOptionPanel
                eventId={event.eventId}
                label="Compare with"
                venue={comparing}
                venues={venues}
                onChoose={setCompareId}
                onClose={() => { setCompareOpen(false); setCompareId(null); }}
                canSuggest={canSuggest}
                suggestedVenueId={suggestion?.venueId ?? null}
                onSuggest={setConfirming}
              />
            ) : null}
          </div> : null}
          {calendarOpen && calendarVenueIds.length && event.viewerRelationship === "ASSIGNED_COORDINATOR" ? (
            <div className="min-w-0 overflow-x-auto"><VenueAvailabilityCalendar
              key={calendarVenueIds.join(",")}
              fixed={{
                venueIds: calendarVenueIds,
                date: event.startDatetime ? calendarDate(new Date(event.startDatetime)) : calendarDate(new Date()),
                check: calendarCheck,
              }}
            /></div>
          ) : null}
        </div>
      ) : null}

      {state.status === "loading" ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Loading venues">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      {state.status === "error" ? (
        <AlertBanner tone="error" title="Unable to load venues">
          {state.fields ? Object.values(state.fields).join(" ") : state.message}
          <div className="mt-3">
            <Button variant="secondary" onClick={() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }}><Icon name="refresh" size={16} />Retry</Button>
          </div>
        </AlertBanner>
      ) : null}

      {state.status === "ready" ? (
        <>
          {!state.data.detailsAvailable ? (
            <AlertBanner tone="info" title="Venue details are temporarily unavailable">
              Capacity and rooms are shown from the venue records. Layout, facility and accessibility requirements show as not checked until details load.
              {state.data.filtersNotChecked.length ? ` The ${state.data.filtersNotChecked.join(", ")} filter could not be checked.` : ""}
            </AlertBanner>
          ) : null}
          {!state.data.availabilityChecked && venues.length ? (
            <AlertBanner tone="warning" title="Availability not checked">
              Availability for the event date cannot be checked right now, so no venue is shown as available. Try again shortly.
            </AlertBanner>
          ) : null}
          {venues.length === 0 ? (
            filtered ? (
              <EmptyState title="No venues match these filters" description="Try a different search or clear the filters to see every available venue." action={<Button variant="secondary" onClick={clear}>Clear filters</Button>} />
            ) : (
              <EmptyState title="No venues are currently available" description="There are no available venues to consider for this event at this time." />
            )
          ) : (
            <>
              <p className="text-sm text-on-surface-variant" aria-live="polite">
                {venues.length} {venues.length === 1 ? "venue" : "venues"}{filtered ? " match your filters" : " available"}
                {((met) => ` · ${met} ${met === 1 ? "meets" : "meet"} every requirement`)(venues.filter((venue) => venue.allRequirementsMet).length)}
              </p>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {venues.slice(0, shown).map((venue) => (
                  <VenueOptionCard
                    key={venue.venueId}
                    eventId={event.eventId}
                    venue={venue}
                    viewing={venue.venueId === viewId}
                    comparing={compareOpen && venue.venueId === compareId}
                    compareOpen={compareOpen}
                    suggested={venue.venueId === suggestion?.venueId}
                    canSuggest={canSuggest}
                    onView={() => { setViewId(venue.venueId); panelsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                    onCompare={() => { setCompareId(venue.venueId); panelsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                    onSuggest={() => setConfirming(venue)}
                  />
                ))}
              </div>
              {shown < venues.length ? (
                <div className="flex justify-center">
                  <Button variant="secondary" onClick={() => setShown((value) => value + VENUE_PAGE_SIZE)}>Show more venues ({venues.length - shown} more)</Button>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}

      <Dialog
        open={confirming !== null}
        onClose={() => { if (!saving) { setConfirming(null); setSaveError(null); } }}
        title="Suggest this venue?"
        footer={(
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="quiet" disabled={saving} onClick={() => { setConfirming(null); setSaveError(null); }}>Cancel</Button>
            {saveError?.stale && onStale ? (
              <Button variant="secondary" onClick={() => { setConfirming(null); setSaveError(null); setAttempt((value) => value + 1); onStale(); }}>Reload</Button>
            ) : null}
            <Button disabled={saving || Boolean(saveError?.stale)} onClick={() => void confirmSuggestion()}>{saving ? "Suggesting…" : "Suggest venue"}</Button>
          </div>
        )}
      >
        {confirming ? (
          <div className="grid gap-3 text-sm text-on-surface">
            <p>
              <span className="font-semibold">{confirming.name}</span> will be suggested to the organiser
              {suggestion ? `, replacing ${suggestion.name ?? "the current suggestion"}` : ""}. They are notified, and the suggestion is recorded in the event history.
            </p>
            <p className="text-on-surface-variant">This does not hold or book the venue; the booking request goes to Venue Staff separately.</p>
            {saveError ? <AlertBanner tone="error">{saveError.message}</AlertBanner> : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
