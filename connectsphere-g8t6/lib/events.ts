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
}

export interface EventRequestPayload {
  title: string;
  purpose?: string;
  description?: string;
  startDatetime?: string;
  endDatetime?: string;
  expectedAttendance?: number;
  preferredLayoutType: "NO_PREFERENCE";
  accessibilityNeeds?: string[];
  isRegistrationEnabled: boolean;
  registrationCapacity?: number;
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
    label: "Under Review",
    chip: "bg-[#FEF3C7] text-[#92400E]",
    border: "border-t-[#92400E]",
  },
  PLANNING: {
    label: "Approved & Planning",
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

export const displayEventStatus = (status: EventStatus, isAssignedToCoordinator = false): EventStatus => {
  if (status === "AWAITING_CLARIFICATION" || (status === "SUBMITTED" && isAssignedToCoordinator)) {
    return "UNDER_REVIEW";
  }
  return status;
};

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

export const toPayload = (values: EventFormValues): EventRequestPayload => {
  const accessibilityNeeds = [
    ...values.accessibilityNeeds,
    ...(values.accessibilityNotes.trim() ? [values.accessibilityNotes.trim()] : []),
  ];

  return {
    title: values.title.trim(),
    ...(values.purpose.trim() ? { purpose: values.purpose.trim() } : {}),
    ...(values.description.trim() ? { description: values.description.trim() } : {}),
    ...(localDateTimeToIso(values.startDatetime)
      ? { startDatetime: localDateTimeToIso(values.startDatetime) }
      : {}),
    ...(localDateTimeToIso(values.endDatetime)
      ? { endDatetime: localDateTimeToIso(values.endDatetime) }
      : {}),
    ...(values.expectedAttendance.trim()
      ? { expectedAttendance: Number(values.expectedAttendance) }
      : {}),
    preferredLayoutType: "NO_PREFERENCE",
    ...(accessibilityNeeds.length ? { accessibilityNeeds } : {}),
    isRegistrationEnabled: values.isRegistrationEnabled,
    ...(values.isRegistrationEnabled && values.registrationCapacity.trim()
      ? { registrationCapacity: Number(values.registrationCapacity) }
      : {}),
    venuePreferences: [],
    equipmentRequirements: [],
  };
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
    startDatetime: toLocalDateTimeInput(event.startDatetime),
    endDatetime: toLocalDateTimeInput(event.endDatetime),
    expectedAttendance: event.expectedAttendance?.toString() ?? "",
    accessibilityNeeds: selectedNeeds,
    accessibilityNotes: notes.join("\n"),
    isRegistrationEnabled: event.isRegistrationEnabled ?? false,
    registrationCapacity: event.registrationCapacity?.toString() ?? "",
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
