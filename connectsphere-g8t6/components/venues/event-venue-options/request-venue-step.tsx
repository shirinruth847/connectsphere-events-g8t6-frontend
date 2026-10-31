"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { formatEventWindow } from "@/lib/datetime";
import { getRequestVenueAvailability, getRequestVenueOptions, type EventVenueOption, type RequestVenueNeeds, type VenueOptionsQuery, type VenueOptionsResult } from "@/lib/api/event-venues";
import { localDateTimeToIso, toLocalDateTimeInput, toPayload, type EventFormValues, type VenueTime } from "@/lib/events";
import { RequestVenueCalendar } from "./request-venue-calendar";
import { VenueBrowser } from "./venue-browser";
import { VenueBadge } from "./venue-option-card";
import { useDebouncedValue } from "../use-debounced-value";

// The request API accepts up to 20 ranked venue preferences.
export const MAX_VENUE_CHOICES = 20;

type VenueChoices = Pick<EventFormValues, "venuePreferences" | "venueTimes">;
type Window = { start: string; end: string };
type ChoiceCheck = { status: "checking" } | { status: "error" } | { status: "ready"; label: string; unavailable: boolean };

const MAX_WINDOW_MS = 366 * 24 * 60 * 60 * 1000;

// What the venues are checked against: the request's values so far.
const requestNeeds = (values: EventFormValues): RequestVenueNeeds => {
  const start = localDateTimeToIso(values.startDatetime) ?? null;
  const end = localDateTimeToIso(values.endDatetime) ?? null;
  const datesValid = Boolean(start && end && Date.parse(end) > Date.parse(start) && Date.parse(end) - Date.parse(start) <= MAX_WINDOW_MS);
  const attendance = /^\d+$/.test(values.expectedAttendance.trim()) ? Number(values.expectedAttendance) : NaN;
  return {
    startDatetime: datesValid ? start : null,
    endDatetime: datesValid ? end : null,
    expectedAttendance: attendance >= 1 && attendance <= 2147483647 ? attendance : null,
    preferredLayoutType: values.preferredLayoutType && values.preferredLayoutType !== "NO_PREFERENCE" ? values.preferredLayoutType : null,
    accessibilityNeeds: toPayload(values).accessibilityNeeds,
  };
};

// Each choice's availability over its own requested time, checked again a
// moment after a time stops changing.
function useChoiceChecks(windows: Array<{ venueId: number } & Window>) {
  const key = useDebouncedValue(JSON.stringify(windows), 500);
  const [checks, setChecks] = useState<Map<string, ChoiceCheck>>(new Map());
  useEffect(() => {
    let alive = true;
    for (const item of JSON.parse(key) as Array<{ venueId: number } & Window>) {
      const id = `${item.venueId}|${item.start}|${item.end}`;
      getRequestVenueAvailability(item.venueId, { from: item.start, to: item.end, check: item })
        .then((result) => {
          const check = result.venue.check;
          if (alive && check) setChecks((current) => new Map(current).set(id, { status: "ready", label: check.availabilityLabel, unavailable: check.conflicts.length > 0 }));
        })
        .catch(() => { if (alive) setChecks((current) => new Map(current).set(id, { status: "error" })); });
    }
    return () => { alive = false; };
  }, [key]);
  return (venueId: number, window: Window) => checks.get(`${venueId}|${window.start}|${window.end}`) ?? { status: "checking" as const };
}

interface RequestVenueStepProps {
  values: EventFormValues;
  // Names from the request options, for choices not in the current list.
  knownNames: Map<number, string>;
  onChange: (next: VenueChoices) => void;
}

// SPM-76: the organiser explores venues with the coordinator's search
// (filters, details, photos, comparison) inside the request form, and ranks up
// to 20 choices. Each choice is wanted for the whole event unless the
// organiser narrows it, by typing or by dragging the yellow block on the
// venue's calendar; several venues may be wanted at the same or different
// times. Choosing never holds or books a venue.
export function RequestVenueStep({ values, knownNames, onChange }: RequestVenueStepProps) {
  const [learnedNames, setLearnedNames] = useState<Map<number, string>>(new Map());
  const [openId, setOpenId] = useState<number | null>(null);
  const chosen = values.venuePreferences;
  const full = chosen.length >= MAX_VENUE_CHOICES;

  const needs = requestNeeds(values);
  const needsKey = JSON.stringify(needs);
  const load = useCallback((query: VenueOptionsQuery) => getRequestVenueOptions(JSON.parse(needsKey), query), [needsKey]);
  const remember = useCallback((data: VenueOptionsResult) => {
    setLearnedNames((current) => {
      const next = new Map(current);
      for (const venue of data.venues) next.set(venue.venueId, venue.name);
      return next;
    });
  }, []);

  const eventWindow = useMemo(
    () => (needs.startDatetime && needs.endDatetime ? { start: needs.startDatetime, end: needs.endDatetime } : null),
    [needs.startDatetime, needs.endDatetime],
  );
  const windowOf = useCallback((venueId: number): Window | null => {
    const time = values.venueTimes[venueId];
    const start = time ? localDateTimeToIso(time.start) : undefined;
    const end = time ? localDateTimeToIso(time.end) : undefined;
    return start && end ? { start, end } : eventWindow;
  }, [values.venueTimes, eventWindow]);
  const checkOf = useChoiceChecks(chosen.flatMap((venueId) => {
    const window = windowOf(venueId);
    return window ? [{ venueId, ...window }] : [];
  }));

  const nameOf = (venueId: number) => learnedNames.get(venueId) ?? knownNames.get(venueId) ?? `Venue ${venueId}`;
  const withoutTime = (venueId: number) => Object.fromEntries(Object.entries(values.venueTimes).filter(([id]) => Number(id) !== venueId));
  const move = (index: number, offset: number) => {
    const next = [...chosen];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange({ venuePreferences: next, venueTimes: values.venueTimes });
  };
  const add = (venueId: number) => {
    if (!full && !chosen.includes(venueId)) onChange({ venuePreferences: [...chosen, venueId], venueTimes: values.venueTimes });
  };
  const remove = (venueId: number) => {
    if (openId === venueId) setOpenId(null);
    onChange({ venuePreferences: chosen.filter((id) => id !== venueId), venueTimes: withoutTime(venueId) });
  };
  // A time equal to the whole event is stored as "whole event", so it follows the event's dates.
  const setTime = useCallback((venueId: number, next: Window) => {
    const whole = eventWindow && Date.parse(next.start) === Date.parse(eventWindow.start) && Date.parse(next.end) === Date.parse(eventWindow.end);
    const others = Object.fromEntries(Object.entries(values.venueTimes).filter(([id]) => Number(id) !== venueId));
    const venueTimes: Record<string, VenueTime> = whole ? others : { ...others, [venueId]: { start: toLocalDateTimeInput(next.start), end: toLocalDateTimeInput(next.end) } };
    onChange({ venuePreferences: chosen, venueTimes });
  }, [chosen, eventWindow, onChange, values.venueTimes]);
  const typeTime = (venueId: number, edge: keyof VenueTime, text: string) => {
    const current = values.venueTimes[venueId] ?? { start: values.startDatetime, end: values.endDatetime };
    onChange({ venuePreferences: chosen, venueTimes: { ...values.venueTimes, [venueId]: { ...current, [edge]: text } } });
  };

  const badge = (venue: EventVenueOption) => {
    const rank = chosen.indexOf(venue.venueId) + 1;
    return rank ? <VenueBadge tone={rank === 1 ? "success" : "neutral"}>Your choice {rank}</VenueBadge> : null;
  };
  const action = (venue: EventVenueOption) => chosen.includes(venue.venueId)
    ? <Button type="button" variant="secondary" onClick={() => remove(venue.venueId)}>Remove choice</Button>
    : <Button type="button" onClick={() => add(venue.venueId)} disabled={full} title={full ? `You can choose up to ${MAX_VENUE_CHOICES} venues.` : undefined}>{chosen.length ? "Add as a choice" : "Choose as ideal venue"}</Button>;

  const openVenue = openId !== null && chosen.includes(openId) ? openId : null;
  const openWindow = openVenue !== null ? windowOf(openVenue) : null;
  const onCalendarChange = useCallback((next: Window) => { if (openVenue !== null) setTime(openVenue, next); }, [openVenue, setTime]);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <section aria-label="Your venue choices" className="grid gap-3 rounded-panel border border-outline-variant p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-on-surface">Your venue choices</h3>
          <span className="text-xs text-on-surface-variant">{chosen.length} / {MAX_VENUE_CHOICES}</span>
        </div>
        {chosen.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No venue chosen yet. Choose your ideal venue below, or continue without one.</p>
        ) : (
          <ol className="grid gap-2">
            {chosen.map((venueId, index) => {
              const window = windowOf(venueId);
              const narrowed = Boolean(values.venueTimes[venueId]);
              const check = window ? checkOf(venueId, window) : null;
              const name = nameOf(venueId);
              return (
                <li key={venueId} className={`grid gap-2 rounded-control px-3 py-2 text-sm ${check?.status === "ready" && check.unavailable ? "bg-error-container/40" : "bg-surface-container-low"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <VenueBadge tone={index === 0 ? "success" : "neutral"}>{index === 0 ? "Ideal venue" : `Choice ${index + 1}`}</VenueBadge>
                    <span className="min-w-0 flex-1 font-medium text-on-surface [overflow-wrap:anywhere]">{name}</span>
                    <span className="flex gap-1">
                      <Button type="button" variant="quiet" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => move(index, -1)}><Icon name="arrow-back" size={16} className="rotate-90" /></Button>
                      <Button type="button" variant="quiet" aria-label={`Move ${name} down`} disabled={index === chosen.length - 1} onClick={() => move(index, 1)}><Icon name="arrow-forward" size={16} className="rotate-90" /></Button>
                      <Button type="button" variant="quiet" aria-label={`Remove ${name}`} onClick={() => remove(venueId)}><Icon name="close" size={16} /></Button>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="text-on-surface">{window ? `${narrowed ? "" : "Whole event · "}${formatEventWindow(window.start, window.end)}` : "Enter the event's date and time to choose times"}</span>
                    {check?.status === "checking" ? <span className="text-on-surface-variant">Checking…</span> : null}
                    {check?.status === "error" ? <span className="font-semibold text-on-surface-variant">Error checking availability</span> : null}
                    {check?.status === "ready" ? (
                      <span className={`font-semibold ${check.unavailable ? "text-error" : "text-success"}`}>{check.unavailable ? `Unavailable at this time (${check.label.replace(/^Unavailable – /, "")})` : check.label}</span>
                    ) : null}
                    {window ? (
                      <Button type="button" variant="quiet" aria-expanded={openVenue === venueId} onClick={() => setOpenId(openVenue === venueId ? null : venueId)}>
                        <Icon name="calendar" size={16} />{openVenue === venueId ? "Hide calendar" : "Set time on calendar"}
                      </Button>
                    ) : null}
                    {narrowed ? <Button type="button" variant="quiet" onClick={() => onChange({ venuePreferences: chosen, venueTimes: withoutTime(venueId) })}>Use whole event</Button> : null}
                  </div>
                  {openVenue === venueId && openWindow && eventWindow ? (
                    <div className="grid gap-3 border-t border-outline-variant pt-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="grid gap-1 text-xs font-semibold text-on-surface-variant">
                          Start
                          <input type="datetime-local" step={900} className="rounded-control border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface" min={values.startDatetime} max={values.endDatetime} value={values.venueTimes[venueId]?.start ?? values.startDatetime} onChange={(changeEvent) => typeTime(venueId, "start", changeEvent.target.value)} />
                        </label>
                        <label className="grid gap-1 text-xs font-semibold text-on-surface-variant">
                          End
                          <input type="datetime-local" step={900} className="rounded-control border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface" min={values.startDatetime} max={values.endDatetime} value={values.venueTimes[venueId]?.end ?? values.endDatetime} onChange={(changeEvent) => typeTime(venueId, "end", changeEvent.target.value)} />
                        </label>
                      </div>
                      <RequestVenueCalendar venueId={venueId} venueName={name} requested={openWindow} bounds={eventWindow} onChange={onCalendarChange} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        <p className="text-xs text-on-surface-variant">Each venue is wanted for the whole event unless you set a time; venues can share a time or have different ones. Choosing does not book or hold a venue; your coordinator arranges the bookings.</p>
      </section>

      <VenueBrowser load={load} reloadKey={needsKey} onLoaded={remember} badge={badge} action={action} alternativeCapacity={needs.expectedAttendance} />
    </div>
  );
}
