"use client";

import { useId } from "react";
import { Button, FormLabel, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import type { EventVenueOption } from "@/lib/api/event-venues";
import { VenueMultiSelect } from "./venue-multi-select";
import type { BookingChecks } from "@/lib/api/venue-bookings";
import { BookingChecksPanel } from "@/components/venues/booking-checks";
import { BOOKING_LIMITS, buffersMissing, type BookingDraft } from "./venue-booking-form-model";
import { useVenueCalendar, type VenueCalendarWindow } from "./venue-details";

export interface VenueChoiceGroups {
  // The organiser's ranked choices and the coordinator's suggestion, listed first.
  featured: EventVenueOption[];
  others: EventVenueOption[];
}

interface VenueBookingSectionProps {
  index: number;
  draft: BookingDraft;
  venue: EventVenueOption | null;
  venueGroups: VenueChoiceGroups;
  // Venues chosen in another section or already booked for this event (AC4).
  unavailableVenueIds: Set<number>;
  bookedVenueIds: Set<number>;
  choices: { layouts: string[]; facilities: string[]; accessibility: string[] };
  errors: Record<string, string>;
  // Set when the coordinator must mark one section as the primary venue.
  primaryGroup: string | null;
  // The "Choose one primary venue" message, when shown, for the radio buttons.
  primaryErrorId?: string;
  canRemove: boolean;
  disabled: boolean;
  // This section's checks for its own venue and window (SPM-186 AC17), and
  // whether a newer check is on its way.
  checks: BookingChecks | null;
  checking: boolean;
  // The event window, for the availability calendar offered when another
  // event's hold is in the way (SPM-188 AC4).
  calendar?: VenueCalendarWindow | null;
  onChange: (patch: Partial<BookingDraft>) => void;
  onRemove: () => void;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-error">
      <Icon name="warning" size={16} className="mt-px shrink-0" />
      <span>{message}</span>
    </p>
  );
}

const invalidClass = (message?: string) => (message ? "border-error" : "");

// One venue section of the booking request (SPM-179 AC3): the venue, its
// label, times, attendance and layout, then optional facilities,
// accessibility needs and special requirements. No equipment field: equipment
// is requested separately.
export function VenueBookingSection({
  index,
  draft,
  venue,
  venueGroups,
  unavailableVenueIds,
  bookedVenueIds,
  choices,
  errors,
  primaryGroup,
  primaryErrorId,
  canRemove,
  disabled,
  checks,
  checking,
  calendar = null,
  onChange,
  onRemove,
}: VenueBookingSectionProps) {
  const id = useId();
  const ids = (name: string) => ({ input: `${id}-${name}`, error: `${id}-${name}-error` });
  const ready = draft.venueId != null && Boolean(draft.start) && Boolean(draft.end);
  // A confirmed hold keeps its venue and times (SPM-188 AC9).
  const held = Boolean(draft.holdId);
  // Another event's tentative hold is in the way (SPM-188 AC3, AC4): offer the
  // ways forward next to the check that says so.
  const heldElsewhere = !checking && Boolean(checks?.blocking.some((check) => check.code === "VENUE_HELD"));
  const { button: calendarButton, panel: calendarPanel } = useVenueCalendar(heldElsewhere ? calendar : null, draft.venueId ?? 0);
  const focusField = (name: string) => document.getElementById(ids(name).input)?.focus();
  const number = index + 1;
  const title = venue ? venue.name : `Venue ${number}`;

  const describe = (name: string) => (errors[name] ? { "aria-invalid": true as const, "aria-describedby": ids(name).error } : {});
  const chooseVenue = (value: string) => {
    const venueId = value ? Number(value) : null;
    const next = venueId == null ? null : [...venueGroups.featured, ...venueGroups.others].find((option) => option.venueId === venueId) ?? null;
    onChange({
      venueId,
      ...(draft.labelEdited ? {} : { label: next ? next.name.slice(0, BOOKING_LIMITS.label) : "" }),
    });
  };
  // Booked, chosen elsewhere or without setup/turnaround times: listed, not selectable (AC4, TC-14).
  const option = (choice: EventVenueOption) => {
    const taken = choice.venueId !== draft.venueId && unavailableVenueIds.has(choice.venueId);
    const noMinutes = choice.venueId !== draft.venueId && buffersMissing(choice);
    const note = bookedVenueIds.has(choice.venueId)
      ? " (already booked for this event)"
      : taken ? " (in another section)" : noMinutes ? " (setup and turnaround times not set)" : "";
    return (
      <option key={choice.venueId} value={choice.venueId} disabled={taken || noMinutes}>
        {choice.name} · {choice.maxCapacity.toLocaleString()} people{note}
      </option>
    );
  };

  return (
    <fieldset
      aria-labelledby={`${id}-title`}
      data-booking-section={index}
      disabled={disabled}
      className="grid min-w-0 gap-4 rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-pill bg-primary-fixed px-2 text-xs font-bold text-primary" aria-hidden="true">{number}</span>
          <h3 id={`${id}-title`} className="min-w-0 text-base font-semibold text-on-surface [overflow-wrap:anywhere]">
            <span className="sr-only">Venue section {number}: </span>{title}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {primaryGroup ? (
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-control bg-surface-container-low px-3 text-sm font-semibold text-on-surface">
              <input
                type="radio"
                name={primaryGroup}
                className="size-4 accent-primary"
                checked={draft.isPrimary}
                disabled={disabled}
                aria-describedby={primaryErrorId}
                onChange={() => onChange({ isPrimary: true })}
              />
              Primary venue
            </label>
          ) : null}
          {canRemove ? (
            <Button type="button" variant="quiet" disabled={disabled} onClick={onRemove} aria-label={`Remove venue section ${number}`}>
              <Icon name="close" size={16} />Remove
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <div className="min-w-0 md:col-span-2">
          <FormLabel htmlFor={ids("venueId").input} required>Venue</FormLabel>
          <select
            id={ids("venueId").input}
            className={`${fieldClasses} ${invalidClass(errors.venueId)}`}
            value={draft.venueId ?? ""}
            disabled={disabled || held}
            onChange={(event) => chooseVenue(event.target.value)}
            {...describe("venueId")}
          >
            <option value="">Choose a venue</option>
            {venueGroups.featured.length ? <optgroup label="Organiser's choices and your suggestion">{venueGroups.featured.map(option)}</optgroup> : null}
            <optgroup label="All available venues">{venueGroups.others.map(option)}</optgroup>
          </select>
          <FieldError id={ids("venueId").error} message={errors.venueId} />
          {held ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-on-surface-variant">
              <Icon name="lock" size={16} className="shrink-0" />
              This confirms your tentative hold, so the venue and times stay as held.
            </p>
          ) : null}
          {venue ? (
            <p className="mt-1.5 text-xs text-on-surface-variant">
              Capacity {venue.maxCapacity.toLocaleString()} people
              {venue.setupMinutes != null && venue.turnaroundMinutes != null ? ` · Setup ${venue.setupMinutes} min · Turnaround ${venue.turnaroundMinutes} min` : ""}
              {venue.operatingHours ? ` · Open ${venue.operatingHours}` : ""}
            </p>
          ) : null}
        </div>

        <div className="min-w-0">
          <FormLabel htmlFor={ids("label").input} required>Label</FormLabel>
          <input
            id={ids("label").input}
            className={`${fieldClasses} ${invalidClass(errors.label)}`}
            value={draft.label}
            maxLength={BOOKING_LIMITS.label}
            disabled={disabled}
            placeholder="e.g. Main hall, Breakout A"
            onChange={(event) => onChange({ label: event.target.value, labelEdited: true })}
            {...describe("label")}
          />
          <FieldError id={ids("label").error} message={errors.label} />
        </div>

        <div className="min-w-0">
          <FormLabel htmlFor={ids("expectedAttendance").input} required>Expected attendance at this venue</FormLabel>
          <input
            id={ids("expectedAttendance").input}
            className={`${fieldClasses} ${invalidClass(errors.expectedAttendance)}`}
            inputMode="numeric"
            autoComplete="off"
            value={draft.expectedAttendance}
            disabled={disabled}
            onChange={(event) => onChange({ expectedAttendance: event.target.value })}
            {...describe("expectedAttendance")}
          />
          <FieldError id={ids("expectedAttendance").error} message={errors.expectedAttendance} />
        </div>

        <div className="min-w-0">
          <FormLabel htmlFor={ids("start").input} required>Start (SGT)</FormLabel>
          <input
            id={ids("start").input}
            type="datetime-local"
            className={`${fieldClasses} ${invalidClass(errors.start)}`}
            value={draft.start}
            disabled={disabled}
            readOnly={held}
            onChange={(event) => onChange({ start: event.target.value })}
            {...describe("start")}
          />
          <FieldError id={ids("start").error} message={errors.start} />
        </div>

        <div className="min-w-0">
          <FormLabel htmlFor={ids("end").input} required>End (SGT)</FormLabel>
          <input
            id={ids("end").input}
            type="datetime-local"
            className={`${fieldClasses} ${invalidClass(errors.end)}`}
            value={draft.end}
            disabled={disabled}
            readOnly={held}
            onChange={(event) => onChange({ end: event.target.value })}
            {...describe("end")}
          />
          <FieldError id={ids("end").error} message={errors.end} />
        </div>


        <div className="min-w-0">
          <FormLabel htmlFor={ids("layout").input} required>Layout</FormLabel>
          <input
            id={ids("layout").input}
            className={`${fieldClasses} ${invalidClass(errors.layout)}`}
            list={`${id}-layouts`}
            value={draft.layout}
            maxLength={BOOKING_LIMITS.layout}
            disabled={disabled}
            placeholder="e.g. Theatre, Classroom"
            autoComplete="off"
            onChange={(event) => onChange({ layout: event.target.value })}
            {...describe("layout")}
          />
          <datalist id={`${id}-layouts`}>
            {choices.layouts.map((layout) => <option key={layout} value={layout} />)}
          </datalist>
          <FieldError id={ids("layout").error} message={errors.layout} />
        </div>

        <div className="min-w-0">
          <span className="mb-1.5 block text-xs font-semibold text-on-surface" aria-hidden="true">Required facilities</span>
          <VenueMultiSelect
            label="Required facilities"
            values={choices.facilities}
            selected={draft.requiredFacilities}
            onChange={(selected) => onChange({ requiredFacilities: selected })}
            invalid={Boolean(errors.requiredFacilities)}
            errorId={errors.requiredFacilities ? ids("requiredFacilities").error : undefined}
          />
          <FieldError id={ids("requiredFacilities").error} message={errors.requiredFacilities} />
        </div>

        <div className="min-w-0">
          <span className="mb-1.5 block text-xs font-semibold text-on-surface" aria-hidden="true">Accessibility needs</span>
          <VenueMultiSelect
            label="Accessibility needs"
            values={choices.accessibility}
            selected={draft.accessibilityNeeds}
            onChange={(selected) => onChange({ accessibilityNeeds: selected })}
            invalid={Boolean(errors.accessibilityNeeds)}
            errorId={errors.accessibilityNeeds ? ids("accessibilityNeeds").error : undefined}
          />
          <FieldError id={ids("accessibilityNeeds").error} message={errors.accessibilityNeeds} />
        </div>

        <div className="min-w-0 md:col-span-2">
          <FormLabel htmlFor={ids("specialRequirements").input}>Special requirements</FormLabel>
          <textarea
            id={ids("specialRequirements").input}
            className={`${fieldClasses} min-h-24 resize-y ${invalidClass(errors.specialRequirements)}`}
            value={draft.specialRequirements}
            maxLength={BOOKING_LIMITS.specialRequirements}
            disabled={disabled}
            placeholder="Catering, access times or anything else Venue Staff should know"
            onChange={(event) => onChange({ specialRequirements: event.target.value })}
            aria-describedby={errors.specialRequirements ? ids("specialRequirements").error : `${id}-special-help`}
            aria-invalid={errors.specialRequirements ? true : undefined}
          />
          <p id={`${id}-special-help`} className="mt-1.5 text-xs text-on-surface-variant">Include catering here. Equipment is requested separately.</p>
          <FieldError id={ids("specialRequirements").error} message={errors.specialRequirements} />
        </div>
      </div>

      {ready ? (
        <div className="grid gap-1 rounded-control border border-outline-variant p-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.05em] text-on-surface-variant">Checks for this venue and time</h4>
          <BookingChecksPanel checks={checks} pending={checking} />
          {checks?.warnings.length && !checks.blocking.length ? (
            <p className="text-xs text-on-surface-variant">You can still send the request with warnings; Venue Staff decide.</p>
          ) : null}
          {heldElsewhere ? (
            <div role="group" aria-label="Ways forward" className="mt-1 grid gap-2 rounded-control bg-[#FEF3C7] p-3 text-sm text-[#92400E]">
              <p className="font-semibold">This venue is tentatively held for another event at this time.</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={held} onClick={() => focusField("start")}>Choose a different date or time</Button>
                <Button type="button" variant="secondary" disabled={held} onClick={() => focusField("venueId")}>Try a different venue</Button>
                {calendarButton}
              </div>
              <p className="text-xs">To ask whether the hold will be released, contact Venue Staff. The hold&apos;s expiry is shown above.</p>
              {calendarPanel}
            </div>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
