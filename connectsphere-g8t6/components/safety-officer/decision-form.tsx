"use client";

import { Button, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { PermissionPill } from "@/components/shared/permission-pill";
import type { PanelBooking } from "@/lib/api/safety-reviews";
import { formatEventWindow } from "@/lib/datetime";
import {
  DECISION_LABELS,
  DECISION_OUTCOMES,
  rejectionField,
  SAFETY_LIMITS,
  type DecisionForm,
  type FieldErrors,
} from "@/lib/safety-review";
import { bookingTitle } from "./review-evidence";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-error">
      <Icon name="warning" size={16} />{message}
    </p>
  );
}

const invalidProps = (message: string | undefined, id: string) =>
  message ? { "aria-invalid": true as const, "aria-describedby": id } : {};

// SPM-243 AC8-AC10: the outcome and what it needs. Approval is offered only
// when no factor is NOT_SATISFACTORY; the backend rechecks every rule.
export function DecisionFormFields({
  form,
  errors,
  bookings,
  approveBlockedReason,
  onChange,
}: {
  form: DecisionForm;
  errors: FieldErrors;
  bookings: PanelBooking[];
  approveBlockedReason: string | null;
  onChange: (form: DecisionForm) => void;
}) {
  const update = (patch: Partial<DecisionForm>) => onChange({ ...form, ...patch });
  const changes = form.requestedChanges.length ? form.requestedChanges : [""];

  return (
    <div className="grid gap-5">
      <fieldset aria-describedby={errors.outcome ? "decision-outcome-error" : undefined} className="grid gap-2">
        <legend className="mb-2 text-xs font-semibold text-on-surface">
          Outcome<span aria-hidden="true" className="ml-1 text-error">*</span><span className="sr-only"> (required)</span>
        </legend>
        {DECISION_OUTCOMES.map((outcome) => {
          const blocked = outcome === "APPROVED" && approveBlockedReason !== null;
          const selected = form.outcome === outcome;
          return (
            <label
              key={outcome}
              className={`flex min-h-11 gap-3 rounded-control border p-3 transition-colors duration-150 ${
                blocked ? "cursor-not-allowed border-outline-variant bg-surface-container opacity-70" : selected ? "cursor-pointer border-primary bg-primary-fixed" : "cursor-pointer border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low"
              }`}
            >
              <input
                type="radio"
                name="decision-outcome"
                value={outcome}
                checked={selected}
                disabled={blocked}
                onChange={() => update({ outcome })}
                className="mt-1 size-4 accent-primary"
              />
              <span className="grid gap-0.5">
                <span className={`text-sm font-semibold ${selected ? "text-primary" : "text-on-surface"}`}>{DECISION_LABELS[outcome].label}</span>
                <span className="text-xs text-on-surface-variant">{blocked ? approveBlockedReason : DECISION_LABELS[outcome].description}</span>
              </span>
            </label>
          );
        })}
        <FieldError id="decision-outcome-error" message={errors.outcome} />
      </fieldset>

      {form.outcome === "CHANGES_REQUESTED" ? (
        <fieldset aria-describedby={errors.requestedChanges ? "requested-changes-error" : undefined} className="grid gap-2">
          <legend className="mb-2 text-xs font-semibold text-on-surface">
            Requested changes<span aria-hidden="true" className="ml-1 text-error">*</span>
            <span className="ml-1 font-normal text-on-surface-variant">Shown to the coordinator. Up to {SAFETY_LIMITS.requestedChanges}.</span>
          </legend>
          {changes.map((change, index) => (
            <div key={index} className="flex items-start gap-2">
              <label htmlFor={`requested-change-${index}`} className="sr-only">Change {index + 1}</label>
              <input
                id={`requested-change-${index}`}
                value={change}
                maxLength={SAFETY_LIMITS.requestedChange}
                onChange={(event) => update({ requestedChanges: changes.map((item, position) => (position === index ? event.target.value : item)) })}
                className={fieldClasses}
                placeholder={`Change ${index + 1}`}
                {...invalidProps(errors.requestedChanges, "requested-changes-error")}
              />
              {changes.length > 1 ? (
                <Button type="button" variant="quiet" aria-label={`Remove change ${index + 1}`} onClick={() => update({ requestedChanges: changes.filter((_, position) => position !== index) })}>
                  <Icon name="close" size={16} />
                </Button>
              ) : null}
            </div>
          ))}
          {changes.length < SAFETY_LIMITS.requestedChanges ? (
            <Button type="button" variant="secondary" className="w-fit" onClick={() => update({ requestedChanges: [...changes, ""] })}>
              <Icon name="add" size={16} />Add a change
            </Button>
          ) : null}
          <FieldError id="requested-changes-error" message={errors.requestedChanges} />
        </fieldset>
      ) : null}

      {form.outcome === "REJECTED" ? (
        <fieldset aria-describedby={errors.rejectedBookings ? "rejected-bookings-error" : undefined} className="grid gap-2">
          <legend className="mb-2 text-xs font-semibold text-on-surface">
            Venue bookings to reject<span aria-hidden="true" className="ml-1 text-error">*</span>
            <span className="ml-1 font-normal text-on-surface-variant">Each needs a reason. Nothing is released.</span>
          </legend>
          {bookings.length === 0 ? <p className="text-sm text-on-surface-variant">The event has no active venue booking to reject.</p> : null}
          {bookings.map((booking) => {
            const selected = Object.prototype.hasOwnProperty.call(form.rejectedBookings, booking.bookingId);
            const reasonError = errors[rejectionField(booking.bookingId)];
            const reasonId = `rejection-reason-${booking.bookingId}`;
            return (
              <div key={booking.bookingId} className={`grid gap-2 rounded-control border p-3 ${selected ? "border-error bg-error-container/30" : "border-outline-variant"}`}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => {
                      const next = { ...form.rejectedBookings };
                      if (event.target.checked) next[booking.bookingId] = "";
                      else delete next[booking.bookingId];
                      update({ rejectedBookings: next });
                    }}
                    className="size-4 accent-primary"
                  />
                  <span className="grid">
                    <span className="text-sm font-semibold text-on-surface">{bookingTitle(booking)}</span>
                    <span className="text-xs text-on-surface-variant">{formatEventWindow(booking.startDatetime, booking.endDatetime)}</span>
                  </span>
                </label>
                {selected ? (
                  <div>
                    <label htmlFor={reasonId} className="mb-1.5 block text-xs font-semibold text-on-surface">
                      Why is it unsuitable?<span aria-hidden="true" className="ml-1 text-error">*</span>
                    </label>
                    <textarea
                      id={reasonId}
                      rows={2}
                      maxLength={SAFETY_LIMITS.rejectionReason}
                      value={form.rejectedBookings[booking.bookingId]}
                      onChange={(event) => update({ rejectedBookings: { ...form.rejectedBookings, [booking.bookingId]: event.target.value } })}
                      className={`${fieldClasses} resize-y`}
                      {...invalidProps(reasonError, `${reasonId}-error`)}
                    />
                    <FieldError id={`${reasonId}-error`} message={reasonError} />
                  </div>
                ) : null}
              </div>
            );
          })}
          <FieldError id="rejected-bookings-error" message={errors.rejectedBookings} />
        </fieldset>
      ) : null}

      <div>
        <label htmlFor="organiser-comment" className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-on-surface">
          Comment for the organiser <span className="font-normal text-on-surface-variant">(optional; the organiser sees it)</span>
        </label>
        <textarea
          id="organiser-comment"
          rows={3}
          maxLength={SAFETY_LIMITS.organiserComment}
          value={form.organiserComment}
          onChange={(event) => update({ organiserComment: event.target.value })}
          className={`${fieldClasses} resize-y`}
          {...invalidProps(errors.organiserComment, "organiser-comment-error")}
        />
        <FieldError id="organiser-comment-error" message={errors.organiserComment} />
      </div>

      <div>
        <label htmlFor="internal-notes" className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-on-surface">
          Internal notes <PermissionPill tone="staff">Staff only</PermissionPill>
        </label>
        <textarea
          id="internal-notes"
          rows={3}
          maxLength={SAFETY_LIMITS.internalNotes}
          value={form.internalNotes}
          onChange={(event) => update({ internalNotes: event.target.value })}
          className={`${fieldClasses} resize-y`}
          placeholder="Never shown to the organiser."
          {...invalidProps(errors.internalNotes, "internal-notes-error")}
        />
        <FieldError id="internal-notes-error" message={errors.internalNotes} />
      </div>
    </div>
  );
}
