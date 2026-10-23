"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { getRequestVenueOptions, type EventVenueOption, type VenueOptionsQuery, type VenueOptionsResult } from "@/lib/api/event-venues";
import { localDateTimeToIso, toPayload, type EventFormValues } from "@/lib/events";
import { VenueBrowser } from "./venue-browser";
import { VenueBadge } from "./venue-option-card";
import { requestVenueNeeds } from "./venue-option-model";

// The request API accepts up to 20 ranked venue preferences.
export const MAX_VENUE_CHOICES = 20;

interface VenuePreferencePickerProps {
  values: EventFormValues;
  // Names from the request options, for choices not in the current list.
  knownNames: Map<number, string>;
  onChange: (venueIds: number[]) => void;
}

// SPM-76: the organiser browses the available venues while filling in the
// request (search, filters, details, photos, availability on the chosen date,
// comparison) and ranks up to 20 of them. The first choice is the ideal venue.
// Choosing does not hold or book anything.
export function VenuePreferencePicker({ values, knownNames, onChange }: VenuePreferencePickerProps) {
  const [learnedNames, setLearnedNames] = useState<Map<number, string>>(new Map());
  const chosen = values.venuePreferences;
  const full = chosen.length >= MAX_VENUE_CHOICES;

  const needs = useMemo(
    () => requestVenueNeeds({
      startDatetime: localDateTimeToIso(values.startDatetime) ?? null,
      endDatetime: localDateTimeToIso(values.endDatetime) ?? null,
      expectedAttendance: values.expectedAttendance,
      preferredLayoutType: values.preferredLayoutType,
      accessibilityNeeds: toPayload(values).accessibilityNeeds,
    }),
    // toPayload reads only these fields for accessibility needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [values.startDatetime, values.endDatetime, values.expectedAttendance, values.preferredLayoutType, values.accessibilityNeeds, values.accessibilityNotes],
  );
  const needsKey = JSON.stringify(needs);
  const load = useCallback((query: VenueOptionsQuery) => getRequestVenueOptions(JSON.parse(needsKey), query), [needsKey]);
  const remember = useCallback((data: VenueOptionsResult) => {
    setLearnedNames((current) => {
      const next = new Map(current);
      for (const venue of data.venues) next.set(venue.venueId, venue.name);
      return next;
    });
  }, []);

  const nameOf = (venueId: number) => learnedNames.get(venueId) ?? knownNames.get(venueId) ?? `Venue ${venueId}`;
  const move = (index: number, offset: number) => {
    const next = [...chosen];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };
  const add = (venueId: number) => { if (!full && !chosen.includes(venueId)) onChange([...chosen, venueId]); };
  const remove = (venueId: number) => onChange(chosen.filter((id) => id !== venueId));

  const badge = (venue: EventVenueOption) => {
    const rank = chosen.indexOf(venue.venueId) + 1;
    return rank ? <VenueBadge tone={rank === 1 ? "success" : "neutral"}>Your choice {rank}</VenueBadge> : null;
  };
  const action = (venue: EventVenueOption) => chosen.includes(venue.venueId)
    ? <Button type="button" variant="secondary" onClick={() => remove(venue.venueId)}>Remove choice</Button>
    : <Button type="button" onClick={() => add(venue.venueId)} disabled={full} title={full ? `You can choose up to ${MAX_VENUE_CHOICES} venues.` : undefined}>{chosen.length ? "Add as a choice" : "Choose as ideal venue"}</Button>;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <section aria-label="Your venue choices" className="grid gap-3 rounded-panel border border-outline-variant p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-on-surface">Your venue choices</h3>
          <span className="text-xs text-on-surface-variant">{chosen.length} / {MAX_VENUE_CHOICES}</span>
        </div>
        {chosen.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No venue chosen yet. Choose your ideal venue below, or submit without a preference.</p>
        ) : (
          <ol className="grid gap-2">
            {chosen.map((venueId, index) => (
              <li key={venueId} className="flex flex-wrap items-center gap-2 rounded-control bg-surface-container-low px-3 py-2 text-sm">
                <VenueBadge tone={index === 0 ? "success" : "neutral"}>{index === 0 ? "Ideal venue" : `Choice ${index + 1}`}</VenueBadge>
                <span className="min-w-0 flex-1 font-medium text-on-surface [overflow-wrap:anywhere]">{nameOf(venueId)}</span>
                <span className="flex gap-1">
                  <Button type="button" variant="quiet" aria-label={`Move ${nameOf(venueId)} up`} disabled={index === 0} onClick={() => move(index, -1)}><Icon name="arrow-back" size={16} className="rotate-90" /></Button>
                  <Button type="button" variant="quiet" aria-label={`Move ${nameOf(venueId)} down`} disabled={index === chosen.length - 1} onClick={() => move(index, 1)}><Icon name="arrow-forward" size={16} className="rotate-90" /></Button>
                  <Button type="button" variant="quiet" aria-label={`Remove ${nameOf(venueId)}`} onClick={() => remove(venueId)}><Icon name="close" size={16} /></Button>
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-on-surface-variant">Choosing does not book or hold a venue.</p>
      </section>

      <VenueBrowser load={load} reloadKey={needsKey} onLoaded={remember} badge={badge} action={action} />
    </div>
  );
}
