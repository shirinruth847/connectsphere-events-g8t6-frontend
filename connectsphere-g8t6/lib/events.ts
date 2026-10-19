export const EVENT_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "AWAITING_CLARIFICATION",
  "PLANNING",
  "CONFIRMED",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface EventRequest {
  eventId: number;
  requestId: string;
  status: EventStatus;
  statusLabel: string;
  title: string;
  purpose?: string | null;
  description?: string | null;
  startDatetime?: string | null;
  endDatetime?: string | null;
  expectedAttendance?: number | null;
  preferredLayoutType?: string | null;
  accessibilityNeeds?: string[] | string | null;
  venuePreferences?: number[];
  equipmentRequirements?: Array<{ equipmentId: number; quantity: number }>;
  isRegistrationEnabled?: boolean;
  registrationCapacity?: number | null;
  organisation?: { organisationId: number; name: string } | null;
  isAssignedToCoordinator?: boolean;
  isOwner?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface EventListItem {
  eventId: number;
  requestId: string;
  status: EventStatus;
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
}

export interface EventFormValues {
  title: string;
  purpose: string;
  description: string;
  startDatetime: string;
  endDatetime: string;
  expectedAttendance: string;
  accessibilityNeeds: string[];
  accessibilityNotes: string;
  isRegistrationEnabled: boolean;
  registrationCapacity: string;
  preferredLayoutType: string;
  venuePreferences: number[];
  equipmentRequirements: Array<{ equipmentId: number; quantity: number }>;
}

export interface EventRequestPayload {
  title: string;
  purpose: string | null;
  description: string | null;
  startDatetime: string | null;
  endDatetime: string | null;
  expectedAttendance: number | null;
  preferredLayoutType: string;
  accessibilityNeeds: string[];
  isRegistrationEnabled: boolean;
  registrationCapacity: number | null;
  venuePreferences: number[];
  equipmentRequirements: Array<{ equipmentId: number; quantity: number }>;
}

export const ACCESSIBILITY_OPTIONS = [
  "Wheelchair / barrier-free access",
  "Assistive listening system / hearing loop",
  "Live CART / ASL captioning space",
  "Gender-neutral restroom proximity",
] as const;

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
    label: "Pending Approval",
    chip: "bg-[#EEF2FF] text-[#4338CA]",
    border: "border-t-[#4338CA]",
  },
  UNDER_REVIEW: {
    label: "Under Review",
    chip: "bg-[#FEF3C7] text-[#92400E]",
    border: "border-t-[#92400E]",
  },
  AWAITING_CLARIFICATION: {
    label: "Under Review",
    chip: "bg-[#FEF3C7] text-[#92400E]",
    border: "border-t-[#92400E]",
  },
  PLANNING: {
    label: "Planning",
    chip: "bg-[#E0F2FE] text-[#0369A1]",
    border: "border-t-[#0369A1]",
  },
  CONFIRMED: {
    label: "Confirmed",
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

export const displayEventStatus = (status: EventStatus, assigned = false): EventStatus => { void assigned; return status; };
export const statusPresentation = (status: string) => STATUS_PRESENTATION[status as EventStatus] ?? { label: status.replaceAll("_", " "), chip: "bg-slate-100 text-slate-700", border: "border-t-slate-400" };
export const eventStatusLabel = (event: Pick<EventListItem, "status" | "statusLabel">) => event.statusLabel || statusPresentation(event.status).label;

export const fieldStep = (field: string) => ({ title: 0, purpose: 0, description: 0, startDatetime: 1, endDatetime: 1, expectedAttendance: 1, venuePreferences: 2, preferredLayoutType: 2, accessibilityNeeds: 3, accessibilityNotes: 3, equipmentRequirements: 4, registrationCapacity: 5, isRegistrationEnabled: 5 }[field] ?? 0);
export function validateEventStep(values: EventFormValues, index: number, required = false, now = Date.now()) {
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
    const start = Date.parse(values.startDatetime); const end = Date.parse(values.endDatetime);
    if (required && !values.startDatetime) errors.startDatetime = "Event start date and time is required.";
    else if (values.startDatetime && !Number.isFinite(start)) errors.startDatetime = "Please enter a valid date and time.";
    else if (required && start < now + 48 * 60 * 60 * 1000) errors.startDatetime = "Event date must be at least 48 hours in advance.";
    if (required && !values.endDatetime) errors.endDatetime = "Event end date and time is required.";
    else if (values.endDatetime && !Number.isFinite(end)) errors.endDatetime = "Please enter a valid date and time.";
    else if (Number.isFinite(start) && end <= start) errors.endDatetime = "End time must be after start time.";
    if (required && !values.expectedAttendance.trim()) errors.expectedAttendance = "Expected Attendance is required for submission";
    else if (values.expectedAttendance && (!Number.isInteger(Number(values.expectedAttendance)) || Number(values.expectedAttendance) < 1 || Number(values.expectedAttendance) > 2147483647)) errors.expectedAttendance = "Expected Attendance must be a positive whole number.";
  }
  if (index === 2 && required && !values.preferredLayoutType) errors.preferredLayoutType = "Preferred layout is required.";
  if (index === 3 && values.accessibilityNotes.split("\n").some(line => line.length > 200)) errors.accessibilityNotes = "Keep each accessibility note to 200 characters or fewer.";
  if (index === 5) {
    if (required && values.isRegistrationEnabled && !values.registrationCapacity.trim()) errors.registrationCapacity = "Registration capacity is required when registration is enabled.";
    else if (values.registrationCapacity && (!Number.isInteger(Number(values.registrationCapacity)) || Number(values.registrationCapacity) < 1 || Number(values.registrationCapacity) > 2147483647)) errors.registrationCapacity = "Registration capacity must be a positive whole number.";
  }
  return errors;
}

export const EVENT_STATUS_ORDER: EventStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "AWAITING_CLARIFICATION",
  "PLANNING",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
];

export const EMPTY_EVENT_FORM: EventFormValues = {
  title: "",
  purpose: "",
  description: "",
  startDatetime: "",
  endDatetime: "",
  expectedAttendance: "",
  accessibilityNeeds: [],
  accessibilityNotes: "",
  isRegistrationEnabled: false,
  registrationCapacity: "",
  preferredLayoutType: "NO_PREFERENCE",
  venuePreferences: [],
  equipmentRequirements: [],
};

export const toLocalDateTimeInput = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export const localDateTimeToIso = (value: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

export const toPayload = (values: EventFormValues): EventRequestPayload => ({
  title: values.title.trim(),
  purpose: values.purpose.trim() || null,
  description: values.description.trim() || null,
  startDatetime: localDateTimeToIso(values.startDatetime) ?? null,
  endDatetime: localDateTimeToIso(values.endDatetime) ?? null,
  expectedAttendance: values.expectedAttendance.trim() ? Number(values.expectedAttendance) : null,
  preferredLayoutType: values.preferredLayoutType,
  accessibilityNeeds: [...values.accessibilityNeeds, ...values.accessibilityNotes.split("\n").map(line => line.trim()).filter(Boolean)],
  isRegistrationEnabled: values.isRegistrationEnabled,
  registrationCapacity: values.isRegistrationEnabled && values.registrationCapacity.trim() ? Number(values.registrationCapacity) : null,
  venuePreferences: [...values.venuePreferences],
  equipmentRequirements: values.equipmentRequirements.map(item => ({ ...item })),
});

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
    startDatetime: toLocalDateTimeInput(event.startDatetime),
    endDatetime: toLocalDateTimeInput(event.endDatetime),
    expectedAttendance: event.expectedAttendance?.toString() ?? "",
    accessibilityNeeds: selectedNeeds,
    accessibilityNotes: notes.join("\n"),
    isRegistrationEnabled: event.isRegistrationEnabled ?? false,
    registrationCapacity: event.registrationCapacity?.toString() ?? "",
    preferredLayoutType: event.preferredLayoutType ?? "NO_PREFERENCE",
    venuePreferences: event.venuePreferences ?? [],
    equipmentRequirements: event.equipmentRequirements ?? [],
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
