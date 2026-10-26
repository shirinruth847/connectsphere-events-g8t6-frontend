"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
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
import { VenueBrowser } from "./venue-browser";
import { VenueChoiceCard } from "./venue-choice-card";
import { VenueBadge } from "./venue-option-card";
import { VenueDetails } from "./venue-details";
import { eventCalendarCheck, suggestionBlocker, venueById } from "./venue-option-model";

type ChoicesState =
  | { status: "loading" }
  | { status: "ready"; data: EventVenueOptions }
  | { status: "error"; message: string };

interface EventVenueSectionProps {
  event: EventView;
  // Called after a suggestion is saved, e.g. to refresh the event history.
  onSuggested?: (suggestion: VenueSuggestion) => void;
  // Called when the suggestion changed elsewhere (409), to reload the event.
  onStale?: () => void;
}

// The venue section of an event request for the assigned coordinator and the
// supervising Lead (SPM-72/74). It opens on the organiser's ranked venue
// choices and the coordinator's suggestion; "Find another venue" opens a popup
// with the search, filters, comparison, availability calendar and venue list,
// where the coordinator can suggest a different venue to the organiser.
export function EventVenueSection({ event, onSuggested, onStale }: EventVenueSectionProps) {
  const [choices, setChoices] = useState<ChoicesState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [canSuggest, setCanSuggest] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  // A related venue (e.g. a room of a chosen hall), opened from Related venues.
  const [relatedId, setRelatedId] = useState<number | null>(null);
  const [suggestion, setSuggestion] = useState<VenueSuggestion | null>(event.venueSuggestion ?? null);
  const [confirming, setConfirming] = useState<EventVenueOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState<{ message: string; stale: boolean } | null>(null);
  const pendingKey = useRef<{ venueId: number; version: number; key: string } | null>(null);
  const isCoordinator = event.viewerRelationship === "ASSIGNED_COORDINATOR";

  useEffect(() => {
    let alive = true;
    getEventVenueOptions(event.eventId)
      .then((data) => {
        if (!alive) return;
        setChoices({ status: "ready", data });
        setCanSuggest(data.canSuggestVenue);
      })
      .catch((caught: unknown) => {
        if (alive) setChoices({ status: "error", message: caught instanceof Error ? caught.message : "Venues could not be loaded." });
      });
    return () => { alive = false; };
  }, [event.eventId, attempt]);

  const preferred = choices.status === "ready" ? choices.data.preferredVenues ?? [] : [];
  const preferredOptions = preferred.flatMap((choice) => (choice.option ? [choice.option] : []));
  const rankOf = new Map(preferred.map((choice) => [choice.venueId, choice.rank]));
  // A suggested venue outside the organiser's choices gets its own card; one of
  // their choices shows the Suggested badge on its card instead.
  const suggestedElsewhere = suggestion && !rankOf.has(suggestion.venueId) ? suggestion : null;
  const suggestedOption = suggestedElsewhere && choices.status === "ready" ? venueById(choices.data.venues, suggestedElsewhere.venueId) : null;
  const allVenues = choices.status === "ready" ? choices.data.venues : [];
  const related = venueById([...allVenues, ...preferredOptions], relatedId);
  const check = eventCalendarCheck(event.startDatetime, event.endDatetime);
  const calendar = isCoordinator ? { eventId: event.eventId, date: event.startDatetime ? calendarDate(new Date(event.startDatetime)) : calendarDate(new Date()), check, label: event.requestId } : null;
  const load = useCallback((query: VenueOptionsQuery) => getEventVenueOptions(event.eventId, query), [event.eventId]);

  const badge = (venue: EventVenueOption) => {
    const rank = rankOf.get(venue.venueId);
    const suggested = venue.venueId === suggestion?.venueId;
    if (!rank && !suggested) return null;
    return (
      <>
        {rank ? <VenueBadge>Organiser&apos;s choice {rank}</VenueBadge> : null}
        {suggested ? <VenueBadge tone="success"><Icon name="check" size={16} />Suggested</VenueBadge> : null}
      </>
    );
  };
  const action = (venue: EventVenueOption, place: "card" | "panel") => {
    if (!canSuggest || venue.venueId === suggestion?.venueId) return null;
    const blocker = suggestionBlocker(venue);
    if (place === "card") {
      return <Button type="button" onClick={() => setConfirming(venue)} disabled={Boolean(blocker)} title={blocker ?? undefined}>Select</Button>;
    }
    return (
      <div className="grid gap-1">
        <Button type="button" onClick={() => setConfirming(venue)} disabled={Boolean(blocker)}><Icon name="check" size={16} />Select this venue</Button>
        {blocker ? <p className="text-xs text-on-surface-variant">{blocker}</p> : null}
      </div>
    );
  };

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
      // Back on the event page, where the cards now show the suggestion.
      setSearchOpen(false);
      setRelatedId(null);
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

  // A choice's card opens its details in place (developer requests of 24 and
  // 25 October 2026); one at a time.
  const toggleView = (venueId: number) => setViewId((current) => (current === venueId ? null : venueId));

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
      {choices.status === "ready" && !canSuggest ? (
        <p className="text-sm text-on-surface-variant">
          {isCoordinator ? "A venue can be selected while the event is under review or in planning." : "Read-only: only the assigned coordinator can select a venue."}
        </p>
      ) : null}

      {suggestedElsewhere ? (
        <section aria-label="Suggested venue" className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
          <h3 className="text-sm font-semibold text-on-surface">Suggested venue</h3>
          {suggestedOption ? (
            <VenueChoiceCard venue={suggestedOption} expanded={suggestedOption.venueId === viewId} onToggle={() => toggleView(suggestedOption.venueId)} badge={badge(suggestedOption)} onOpenVenue={setRelatedId} calendar={calendar} />
          ) : (
            <article aria-label={suggestedElsewhere.name ?? `Venue ${suggestedElsewhere.venueId}`} className="grid content-start gap-2 rounded-panel border border-outline-variant bg-surface-container-low p-4">
              <div><VenueBadge tone="success"><Icon name="check" size={16} />Suggested</VenueBadge></div>
              <h3 className="font-semibold text-on-surface [overflow-wrap:anywhere]">{suggestedElsewhere.name ?? `Venue ${suggestedElsewhere.venueId}`}</h3>
              {suggestedElsewhere.address ? <p className="text-sm text-on-surface-variant">{suggestedElsewhere.address}</p> : null}
              <p className="text-sm text-on-surface-variant">Not in the current venue list.</p>
            </article>
          )}
        </section>
      ) : null}

      <section aria-label="Organiser's venue choices" className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
        <h3 className="text-sm font-semibold text-on-surface">Organiser&apos;s venue choices</h3>
        {choices.status === "loading" ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3" aria-busy="true" aria-label="Loading venues">
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        ) : choices.status === "error" ? (
          <AlertBanner tone="error" title="Unable to load venues">
            {choices.message}
            <div className="mt-3">
              <Button type="button" variant="secondary" onClick={() => { setChoices({ status: "loading" }); setAttempt((value) => value + 1); }}><Icon name="refresh" size={16} />Retry</Button>
            </div>
          </AlertBanner>
        ) : preferred.length === 0 ? (
          <p className="rounded-control bg-surface-container-low p-4 text-sm text-on-surface-variant">The organiser did not choose a venue.</p>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
            {preferred.map((choice) => choice.option ? (
              <VenueChoiceCard
                key={choice.venueId}
                venue={choice.option}
                expanded={choice.venueId === viewId}
                onToggle={() => toggleView(choice.venueId)}
                badge={badge(choice.option)}
                action={action(choice.option, "card")}
                onOpenVenue={setRelatedId}
                calendar={calendar}
              />
            ) : (
              <article key={choice.venueId} aria-label={choice.name ?? `Venue ${choice.venueId}`} className="grid content-start gap-2 rounded-panel border border-outline-variant bg-surface-container-low p-4">
                <div><VenueBadge>Organiser&apos;s choice {choice.rank}</VenueBadge></div>
                <h3 className="font-semibold text-on-surface [overflow-wrap:anywhere]">{choice.name ?? `Venue ${choice.venueId}`}</h3>
                <p className="text-sm text-on-surface-variant">No longer available for new requests.</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <div>
        <Button type="button" variant="secondary" aria-haspopup="dialog" onClick={() => setSearchOpen(true)}>
          <Icon name="venue" size={16} />Find another venue
        </Button>
      </div>
      {/* The search loads only while its popup is open. */}
      <Dialog open={searchOpen} onClose={() => setSearchOpen(false)} title="Find another venue" size="wide">
        {searchOpen ? (
          <VenueBrowser
            load={load}
            reloadKey={String(event.eventId)}
            onLoaded={(data) => setCanSuggest(data.canSuggestVenue)}
            calendar={calendar}
            badge={badge}
            action={action}
          />
        ) : null}
      </Dialog>

      <Dialog open={related !== null} onClose={() => setRelatedId(null)} title="Venue details" size="wide">
        {related ? (
          <VenueDetails key={related.venueId} venue={related} badge={badge(related)} action={action(related, "panel")} onOpenVenue={setRelatedId} calendar={calendar} />
        ) : null}
      </Dialog>

      <Dialog
        open={confirming !== null}
        onClose={() => { if (!saving) { setConfirming(null); setSaveError(null); } }}
        title="Suggest this venue?"
        footer={(
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="quiet" disabled={saving} onClick={() => { setConfirming(null); setSaveError(null); }}>Cancel</Button>
            {saveError?.stale && onStale ? (
              <Button type="button" variant="secondary" onClick={() => { setConfirming(null); setSaveError(null); setAttempt((value) => value + 1); onStale(); }}>Reload</Button>
            ) : null}
            <Button type="button" disabled={saving || Boolean(saveError?.stale)} onClick={() => void confirmSuggestion()}>{saving ? "Suggesting…" : "Suggest venue"}</Button>
          </div>
        )}
      >
        {confirming ? (
          <div className="grid gap-3 text-sm text-on-surface">
            <p>
              <span className="font-semibold">{confirming.name}</span> will be suggested to the organiser
              {suggestion ? `, replacing ${suggestion.name ?? "the current suggestion"}` : ""}. They are notified, and the suggestion is recorded in the event history.
            </p>
            <p className="text-on-surface-variant">This does not hold or book the venue.</p>
            {saveError ? <AlertBanner tone="error">{saveError.message}</AlertBanner> : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
