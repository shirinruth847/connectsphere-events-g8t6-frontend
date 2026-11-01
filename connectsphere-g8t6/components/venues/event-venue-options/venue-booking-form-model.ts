// Pure helpers for the venue booking request form (SPM-179); type-only
// imports, so they are unit tested. The checks here give instant feedback
// only: the backend repeats every one of them under the venue lock and its
// answer is final (Master 2.6, 5.4).
import type { EventVenueBooking, EventVenueOption, VenueBookingRequestItem } from "../../../lib/api/event-venues";

export const MAX_BOOKING_SECTIONS = 10;

// The backend's limits (validators/venueBookingValidator.js).
export const BOOKING_LIMITS = Object.freeze({
  label: 100,
  layout: 50,
  listItems: 20,
  listItemLength: 100,
  specialRequirements: 2000,
});

// Worded as SPM-179 AC5 to AC10 and as the backend answers.
export const BOOKING_MESSAGES = Object.freeze({
  venueRequired: "Venue is required.",
  venueTwice: "This venue is already in the request.",
  venueBooked: "This event already has a booking at this venue.",
  venueNotBookable: "This venue is not available for booking.",
  buffersNotSet: "This venue cannot take bookings until Venue Staff set its setup and turnaround times.",
  labelRequired: "Label is required.",
  labelTooLong: `Label must be ${BOOKING_LIMITS.label} characters or fewer.`,
  startRequired: "Start date and time is required.",
  endRequired: "End date and time is required.",
  endBeforeStart: "End time must be after start time.",
  startInPast: "The booking must start in the future.",
  outsideEvent: "The booking must be within the event's dates and times.",
  attendanceRequired: "Expected attendance is required.",
  attendanceInvalid: "Expected attendance must be a whole number of 1 or more.",
  layoutRequired: "Layout is required.",
  layoutTooLong: `Layout must be ${BOOKING_LIMITS.layout} characters or fewer.`,
  listInvalid: `List up to ${BOOKING_LIMITS.listItems} entries of ${BOOKING_LIMITS.listItemLength} characters or fewer.`,
  specialTooLong: `Special requirements must be ${BOOKING_LIMITS.specialRequirements} characters or fewer.`,
  onePrimary: "Choose one primary venue.",
});

export const capacityMessage = (attendance: number, capacity: number) =>
  `Expected attendance (${attendance}) exceeds this venue's capacity (${capacity}).`;

// One venue section of the form. Times are Singapore civil times as a
// datetime-local input holds them ("2030-03-10T09:00").
export interface BookingDraft {
  key: string;
  venueId: number | null;
  label: string;
  // The label follows the venue's name until the coordinator edits it (AC3).
  labelEdited: boolean;
  start: string;
  end: string;
  expectedAttendance: string;
  layout: string;
  requiredFacilities: string[];
  accessibilityNeeds: string[];
  specialRequirements: string;
  isPrimary: boolean;
}

export interface BookingEventContext {
  startDatetime: string | null;
  endDatetime: string | null;
  expectedAttendance: number | null;
  preferredLayoutType: string | null;
  accessibilityNeeds: string[];
}

// ---------- Singapore times ----------

const SINGAPORE = "Asia/Singapore";
const SGT_OFFSET = "+08:00";
const INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/;
const inputParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: SINGAPORE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// Minutes by default; immutable hold windows retain seconds and milliseconds.
export function toSgtInput(value: string | null | undefined, preservePrecision = false): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(inputParts.formatToParts(date).map((part) => [part.type, part.value]));
  const minute = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  if (!preservePrecision || (!date.getUTCSeconds() && !date.getUTCMilliseconds())) return minute;
  const fraction = date.getUTCMilliseconds() ? `.${String(date.getUTCMilliseconds()).padStart(3, "0")}` : "";
  return `${minute}:${String(date.getUTCSeconds()).padStart(2, "0")}${fraction}`;
}

// A datetime-local value read as Singapore time, as an ISO instant; null when incomplete.
export function sgtInputToIso(value: string): string | null {
  if (!INPUT_PATTERN.test(value)) return null;
  const date = new Date(`${value}${value.length === 16 ? ":00" : ""}${SGT_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// The section's period as the availability calendar's "check a period" inputs
// (SPM-74), or null while either time is incomplete or the end is not later.
export function periodCheckInputs(start: string, end: string) {
  const from = sgtInputToIso(start);
  const to = sgtInputToIso(end);
  if (!from || !to || to <= from) return null;
  const date = start.slice(0, 10);
  const endDate = end.slice(0, 10);
  const days = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000) + 1;
  return { date, days, check: { date, startTime: start.slice(11, 16), endDate, endTime: end.slice(11, 16) } };
}

// ---------- defaults (AC2, AC3) ----------

const humanise = (code: string) => code.charAt(0) + code.slice(1).toLowerCase().replaceAll("_", " ");

export const defaultLayout = (preferred: string | null) =>
  !preferred || preferred === "NO_PREFERENCE" ? "" : humanise(preferred);

export function newDraft(key: string, event: BookingEventContext, venue: Pick<EventVenueOption, "venueId" | "name"> | null = null): BookingDraft {
  return {
    key,
    venueId: venue?.venueId ?? null,
    label: venue?.name.slice(0, BOOKING_LIMITS.label) ?? "",
    labelEdited: false,
    start: toSgtInput(event.startDatetime),
    end: toSgtInput(event.endDatetime),
    expectedAttendance: event.expectedAttendance ? String(event.expectedAttendance) : "",
    layout: defaultLayout(event.preferredLayoutType).slice(0, BOOKING_LIMITS.layout),
    requiredFacilities: [],
    accessibilityNeeds: [...event.accessibilityNeeds],
    specialRequirements: "",
    isPrimary: false,
  };
}

// Venue Staff set the minutes once (Master 5.4.1); null with a current or
// missing detail means "not set", and such a venue takes no bookings (AC7,
// TC-14). When the detail service could not be read, the backend decides.
export const buffersMissing = (venue: EventVenueOption) =>
  venue.detailStatus !== "NOT_CHECKED" && (venue.setupMinutes == null || venue.turnaroundMinutes == null);

// The venue the first section starts with: the coordinator's suggestion, else
// the organiser's highest-ranked choice, skipping venues that cannot be
// requested, cannot take bookings yet, or already have a booking for this
// event (AC2, AC4, AC9, TC-14).
export function firstVenueId(candidates: Array<number | null | undefined>, selectable: EventVenueOption[], bookedVenueIds: Set<number>): number | null {
  for (const venueId of candidates) {
    const venue = venueId == null ? null : selectable.find((option) => option.venueId === venueId);
    if (venue && !bookedVenueIds.has(venue.venueId) && !buffersMissing(venue)) return venue.venueId;
  }
  return null;
}

// ---------- bookings already made ----------

const ACTIVE_BOOKING_STATUSES = new Set(["PENDING", "APPROVED"]);

export const activeBookings = (bookings: EventVenueBooking[]) => bookings.filter((booking) => ACTIVE_BOOKING_STATUSES.has(booking.status));

export const bookedVenueIds = (bookings: EventVenueBooking[]) => new Set(activeBookings(bookings).map((booking) => booking.venueId));

// The event keeps its primary venue; new bookings are added as extra venues (AC10).
export const hasPrimaryVenue = (bookings: EventVenueBooking[]) => activeBookings(bookings).some((booking) => booking.isPrimary);

// Whether the coordinator must mark a primary: only when the event has none
// and the request has several venues (one venue becomes primary by itself).
export const needsPrimaryChoice = (sectionCount: number, eventHasPrimary: boolean) => !eventHasPrimary && sectionCount > 1;

// ---------- checks before sending (AC4 to AC10) ----------

const field = (index: number, name: string) => `bookings.${index}.${name}`;

export interface DraftCheckContext {
  event: BookingEventContext;
  venues: EventVenueOption[];
  bookedVenueIds: Set<number>;
  eventHasPrimary: boolean;
  now?: number;
}

// Errors keyed as the backend keys them: "bookings.<i>.<field>" and "bookings.primary".
export function validateDrafts(drafts: BookingDraft[], { event, venues, bookedVenueIds: booked, eventHasPrimary, now = Date.now() }: DraftCheckContext): Record<string, string> {
  const errors: Record<string, string> = {};
  const eventStart = event.startDatetime ? Date.parse(event.startDatetime) : null;
  const eventEnd = event.endDatetime ? Date.parse(event.endDatetime) : null;
  const seen = new Set<number>();

  drafts.forEach((draft, index) => {
    const venue = draft.venueId == null ? null : venues.find((option) => option.venueId === draft.venueId) ?? null;
    if (draft.venueId == null) errors[field(index, "venueId")] = BOOKING_MESSAGES.venueRequired;
    else if (seen.has(draft.venueId)) errors[field(index, "venueId")] = BOOKING_MESSAGES.venueTwice;
    else if (booked.has(draft.venueId)) errors[field(index, "venueId")] = BOOKING_MESSAGES.venueBooked;
    else if (!venue) errors[field(index, "venueId")] = BOOKING_MESSAGES.venueNotBookable;
    else if (buffersMissing(venue)) errors[field(index, "venueId")] = BOOKING_MESSAGES.buffersNotSet;
    if (draft.venueId != null) seen.add(draft.venueId);

    const label = draft.label.trim();
    if (!label) errors[field(index, "label")] = BOOKING_MESSAGES.labelRequired;
    else if (label.length > BOOKING_LIMITS.label) errors[field(index, "label")] = BOOKING_MESSAGES.labelTooLong;

    const start = sgtInputToIso(draft.start);
    const end = sgtInputToIso(draft.end);
    if (!start) errors[field(index, "start")] = BOOKING_MESSAGES.startRequired;
    if (!end) errors[field(index, "end")] = BOOKING_MESSAGES.endRequired;
    if (start && end) {
      const from = Date.parse(start);
      const to = Date.parse(end);
      if (to <= from) errors[field(index, "end")] = BOOKING_MESSAGES.endBeforeStart;
      else if (from <= now) errors[field(index, "start")] = BOOKING_MESSAGES.startInPast;
      else if (eventStart != null && eventEnd != null && (from < eventStart || to > eventEnd)) errors[field(index, "start")] = BOOKING_MESSAGES.outsideEvent;
    }

    const attendance = draft.expectedAttendance.trim();
    if (!attendance) errors[field(index, "expectedAttendance")] = BOOKING_MESSAGES.attendanceRequired;
    else if (!/^\d+$/.test(attendance) || Number(attendance) < 1 || !Number.isSafeInteger(Number(attendance))) {
      errors[field(index, "expectedAttendance")] = BOOKING_MESSAGES.attendanceInvalid;
    } else if (venue && Number(attendance) > venue.maxCapacity) {
      errors[field(index, "expectedAttendance")] = capacityMessage(Number(attendance), venue.maxCapacity);
    }

    const layout = draft.layout.trim();
    if (!layout) errors[field(index, "layout")] = BOOKING_MESSAGES.layoutRequired;
    else if (layout.length > BOOKING_LIMITS.layout) errors[field(index, "layout")] = BOOKING_MESSAGES.layoutTooLong;

    for (const name of ["requiredFacilities", "accessibilityNeeds"] as const) {
      const list = draft[name];
      if (list.length > BOOKING_LIMITS.listItems || list.some((item) => item.trim().length > BOOKING_LIMITS.listItemLength)) {
        errors[field(index, name)] = BOOKING_MESSAGES.listInvalid;
      }
    }
    if (draft.specialRequirements.trim().length > BOOKING_LIMITS.specialRequirements) {
      errors[field(index, "specialRequirements")] = BOOKING_MESSAGES.specialTooLong;
    }
  });

  if (needsPrimaryChoice(drafts.length, eventHasPrimary) && drafts.filter((draft) => draft.isPrimary).length !== 1) {
    errors["bookings.primary"] = BOOKING_MESSAGES.onePrimary;
  }
  return errors;
}

const cleanList = (items: string[]) => {
  const seen = new Set<string>();
  return items.map((item) => item.trim()).filter((item) => {
    if (!item || seen.has(item.toLowerCase())) return false;
    seen.add(item.toLowerCase());
    return true;
  });
};

// The POST body's bookings, once validateDrafts found nothing to correct.
// isPrimary is sent only when the coordinator chose among several venues: a
// single venue becomes the primary by itself when the event has none, and an
// event that has one keeps it (AC10).
export function toRequestItems(drafts: BookingDraft[], eventHasPrimary: boolean): VenueBookingRequestItem[] {
  return drafts.map((draft) => ({
    venueId: draft.venueId as number,
    label: draft.label.trim(),
    start: sgtInputToIso(draft.start) as string,
    end: sgtInputToIso(draft.end) as string,
    expectedAttendance: Number(draft.expectedAttendance.trim()),
    layout: draft.layout.trim(),
    requiredFacilities: cleanList(draft.requiredFacilities),
    accessibilityNeeds: cleanList(draft.accessibilityNeeds),
    specialRequirements: draft.specialRequirements.trim() || null,
    isPrimary: needsPrimaryChoice(drafts.length, eventHasPrimary) && draft.isPrimary,
  }));
}

// ---------- warnings (AC8; advisory, never blocking) ----------

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const listed = (values: string[] | null | undefined, wanted: string) => (values ?? []).some((value) => sameText(value, wanted));

// What the venue's recorded detail does not list. Nothing is said when the
// detail could not be read or was never recorded: that is "not checked",
// not "unsupported". Operating hours come from the period check.
export function suitabilityWarnings(draft: BookingDraft, venue: EventVenueOption | null): string[] {
  if (!venue || venue.detailStatus !== "CURRENT") return [];
  const messages: string[] = [];
  const layouts = [...(venue.supportedLayouts ?? []), ...venue.rooms.map((room) => room.layoutType)];
  const layout = draft.layout.trim();
  if (layout && layouts.length && !listed(layouts, layout)) messages.push(`${venue.name} does not list the ${layout} layout.`);
  for (const facility of cleanList(draft.requiredFacilities)) {
    if (!listed(venue.facilities, facility)) messages.push(`${venue.name} does not list the facility "${facility}".`);
  }
  for (const need of cleanList(draft.accessibilityNeeds)) {
    if (!listed(venue.accessibilityFeatures, need)) messages.push(`${venue.name} does not list the accessibility feature "${need}".`);
  }
  return messages;
}

// ---------- the server's answer ----------

export interface BookingRequestFailure {
  // Field errors to show in the venue sections.
  fields: Record<string, string>;
  // Message for the banner at the top of the form.
  banner: string;
  // The venue section to scroll to, if the error belongs to one.
  sectionIndex: number | null;
  // The event changed elsewhere (left planning, reassigned): the form cannot
  // be sent any more, and the event page must be reloaded.
  stale: boolean;
  // The event's bookings changed elsewhere: reload them and keep the form.
  refreshBookings: boolean;
}

const STALE_CODES = new Set(["EVENT_NOT_IN_PLANNING", "FORBIDDEN", "EVENT_NOT_FOUND"]);
// These refusals also reload the event's bookings.
const BOOKINGS_CHANGED_CODES = new Set(["PRIMARY_VENUE_ALREADY_SET", "VENUE_ALREADY_BOOKED_FOR_EVENT"]);

export function bookingRequestFailure(error: { code?: string; message: string; fields?: Record<string, string>; details?: Record<string, unknown> }): BookingRequestFailure {
  const fields = { ...(error.fields ?? {}) };
  const index = typeof error.details?.bookingIndex === "number" ? error.details.bookingIndex : null;
  const fromFields = Object.keys(fields)
    .map((key) => /^bookings\.(\d+)\./.exec(key)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number);
  const sectionIndex = index ?? (fromFields.length ? Math.min(...fromFields) : null);
  const fieldSpecific = Object.keys(fields).length > 0;
  return {
    fields,
    banner: fieldSpecific ? "Nothing was saved. Correct the highlighted fields and send the request again." : error.message,
    sectionIndex,
    stale: STALE_CODES.has(error.code ?? ""),
    refreshBookings: BOOKINGS_CHANGED_CODES.has(error.code ?? ""),
  };
}

// The errors that belong to one section, by field name ("venueId", "start", ...).
export function sectionErrors(errors: Record<string, string>, index: number): Record<string, string> {
  const prefix = `bookings.${index}.`;
  return Object.fromEntries(Object.entries(errors).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]));
}

// After a section is removed, errors of the later sections move up by one.
export function shiftErrorsAfterRemoval(errors: Record<string, string>, removed: number): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(errors)) {
    const match = /^bookings\.(\d+)\.(.+)$/.exec(key);
    if (!match) {
      next[key] = value;
      continue;
    }
    const index = Number(match[1]);
    if (index === removed) continue;
    next[`bookings.${index > removed ? index - 1 : index}.${match[2]}`] = value;
  }
  return next;
}

// Whether the form differs from how it opened, so closing asks first.
const comparable = (drafts: BookingDraft[]) => JSON.stringify(drafts.map((draft) => ({ ...draft, key: "" })));
export const draftsChanged = (drafts: BookingDraft[], initial: BookingDraft[]) => comparable(drafts) !== comparable(initial);
