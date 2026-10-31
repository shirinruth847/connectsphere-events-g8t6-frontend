import { apiRequest } from "@/lib/api";
import {
  availabilityQuery,
  technicalRequestQuery,
  type EquipmentAvailability,
  type EquipmentLine,
  type TechnicalRequestFilters,
  type TechnicalRequestStatus,
} from "@/lib/technical-requests";

// Equipment selection and technical requests (SPM-286, SPM-287). Shapes follow
// the backend routes; the backend re-checks every quantity and decision.

type Person = { userId: number; name: string | null } | null;

export type TechnicalRequestEvent = {
  eventId: number;
  requestId: string;
  title: string;
  status: string;
  start: string | null;
  end: string | null;
  venue: { venueId: number; name: string; address?: string | null } | null;
};

export type TechnicalRequestItem = {
  equipmentId: number;
  name: string;
  category: string | null;
  quantity: number;
};

export type TechnicalRequestListItem = {
  technicalRequestId: number;
  status: TechnicalRequestStatus;
  createdAt: string;
  decidedAt: string | null;
  event: TechnicalRequestEvent;
  requestedBy: Person;
  items: TechnicalRequestItem[];
};

export type TechnicalRequestHistoryEntry = {
  action: string;
  details: string | null;
  actorRole: string | null;
  actor: Person;
  rejectionReason: string | null;
  at: string;
};

export type TechnicalRequestDetail = Omit<TechnicalRequestListItem, "items"> & {
  rejectionReason: string | null;
  decidedBy: Person;
  // availableQuantity is what is free for the event's time now, excluding this request.
  items: Array<TechnicalRequestItem & { availableQuantity: number }>;
  history: TechnicalRequestHistoryEntry[];
};

export type SentTechnicalRequest = {
  technicalRequestId: number;
  eventId: number;
  requestId: string;
  status: TechnicalRequestStatus;
  items: TechnicalRequestItem[];
  arrangementVersion: number;
  createdAt: string;
};

export type TechnicalDecisionResult = {
  technicalRequestId: number;
  eventId: number;
  status: TechnicalRequestStatus;
  rejectionReason: string | null;
  decidedAt: string;
  arrangementVersion: number;
};

// GET /api/events/equipment-options — organisers and coordinators. Without a
// complete window the quantities are usable stock and `note` explains why.
export const getEquipmentAvailability = (start?: string | null, end?: string | null, signal?: AbortSignal) =>
  apiRequest<EquipmentAvailability>(`/events/equipment-options${availabilityQuery(start, end)}`, { signal });

// POST /api/events/:id/technical-requests — the assigned coordinator, in Planning.
export const sendTechnicalRequest = (eventId: number, items: EquipmentLine[], idempotencyKey: string) =>
  apiRequest<SentTechnicalRequest>(`/events/${eventId}/technical-requests`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ items }),
  });

// GET /api/equipment/requests — Technical Support. Pending first, oldest first.
export const listTechnicalRequests = (filters: TechnicalRequestFilters, offset = 0) =>
  apiRequest<{ technicalRequests: TechnicalRequestListItem[]; total: number; nextOffset: number | null }>(
    `/equipment/requests${technicalRequestQuery(filters, offset)}`,
  );

export const getTechnicalRequest = (requestId: number) =>
  apiRequest<TechnicalRequestDetail>(`/equipment/requests/${requestId}`);

// POST /api/equipment/requests/:id/decision — all lines or none (Master 5.5).
export const decideTechnicalRequest = (requestId: number, decision: "APPROVE" | "REJECT", reason: string | null, idempotencyKey: string) =>
  apiRequest<TechnicalDecisionResult>(`/equipment/requests/${requestId}/decision`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ decision, reason }),
  });
