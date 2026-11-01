// Equipment selection and technical requests (SPM-286, SPM-287). Pure and free
// of runtime imports, so the unit tests can load it directly.

export type TechnicalRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export const TECHNICAL_REQUEST_STATUSES: TechnicalRequestStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export const TECHNICAL_REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const technicalStatusLabel = (status: string) =>
  TECHNICAL_REQUEST_STATUS_LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");

// Limits the backend enforces (config/equipmentConstants.js, LIMITS.search).
export const MAX_TECHNICAL_SEARCH_LENGTH = 100;
export const MAX_REJECTION_REASON = 1000;
export const TECHNICAL_REQUEST_PAGE_SIZE = 24;

export type EquipmentLine = { equipmentId: number; quantity: number };

// One catalogue item from GET /api/events/equipment-options.
export type EquipmentAvailabilityOption = {
  equipmentId: number;
  name: string;
  category: string | null;
  description: string | null;
  totalQuantity: number;
  availableQuantity: number;
};

export type EquipmentAvailability = {
  window: { start: string; end: string } | null;
  // Set when no window was sent: the quantities are usable stock (SPM-286 AC2).
  note: string | null;
  equipment: EquipmentAvailabilityOption[];
};

const instant = (value?: string | null) => {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

// An instant written in Singapore time, e.g. "2030-03-10T10:00:00+08:00".
export const toSingaporeOffset = (time: number) => `${new Date(time + SGT_OFFSET_MS).toISOString().slice(0, 19)}+08:00`;

// The event's window when both ends are valid and in order, in Singapore time;
// the backend wants both or neither.
export function availabilityWindow(start?: string | null, end?: string | null) {
  const from = instant(start);
  const to = instant(end);
  if (from === null || to === null || from >= to) return null;
  return { start: toSingaporeOffset(from), end: toSingaporeOffset(to) };
}

export function availabilityQuery(start?: string | null, end?: string | null) {
  const window = availabilityWindow(start, end);
  return window ? `?${new URLSearchParams(window)}` : "";
}

// "Only 3 Projector available for the event's time." per line over the
// available quantity. Lines for items no longer offered are not checked.
export function lineQuantityProblems(lines: EquipmentLine[], availability: EquipmentAvailability | null) {
  const problems: Record<number, string> = {};
  if (!availability) return problems;
  lines.forEach((line, index) => {
    const option = availability.equipment.find((item) => item.equipmentId === line.equipmentId);
    if (!option || !Number.isInteger(line.quantity) || line.quantity <= option.availableQuantity) return;
    problems[index] = availability.window
      ? `Only ${option.availableQuantity} ${option.name} available for the event's time.`
      : `Only ${option.availableQuantity} ${option.name} in stock.`;
  });
  return problems;
}

// The field error the save and submit checks add (SPM-286 AC3).
export function equipmentAvailabilityErrors(lines: EquipmentLine[], availability: EquipmentAvailability | null): Record<string, string> {
  return Object.keys(lineQuantityProblems(lines, availability)).length
    ? { equipmentRequirements: "Reduce the highlighted equipment quantities to what is available." }
    : {};
}

// "items[2].quantity" -> { 2: message }, for refusals of a sent request.
export function itemFieldErrors(fields: Record<string, string>) {
  const lines: Record<number, string> = {};
  for (const [key, message] of Object.entries(fields)) {
    const match = /^items\[(\d+)\]\.(equipmentId|quantity)$/.exec(key);
    if (match) lines[Number(match[1])] ??= message;
  }
  return lines;
}

export type UnavailableItem = { equipmentId: number; name: string; requested: number; available: number };

// The lines a 409 EQUIPMENT_NOT_AVAILABLE names, or none for another body.
export function unavailableItems(details: Record<string, unknown>): UnavailableItem[] {
  const items = details.items;
  return Array.isArray(items)
    ? items.filter((item): item is UnavailableItem => Boolean(item) && typeof item.name === "string" && Number.isFinite(item.available))
    : [];
}

// An event's equipment line as the event API returns it. GET /api/events/:id
// names the item; save, submit and amendment responses leave name null.
export type EquipmentRequirement = EquipmentLine & { name?: string | null; category?: string | null };

type NamedEquipment = { equipmentId: number; name?: string | null };

export const equipmentLabel = (item: NamedEquipment) => item.name ?? `Equipment #${item.equipmentId}`;

// Fills the names a response left null from items already known by ID: the
// event shown before the save, or the equipment options. Earlier sources win.
export function withEquipmentNames<T extends NamedEquipment>(items: T[], ...known: NamedEquipment[][]): T[] {
  const names = new Map(known.flat().filter((item) => item.name).reverse().map((item) => [item.equipmentId, item.name]));
  return items.map((item) => (item.name || !names.has(item.equipmentId) ? item : { ...item, name: names.get(item.equipmentId) }));
}

export const itemsSummary = (items: Array<NamedEquipment & { quantity: number }>) =>
  items.length ? items.map((item) => `${equipmentLabel(item)} × ${item.quantity}`).join(", ") : "No equipment";

export type TechnicalRequestFilters = { status?: string; search?: string };

// Query string for GET /api/equipment/requests; empty filters are dropped.
export function technicalRequestQuery(filters: TechnicalRequestFilters, offset = 0, limit = TECHNICAL_REQUEST_PAGE_SIZE) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  const search = filters.search?.trim();
  if (search) params.set("search", search);
  params.set("limit", String(limit));
  if (offset > 0) params.set("offset", String(offset));
  return `?${params}`;
}

// A reason is required to reject and limited in length (SPM-287 AC5).
export function rejectionReasonProblem(reason: string) {
  const trimmed = reason.trim();
  if (!trimmed) return "Enter a reason for rejecting this request.";
  if (trimmed.length > MAX_REJECTION_REASON) return `The reason must be ${MAX_REJECTION_REASON} characters or fewer.`;
  return null;
}

// History entries from GET /api/equipment/requests/:id, in plain words.
export const HISTORY_ACTION_LABELS: Record<string, string> = {
  TECHNICAL_REQUEST_SENT: "Request sent",
  TECHNICAL_REQUEST_APPROVED: "Request approved",
  TECHNICAL_REQUEST_REJECTED: "Request rejected",
};

export const historyActionLabel = (action: string) =>
  HISTORY_ACTION_LABELS[action] ?? action.charAt(0) + action.slice(1).toLowerCase().replaceAll("_", " ");

// ---------- event history (SPM-286/287) ----------

type HistoryChange = { field: string; before: unknown; after: unknown; label?: string; beforeLabel?: string; afterLabel?: string };

const blank = (value: unknown) => value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

// A change with nothing on either side ("technicalRequestId —→—") says nothing.
export const isEmptyChange = (change: HistoryChange) => blank(change.before) && blank(change.after);

// The technical request status in history, readable in the API's shape
// (technicalRequestStatus, labelled) and the earlier one (technicalRequest
// { before, after }, technicalRequestId). Other fields are returned unchanged.
export function readableHistoryChange<T extends HistoryChange>(change: T): T {
  if (change.field === "technicalRequestStatus" || change.field === "technicalRequest") {
    const label = (value: unknown) => (typeof value === "string" ? technicalStatusLabel(value) : undefined);
    return {
      ...change,
      label: change.label ?? "Technical request",
      beforeLabel: change.beforeLabel ?? label(change.before),
      afterLabel: change.afterLabel ?? label(change.after),
    };
  }
  if (change.field === "technicalRequestId") {
    const number = (value: unknown) => (blank(value) ? undefined : `Request #${value}`);
    return { ...change, label: change.label ?? "Technical request", beforeLabel: number(change.before), afterLabel: number(change.after) };
  }
  return change;
}

export const visibleHistoryChanges = <T extends HistoryChange>(changes: T[]) => changes.map(readableHistoryChange).filter((change) => !isEmptyChange(change));
