"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSessionUser } from "@/components/auth/auth-gate";
import { keepsIdempotencyKey } from "@/lib/lifecycle-actions";
import { readHoldCommand, saveHoldCommand } from "../hold-command-recovery";
import Link from "next/link";
import { useHoldExpiryRefresh, useMinuteClock } from "../use-hold-expiry-refresh";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, FormLabel, Skeleton, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { BookingStatusChip } from "@/components/venue-staff/booking-requests/booking-status-chip";
import { BookingChecksPanel } from "@/components/venues/booking-checks";
import { ApiError } from "@/lib/api";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import { holdCountdown } from "@/lib/hold-countdown";
import type { EventVenueOption } from "@/lib/api/event-venues";
import type { EventView } from "@/lib/api/event-workspace";
import {
  HOLD_LIMITS,
  isActiveHold,
  listEventHolds,
  releaseVenueHold,
  requestVenueHold,
  withdrawHoldRequest,
  type VenueHoldRequest,
} from "@/lib/api/venue-holds";
import { sgtInputToIso, toSgtInput } from "./venue-booking-form-model";
import { useVenueBookingChecks } from "./use-venue-booking-checks";

const DAY_MS = 24 * 60 * 60 * 1000;

// The chip shows the hold's own state once placed, otherwise the request's.
export const holdChipStatus = (request: VenueHoldRequest, now = Date.now()) => (
  request.hold?.bookingUnavailable ? "NOT_CHECKED" : request.hold?.status === "ACTIVE" && request.hold.expiresAt && Date.parse(request.hold.expiresAt) <= now
    ? "EXPIRED" : request.hold?.status ?? request.status
);
export const holdChipLabel = (request: VenueHoldRequest, now: number) =>
  holdChipStatus(request, now) === "EXPIRED" ? "Hold expired" : request.statusLabel;

// A hold confirmed but never saved as a booking (Master T35) can be confirmed again.
export const canConfirmAgain = (request: VenueHoldRequest) => request.status === "PLACED" && Boolean(request.hold?.bookingMissing);

// bookingLink: Venue Staff open the booking a confirmed hold became.
export function HoldSummary({ request, now, bookingLink = false, onRetry }: { request: VenueHoldRequest; now: number; bookingLink?: boolean; onRetry?: () => void }) {
  const hold = request.hold;
  const countdown = isActiveHold(request, now) ? holdCountdown(hold?.expiresAt, now) : null;
  const booking = hold?.convertedBooking ?? null;
  return (
    <div className="grid gap-1 text-sm text-on-surface-variant">
      <p>
        {formatEventWindow(request.start, request.end)}
        {request.expectedAttendance ? ` · ${request.expectedAttendance.toLocaleString()} people` : ""}
      </p>
      {isActiveHold(request, now) && hold?.expiresAt ? (
        <p className="font-semibold text-[#92400E]">
          {countdown ? `${countdown} (${formatTimestamp(hold.expiresAt)})` : `Held until ${formatTimestamp(hold.expiresAt)}`}
          {hold.extended ? " (extended once)" : ""}
        </p>
      ) : null}
      {booking ? (
        <p className="font-semibold text-on-surface">
          Confirmed as{" "}
          {bookingLink ? (
            <Link className="underline" href={`/events/${request.eventId}?booking=${booking.bookingId}`}>Booking #{booking.bookingId}</Link>
          ) : `Booking #${booking.bookingId}`}
          {` · ${booking.statusLabel}`}
        </p>
      ) : null}
      {hold?.bookingMissing ? (
        <p className="font-semibold text-error">The booking was not saved. Confirm the hold again to send it to Venue Staff.</p>
      ) : null}
      {hold?.bookingUnavailable ? (
        <div role="status" className="grid justify-items-start gap-1">
          <p>The booking&apos;s outcome could not be checked. Reload holds to try again.</p>
          {onRetry ? <Button type="button" variant="quiet" onClick={onRetry}>Retry booking lookup</Button> : null}
        </div>
      ) : null}
      {request.holdUnavailable ? <p className="text-xs">The hold&apos;s current state cannot be read right now.</p> : null}
      {request.note ? <p className="text-xs"><span className="font-semibold">Note:</span> {request.note}</p> : null}
      {request.status === "DECLINED" && request.declineReason ? (
        <p className="text-xs text-on-surface"><span className="font-semibold">Reason:</span> {request.declineReason}</p>
      ) : null}
    </div>
  );
}

interface HoldRequestDialogProps {
  open: boolean;
  event: EventView;
  venues: EventVenueOption[];
  startVenueId: number | null;
  onClose: () => void;
  onRequested: (request: VenueHoldRequest, message: string) => void;
}

// The coordinator's hold request (SPM-190 AC1): one venue and one window inside
// the event, checked live with the booking rules. A hold is possible only when
// setup starts more than 24 hours from now (AC3).
function HoldRequestDialog({ open, event, venues, startVenueId, onClose, onRequested }: HoldRequestDialogProps) {
  const user = useSessionUser();
  const slot = `connectsphere:recovery:spm190:request:${user?.user_id}:${event.eventId}`;
  const [saved] = useState(() => {
    const command = readHoldCommand(slot);
    try {
      const input = command ? JSON.parse(command.body) : null;
      return input && Number.isInteger(input.venueId) && typeof input.label === "string"
        && typeof input.start === "string" && typeof input.end === "string"
        && Number.isFinite(Date.parse(input.start)) && Number.isFinite(Date.parse(input.end))
        && (input.note == null || typeof input.note === "string")
        && (input.expectedAttendance == null || Number.isInteger(input.expectedAttendance))
        ? { command, input } : null;
    } catch { return null; }
  });
  const [uncertainBody, setUncertainBody] = useState<string | null>(saved?.command?.body ?? null);
  const [venueId, setVenueId] = useState<number | null>(saved?.input.venueId ?? startVenueId);
  const [label, setLabel] = useState(() => saved?.input.label ?? venues.find((venue) => venue.venueId === startVenueId)?.name ?? "");
  const [start, setStart] = useState(() => toSgtInput(saved?.input.start ?? event.startDatetime));
  const [end, setEnd] = useState(() => toSgtInput(saved?.input.end ?? event.endDatetime));
  const [attendance, setAttendance] = useState(saved ? String(saved.input.expectedAttendance ?? "") : event.expectedAttendance ? String(event.expectedAttendance) : "");
  const [note, setNote] = useState(saved?.input.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const keyRef = useRef<{ body: string; key: string } | null>(saved?.command ?? null);
  // Each opening is a fresh form, so its opening time is "now" for the 24-hour cutoff.
  const [openedAt] = useState(() => Date.now());

  const startIso = sgtInputToIso(start);
  const endIso = sgtInputToIso(end);
  const attendanceValue = attendance.trim() ? Number(attendance) : null;
  const items = useMemo(() => (venueId && startIso && endIso && endIso > startIso
    ? [{
      venueId, label: label.trim() || "Hold", start: startIso, end: endIso, expectedAttendance: attendanceValue ?? 1,
      layout: "", requiredFacilities: [], accessibilityNeeds: [], specialRequirements: null, isPrimary: false,
    }]
    : null), [venueId, label, startIso, endIso, attendanceValue]);
  const checks = useVenueBookingChecks(event.eventId, items);
  const result = checks.results[0]?.checked ? checks.results[0] : null;
  const tooLate = result?.occupiedStart ? Date.parse(result.occupiedStart) - DAY_MS <= openedAt : false;
  const body = JSON.stringify({ venueId, label: label.trim(), start: startIso, end: endIso, expectedAttendance: attendanceValue, note: note.trim() || null });
  const recovering = uncertainBody === body;
  const blocked = !recovering && (Boolean(result?.blocking.length) || tooLate);

  const submit = async () => {
    if (!venueId || !startIso || !endIso) {
      setError({ message: "Choose a venue and both times.", fields: {} });
      return;
    }
    const input = { venueId, label: label.trim(), start: startIso, end: endIso, expectedAttendance: attendanceValue, note: note.trim() || null };
    const body = JSON.stringify(input);
    // A retry of the same form reuses its key.
    const key = keyRef.current?.body === body ? keyRef.current.key : crypto.randomUUID();
    keyRef.current = { body, key };
    saveHoldCommand(slot, keyRef.current);
    setSaving(true);
    setError(null);
    try {
      const answer = await requestVenueHold(event.eventId, input, key);
      saveHoldCommand(slot, null);
      onRequested(answer.holdRequest, answer.message);
    } catch (caught) {
      if (keepsIdempotencyKey(caught instanceof ApiError ? caught : null) || (caught instanceof ApiError && caught.status === 401)) {
        setUncertainBody(body);
      } else {
        keyRef.current = null;
        setUncertainBody(null);
        saveHoldCommand(slot, null);
      }
      setError({
        message: caught instanceof Error ? caught.message : "The hold could not be requested.",
        fields: caught instanceof ApiError ? caught.fields : {},
      });
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (name: string) => (error?.fields[name] ? <p className="mt-1 text-xs text-error">{error.fields[name]}</p> : null);

  return (
    <Dialog
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title="Request a tentative hold"
      size="wide"
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="quiet" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={saving || blocked} onClick={() => void submit()}>{saving ? "Requesting…" : "Request hold"}</Button>
        </div>
      )}
    >
      <div className="grid gap-4 text-sm">
        <p className="text-on-surface-variant">
          Venue Staff place the hold or tell you why not. A hold keeps the venue for up to 7 days, or until 24 hours before setup, whichever is sooner. It is not a booking.
        </p>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <div className="min-w-0 md:col-span-2">
            <FormLabel htmlFor="hold-venue" required>Venue</FormLabel>
            <select id="hold-venue" className={fieldClasses} value={venueId ?? ""} disabled={saving}
              onChange={(change) => {
                const next = change.target.value ? Number(change.target.value) : null;
                const previous = venues.find((venue) => venue.venueId === venueId)?.name ?? "";
                setVenueId(next);
                if (!label.trim() || label === previous) setLabel(venues.find((venue) => venue.venueId === next)?.name ?? "");
              }}>
              <option value="">Choose a venue</option>
              {venues.map((venue) => <option key={venue.venueId} value={venue.venueId}>{venue.name}</option>)}
            </select>
            {fieldError("venueId")}
          </div>
          <div className="min-w-0">
            <FormLabel htmlFor="hold-label" required>Label</FormLabel>
            <input id="hold-label" className={fieldClasses} value={label} maxLength={HOLD_LIMITS.label} disabled={saving} onChange={(change) => setLabel(change.target.value)} />
            {fieldError("label")}
          </div>
          <div className="min-w-0">
            <FormLabel htmlFor="hold-attendance">Expected attendance</FormLabel>
            <input id="hold-attendance" type="number" min={1} inputMode="numeric" className={fieldClasses} value={attendance} disabled={saving} onChange={(change) => setAttendance(change.target.value)} />
            {fieldError("expectedAttendance")}
          </div>
          <div className="min-w-0">
            <FormLabel htmlFor="hold-start" required>Start (SGT)</FormLabel>
            <input id="hold-start" type="datetime-local" className={fieldClasses} value={start} disabled={saving} onChange={(change) => setStart(change.target.value)} />
            {fieldError("start")}
          </div>
          <div className="min-w-0">
            <FormLabel htmlFor="hold-end" required>End (SGT)</FormLabel>
            <input id="hold-end" type="datetime-local" className={fieldClasses} value={end} disabled={saving} onChange={(change) => setEnd(change.target.value)} />
            {fieldError("end")}
          </div>
          <div className="min-w-0 md:col-span-2">
            <FormLabel htmlFor="hold-note">Note for Venue Staff</FormLabel>
            <textarea id="hold-note" rows={2} className={fieldClasses} value={note} maxLength={HOLD_LIMITS.note} disabled={saving} onChange={(change) => setNote(change.target.value)} />
            {fieldError("note")}
          </div>
        </div>
        <BookingChecksPanel checks={result} pending={checks.checking} />
        {tooLate ? (
          <p className="text-sm font-semibold text-error">Setup starts within 24 hours, so no hold is possible. Request a booking instead.</p>
        ) : null}
        {checks.failed ? <p className="text-xs text-on-surface-variant">The venue could not be checked just now; Venue Staff check again when placing the hold.</p> : null}
        {error ? <AlertBanner tone="error">{error.message}</AlertBanner> : null}
      </div>
    </Dialog>
  );
}

interface EventVenueHoldsProps {
  event: EventView;
  isCoordinator: boolean;
  canRequest: boolean;
  venues: EventVenueOption[];
  // Each opening of the form gets a new key, so it starts fresh.
  form: { open: boolean; key: number; venueId: number | null } | null;
  onOpenForm: (venueId: number | null) => void;
  onCloseForm: () => void;
  // Called after any change, e.g. to refresh the event history.
  onChanged?: () => void;
  // "Confirm as booking" on an active hold (SPM-188 AC9); only while the
  // coordinator can request bookings.
  onConfirm?: (request: VenueHoldRequest) => void;
  // Changes when the event's bookings change, e.g. after a hold is confirmed.
  reloadKey?: number;
  // Venues this event already has an active booking at: a hold there cannot
  // be confirmed as a second booking.
  bookedVenueIds?: Set<number>;
}

// The event's tentative holds (SPM-190) for the coordinator and supervising
// Lead: each request with its status, the placed hold's expiry, and Withdraw
// (pending) or Release (active hold) for the coordinator.
export function EventVenueHolds({ event, isCoordinator, canRequest, venues, form, onOpenForm, onCloseForm, onChanged, onConfirm, reloadKey = 0, bookedVenueIds }: EventVenueHoldsProps) {
  const [state, setState] = useState<{ status: "loading" } | { status: "ready"; holds: VenueHoldRequest[] } | { status: "error"; message: string }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    listEventHolds(event.eventId)
      .then((holds) => { if (alive) setState({ status: "ready", holds }); })
      .catch((caught: unknown) => {
        if (alive) setState({ status: "error", message: caught instanceof Error ? caught.message : "Holds could not be loaded." });
      });
    return () => { alive = false; };
  }, [event.eventId, event.status, attempt, reloadKey]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const refreshedAt = useHoldExpiryRefresh(state.status === "ready" ? state.holds : [], reload);
  const clock = useMinuteClock();
  const now = Math.max(refreshedAt, clock);
  const act = async (request: VenueHoldRequest, action: "withdraw" | "release") => {
    setBusyId(request.holdRequestId);
    setNotice(null);
    try {
      const answer = action === "withdraw"
        ? await withdrawHoldRequest(request.holdRequestId)
        : await releaseVenueHold(request.hold?.holdId ?? "");
      setNotice({ tone: "success", text: answer.message });
      onChanged?.();
    } catch (caught) {
      setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "The hold could not be changed." });
    } finally {
      setBusyId(null);
      reload();
    }
  };

  return (
    <section aria-labelledby="event-venue-holds-heading" className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="event-venue-holds-heading" className="text-sm font-semibold text-on-surface">Tentative holds</h3>
        {canRequest ? (
          <Button type="button" variant="secondary" onClick={() => onOpenForm(null)} aria-haspopup="dialog">
            <Icon name="add" size={16} />Request hold
          </Button>
        ) : null}
      </div>
      <div aria-live="polite" role="status">
        {notice ? <AlertBanner tone={notice.tone} live={false}>{notice.text}</AlertBanner> : null}
      </div>
      {state.status === "loading" ? (
        <Skeleton className="h-16 w-full" />
      ) : state.status === "error" ? (
        <AlertBanner tone="error" title="Unable to load holds">
          {state.message}
          <div className="mt-3"><Button type="button" variant="secondary" onClick={reload}><Icon name="refresh" size={16} />Retry</Button></div>
        </AlertBanner>
      ) : state.holds.length === 0 ? (
        <p className="rounded-control bg-surface-container-low p-4 text-sm text-on-surface-variant">No holds have been requested.</p>
      ) : (
        <ul className="grid gap-3">
          {state.holds.map((request) => (
            <li key={request.holdRequestId} data-hold-request-id={request.holdRequestId} className="grid min-w-0 gap-2 rounded-panel border-t-4 border-t-[#B45309] bg-surface-container-low p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h4 className="text-sm font-semibold text-on-surface [overflow-wrap:anywhere]">
                  {request.venueName ?? `Venue ${request.venueId}`}{request.label && request.label !== request.venueName ? ` · ${request.label}` : ""}
                </h4>
                <BookingStatusChip status={holdChipStatus(request, now)} label={holdChipLabel(request, now)} />
              </div>
              <HoldSummary request={request} now={now} onRetry={reload} />
              {isCoordinator && (request.status === "PENDING" || isActiveHold(request, now) || canConfirmAgain(request)) ? (
                <div className="flex flex-wrap gap-2">
                  {onConfirm && (isActiveHold(request, now) || canConfirmAgain(request)) ? (
                    <Button
                      type="button"
                      aria-haspopup="dialog"
                      disabled={busyId === request.holdRequestId || Boolean(bookedVenueIds?.has(request.venueId))}
                      title={bookedVenueIds?.has(request.venueId) ? "This event already has a booking at this venue." : undefined}
                      onClick={() => onConfirm(request)}
                    >
                      <Icon name="check" size={16} />Confirm as booking
                    </Button>
                  ) : null}
                  {request.status === "PENDING" || isActiveHold(request, now) ? (
                    <Button type="button" variant="quiet" disabled={busyId === request.holdRequestId} onClick={() => void act(request, request.status === "PENDING" ? "withdraw" : "release")}>
                      {request.status === "PENDING" ? "Withdraw request" : "Release hold"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {form ? (
        <HoldRequestDialog
          key={form.key}
          open={form.open}
          event={event}
          venues={venues}
          startVenueId={form.venueId}
          onClose={onCloseForm}
          onRequested={(_request, message) => {
            onCloseForm();
            setNotice({ tone: "success", text: message });
            reload();
            onChanged?.();
          }}
        />
      ) : null}
    </section>
  );
}
