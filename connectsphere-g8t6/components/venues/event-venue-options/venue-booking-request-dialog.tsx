"use client";

import { useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, ReferenceIdTag } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { ApiError } from "@/lib/api";
import { keepsIdempotencyKey } from "@/lib/lifecycle-actions";
import { formatEventWindow } from "@/lib/datetime";
import {
  requestEventVenueBookings,
  type EventVenueBookingList,
  type EventVenueOption,
  type VenueBookingRequestResult,
} from "@/lib/api/event-venues";
import type { EventView } from "@/lib/api/event-workspace";
import { calendarDate } from "@/lib/coordinator-calendar";
import { eventCalendarCheck, venueFilterChoices } from "./venue-option-model";
import {
  MAX_BOOKING_SECTIONS,
  activeBookings,
  bookedVenueIds as bookedIds,
  bookingRequestFailure,
  draftsChanged,
  firstVenueId,
  hasPrimaryVenue,
  needsPrimaryChoice,
  newDraft,
  sectionErrors,
  shiftErrorsAfterRemoval,
  toRequestItems,
  toSgtInput,
  validateDrafts,
  type BookingDraft,
} from "./venue-booking-form-model";
import { VenueBookingSection, type VenueChoiceGroups } from "./venue-booking-section";
import { useVenueBookingChecks } from "./use-venue-booking-checks";
import { findBookingConflicts, type BookingConflict } from "./booking-precheck";

interface VenueBookingRequestDialogProps {
  // Kept mounted while closing, so focus returns to the button that opened it;
  // the parent gives each opening a new key for a fresh form.
  open: boolean;
  event: EventView;
  // Every venue the coordinator can choose (active and in service, AC9).
  venues: EventVenueOption[];
  // The organiser's ranked choices and the coordinator's suggestion, in order.
  featuredVenueIds: number[];
  // The time the organiser wants each chosen venue for, when narrower than the event (SPM-76).
  requestedTimes?: Map<number, { start: string; end: string }>;
  bookings: EventVenueBookingList;
  // A venue card's "Request booking" starts the form with that venue.
  startVenueId: number | null;
  onClose: () => void;
  onSubmitted: (result: VenueBookingRequestResult) => void;
  // The event left planning or the coordinator changed: reload the event.
  onStale: () => void;
  // The event's bookings changed elsewhere: reload them, keeping the form.
  onBookingsChanged: () => void;
}

let sectionCounter = 0;
const nextKey = () => `section-${++sectionCounter}`;

// The booking request form (SPM-179), in a wide popup over the event's venue
// section. Event details are shown read-only (AC2); each venue has its own
// section (AC3, AC4); nothing is saved unless every section passes, and every
// value is kept after a refusal (AC11, AC16). Closing a changed form asks first.
export function VenueBookingRequestDialog({
  open,
  event,
  venues,
  featuredVenueIds,
  requestedTimes,
  bookings,
  startVenueId,
  onClose,
  onSubmitted,
  onStale,
  onBookingsChanged,
}: VenueBookingRequestDialogProps) {
  const booked = useMemo(() => bookedIds(bookings.bookings), [bookings.bookings]);
  const eventHasPrimary = hasPrimaryVenue(bookings.bookings);
  const context = useMemo(() => ({
    startDatetime: event.startDatetime,
    endDatetime: event.endDatetime,
    expectedAttendance: event.expectedAttendance,
    preferredLayoutType: event.preferredLayoutType,
    accessibilityNeeds: event.accessibilityNeeds ?? [],
  }), [event]);

  // A section's times start as the organiser's requested time for its venue,
  // or the whole event (SPM-76).
  const timesFor = (venueId: number | null) => {
    const time = venueId == null ? undefined : requestedTimes?.get(venueId);
    return { start: toSgtInput(time?.start ?? event.startDatetime), end: toSgtInput(time?.end ?? event.endDatetime) };
  };
  const [initial] = useState<BookingDraft[]>(() => {
    const venueId = firstVenueId([startVenueId, ...featuredVenueIds], venues, booked);
    const venue = venues.find((option) => option.venueId === venueId) ?? null;
    return [{ ...newDraft(nextKey(), context, venue), ...timesFor(venueId) }];
  });
  const [drafts, setDrafts] = useState<BookingDraft[]>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ message: string; stale: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [checking, setChecking] = useState(false);
  const [conflicts, setConflicts] = useState<BookingConflict[] | null>(null);
  // One key per request body: a retry of the same body cannot book twice (AC13).
  const [uncertainBody, setUncertainBody] = useState<string | null>(null);
  const attempt = useRef<{ body: string; key: string; uncertain: boolean } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const venueById = useMemo(() => new Map(venues.map((venue) => [venue.venueId, venue])), [venues]);
  const groups: VenueChoiceGroups = useMemo(() => {
    const featured = featuredVenueIds.flatMap((venueId) => venueById.get(venueId) ?? []);
    const featuredIds = new Set(featured.map((venue) => venue.venueId));
    const others = venues.filter((venue) => !featuredIds.has(venue.venueId)).sort((a, b) => a.name.localeCompare(b.name));
    return { featured, others };
  }, [featuredVenueIds, venueById, venues]);
  const choices = useMemo(() => {
    const found = venueFilterChoices(venues);
    return { ...found, accessibility: [...new Set([...found.accessibility, ...(event.accessibilityNeeds ?? [])])] };
  }, [venues, event.accessibilityNeeds]);

  // Each section is checked on its own venue and window as it changes (SPM-186
  // AC17); a section without a venue and both times is not checked yet.
  const checkItems = useMemo(
    () => (drafts.some((draft) => draft.venueId != null && draft.start && draft.end) ? toRequestItems(drafts, eventHasPrimary) : null),
    [drafts, eventHasPrimary],
  );
  const checks = useVenueBookingChecks(event.eventId, checkItems);
  const recoveringRequest = uncertainBody !== null && uncertainBody === JSON.stringify(toRequestItems(drafts, eventHasPrimary));
  // The coordinator's calendar on the event window, offered when a hold is in the way (SPM-188 AC4).
  const calendar = useMemo(() => ({
    eventId: event.eventId,
    date: event.startDatetime ? calendarDate(new Date(event.startDatetime)) : calendarDate(new Date()),
    check: eventCalendarCheck(event.startDatetime, event.endDatetime),
    label: event.requestId,
  }), [event.eventId, event.startDatetime, event.endDatetime, event.requestId]);
  const blockingCount = checks.checking ? 0 : checks.results.filter((result) => result.checked && result.blocking.length).length;
  // Invalid windows are returned unchecked, with field errors rather than blockers.
  const hasCheckFieldErrors = !checks.checking && checks.results.some((result) =>
    Object.keys(result.fields).some((field) => /\.(start|end)$/.test(field)),
  );
  // A time the server cannot check yet (e.g. outside the event) shows on its field (AC18).
  const liveErrors = (index: number) => {
    const fields = checks.results[index]?.fields ?? {};
    return Object.fromEntries(["start", "end"].flatMap((name) => {
      const message = fields[`bookings.${index}.${name}`];
      return message ? [[name, message]] : [];
    }));
  };

  const askPrimary = needsPrimaryChoice(drafts.length, eventHasPrimary);
  const primaryGroup = `primary-${event.eventId}`;
  const primaryVenue = activeBookings(bookings.bookings).find((booking) => booking.isPrimary) ?? null;

  const update = (index: number, patch: Partial<BookingDraft>) => {
    if (saving) return;
    setDrafts((current) => current.map((draft, at) => {
      if (patch.isPrimary) return at === index ? { ...draft, ...patch } : { ...draft, isPrimary: false };
      if (at !== index) return draft;
      // Choosing another venue moves untouched times to that venue's requested time.
      const before = timesFor(draft.venueId);
      const untouched = draft.start === before.start && draft.end === before.end;
      return "venueId" in patch && untouched ? { ...draft, ...patch, ...timesFor(patch.venueId ?? null) } : { ...draft, ...patch };
    }));
    // A corrected field drops its error; the rest stay until the next send.
    setErrors((current) => {
      const next = { ...current };
      for (const name of Object.keys(patch)) delete next[`bookings.${index}.${name === "labelEdited" ? "label" : name}`];
      if ("isPrimary" in patch) delete next["bookings.primary"];
      return next;
    });
  };
  const addSection = () => setDrafts((current) => [...current, newDraft(nextKey(), context)]);
  const removeSection = (index: number) => {
    setDrafts((current) => current.filter((_, at) => at !== index));
    setErrors((current) => shiftErrorsAfterRemoval(current, index));
  };

  const close = () => {
    if (saving) return;
    if (draftsChanged(drafts, initial)) setConfirmDiscard(true);
    else onClose();
  };

  const showSection = (index: number | null) => {
    if (index == null) return;
    // After React paints the errors, bring the section and its first invalid field into view.
    window.setTimeout(() => {
      const section = bodyRef.current?.querySelector<HTMLElement>(`[data-booking-section="${index}"]`);
      section?.scrollIntoView({ block: "start", behavior: "smooth" });
      section?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus({ preventScroll: true });
    }, 0);
  };

  const submit = async () => {
    if (saving) return;
    const items = toRequestItems(drafts, eventHasPrimary);
    const body = JSON.stringify(items);
    const recovering = attempt.current?.body === body && attempt.current.uncertain;
    const found = recovering ? {} : validateDrafts(drafts, { event: context, venues, bookedVenueIds: booked, eventHasPrimary });
    if (Object.keys(found).length) {
      setErrors(found);
      setBanner({ message: "Nothing was sent. Correct the highlighted fields.", stale: false });
      const first = Object.keys(found).map((key) => /^bookings\.(\d+)\./.exec(key)?.[1]).find((value) => value !== undefined);
      showSection(first !== undefined ? Number(first) : null);
      return;
    }
    const key = attempt.current?.body === body ? attempt.current.key : crypto.randomUUID();
    attempt.current = { body, key, uncertain: Boolean(recovering) };
    setSaving(true);
    setBanner(null);
    // Recovery must reach the server even if availability changed after commit.
    // New commands still receive the advisory check before submission.
    if (!recovering) {
      setChecking(true);
      const clashes = await findBookingConflicts(event.eventId, drafts, (venueId) => venueById.get(venueId)?.name ?? "This venue");
      setChecking(false);
      if (clashes.length) {
        setSaving(false);
        setConflicts(clashes);
        return;
      }
    }
    try {
      const result = await requestEventVenueBookings(event.eventId, items, key);
      attempt.current = null;
      setUncertainBody(null);
      onSubmitted(result);
    } catch (caught) {
      const error = caught instanceof ApiError ? caught : new ApiError(caught instanceof Error ? caught.message : "The booking request could not be sent.", 0);
      const uncertain = keepsIdempotencyKey(error) || error.status === 401;
      if (attempt.current) attempt.current.uncertain = uncertain;
      setUncertainBody(uncertain ? body : null);
      const failure = bookingRequestFailure(error);
      setErrors(failure.fields);
      setBanner({ message: failure.banner, stale: failure.stale });
      if (failure.refreshBookings) onBookingsChanged();
      showSection(failure.sectionIndex);
    } finally {
      setSaving(false);
    }
  };

  const closeConflicts = () => {
    const first = conflicts?.[0]?.index ?? null;
    setConflicts(null);
    showSection(first);
  };

  const unavailableFor = (index: number) =>
    new Set([...booked, ...drafts.flatMap((draft, at) => (at !== index && draft.venueId != null ? [draft.venueId] : []))]);

  const eventRows = [
    { icon: "document" as const, label: "Reference", value: <ReferenceIdTag value={bookings.requestId || event.requestId} /> },
    { icon: "registration" as const, label: "Title", value: event.title },
    { icon: "layout" as const, label: "Type", value: bookings.eventTypeLabel ?? "Not provided" },
    { icon: "calendar" as const, label: "Date & time", value: formatEventWindow(event.startDatetime, event.endDatetime) },
    {
      icon: "attendees" as const,
      label: "Expected attendance",
      value: event.expectedAttendance ? `${event.expectedAttendance.toLocaleString()} people` : "Not provided",
    },
  ];

  return (
    <>
      <Dialog
        open={open}
        onClose={close}
        title="Request venue bookings"
        size="wide"
        footer={(
          <>
            <Button type="button" variant="quiet" disabled={saving} onClick={close}>Cancel</Button>
            {blockingCount && !recoveringRequest ? (
              <span className="self-center text-xs font-semibold text-error">
                {blockingCount === 1 ? "1 venue has" : `${blockingCount} venues have`} a problem to fix first.
              </span>
            ) : null}
            {recoveringRequest ? <span className="self-center text-xs text-on-surface-variant">Retry to recover the previous request&apos;s result.</span> : null}
            <Button type="button" disabled={saving || Boolean(banner?.stale) || (!recoveringRequest && (blockingCount > 0 || hasCheckFieldErrors))} onClick={() => void submit()}>
              {checking ? "Checking availability…" : saving ? "Sending…" : "Send booking request"}
            </Button>
          </>
        )}
      >
        <div ref={bodyRef} className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start">
          <aside aria-label="Event details" className="grid min-w-0 gap-3 lg:sticky lg:top-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-on-surface">
              <Icon name="lock" size={16} />Event details (read-only)
            </h3>
            <KeyValuePanel rows={eventRows} />
            <p className="text-xs leading-relaxed text-on-surface-variant">
              {primaryVenue
                ? `${primaryVenue.venueName ?? "A venue"} is this event's primary venue. New venues are added as additional venues.`
                : "One venue becomes the primary venue. With several venues, mark one as primary."}
            </p>
            <p className="text-xs leading-relaxed text-on-surface-variant">
              Times are in Singapore time (SGT). Each booking must fall within the event&apos;s dates and times. Venue Staff review every venue separately.
            </p>
          </aside>

          <div className="grid min-w-0 gap-4">
            {banner ? (
              <AlertBanner tone="error" title={banner.stale ? "This event has changed" : "The request was not sent"}>
                <p>{banner.message}</p>
                {banner.stale ? (
                  <div className="mt-3">
                    <Button type="button" variant="secondary" onClick={onStale}><Icon name="refresh" size={16} />Reload event</Button>
                  </div>
                ) : null}
              </AlertBanner>
            ) : null}
            {errors["bookings.primary"] ? (
              <p id={`${primaryGroup}-error`} role="alert" className="flex items-start gap-1.5 rounded-control bg-error-container px-3 py-2 text-sm font-semibold text-on-error-container">
                <Icon name="warning" size={16} className="mt-0.5 shrink-0" />{errors["bookings.primary"]}
              </p>
            ) : null}

            {drafts.map((draft, index) => (
              <VenueBookingSection
                key={draft.key}
                index={index}
                draft={draft}
                venue={draft.venueId == null ? null : venueById.get(draft.venueId) ?? null}
                venueGroups={groups}
                unavailableVenueIds={unavailableFor(index)}
                bookedVenueIds={booked}
                choices={choices}
                errors={{ ...liveErrors(index), ...sectionErrors(errors, index) }}
                checks={checks.results[index]?.checked ? checks.results[index] : null}
                checking={checks.checking}
                calendar={calendar}
                primaryGroup={askPrimary ? primaryGroup : null}
                primaryErrorId={errors["bookings.primary"] ? `${primaryGroup}-error` : undefined}
                canRemove={drafts.length > 1}
                disabled={saving}
                onChange={(patch) => update(index, patch)}
                onRemove={() => removeSection(index)}
              />
            ))}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" disabled={saving || drafts.length >= MAX_BOOKING_SECTIONS} onClick={addSection}>
                <Icon name="add" size={16} />Add another venue
              </Button>
              <span className="text-xs text-on-surface-variant">{drafts.length} of {MAX_BOOKING_SECTIONS} venues</span>
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Discard this booking request?"
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
            {/* The prompt closes first, so the form's own close then returns
                focus to the button that opened the form. */}
            <Button type="button" variant="danger" onClick={() => { setConfirmDiscard(false); window.setTimeout(onClose, 0); }}>Discard</Button>
          </>
        )}
      >
        <p className="text-sm text-on-surface">The venue sections you filled in will be lost. Nothing has been sent to Venue Staff.</p>
      </Dialog>

      {/* SPM-185: clashes found before sending; the form keeps every value. */}
      <Dialog
        open={conflicts !== null}
        onClose={closeConflicts}
        title={conflicts && conflicts.length > 1 ? "Some venues are not available at those times" : "This venue is not available at that time"}
        footer={<Button type="button" onClick={closeConflicts}>Change times or venue</Button>}
      >
        <div className="grid gap-3 text-sm text-on-surface">
          <p>Nothing was sent. Each venue&apos;s setup and turnaround time is included.</p>
          {(conflicts ?? []).map((conflict) => (
            <section key={conflict.index} aria-label={`Venue section ${conflict.index + 1}: ${conflict.venueName}`} className="grid gap-1">
              <h3 className="font-semibold">Venue section {conflict.index + 1}: {conflict.venueName}</h3>
              <ul className="grid gap-1">
                {conflict.messages.map((message, at) => (
                  <li key={at} className="rounded-control bg-[#FEF2F2] px-3 py-1.5">{message}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Dialog>
    </>
  );
}
