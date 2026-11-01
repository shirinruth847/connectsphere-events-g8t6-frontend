"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { getEventVenueChoices, type EventVenueChoices, type PreferredVenue } from "@/lib/api/event-venues";
import { formatEventWindow } from "@/lib/datetime";
import { VenueChoiceCard } from "@/components/venues/event-venue-options/venue-choice-card";
import { VenueBadge } from "@/components/venues/event-venue-options/venue-option-card";

export interface OrganiserVenueCardsProps {
  eventId: number;
  eventStart: string | null;
  eventEnd: string | null;
  // Changes when the organiser refreshes the arrangements.
  refreshKey: number;
  // While a clarification is open the owner can add a suggested venue to the
  // amendment; chosenIds are the venues already in it.
  onAddChoice?: (venueId: number) => void;
  chosenIds?: number[];
}

type State = { status: "loading"; key: string } | { status: "ready"; key: string; data: EventVenueChoices } | { status: "error"; key: string };

function RequestedTime({ choice, eventStart, eventEnd }: { choice: PreferredVenue; eventStart: string | null; eventEnd: string | null }) {
  const narrowed = Boolean(choice.requestedStart && choice.requestedEnd);
  const availability = choice.requestedAvailability;
  return (
    <p className="grid gap-0.5 text-xs">
      <span className="font-semibold text-on-surface">
        Wanted for: {narrowed ? formatEventWindow(choice.requestedStart, choice.requestedEnd) : `the whole event${eventStart ? ` (${formatEventWindow(eventStart, eventEnd)})` : ""}`}
      </span>
      {narrowed && availability ? (
        <span className={`font-semibold ${availability.status.startsWith("UNAVAILABLE") ? "text-error" : "text-success"}`}>At that time: {availability.label}</span>
      ) : null}
    </p>
  );
}

function Unlisted({ name, badge, children }: { name: string; badge: ReactNode; children?: ReactNode }) {
  return (
    <article aria-label={name} className="grid content-start gap-2 rounded-panel border border-outline-variant bg-surface-container-low p-4">
      <div className="flex flex-wrap gap-1.5">{badge}</div>
      <h4 className="font-semibold text-on-surface [overflow-wrap:anywhere]">{name}</h4>
      {children}
      <p className="text-sm text-on-surface-variant">No longer available for new requests.</p>
    </article>
  );
}

// The organiser's venue choices and their coordinator's selected and suggested
// venues as full cards: photos, details and which needs each venue meets
// (developer request, 1 November 2026). Busy periods show only their kind.
export function OrganiserVenueCards({ eventId, eventStart, eventEnd, refreshKey, onAddChoice, chosenIds = [] }: OrganiserVenueCardsProps) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: "loading", key: "" });
  const [openId, setOpenId] = useState<number | null>(null);
  const key = `${eventId}|${refreshKey}|${attempt}`;
  useEffect(() => {
    let alive = true;
    getEventVenueChoices(eventId)
      .then((data) => { if (alive) setState({ status: "ready", key, data }); })
      .catch(() => { if (alive) setState({ status: "error", key }); });
    return () => { alive = false; };
  }, [eventId, key]);

  const toggle = (venueId: number) => setOpenId((current) => (current === venueId ? null : venueId));
  if (state.key !== key || state.status === "loading") {
    return <div aria-busy="true" aria-label="Loading your venues" className="grid gap-3"><Skeleton className="h-36 w-full" /><Skeleton className="h-36 w-full" /></div>;
  }
  if (state.status === "error") {
    return (
      <AlertBanner tone="error" title="Your venues could not be loaded">
        Try again in a moment.
        <div className="mt-3"><Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}><Icon name="refresh" size={16} />Try again</Button></div>
      </AlertBanner>
    );
  }

  const { preferredVenues, suggestedVenues } = state.data;
  const selected = new Set(suggestedVenues.filter((item) => item.fromOrganiserChoices).map((item) => item.venueId));
  const suggested = suggestedVenues.filter((item) => !item.fromOrganiserChoices);
  const rankBadge = (rank: number) => <VenueBadge tone={rank === 1 ? "success" : "neutral"}>{rank === 1 ? "Ideal venue" : `Choice ${rank}`}</VenueBadge>;
  const selectedBadge = (venueId: number) => selected.has(venueId) ? <VenueBadge tone="success"><Icon name="check" size={16} />Selected by your coordinator</VenueBadge> : null;
  const addAction = (venueId: number) => {
    if (!onAddChoice) return null;
    return chosenIds.includes(venueId)
      ? <span className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-success"><Icon name="check" size={16} />In your amendment</span>
      : <Button type="button" onClick={() => onAddChoice(venueId)}><Icon name="add" size={16} />Add to my choices</Button>;
  };

  return (
    <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <h3 className="text-sm font-semibold text-on-surface">Venues you asked for</h3>
      {preferredVenues.length === 0 ? (
        <p className="rounded-control bg-surface-container-low p-4 text-sm text-on-surface-variant">You did not choose a venue. Your coordinator will find one that suits the event.</p>
      ) : preferredVenues.map((choice) => {
        const requested = <RequestedTime choice={choice} eventStart={eventStart} eventEnd={eventEnd} />;
        const badge = <>{rankBadge(choice.rank)}{selectedBadge(choice.venueId)}</>;
        return choice.option ? (
          <VenueChoiceCard key={choice.venueId} venue={choice.option} expanded={openId === choice.venueId} onToggle={() => toggle(choice.venueId)} badge={badge} requested={requested} />
        ) : (
          <Unlisted key={choice.venueId} name={choice.name ?? `Venue ${choice.venueId}`} badge={badge}>{requested}</Unlisted>
        );
      })}

      {suggested.length ? (
        <>
          <h3 className="mt-2 text-sm font-semibold text-on-surface">Suggested by your coordinator</h3>
          <p className="text-xs text-on-surface-variant">
            {onAddChoice
              ? "Add a suggested venue to your choices, then save your amendment. Your coordinator sees the change."
              : "Your coordinator suggested these venues. Nothing is held or booked."}
          </p>
          {suggested.map((item) => {
            const badge = <VenueBadge tone="success"><Icon name="check" size={16} />Suggested</VenueBadge>;
            return item.option ? (
              <VenueChoiceCard key={item.venueId} venue={item.option} expanded={openId === item.venueId} onToggle={() => toggle(item.venueId)} badge={badge} action={addAction(item.venueId)} />
            ) : (
              <Unlisted key={item.venueId} name={item.name ?? `Venue ${item.venueId}`} badge={badge} />
            );
          })}
        </>
      ) : null}
      <p className="text-xs text-on-surface-variant">Your coordinator arranges holds and bookings from these venues; each appears below once it is requested.</p>
    </div>
  );
}
