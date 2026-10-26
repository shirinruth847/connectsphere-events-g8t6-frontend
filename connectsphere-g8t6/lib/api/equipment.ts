import { apiRequest } from "@/lib/api";
import { equipmentQuery, type EquipmentFilters } from "@/lib/equipment";

export type { EquipmentFilters };

// Equipment catalogue for Technical Support (SPM-52). Shapes follow the backend
// routes under /api/equipment; the backend decides every status and label.

export type EquipmentStatus = "ACTIVE" | "INACTIVE" | "DETAILS_PENDING";
// Where the MongoDB detail stands: PENDING until first applied; OUT_OF_DATE or
// FAILED while a later change has not reached it; NONE when none was ever written.
export type EquipmentDetailStatus = "CURRENT" | "PENDING" | "OUT_OF_DATE" | "FAILED" | "NONE";
export type UnavailabilityReason = "DAMAGED" | "MAINTENANCE" | "OTHER";

// Filter and form choices; the labels come from the backend.
export type EquipmentOptions = {
  categories: string[];
  statuses: { value: EquipmentStatus; label: string }[];
  unavailabilityReasons: { value: UnavailabilityReason; label: string }[];
};

export const EMPTY_EQUIPMENT_OPTIONS: EquipmentOptions = { categories: [], statuses: [], unavailabilityReasons: [] };

type Person = { userId: number; name: string | null } | null;

export type Equipment = {
  equipmentId: number;
  name: string;
  category: string;
  storageLocation: string | null;
  totalQuantity: number;
  unavailableNow: number;
  isActive: boolean;
  status: EquipmentStatus;
  statusLabel: string;
  detailStatus: EquipmentDetailStatus;
  detailNotice: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: Person;
  updatedBy: Person;
};

export type EquipmentDetails = {
  specifications: string | null;
  technicalNotes: string | null;
  handlingNotes: string | null;
  pgVersion: number;
  updatedAt: string | null;
};

// The detail values sent with a stale save's 409 (EQUIPMENT_VERSION_CONFLICT).
export type CurrentEquipmentDetails = Pick<EquipmentDetails, "specifications" | "technicalNotes" | "handlingNotes">;

export type Unavailability = {
  unavailabilityId: number;
  equipmentId: number;
  quantity: number;
  reason: UnavailabilityReason;
  reasonLabel: string;
  startsAt: string;
  endsAt: string;
  note: string;
  status: "ACTIVE" | "CANCELLED";
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: Person;
  updatedBy: Person;
};

export type UpcomingEquipmentRequest = { eventId: number; requestId: string; title: string; startDatetime: string };

export type EquipmentInput = {
  name: string;
  category: string;
  storageLocation: string;
  totalQuantity: string | number;
  specifications?: string | null;
  technicalNotes?: string | null;
  handlingNotes?: string | null;
};

export type UnavailabilityInput = {
  quantity: string | number;
  reason: UnavailabilityReason | "";
  startsAt: string;
  endsAt: string;
  note: string;
};

export const listEquipment = (filters: EquipmentFilters = {}, offset = 0) =>
  apiRequest<{ equipment: Equipment[]; nextOffset: number | null }>(`/equipment${equipmentQuery(filters, offset)}`);

export const listEquipmentOptions = () => apiRequest<EquipmentOptions>("/equipment/options");

export const getEquipment = (equipmentId: number) =>
  apiRequest<{ equipment: Equipment; details: EquipmentDetails | null; detailsRead: "OK" | "NOT_CHECKED"; unavailability: Unavailability[] }>(
    `/equipment/${equipmentId}`,
  );

export const createEquipment = (input: EquipmentInput) =>
  apiRequest<{ message: string; equipment: Equipment }>("/equipment", { method: "POST", body: JSON.stringify(input) });

export const updateEquipment = (equipmentId: number, input: Partial<EquipmentInput> & { version: number }) =>
  apiRequest<{ message: string; equipment: Equipment; changed: boolean }>(`/equipment/${equipmentId}`, { method: "PUT", body: JSON.stringify(input) });

export const changeEquipmentStatus = (equipmentId: number, input: { active: boolean; version: number; confirmUpcomingRequests?: boolean }) =>
  apiRequest<{ message: string; equipment: Equipment; changed: boolean; upcomingRequests: number }>(`/equipment/${equipmentId}/status`, {
    method: "PUT",
    body: JSON.stringify(input),
  });

type UnavailabilityResult = { message: string; unavailability: Unavailability; equipment: Equipment; changed: boolean };

export const recordUnavailability = (equipmentId: number, input: UnavailabilityInput) =>
  apiRequest<UnavailabilityResult>(`/equipment/${equipmentId}/unavailability`, { method: "POST", body: JSON.stringify(input) });

export const updateUnavailability = (equipmentId: number, unavailabilityId: number, input: Partial<UnavailabilityInput> & { version: number }) =>
  apiRequest<UnavailabilityResult>(`/equipment/${equipmentId}/unavailability/${unavailabilityId}`, { method: "PUT", body: JSON.stringify(input) });

export const endUnavailability = (equipmentId: number, unavailabilityId: number, version: number) =>
  apiRequest<UnavailabilityResult>(`/equipment/${equipmentId}/unavailability/${unavailabilityId}/end`, {
    method: "POST",
    body: JSON.stringify({ version }),
  });
