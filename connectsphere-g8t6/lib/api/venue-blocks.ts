// SPM-195: operational blocks, incidents and restoration. Field names, codes,
// states and labels are the backend's (routes under /api/venues, see the
// backend README "Venue Blocks and Restoration"); do not rename them here.
import { apiRequest } from "@/lib/api";

// Master 5.4.4 / Week 7 change #2. The labels match the backend's reasonLabel.
export const BLOCK_REASON_OPTIONS = [
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "EQUIPMENT_FAILURE", label: "Equipment failure" },
  { value: "RENOVATION", label: "Renovation" },
  { value: "SAFETY", label: "Safety" },
  { value: "OTHER", label: "Other" },
] as const;

export type BlockReason = (typeof BLOCK_REASON_OPTIONS)[number]["value"];

export interface VenueBlock {
  blockId: string;
  venueId: number;
  reason: BlockReason;
  reasonLabel: string;
  start: string;
  end: string;
  note: string;
  // ACTIVE or LIFTED.
  status: string;
  statusLabel: string;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
}

// The coordinator's options on an open incident (AC7): RESTORE is always
// waiting for Venue Staff, REPLACE is not available yet (SPM-172).
export interface IncidentAction {
  action: "RESTORE" | "REPLACE" | "CANCEL";
  available: boolean;
  label: string;
}

export interface VenueIncident {
  incidentId: number;
  eventId: number;
  requestId: string;
  eventTitle: string | null;
  bookingId: number | null;
  calendarHoldId: string | null;
  calendarBlockId: string;
  venueId: number | null;
  occupiedStart: string | null;
  occupiedEnd: string | null;
  // OPEN or RESOLVED.
  status: string;
  statusLabel: string;
  resolution: string | null;
  resolutionLabel: string | null;
  createdAt: string;
  resolvedAt: string | null;
  // Null when MongoDB could not be read.
  block: VenueBlock | null;
  // True only when no active block overlaps the whole occupied range; null
  // when it could not be checked, never shown as restorable.
  canBeRestored: boolean | null;
  restoreLabel: string | null;
  actions?: IncidentAction[];
}

export interface VenueBlockWithIncidents extends VenueBlock {
  incidents: VenueIncident[];
  // Overlapping bookings of finished, cancelled or rejected events: never
  // affected, so they have no incident.
  closedEventBookings?: number;
}

export interface VenueBlockList {
  venueId: number;
  venueName: string;
  // True when the backend left later blocks out of a long list.
  hasMore?: boolean;
  blocks: VenueBlockWithIncidents[];
}

export interface VenueBlockInput {
  reason: BlockReason;
  // ISO 8601 with an offset.
  start: string;
  end: string;
  note: string;
}

export interface CreatedVenueBlock {
  message: string;
  block: VenueBlock;
  incidents: Array<{ incidentId: number; eventId: number; requestId: string; bookingId: number | null; calendarHoldId: string | null }>;
  affectedEvents: Array<{ eventId: number; requestId: string; title: string; status: string; arrangementVersion: number }>;
  replayed?: boolean;
}

export interface ChangedVenueBlock {
  message: string;
  block: VenueBlock;
  incidents: VenueIncident[];
  changed: boolean;
}

export interface RestoredIncident {
  message: string;
  incidentId: number;
  eventId: number;
  requestId: string;
  bookingId: number | null;
  calendarHoldId: string | null;
  status: string;
  statusLabel: string;
  resolution: string;
  resolutionLabel: string;
  arrangementVersion: number;
  changed: boolean;
}

export const listVenueBlocks = async (venueId: number): Promise<VenueBlockList> => {
  const data = await apiRequest<Partial<VenueBlockList>>(`/venues/${venueId}/blocks`);
  return {
    venueId: data.venueId ?? venueId,
    venueName: data.venueName ?? "",
    hasMore: data.hasMore === true,
    blocks: Array.isArray(data.blocks)
      ? data.blocks.map((block) => ({ ...block, incidents: Array.isArray(block.incidents) ? block.incidents : [] }))
      : [],
  };
};

// A retry of the same form reuses its key, so a double click or a network
// retry cannot record a second block (AC13).
export const createVenueBlock = (venueId: number, input: VenueBlockInput, idempotencyKey: string) =>
  apiRequest<CreatedVenueBlock>(`/venues/${venueId}/blocks`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });

// Only a shorter interval is accepted; version is the block version loaded.
export const shortenVenueBlock = (venueId: number, blockId: string, change: { start: string; end: string; version: number }) =>
  apiRequest<ChangedVenueBlock>(`/venues/${venueId}/blocks/${blockId}`, {
    method: "PUT",
    body: JSON.stringify(change),
  });

export const liftVenueBlock = (venueId: number, blockId: string, version: number) =>
  apiRequest<ChangedVenueBlock>(`/venues/${venueId}/blocks/${blockId}/lift`, {
    method: "POST",
    body: JSON.stringify({ version }),
  });

export const restoreVenueIncident = (incidentId: number, idempotencyKey: string) =>
  apiRequest<RestoredIncident>(`/venues/incidents/${incidentId}/restore`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
  });
