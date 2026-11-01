"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, FormLabel, Skeleton, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { ApiError } from "@/lib/api";
import { calendarDate } from "@/lib/coordinator-calendar";
import { formatEventWindow } from "@/lib/datetime";
import {
  getEventVenueOptions,
  listEventVenueBookings,
  suggestEventVenues,
  type EventVenueOption,
  type EventVenueOptions,
  type PreferredVenue,
  type VenueBookingRequestResult,
  type VenueOptionsQuery,
} from "@/lib/api/event-venues";
import type { EventView, VenueSuggestion } from "@/lib/api/event-workspace";
import { VenueBrowser } from "./venue-browser";
import { VenueChoiceCard } from "./venue-choice-card";
import { VenueBadge } from "./venue-option-card";
import { VenueDetails } from "./venue-details";
import { eventCalendarCheck, suggestionBlocker, venueById } from "./venue-option-model";
import { EventVenueBookings, type BookingListState } from "./event-venue-bookings";
import { VenueBookingRequestDialog } from "./venue-booking-request-dialog";
import { bookedVenueIds } from "./venue-booking-form-model";
import { EventVenueHolds } from "./event-venue-holds";
import type { VenueHoldRequest } from "@/lib/api/venue-holds";

type ChoicesState =
  | { status: "loading" }
  | { status: "ready"; data: EventVenueOptions }
  | { status: "error"; message: string };

// Up to 10 venues on the coordinator's list for the organiser.
const MAX_LIST = 10;

interface EventVenueSectionProps {
  event: EventView;
  // Called after the list is sent, e.g. to reload the event: suggesting a venue
  // outside the organiser's choices opens a clarification.
  onSuggested?: (suggestions: VenueSuggestion[]) => void;
  // Called when the list changed elsewhere (409), to reload the event.
  onStale?: () => void;
  // Called after venue bookings are requested (SPM-179), e.g. to refresh the event history.
  onBookingsRequested?: (result: VenueBookingRequestResult) => void;
}

// The venue section of an event request for the assigned coordinator and the
// supervising Lead (SPM-72/74). It opens on the organiser's ranked venue
// choices and the coordinator's list for the organiser: Select marks one of the
// organiser's own choices, Suggest adds any other venue, and Send to organiser
// saves the list. Suggested venues reach the organiser in a clarification, so
// they can amend their choices (developer request, 1 November 2026). "Find
// another venue" opens a popup with the search, filters, comparison,
// availability calendar and venue list. In
// planning, the coordinator requests venue bookings from here (SPM-179); the
// event's bookings are listed above the choices for the coordinator and Lead.
// SPM-76: when the organiser wants this venue, and whether it is free then.
// The coordinator and the Lead both see it; it never books anything.
function RequestedTime({ choice, eventStart, eventEnd }: { choice: PreferredVenue; eventStart: string | null; eventEnd: string | null }) {
  const narrowed = Boolean(choice.requestedStart && choice.requestedEnd);
  const availability = choice.requestedAvailability;
  const unavailable = availability?.status.startsWith("UNAVAILABLE");
  return (
    <p className="grid gap-0.5 text-xs">
      <span className="font-semibold text-on-surface">
        Wanted for: {narrowed ? formatEventWindow(choice.requestedStart, choice.requestedEnd) : `the whole event${eventStart ? ` (${formatEventWindow(eventStart, eventEnd)})` : ""}`}
      </span>
      {narrowed && availability ? (
        <span className={`font-semibold ${unavailable ? "text-error" : "text-success"}`}>At that time: {availability.label}</span>
      ) : null}
    </p>
  );
}

export function EventVenueSection({ event, onSuggested, onStale, onBookingsRequested }: EventVenueSectionProps) {
  const [choices, setChoices] = useState<ChoicesState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [canSuggest, setCanSuggest] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // The search opened from "Find Alternative Venues" starts filtered (SPM-198).
  const [searchAlternatives, setSearchAlternatives] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  // A related venue (e.g. a room of a chosen hall), opened from Related venues.
  const [relatedId, setRelatedId] = useState<number | null>(null);
  // What the organiser has been sent, and the list being prepared from it.
  const [sent, setSent] = useState<VenueSuggestion[]>(event.venueSuggestions ?? []);
  const [picked, setPicked] = useState<number[]>(() => (event.venueSuggestions ?? []).map((item) => item.venueId));
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState<{ message: string; stale: boolean } | null>(null);
  const pendingKey = useRef<{ body: string; key: string } | null>(null);
  const isCoordinator = event.viewerRelationship === "ASSIGNED_COORDINATOR";
  const [bookings, setBookings] = useState<BookingListState>({ status: "loading" });
  const [bookingsAttempt, setBookingsAttempt] = useState(0);
  // Each opening of the request form gets a new key, so it starts fresh.
  // fromHold: the form confirms that hold (SPM-188 AC9).
  const [request, setRequest] = useState<{ open: boolean; key: number; startVenueId: number | null; fromHold: VenueHoldRequest | null } | null>(null);
  const [requested, setRequested] = useState<VenueBookingRequestResult | null>(null);
  // The hold request form (SPM-190), keyed like the booking form.
  const [holdForm, setHoldForm] = useState<{ open: boolean; key: number; venueId: number | null } | null>(null);

  useEffect(() => {
    let alive = true;
    listEventVenueBookings(event.eventId)
      .then((data) => { if (alive) setBookings({ status: "ready", data }); })
      .catch((caught: unknown) => {
        if (alive) setBookings({ status: "error", message: caught instanceof Error ? caught.message : "Venue bookings could not be loaded." });
      });
    return () => { alive = false; };
  }, [event.eventId, event.status, event.viewerRelationship, bookingsAttempt]);

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
  const requestedTimes = new Map(preferred.flatMap((choice) => (choice.requestedStart && choice.requestedEnd ? [[choice.venueId, { start: choice.requestedStart, end: choice.requestedEnd }] as const] : [])));
  // Venues suggested outside the organiser's choices get their own cards; their
  // own choices show Selected on their cards instead.
  const sentIds = sent.map((item) => item.venueId);
  const suggestedCards = choices.status === "ready" ? choices.data.suggestedVenues.filter((item) => !rankOf.has(item.venueId) && sentIds.includes(item.venueId)) : [];
  const suggestedOptions = suggestedCards.flatMap((item) => (item.option ? [item.option] : []));
  const allVenues = choices.status === "ready" ? choices.data.venues : [];
  const knownVenues = [...allVenues, ...preferredOptions, ...suggestedOptions];
  const related = venueById(knownVenues, relatedId);
  const nameOf = (venueId: number) => venueById(knownVenues, venueId)?.name ?? sent.find((item) => item.venueId === venueId)?.name ?? `Venue ${venueId}`;
  const changed = picked.length !== sentIds.length || picked.some((venueId) => !sentIds.includes(venueId));
  const added = picked.filter((venueId) => !sentIds.includes(venueId));
  const removed = sentIds.filter((venueId) => !picked.includes(venueId));
  const addedOutside = added.filter((venueId) => !rankOf.has(venueId));
  const check = eventCalendarCheck(event.startDatetime, event.endDatetime);
  const calendar = isCoordinator ? { eventId: event.eventId, date: event.startDatetime ? calendarDate(new Date(event.startDatetime)) : calendarDate(new Date()), check, label: event.requestId } : null;
  const load = useCallback((query: VenueOptionsQuery) => getEventVenueOptions(event.eventId, query), [event.eventId]);

  const bookingList = bookings.status === "ready" ? bookings.data : null;
  const canRequest = isCoordinator && event.status === "PLANNING" && Boolean(bookingList?.canRequestVenueBookings) && choices.status === "ready";
  const booked = bookingList ? bookedVenueIds(bookingList.bookings) : new Set<number>();
  // The organiser's choices and any outside suggestion, for the form's venue list.
  const requestVenues = [...allVenues, ...[...preferredOptions, ...suggestedOptions].filter((option, index, list) => !venueById(allVenues, option.venueId) && list.findIndex((item) => item.venueId === option.venueId) === index)];
  const featuredVenueIds = [...new Set([...sentIds, ...preferred.map((choice) => choice.venueId)])];
  const openRequest = (startVenueId: number | null, fromHold: VenueHoldRequest | null = null) => {
    if (!canRequest) return;
    setRequested(null);
    setRequest((current) => ({ open: true, key: (current?.key ?? 0) + 1, startVenueId, fromHold }));
  };
  const confirmHold = (hold: VenueHoldRequest) => openRequest(hold.venueId, hold);
  const closeRequest = () => setRequest((current) => (current ? { ...current, open: false } : current));
  const bookingsRequested = (result: VenueBookingRequestResult) => {
    closeRequest();
    setSearchOpen(false);
    setRelatedId(null);
    setRequested(result);
    setBookingsAttempt((value) => value + 1);
    onBookingsRequested?.(result);
  };

  const badge = (venue: EventVenueOption) => {
    const rank = rankOf.get(venue.venueId);
    const onList = sentIds.includes(venue.venueId);
    if (!rank && !onList) return null;
    return (
      <>
        {rank ? <VenueBadge>Organiser&apos;s choice {rank}</VenueBadge> : null}
        {onList ? <VenueBadge tone="success"><Icon name="check" size={16} />{rank ? "Selected" : "Suggested"}</VenueBadge> : null}
      </>
    );
  };
  // "Request booking" starts the booking form with this venue (SPM-179); a venue
  // this event already has an active booking at is not offered again (AC4).
  const requestAction = (venue: EventVenueOption, place: "card" | "panel") => {
    if (!canRequest || booked.has(venue.venueId)) return null;
    return (
      <Button type="button" variant="secondary" aria-haspopup="dialog" onClick={() => openRequest(venue.venueId)}>
        {place === "panel" ? <Icon name="add" size={16} /> : null}Request booking
      </Button>
    );
  };
  // The organiser's own choices are selected, never suggested back to them;
  // any other venue is suggested. Either goes on the list until it is sent.
  const suggestAction = (venue: EventVenueOption, place: "card" | "panel") => {
    if (!canSuggest) return null;
    const own = rankOf.has(venue.venueId);
    if (picked.includes(venue.venueId)) {
      return (
        <Button type="button" variant="secondary" aria-pressed="true" onClick={() => setPicked((list) => list.filter((venueId) => venueId !== venue.venueId))}>
          <Icon name="check" size={16} />{own ? "Selected" : "On your list"}
        </Button>
      );
    }
    const blocker = suggestionBlocker(venue) ?? (picked.length >= MAX_LIST ? `Up to ${MAX_LIST} venues can be on the list.` : null);
    const label = own ? "Select" : place === "panel" ? "Suggest this venue" : "Suggest";
    const button = <Button type="button" aria-pressed="false" onClick={() => setPicked((list) => [...list, venue.venueId])} disabled={Boolean(blocker)} title={place === "card" ? blocker ?? undefined : undefined}>{label}</Button>;
    if (place === "card") return button;
    return (
      <div className="grid gap-1">
        {button}
        {blocker ? <p className="text-xs text-on-surface-variant">{blocker}</p> : null}
      </div>
    );
  };
  const openHoldForm = (venueId: number | null) => {
    if (!canRequest) return;
    setSearchOpen(false);
    setRelatedId(null);
    setHoldForm((current) => ({ open: true, key: (current?.key ?? 0) + 1, venueId }));
  };
  // "Request hold" (SPM-190) keeps a venue for a while before booking it.
  const holdAction = (venue: EventVenueOption) => {
    if (!canRequest || booked.has(venue.venueId)) return null;
    return <Button type="button" variant="quiet" aria-haspopup="dialog" onClick={() => openHoldForm(venue.venueId)}>Request hold</Button>;
  };
  const action = (venue: EventVenueOption, place: "card" | "panel") => {
    const buttons = [suggestAction(venue, place), requestAction(venue, place), holdAction(venue)].filter(Boolean);
    if (buttons.length <= 1) return buttons[0] ?? null;
    return <div className="flex flex-wrap items-start gap-2">{buttons}</div>;
  };

  const closeConfirm = () => { setConfirming(false); setSaveError(null); };
  const confirmSuggestion = async () => {
    const body = { venueIds: picked, expectedVenueIds: sentIds, note: addedOutside.length ? note.trim() : "" };
    // A retry of the same list reuses its key, so it cannot notify twice.
    const text = JSON.stringify(body);
    const key = pendingKey.current?.body === text ? pendingKey.current.key : crypto.randomUUID();
    pendingKey.current = { body: text, key };
    setSaving(true);
    setSaveError(null);
    try {
      const result = await suggestEventVenues(event.eventId, body, key);
      pendingKey.current = null;
      setSent(result.suggestions);
      setPicked(result.suggestions.map((item) => item.venueId));
      setNote("");
      setNotice(`${result.message} It is recorded in the event history.`);
      setConfirming(false);
      // Back on the event page, where the cards now show the list.
      setSearchOpen(false);
      setRelatedId(null);
      setAttempt((value) => value + 1);
      onSuggested?.(result.suggestions);
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : undefined;
      if (code && code !== "NETWORK_ERROR") pendingKey.current = null;
      setSaveError({
        message: caught instanceof Error ? caught.message : "The venues could not be sent to the organiser.",
        stale: code === "VENUE_SUGGESTION_VERSION_CONFLICT" || code === "VENUE_NOT_SELECTABLE",
      });
    } finally {
      setSaving(false);
    }
  };

  // A choice's card opens its details in place (developer requests of 24 and
  // 25 October 2026); one at a time.
  const toggleView = (venueId: number) => setViewId((current) => (current === venueId ? null : venueId));
  const openSearch = (alternatives: boolean) => {
    setRelatedId(null);
    setSearchAlternatives(alternatives);
    setSearchOpen(true);
  };
  // A venue too small for the expected attendance offers venues at least that
  // large (SPM-198 AC4); without an expected attendance there is no assessment.
  const findAlternatives = event.expectedAttendance ? () => openSearch(true) : undefined;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div aria-live="polite" role="status">
        {notice ? <AlertBanner tone="success" title="Venues sent to the organiser" live={false}>{notice}</AlertBanner> : null}
        {requested ? (
          <AlertBanner tone="success" title="Booking request sent" live={false}>
            <p>{requested.message}</p>
            <p className="mt-1">
              Event <span className="font-mono">{requested.requestId}</span> · {requested.bookings.map((booking) => `Booking #${booking.bookingId} (${booking.venueName ?? `Venue ${booking.venueId}`})`).join(", ")}
            </p>
            {requested.warnings.length ? (
              <div className="mt-2">
                <p className="font-semibold">Venue Staff will see these warnings:</p>
                <ul className="list-disc pl-5">
                  {requested.warnings.flatMap((warning) => warning.messages.map((message, at) => ({ key: `${warning.index}-${at}`, message })))
                    .map(({ key, message }) => <li key={key}>{message}</li>)}
                </ul>
              </div>
            ) : null}
          </AlertBanner>
        ) : null}
      </div>
      <EventVenueBookings
        state={bookings}
        isCoordinator={isCoordinator}
        canRequest={canRequest}
        onRequest={() => openRequest(null)}
        onRetry={() => { setBookings({ status: "loading" }); setBookingsAttempt((value) => value + 1); }}
      />
      <EventVenueHolds
        event={event}
        isCoordinator={isCoordinator}
        canRequest={canRequest}
        venues={requestVenues}
        form={holdForm}
        onOpenForm={openHoldForm}
        onCloseForm={() => setHoldForm((current) => (current ? { ...current, open: false } : current))}
        onConfirm={canRequest ? confirmHold : undefined}
        bookedVenueIds={booked}
        reloadKey={bookingsAttempt}
      />
      {canSuggest || sent.length ? (
        <section aria-labelledby={`venue-list-${event.eventId}`} className="grid gap-3 rounded-panel border border-outline-variant bg-surface-container-low p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="grid gap-0.5">
              <h3 id={`venue-list-${event.eventId}`} className="text-sm font-semibold text-on-surface">Venues for the organiser <span className="font-normal text-on-surface-variant">({picked.length} / {MAX_LIST})</span></h3>
              <p className="text-xs text-on-surface-variant">
                {canSuggest
                  ? "Select from the organiser's choices, or suggest other venues. Suggested venues go to the organiser in a clarification request, so they can amend their choices. Nothing is held or booked."
                  : "Read-only: venues can be sent to the organiser while the event is under review or awaiting clarification."}
              </p>
            </div>
            {canSuggest && changed ? (
              <span className="flex flex-wrap gap-2">
                <Button type="button" variant="quiet" onClick={() => setPicked(sentIds)}>Undo changes</Button>
                <Button type="button" aria-haspopup="dialog" onClick={() => setConfirming(true)}><Icon name="forum" size={16} />Send to organiser</Button>
              </span>
            ) : null}
          </div>
          {picked.length ? (
            <ul className="flex flex-wrap gap-2" aria-label="Venues on the list">
              {picked.map((venueId) => (
                <li key={venueId} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest py-1 pl-3 pr-1 text-sm text-on-surface">
                  <span className="[overflow-wrap:anywhere]">{nameOf(venueId)}</span>
                  <span className="text-xs text-on-surface-variant">· {rankOf.has(venueId) ? "Selected" : "Suggested"}{sentIds.includes(venueId) ? "" : ", not sent"}</span>
                  {canSuggest ? (
                    <button type="button" aria-label={`Take ${nameOf(venueId)} off the list`} onClick={() => setPicked((list) => list.filter((id) => id !== venueId))} className="inline-flex size-7 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-primary">
                      <Icon name="close" size={16} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-on-surface-variant">No venues on the list yet.</p>
          )}
          {canSuggest && removed.length ? <p className="text-xs text-on-surface-variant">Taken off when sent: {removed.map(nameOf).join(", ")}.</p> : null}
        </section>
      ) : null}

      {suggestedCards.length ? (
        <section aria-label="Suggested venues" className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
          <h3 className="text-sm font-semibold text-on-surface">Suggested venues</h3>
          {suggestedCards.map((item) => item.option ? (
            <VenueChoiceCard key={item.venueId} venue={item.option} expanded={item.venueId === viewId} onToggle={() => toggleView(item.venueId)} badge={badge(item.option)} action={action(item.option, "card")} onOpenVenue={setRelatedId} onFindAlternatives={findAlternatives} calendar={calendar} />
          ) : (
            <article key={item.venueId} aria-label={item.name ?? `Venue ${item.venueId}`} className="grid content-start gap-2 rounded-panel border border-outline-variant bg-surface-container-low p-4">
              <div><VenueBadge tone="success"><Icon name="check" size={16} />Suggested</VenueBadge></div>
              <h3 className="font-semibold text-on-surface [overflow-wrap:anywhere]">{item.name ?? `Venue ${item.venueId}`}</h3>
              <p className="text-sm text-on-surface-variant">No longer available for new requests.</p>
            </article>
          ))}
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
                onFindAlternatives={findAlternatives}
                calendar={calendar}
                requested={<RequestedTime choice={choice} eventStart={event.startDatetime} eventEnd={event.endDatetime} />}
              />
            ) : (
              <article key={choice.venueId} aria-label={choice.name ?? `Venue ${choice.venueId}`} className="grid content-start gap-2 rounded-panel border border-outline-variant bg-surface-container-low p-4">
                <div><VenueBadge>Organiser&apos;s choice {choice.rank}</VenueBadge></div>
                <h3 className="font-semibold text-on-surface [overflow-wrap:anywhere]">{choice.name ?? `Venue ${choice.venueId}`}</h3>
                <RequestedTime choice={choice} eventStart={event.startDatetime} eventEnd={event.endDatetime} />
                <p className="text-sm text-on-surface-variant">No longer available for new requests.</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <div>
        <Button type="button" variant="secondary" aria-haspopup="dialog" onClick={() => openSearch(false)}>
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
            alternativeCapacity={event.expectedAttendance}
            startWithAlternatives={searchAlternatives}
          />
        ) : null}
      </Dialog>

      <Dialog open={related !== null} onClose={() => setRelatedId(null)} title="Venue details" size="wide">
        {related ? (
          <VenueDetails key={related.venueId} venue={related} badge={badge(related)} action={action(related, "panel")} onOpenVenue={setRelatedId} onFindAlternatives={findAlternatives} calendar={calendar} />
        ) : null}
      </Dialog>

      <Dialog
        open={confirming}
        onClose={() => { if (!saving) closeConfirm(); }}
        title="Send these venues to the organiser?"
        footer={(
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="quiet" disabled={saving} onClick={closeConfirm}>Cancel</Button>
            {saveError?.stale && onStale ? (
              <Button type="button" variant="secondary" onClick={() => { closeConfirm(); setAttempt((value) => value + 1); onStale(); }}>Reload</Button>
            ) : null}
            <Button type="button" disabled={saving || Boolean(saveError?.stale)} onClick={() => void confirmSuggestion()}>{saving ? "Sending…" : "Send to organiser"}</Button>
          </div>
        )}
      >
        {confirming ? (
          <div className="grid gap-3 text-sm text-on-surface">
            {added.filter((venueId) => rankOf.has(venueId)).length ? (
              <p><span className="font-semibold">Selected from their choices:</span> {added.filter((venueId) => rankOf.has(venueId)).map(nameOf).join(", ")}</p>
            ) : null}
            {addedOutside.length ? (
              <p><span className="font-semibold">Suggested:</span> {addedOutside.map(nameOf).join(", ")}</p>
            ) : null}
            {removed.length ? <p><span className="font-semibold">Taken off the list:</span> {removed.map(nameOf).join(", ")}</p> : null}
            <p className="text-on-surface-variant">
              {addedOutside.length
                ? event.status === "AWAITING_CLARIFICATION"
                  ? "The suggested venues are added to the open clarification request, so the organiser can amend their venue choices."
                  : "This opens a clarification request for the organiser, so they can amend their venue choices. The request is returned to them until you mark the clarification complete."
                : added.length
                  ? "The organiser is notified."
                  : "The organiser is not notified."}
              {" "}Nothing is held or booked, and the change is recorded in the event history.
            </p>
            {addedOutside.length ? (
              <div>
                <FormLabel htmlFor={`venue-list-note-${event.eventId}`}>Note to the organiser (optional)</FormLabel>
                <textarea id={`venue-list-note-${event.eventId}`} rows={3} maxLength={1000} value={note} onChange={(change) => setNote(change.target.value)} className={`${fieldClasses} resize-y`} placeholder="Why these venues might suit the event." />
              </div>
            ) : null}
            {saveError ? <AlertBanner tone="error">{saveError.message}</AlertBanner> : null}
          </div>
        ) : null}
      </Dialog>

      {request && bookingList && choices.status === "ready" ? (
        <VenueBookingRequestDialog
          key={request.key}
          open={request.open}
          event={event}
          venues={requestVenues}
          featuredVenueIds={featuredVenueIds}
          requestedTimes={requestedTimes}
          bookings={bookingList}
          startVenueId={request.startVenueId}
          fromHold={request.fromHold}
          onClose={closeRequest}
          onSubmitted={bookingsRequested}
          onStale={() => { closeRequest(); onStale?.(); }}
          onBookingsChanged={() => setBookingsAttempt((value) => value + 1)}
        />
      ) : null}
    </div>
  );
}
