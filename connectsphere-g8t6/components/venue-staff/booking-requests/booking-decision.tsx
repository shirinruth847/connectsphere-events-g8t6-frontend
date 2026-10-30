"use client";

import { useId, useState } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, FormLabel, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { ApiError } from "@/lib/api";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import {
  MAX_REJECTION_REASON_LENGTH,
  approveVenueBooking,
  rejectVenueBooking,
  type VenueBookingDetail,
} from "@/lib/api/venue-bookings";
import { hasBlockingProblem } from "@/components/venues/booking-checks";
import { formatBookingId } from "./booking-filters";

export type DecisionNotice = { tone: "success" | "warning"; text: string };

const REASON_REQUIRED = "Enter a reason for rejecting this booking.";

// Approve and reject for one venue booking (SPM-186, SPM-189). The backend
// decides which actions are open (`actions`) and re-checks every rule; a
// decision someone else made first comes back as 409 BOOKING_ALREADY_DECIDED.
export function BookingDecision({ booking, onDecided }: {
  booking: VenueBookingDetail;
  onDecided: (notice: DecisionNotice) => void;
}) {
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const reasonId = useId();
  const hintId = useId();

  const actions = booking.actions;
  const approved = booking.status === "APPROVED";
  // A blocking check stops approval; the backend re-checks under the venue lock (SPM-186 AC8).
  const blocked = hasBlockingProblem(booking.checks);
  const warnings = booking.checks?.warnings ?? [];
  const blockedId = useId();
  const decisionLine = booking.reviewedAt
    ? `${booking.statusLabel} by ${booking.reviewedByName ?? "Venue Staff"} · ${formatTimestamp(booking.reviewedAt)}`
    : null;

  const close = () => {
    if (saving) return;
    setDialog(null);
    setError("");
  };

  const decide = async () => {
    if (dialog === "reject") {
      const trimmed = reason.trim();
      if (!trimmed) {
        setReasonError(REASON_REQUIRED);
        return;
      }
      if (trimmed.length > MAX_REJECTION_REASON_LENGTH) {
        setReasonError(`The reason must be ${MAX_REJECTION_REASON_LENGTH} characters or fewer.`);
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const result = dialog === "approve"
        ? await approveVenueBooking(booking.bookingId, booking.status)
        : await rejectVenueBooking(booking.bookingId, reason.trim(), booking.status);
      setDialog(null);
      setReason("");
      onDecided({
        tone: "success",
        text: dialog === "approve"
          ? `${result.message} The coordinator and organiser have been notified.`
          : `${result.message} The coordinator has the reason; the organiser has been told the venue is not available.`,
      });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "BOOKING_ALREADY_DECIDED") {
        setDialog(null);
        onDecided({ tone: "warning", text: caught.message });
      } else if (caught instanceof ApiError && caught.fields.reason) {
        setReasonError(caught.fields.reason);
      } else {
        // Input is kept so the user can retry after a recoverable error.
        setError(caught instanceof Error ? caught.message : "The decision could not be saved. Try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!actions) return null;

  return (
    <div className="grid gap-2 border-t border-outline-variant pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-on-surface-variant">
          {decisionLine
            ?? (booking.status === "PENDING"
              ? actions.canApprove ? "Awaiting your decision." : "Can be approved once the event is in planning."
              : "No decision recorded.")}
        </p>
        {actions.canApprove || actions.canReject ? (
          <div className="flex flex-wrap gap-2">
            {actions.canReject ? (
              <Button variant={approved ? "secondary" : "danger"} onClick={() => { setDialog("reject"); setReasonError(""); setError(""); }}>
                <Icon name="close" size={16} />{approved ? "Reject approved booking" : "Reject"}
              </Button>
            ) : null}
            {actions.canApprove ? (
              <Button disabled={blocked} aria-describedby={blocked ? blockedId : undefined} onClick={() => { setDialog("approve"); setError(""); }}>
                <Icon name="check" size={16} />Approve
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {actions.canApprove && blocked ? (
        <p id={blockedId} className="text-xs font-semibold text-error">Can&apos;t approve: {booking.checks?.blocking[0].message}</p>
      ) : null}
      {approved && actions.canReject ? (
        <p className="text-xs text-on-surface-variant">
          Only if the venue can no longer host it (e.g. maintenance). The event is not cancelled.
        </p>
      ) : null}

      <Dialog
        open={dialog !== null}
        onClose={close}
        title={dialog === "approve" ? "Approve this venue booking?" : approved ? "Reject this approved booking?" : "Reject this venue booking?"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="quiet" disabled={saving} onClick={close}>Cancel</Button>
            <Button variant={dialog === "approve" ? "primary" : "danger"} disabled={saving} onClick={() => void decide()}>
              {saving ? "Saving…" : dialog === "approve" ? "Approve booking" : "Reject booking"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <p className="text-sm text-on-surface">
            <span className="font-semibold">{booking.venueName}</span>
            {booking.label ? ` · ${booking.label}` : ""} · <span className="font-mono">{formatBookingId(booking.bookingId)}</span>
            <br />
            <span className="text-on-surface-variant">{formatEventWindow(booking.startDatetime, booking.endDatetime)}</span>
          </p>
          {dialog === "approve" ? (
            <div className="grid gap-2">
              <p className="text-sm text-on-surface-variant">Only this booking is approved. Other bookings under the event keep their status.</p>
              {warnings.length ? (
                <div className="grid gap-1 rounded-control border border-[#F59E0B] p-3">
                  <p className="text-sm font-semibold text-on-surface">You are approving with {warnings.length === 1 ? "a warning" : `${warnings.length} warnings`}:</p>
                  <ul className="list-disc pl-5 text-sm text-on-surface">
                    {warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div>
              <FormLabel htmlFor={reasonId} required>Reason</FormLabel>
              <textarea
                id={reasonId}
                className={`${fieldClasses} min-h-28`}
                value={reason}
                maxLength={MAX_REJECTION_REASON_LENGTH}
                aria-invalid={reasonError ? true : undefined}
                aria-describedby={`${hintId}${reasonError ? ` ${reasonId}-error` : ""}`}
                onChange={(event) => { setReason(event.target.value); setReasonError(""); }}
                disabled={saving}
              />
              <p id={hintId} className="mt-1 flex justify-between gap-3 text-xs text-on-surface-variant">
                <span>Explain why. You can also suggest other dates or venues.</span>
                <span>{reason.length}/{MAX_REJECTION_REASON_LENGTH}</span>
              </p>
              {reasonError ? <p id={`${reasonId}-error`} role="alert" className="mt-1 text-xs font-semibold text-error">{reasonError}</p> : null}
              {approved ? (
                <p className="mt-3 text-xs text-on-surface-variant">The coordinator sees this reason. The organiser is told the venue is no longer available and that the event is not cancelled.</p>
              ) : null}
            </div>
          )}
          {error ? <AlertBanner tone="error">{error}</AlertBanner> : null}
        </div>
      </Dialog>
    </div>
  );
}
