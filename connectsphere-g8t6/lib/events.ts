export const EVENT_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "AWAITING_CLARIFICATION",
  "PLANNING",
  "SAFETY_REVIEW",
  "CONFIRMED",
  "PREPARATION",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

// Organiser responses carry statusLabel but not the stored status (SPM-173 AC6);
// staff responses carry both. Read the state through eventDisplayStatus.
export interface EventRequest {
  eventId: number;
  requestId: string;
  status?: EventStatus;
  statusLabel: string;
  title: string;
  purpose?: string | null;
  description?: string | null;
  technicalSupportNeeds?: string | null;
  startDatetime?: string | null;
  endDatetime?: string | null;
  expectedAttendance?: number | null;
  preferredLayoutType?: string | null;
  accessibilityNeeds?: string[] | string | null;
  venuePreferences?: number[];
  equipmentRequirements?: Array<{ equipmentId: number; name?: string | null; category?: string | null; quantity: number }>;
  isRegistrationEnabled?: boolean;
  registrationCapacity?: number | null;
  registrationOpenAt?: string | null;
  registrationCloseAt?: string | null;
  organisation?: { organisationId: number; name: string } | null;
  isAssignedToCoordinator?: boolean;
  isOwner?: boolean;
  createdAt?: string;
  updatedAt?: string;
  submittedAt?: string | null;
  coordinatorName?: string | null;
}

export interface EventListItem {
  eventId: number;
  requestId: string;
  status?: EventStatus;
  statusLabel: string;
  title: string;
  startDatetime?: string | null;
  endDatetime?: string | null;
  expectedAttendance?: number | null;
  organisation?: { organisationId: number; name: string } | null;
  isAssignedToCoordinator?: boolean;
  isOwner?: boolean;
  createdAt?: string;
  updatedAt?: string;
  submittedAt?: string | null;
}

export interface EventFormValues {
  title: string;
  purpose: string;
  description: string;
  technicalSupportNeeds: string;
  startDatetime: string;
  endDatetime: string;
  expectedAttendance: string;
  accessibilityNeeds: string[];
  accessibilityNotes: string;
  isRegistrationEnabled: boolean;
  registrationCapacity: string;
  // datetime-local values, read as Singapore time.
  registrationOpenAt: string;
  registrationCloseAt: string;
  preferredLayoutType: string;
  venuePreferences: number[];
  equipmentRequirements: Array<{ equipmentId: number; quantity: number }>;
}

export interface EventRequestPayload {
  title: string;
  purpose: string | null;
  description: string | null;
  technicalSupportNeeds: string | null;
  startDatetime: string | null;
  endDatetime: string | null;
  expectedAttendance: number | null;
  preferredLayoutType: string;
  accessibilityNeeds: string[];
  isRegistrationEnabled: boolean;
  registrationCapacity: number | null;
  registrationOpenAt: string | null;
  registrationCloseAt: string | null;
  venuePreferences: number[];
  equipmentRequirements: Array<{ equipmentId: number; quantity: number }>;
}

export const ACCESSIBILITY_OPTIONS = [
  "Wheelchair / barrier-free access",
  "Assistive listening system / hearing loop",
  "Live CART / ASL captioning space",
  "Gender-neutral restroom proximity",
] as const;

// Stored states (Master section 5.2) as staff see them. Organiser screens show
// the backend's statusLabel instead (Master section 3.5); see eventStatusLabel.
export const STATUS_PRESENTATION: Record<
  EventStatus,
  { label: string; chip: string; border: string }
> = {
  DRAFT: {
    label: "Draft",
    chip: "bg-[#F3F4F6] text-[#4B5563]",
    border: "border-t-[#4B5563]",
  },
  SUBMITTED: {
    label: "Submitted",
    chip: "bg-[#EEF2FF] text-[#4338CA]",
    border: "border-t-[#4338CA]",
  },
  UNDER_REVIEW: {
    label: "Under Review",
    chip: "bg-[#FEF3C7] text-[#92400E]",
    border: "border-t-[#92400E]",
  },
  AWAITING_CLARIFICATION: {
    label: "Awaiting Clarification",
    chip: "bg-[#FEF3C7] text-[#92400E]",
    border: "border-t-[#92400E]",
  },
  PLANNING: {
    label: "Planning",
    chip: "bg-[#E0F2FE] text-[#0369A1]",
    border: "border-t-[#0369A1]",
  },
  SAFETY_REVIEW: {
    label: "Safety Review",
    chip: "bg-[#E0F2FE] text-[#0369A1]",
    border: "border-t-[#0369A1]",
  },
  CONFIRMED: {
    label: "Confirmed",
    chip: "bg-[#DCFCE7] text-[#166534]",
    border: "border-t-[#166534]",
  },
  PREPARATION: {
    label: "Preparation",
    chip: "bg-[#DCFCE7] text-[#166534]",
    border: "border-t-[#166534]",
  },
  COMPLETED: {
    label: "Completed",
    chip: "bg-[#CCFBF1] text-[#115E59]",
    border: "border-t-[#115E59]",
  },
  REJECTED: {
    label: "Rejected",
    chip: "bg-[#FEE2E2] text-[#991B1B]",
    border: "border-t-[#991B1B]",
  },
  CANCELLED: {
    label: "Cancelled",
    chip: "bg-[#E2E8F0] text-[#334155]",
    border: "border-t-[#334155]",
  },
};

export const statusPresentation = (status: string) => STATUS_PRESENTATION[status as EventStatus] ?? { label: status.replaceAll("_", " "), chip: "bg-slate-100 text-slate-700", border: "border-t-slate-400" };

// The eight organiser labels (Master section 3.5). The backend computes them;
// this copy is only the fallback for a response without a usable label.
export const ORGANISER_STATUS_LABELS: Record<EventStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  AWAITING_CLARIFICATION: "Under Review",
  PLANNING: "Approved & Planning",
  SAFETY_REVIEW: "Approved & Planning",
  CONFIRMED: "Confirmed",
  PREPARATION: "Confirmed",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};
// A label equal to the raw state code means the backend had none to give.
export const eventStatusLabel = (event: { status?: string | null; statusLabel?: string | null }) =>
  (event.statusLabel && event.statusLabel !== event.status ? event.statusLabel : null)
  ?? (event.status ? ORGANISER_STATUS_LABELS[event.status as EventStatus] ?? statusPresentation(event.status).label : "Unknown status");

export const fieldStep = (field: string) => ({ title: 0, purpose: 0, description: 0, startDatetime: 1, endDatetime: 1, expectedAttendance: 1, venuePreferences: 2, preferredLayoutType: 2, accessibilityNeeds: 3, accessibilityNotes: 3, equipmentRequirements: 4, technicalSupportNeeds: 4, registrationCapacity: 5, isRegistrationEnabled: 5, registrationOpenAt: 5, registrationCloseAt: 5 }[field] ?? 0);
export function validateEventStep(values: EventFormValues, index: number, required = false, now = Date.now(), checkLeadTime = true) {
  const errors: Record<string, string> = {};
  if (index === 0) {
    if (!values.title.trim()) errors.title = "Event Title is required.";
    if (values.title.trim().length > 200) errors.title = "Event Title must be 200 characters or fewer.";
    if (required && !values.purpose.trim()) errors.purpose = "Event Purpose is required.";
    if (values.purpose.trim().length > 2000) errors.purpose = "Event Purpose must be 2,000 characters or fewer.";
    if (required && !values.description.trim()) errors.description = "Event Description is required.";
    if (values.description.trim().length > 5000) errors.description = "Event Description must be 5,000 characters or fewer.";
  }
  if (index === 1) {
    const start = typedInstant(values.startDatetime); const end = typedInstant(values.endDatetime);
    if (required && !values.startDatetime) errors.startDatetime = "Event start date and time is required.";
    else if (values.startDatetime && !Number.isFinite(start)) errors.startDatetime = "Please enter a valid date and time.";
    else if (required && checkLeadTime && start < now + 48 * 60 * 60 * 1000) errors.startDatetime = "Event date must be at least 48 hours in advance.";
    if (required && !values.endDatetime) errors.endDatetime = "Event end date and time is required.";
    else if (values.endDatetime && !Number.isFinite(end)) errors.endDatetime = "Please enter a valid date and time.";
    else if (Number.isFinite(start) && end <= start) errors.endDatetime = "End time must be after start time.";
    if (required && !values.expectedAttendance.trim()) errors.expectedAttendance = "Expected Attendance is required for submission";
    else if (values.expectedAttendance && (!Number.isInteger(Number(values.expectedAttendance)) || Number(values.expectedAttendance) < 1 || Number(values.expectedAttendance) > 2147483647)) errors.expectedAttendance = "Expected Attendance must be a positive whole number.";
  }
  if (index === 2 && required && !values.preferredLayoutType) errors.preferredLayoutType = "Preferred layout is required.";
  if (index === 3 && values.accessibilityNotes.split("\n").some(line => line.length > 200)) errors.accessibilityNotes = "Keep each accessibility note to 200 characters or fewer.";
  if (index === 4 && values.technicalSupportNeeds.trim().length > 2000) errors.technicalSupportNeeds = "Technical support needs must be 2,000 characters or fewer.";
  if (index === 4 && (values.equipmentRequirements.length > 20 || values.equipmentRequirements.some((item) =>
    !Number.isInteger(item.equipmentId) || item.equipmentId < 1 ||
    !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 2147483647
  ))) errors.equipmentRequirements = "Choose up to 20 equipment items with positive whole quantities.";
  if (index === 5) {
    if (required && values.isRegistrationEnabled && !values.registrationCapacity.trim()) errors.registrationCapacity = "Registration capacity is required when registration is enabled.";
    else if (values.registrationCapacity && (!Number.isInteger(Number(values.registrationCapacity)) || Number(values.registrationCapacity) < 1 || Number(values.registrationCapacity) > 2147483647)) errors.registrationCapacity = "Registration capacity must be a positive whole number.";
    // SPM-35: registration runs [open, close) and closes by the event start; same rules as the backend.
    if (values.isRegistrationEnabled) {
      const open = typedInstant(values.registrationOpenAt); const close = typedInstant(values.registrationCloseAt);
      const start = typedInstant(values.startDatetime);
      if (required && !values.registrationOpenAt) errors.registrationOpenAt = "Registration start date and time is required when registration is enabled.";
      else if (values.registrationOpenAt && !Number.isFinite(open)) errors.registrationOpenAt = "Please enter a valid date and time.";
      if (required && !values.registrationCloseAt) errors.registrationCloseAt = "Registration end date and time is required when registration is enabled.";
      else if (values.registrationCloseAt && !Number.isFinite(close)) errors.registrationCloseAt = "Please enter a valid date and time.";
      else if (Number.isFinite(open) && close <= open) errors.registrationCloseAt = "Registration must close after it opens.";
      else if (Number.isFinite(start) && close > start) errors.registrationCloseAt = "Registration must close no later than the event start.";
    }
  }
  return errors;
}

export const EVENT_STATUS_ORDER: EventStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "AWAITING_CLARIFICATION",
  "PLANNING",
  "SAFETY_REVIEW",
  "CONFIRMED",
  "PREPARATION",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
];

// Organiser labels in lifecycle order, each once, for the organiser's status filter.
export const ORGANISER_LABEL_ORDER = [...new Set(EVENT_STATUS_ORDER.map(status => ORGANISER_STATUS_LABELS[status]))];

// Each label's earliest state ("Approved & Planning" -> PLANNING). "Draft" is DRAFT only.
const LABEL_STATUS = new Map<string, EventStatus>();
for (const status of EVENT_STATUS_ORDER) {
  if (!LABEL_STATUS.has(ORGANISER_STATUS_LABELS[status])) LABEL_STATUS.set(ORGANISER_STATUS_LABELS[status], status);
}

// The stored status when the response has one (staff), otherwise the state its
// organiser label stands for. Picks chip colour, sort order and the next action;
// "UNKNOWN" when neither is recognised.
export const eventDisplayStatus = (event: { status?: string | null; statusLabel?: string | null }): string =>
  event.status || LABEL_STATUS.get(event.statusLabel ?? "") || "UNKNOWN";
export const isDraftEvent = (event: { status?: string | null; statusLabel?: string | null }) =>
  eventDisplayStatus(event) === "DRAFT";

export const EMPTY_EVENT_FORM: EventFormValues = {
  title: "",
  purpose: "",
  description: "",
  technicalSupportNeeds: "",
  startDatetime: "",
  endDatetime: "",
  expectedAttendance: "",
  accessibilityNeeds: [],
  accessibilityNotes: "",
  isRegistrationEnabled: false,
  registrationCapacity: "",
  registrationOpenAt: "",
  registrationCloseAt: "",
  preferredLayoutType: "NO_PREFERENCE",
  venuePreferences: [],
  equipmentRequirements: [],
};

// Typed dates and times are Singapore time whatever the browser's time zone
// (Master: all times SGT). Singapore has no daylight saving, so the offset is fixed.
const SGT_OFFSET = "+08:00";
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
const LOCAL_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

// An instant -> the datetime-local value that shows it in Singapore time.
export const toLocalDateTimeInput = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 16);
};

// "2026-11-02T10:00" typed -> "2026-11-02T10:00:00+08:00", never the browser's zone.
// A value that already names its zone ("…Z", "…+08:00") keeps its meaning.
export const localDateTimeToIso = (value: string) => {
  if (!LOCAL_INPUT.test(value)) {
    return /(Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined;
  }
  const instant = `${value.length === 16 ? `${value}:00` : value}${SGT_OFFSET}`;
  return Number.isNaN(Date.parse(instant)) ? undefined : instant;
};

const typedInstant = (value: string) => Date.parse(localDateTimeToIso(value) ?? "");

export const toPayload = (values: EventFormValues): EventRequestPayload => ({
  title: values.title.trim(),
  purpose: values.purpose.trim() || null,
  description: values.description.trim() || null,
  technicalSupportNeeds: values.technicalSupportNeeds.trim() || null,
  startDatetime: localDateTimeToIso(values.startDatetime) ?? null,
  endDatetime: localDateTimeToIso(values.endDatetime) ?? null,
  expectedAttendance: values.expectedAttendance.trim() ? Number(values.expectedAttendance) : null,
  preferredLayoutType: values.preferredLayoutType,
  accessibilityNeeds: [...values.accessibilityNeeds, ...values.accessibilityNotes.split("\n").map(line => line.trim()).filter(Boolean)],
  isRegistrationEnabled: values.isRegistrationEnabled,
  registrationCapacity: values.isRegistrationEnabled && values.registrationCapacity.trim() ? Number(values.registrationCapacity) : null,
  registrationOpenAt: values.isRegistrationEnabled ? localDateTimeToIso(values.registrationOpenAt) ?? null : null,
  registrationCloseAt: values.isRegistrationEnabled ? localDateTimeToIso(values.registrationCloseAt) ?? null : null,
  venuePreferences: [...values.venuePreferences],
  // The backend refuses display fields such as name on a line.
  equipmentRequirements: values.equipmentRequirements.map(({ equipmentId, quantity }) => ({ equipmentId, quantity })),
});

// SPM-41: fields an owner may amend while a clarification thread is open.
// Registration settings and organisation are not among them.
export const AMENDABLE_FIELDS = [
  "title",
  "purpose",
  "description",
  "startDatetime",
  "endDatetime",
  "expectedAttendance",
  "preferredLayoutType",
  "venuePreferences",
  "accessibilityNeeds",
  "equipmentRequirements",
  "technicalSupportNeeds",
] as const;
export type AmendableField = (typeof AMENDABLE_FIELDS)[number];
export type EventAmendments = Partial<Pick<EventRequestPayload, AmendableField>>;

// Only the amendable fields whose submitted value differs from the event as loaded.
export const amendedFields = (original: EventFormValues, current: EventFormValues): EventAmendments => {
  const before = toPayload(original);
  const after = toPayload(current);
  const changes: EventAmendments = {};
  for (const field of AMENDABLE_FIELDS) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      (changes as Record<string, unknown>)[field] = after[field];
    }
  }
  return changes;
};

// SPM-41: a thread message is required and at most `limit` characters.
export const clarificationMessageProblem = (text: string, limit = 2000) => {
  if (!text.trim()) return "Write a message before sending.";
  if (text.length > limit) return `Use ${limit.toLocaleString()} characters or fewer.`;
  return null;
};

export const formValuesFromEvent = (event: EventRequest): EventFormValues => {
  const savedNeeds = Array.isArray(event.accessibilityNeeds)
    ? event.accessibilityNeeds
    : typeof event.accessibilityNeeds === "string" && event.accessibilityNeeds.trim()
      ? [event.accessibilityNeeds.trim()]
      : [];
  const selectedNeeds = savedNeeds.filter((need) =>
    ACCESSIBILITY_OPTIONS.includes(need as (typeof ACCESSIBILITY_OPTIONS)[number]),
  );
  const notes = savedNeeds.filter(
    (need) => !ACCESSIBILITY_OPTIONS.includes(need as (typeof ACCESSIBILITY_OPTIONS)[number]),
  );

  return {
    title: event.title ?? "",
    purpose: event.purpose ?? "",
    description: event.description ?? "",
    technicalSupportNeeds: event.technicalSupportNeeds ?? "",
    startDatetime: toLocalDateTimeInput(event.startDatetime),
    endDatetime: toLocalDateTimeInput(event.endDatetime),
    expectedAttendance: event.expectedAttendance?.toString() ?? "",
    accessibilityNeeds: selectedNeeds,
    accessibilityNotes: notes.join("\n"),
    isRegistrationEnabled: event.isRegistrationEnabled ?? false,
    registrationCapacity: event.registrationCapacity?.toString() ?? "",
    registrationOpenAt: toLocalDateTimeInput(event.registrationOpenAt),
    registrationCloseAt: toLocalDateTimeInput(event.registrationCloseAt),
    preferredLayoutType: event.preferredLayoutType ?? "NO_PREFERENCE",
    venuePreferences: event.venuePreferences ?? [],
    equipmentRequirements: (event.equipmentRequirements ?? []).map(({ equipmentId, quantity }) => ({ equipmentId, quantity })),
  };
};

export const formatDateRange = (start?: string | null, end?: string | null) => {
  if (!start) return "Date not selected";
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  if (Number.isNaN(startDate.getTime())) return "Date not available";
  const first = new Intl.DateTimeFormat("en", options).format(startDate);
  if (!endDate || Number.isNaN(endDate.getTime())) return first;
  return `${first} · ${new Intl.DateTimeFormat("en", options).format(endDate)}`;
};

export const formatSavedTime = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(value));
