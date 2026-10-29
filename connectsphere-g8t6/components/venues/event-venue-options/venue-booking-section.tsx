"use client";

import { useId, type ReactNode } from "react";
import { Button, FormLabel, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { formatEventWindow } from "@/lib/datetime";
import type { EventVenueOption } from "@/lib/api/event-venues";
import { VenueMultiSelect } from "./venue-multi-select";
import { BOOKING_LIMITS, buffersMissing, suitabilityWarnings, type BookingDraft } from "./venue-booking-form-model";
import { useBookingPeriodCheck, type PeriodCheckState } from "./use-booking-period-check";

export interface VenueChoiceGroups {
  // The organiser's ranked choices and the coordinator's suggestion, listed first.
  featured: EventVenueOption[];
  others: EventVenueOption[];
}

interface VenueBookingSectionProps {
  index: number;
  eventId: number;
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

const sgtTime = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const CONFLICT_NAMES: Record<string, string> = { BOOKING: "another booking", HOLD: "a tentative hold", BLOCK: "an operational block" };

function Notice({ tone, icon, children }: { tone: "success" | "warning" | "error" | "neutral"; icon: "check" | "warning" | "info" | "schedule"; children: ReactNode }) {
  const tones = {
    success: "bg-success-container/35 text-on-success-container",
    warning: "bg-tertiary-fixed text-on-tertiary-fixed",
    error: "bg-error-container text-on-error-container",
    neutral: "bg-surface-container-low text-on-surface-variant",
  };
  return (
    <div className={`flex items-start gap-2 rounded-control px-3 py-2 text-xs leading-relaxed ${tones[tone]}`}>
      <Icon name={icon} size={16} className="mt-px shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// What the availability calendar says about this section's period. Advisory:
// the server checks again under the venue lock when the request is sent.
function AvailabilityNotice({ state }: { state: PeriodCheckState }) {
  if (state.status === "idle") return null;
  if (state.status === "checking") return <Notice tone="neutral" icon="schedule">Checking availability…</Notice>;
  if (state.status === "unavailable") {
    return <Notice tone="neutral" icon="info">Availability could not be checked now. It is checked again when you send the request.</Notice>;
  }
  const { check } = state;
  const occupied = `${formatEventWindow(check.occupiedStart, check.occupiedEnd)}, including setup and turnaround`;
  if (!check.canRequest) {
    return (
      <Notice tone="error" icon="warning">
        <p className="font-semibold">{check.availabilityLabel}</p>
        <ul className="mt-1 grid gap-0.5">
          {check.conflicts.map((conflict) => (
            <li key={conflict.entryId}>
              Taken {sgtTime.format(new Date(conflict.occupiedStart))}–{sgtTime.format(new Date(conflict.occupiedEnd))} SGT by {CONFLICT_NAMES[conflict.type] ?? "another arrangement"}.
            </li>
          ))}
        </ul>
        <p className="mt-1">This venue would be occupied {occupied}. Change the times or the venue, or the request will be refused.</p>
      </Notice>
    );
  }
  return (
    <Notice tone="success" icon="check">
      <span className="font-semibold">Available</span> · occupied {occupied}.
    </Notice>
  );
}

// One venue section of the booking request (SPM-179 AC3): the venue, its
// label, times, attendance and layout, then optional facilities,
// accessibility needs and special requirements. No equipment field: equipment
// is requested separately.
export function VenueBookingSection({
  index,
  eventId,
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
  onChange,
  onRemove,
}: VenueBookingSectionProps) {
  const id = useId();
  const ids = (name: string) => ({ input: `${id}-${name}`, error: `${id}-${name}-error` });
  const period = useBookingPeriodCheck(eventId, draft.venueId, draft.start, draft.end);
  const hoursWarning = period.status === "ready" ? period.check.operatingHoursWarning?.message ?? null : null;
  const warnings = [...(hoursWarning ? [hoursWarning] : []), ...suitabilityWarnings(draft, venue)];
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
            disabled={disabled}
            onChange={(event) => chooseVenue(event.target.value)}
            {...describe("venueId")}
          >
            <option value="">Choose a venue</option>
            {venueGroups.featured.length ? <optgroup label="Organiser's choices and your suggestion">{venueGroups.featured.map(option)}</optgroup> : null}
            <optgroup label="All available venues">{venueGroups.others.map(option)}</optgroup>
          </select>
          <FieldError id={ids("venueId").error} message={errors.venueId} />
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
            onChange={(event) => onChange({ end: event.target.value })}
            {...describe("end")}
          />
          <FieldError id={ids("end").error} message={errors.end} />
        </div>

        <div className="min-w-0 md:col-span-2">
          <AvailabilityNotice state={period} />
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

      {warnings.length ? (
        <Notice tone="warning" icon="warning">
          <p className="font-semibold">Warnings: you can still send the request, and Venue Staff decide.</p>
          <ul className="mt-1 list-disc pl-4">
            {warnings.map((message, at) => <li key={`${at}-${message}`}>{message}</li>)}
          </ul>
        </Notice>
      ) : null}
    </fieldset>
  );
}
