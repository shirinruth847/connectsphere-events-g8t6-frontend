// Pure helpers for the equipment catalogue (SPM-52): list query, form checks
// and Singapore-time conversion. No imports, so node tests can load it.
// Form checks give early messages only; the backend's validation decides.

export type EquipmentFilters = { search?: string; category?: string; status?: "ACTIVE" | "INACTIVE" | "DETAILS_PENDING" | "" };

export const equipmentQuery = (filters: EquipmentFilters = {}, offset = 0) => {
  const params = new URLSearchParams();
  const search = filters.search?.trim();
  const category = filters.category?.trim();
  if (search) params.set("search", search);
  if (category) params.set("category", category);
  if (filters.status) params.set("status", filters.status);
  if (offset > 0) params.set("offset", String(offset));
  const query = params.toString();
  return query ? `?${query}` : "";
};

// The backend's wording (SPM-52 test cases), so the early message and the
// authoritative one read the same.
export const EQUIPMENT_MESSAGES = {
  nameRequired: "Name is required",
  nameTooLong: "Name must be 100 characters or fewer",
  categoryRequired: "Category is required",
  categoryTooLong: "Category must be 100 characters or fewer",
  storageLocationRequired: "Storage location is required",
  storageLocationTooLong: "Storage location must be 150 characters or fewer",
  totalQuantityRequired: "Total quantity is required",
  totalQuantityInvalid: "Total quantity must be a whole number of 0 or more",
  detailTooLong: "Must be 2000 characters or fewer",
  quantityRequired: "Quantity is required",
  quantityInvalid: "Quantity must be a whole number greater than 0",
  reasonRequired: "Reason is required",
  startRequired: "Start is required",
  endRequired: "End is required",
  endBeforeStart: "End must be after the start",
  endInPast: "End must be in the future",
  noteRequired: "Note is required",
  noteTooLong: "Note must be 500 characters or fewer",
} as const;

export type EquipmentFormValues = {
  name: string;
  category: string;
  storageLocation: string;
  totalQuantity: string;
  specifications: string;
  technicalNotes: string;
  handlingNotes: string;
};

export const EMPTY_EQUIPMENT_FORM: EquipmentFormValues = {
  name: "",
  category: "",
  storageLocation: "",
  totalQuantity: "",
  specifications: "",
  technicalNotes: "",
  handlingNotes: "",
};

export const DETAIL_KEYS = ["specifications", "technicalNotes", "handlingNotes"] as const;
export const RECORD_KEYS = ["name", "category", "storageLocation", "totalQuantity"] as const;

export type FieldErrors = Partial<Record<string, string>>;

const checkLength = (errors: FieldErrors, key: string, value: string, limit: number, message: string) => {
  if (value.trim().length > limit) errors[key] = message;
};

// Required record fields and limits (SPM-52 AC2). Pass only the keys being
// saved when editing, so an older row without a location can still be saved.
export function validateEquipmentForm(values: EquipmentFormValues, keys: readonly (keyof EquipmentFormValues)[] = [...RECORD_KEYS, ...DETAIL_KEYS]) {
  const errors: FieldErrors = {};
  const checks: Record<keyof EquipmentFormValues, () => void> = {
    name: () => {
      if (!values.name.trim()) errors.name = EQUIPMENT_MESSAGES.nameRequired;
      else checkLength(errors, "name", values.name, 100, EQUIPMENT_MESSAGES.nameTooLong);
    },
    category: () => {
      if (!values.category.trim()) errors.category = EQUIPMENT_MESSAGES.categoryRequired;
      else checkLength(errors, "category", values.category, 100, EQUIPMENT_MESSAGES.categoryTooLong);
    },
    storageLocation: () => {
      if (!values.storageLocation.trim()) errors.storageLocation = EQUIPMENT_MESSAGES.storageLocationRequired;
      else checkLength(errors, "storageLocation", values.storageLocation, 150, EQUIPMENT_MESSAGES.storageLocationTooLong);
    },
    totalQuantity: () => {
      const text = values.totalQuantity.trim();
      if (!text) errors.totalQuantity = EQUIPMENT_MESSAGES.totalQuantityRequired;
      else if (!/^\d+$/.test(text)) errors.totalQuantity = EQUIPMENT_MESSAGES.totalQuantityInvalid;
    },
    specifications: () => checkLength(errors, "specifications", values.specifications, 2000, EQUIPMENT_MESSAGES.detailTooLong),
    technicalNotes: () => checkLength(errors, "technicalNotes", values.technicalNotes, 2000, EQUIPMENT_MESSAGES.detailTooLong),
    handlingNotes: () => checkLength(errors, "handlingNotes", values.handlingNotes, 2000, EQUIPMENT_MESSAGES.detailTooLong),
  };
  keys.forEach((key) => checks[key]());
  return errors;
}

// ---------- unavailable stock (SPM-52 AC8) ----------

export type UnavailabilityFormValues = { quantity: string; reason: string; startsAt: string; endsAt: string; note: string };

export const EMPTY_UNAVAILABILITY_FORM: UnavailabilityFormValues = { quantity: "", reason: "", startsAt: "", endsAt: "", note: "" };

// Times are entered and shown in Singapore time, like every other ConnectSphere schedule.
const SINGAPORE_OFFSET = "+08:00";
const LOCAL_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const inputFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Singapore",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// "2026-11-02T09:00" (a datetime-local value read as Singapore time) -> an instant
// with its offset, as the backend requires. Empty when the value is incomplete.
export const toSingaporeInstant = (local: string) => (LOCAL_INPUT.test(local) ? `${local}:00${SINGAPORE_OFFSET}` : "");

// An instant -> the datetime-local value that shows it in Singapore time.
export const toSingaporeInput = (instant: string) => {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return "";
  const part = Object.fromEntries(inputFormat.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`;
};

export function validateUnavailabilityForm(values: UnavailabilityFormValues, now = new Date(), keys: readonly (keyof UnavailabilityFormValues)[] = ["quantity", "reason", "startsAt", "endsAt", "note"]) {
  const errors: FieldErrors = {};
  const has = (key: keyof UnavailabilityFormValues) => keys.includes(key);
  if (has("quantity")) {
    const text = values.quantity.trim();
    if (!text) errors.quantity = EQUIPMENT_MESSAGES.quantityRequired;
    else if (!/^\d+$/.test(text) || Number(text) < 1) errors.quantity = EQUIPMENT_MESSAGES.quantityInvalid;
  }
  if (has("reason") && !values.reason) errors.reason = EQUIPMENT_MESSAGES.reasonRequired;
  if (has("note")) {
    if (!values.note.trim()) errors.note = EQUIPMENT_MESSAGES.noteRequired;
    else checkLength(errors, "note", values.note, 500, EQUIPMENT_MESSAGES.noteTooLong);
  }
  const start = toSingaporeInstant(values.startsAt);
  const end = toSingaporeInstant(values.endsAt);
  if (!start) errors.startsAt = EQUIPMENT_MESSAGES.startRequired;
  if (!end) errors.endsAt = EQUIPMENT_MESSAGES.endRequired;
  else if (start && Date.parse(end) <= Date.parse(start)) errors.endsAt = EQUIPMENT_MESSAGES.endBeforeStart;
  else if (Date.parse(end) <= now.getTime()) errors.endsAt = EQUIPMENT_MESSAGES.endInPast;
  return errors;
}

// "2 / 5 unavailable now"-style quantity, and the share used for the bar.
export const unavailableShare = (unavailable: number, total: number) => (total > 0 ? Math.min(100, Math.round((unavailable / total) * 100)) : 0);
