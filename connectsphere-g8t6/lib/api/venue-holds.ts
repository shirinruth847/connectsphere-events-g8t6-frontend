// SPM-190: tentative venue holds (Master 5.4.3, T34). The coordinator requests
// a hold; Venue Staff place or decline it, extend it once and release it.
// Field names, states and labels are the backend's; the frontend never maps
// hold states itself.
import { apiRequest } from "@/lib/api";
import type { BookingChecks } from "@/lib/api/venue-bookings";

export type HoldRequestStatus = "PENDING" | "PLACED" | "DECLINED" | "WITHDRAWN";
export const HOLD_REQUEST_STATUSES: HoldRequestStatus[] = ["PENDING", "PLACED", "DECLINED", "WITHDRAWN"];

export interface VenueHold {
  holdId: string;
  // ACTIVE, EXPIRED (also when overdue but not yet recorded), RELEASED or CONVERTED.
  status: string;
  statusLabel: string;
  expiresAt: string | null;
  extended: boolean;
  occupiedStart: string | null;
  occupiedEnd: string | null;
  // The booking a confirmed hold became (SPM-188 AC9).
  convertedBookingId: number | null;
  // That booking with the backend's status label; null when unknown or never saved.
  convertedBooking: { bookingId: number; status: string; statusLabel: string } | null;
  // Confirmed, but its booking was never saved (a lost commit, Master T35):
  // the coordinator confirms it again.
  bookingMissing: boolean;
}

export interface HoldPreview extends BookingChecks {
  // When the hold would expire if placed now; null when no hold is possible.
  expiresAt: string | null;
}

export interface VenueHoldRequest {
  holdRequestId: number;
  eventId: number;
  requestId: string;
  eventTitle: string | null;
  venueId: number;
  venueName: string | null;
  label: string;
  start: string;
  end: string;
  expectedAttendance: number | null;
  note: string | null;
  status: HoldRequestStatus;
  statusLabel: string;
  requestedAt: string;
  requestedByName: string | null;
  decidedAt: string | null;
  decidedByName: string | null;
  declineReason: string | null;
  hold: VenueHold | null;
  // A placed hold whose calendar entry could not be read just now.
  holdUnavailable: boolean;
  // Venue Staff's list only, for pending requests.
  preview?: HoldPreview | null;
}

export interface VenueHoldRequestInput {
  venueId: number;
  label: string;
  // ISO 8601 with an offset, inside the event.
  start: string;
  end: string;
  expectedAttendance: number | null;
  note: string | null;
}

type HoldAnswer = { message: string; holdRequest: VenueHoldRequest };

export const MAX_HOLD_EXTENSION_DAYS = 7;
export const HOLD_LIMITS = Object.freeze({ label: 100, note: 500, reason: 1000 });

// Whether the coordinator may act on this hold request now.
export const isActiveHold = (request: VenueHoldRequest, now = Date.now()) => request.status === "PLACED"
  && request.hold?.status === "ACTIVE" && Boolean(request.hold.expiresAt) && Date.parse(request.hold.expiresAt as string) > now;

// ---------- coordinator ----------

export const listEventHolds = async (eventId: number): Promise<VenueHoldRequest[]> => {
  const data = await apiRequest<{ holds?: VenueHoldRequest[] }>(`/events/${eventId}/venue-holds`);
  return Array.isArray(data.holds) ? data.holds : [];
};

// A retry of the same form reuses its key, so it cannot ask twice.
export const requestVenueHold = (eventId: number, input: VenueHoldRequestInput, idempotencyKey: string) =>
  apiRequest<HoldAnswer>(`/events/${eventId}/venue-holds`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });

export const withdrawHoldRequest = (holdRequestId: number) =>
  apiRequest<HoldAnswer>(`/venues/hold-requests/${holdRequestId}/withdraw`, { method: "POST" });

// ---------- Venue Staff ----------

export const listHoldRequests = async (status?: HoldRequestStatus): Promise<{ requests: VenueHoldRequest[]; pendingCount: number }> => {
  const data = await apiRequest<{ requests?: VenueHoldRequest[]; pendingCount?: number }>(
    `/venues/hold-requests${status ? `?status=${status}` : ""}`,
  );
  return { requests: Array.isArray(data.requests) ? data.requests : [], pendingCount: data.pendingCount ?? 0 };
};

export const placeVenueHold = (holdRequestId: number, idempotencyKey: string) =>
  apiRequest<HoldAnswer>(`/venues/hold-requests/${holdRequestId}/place`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
  });

export const declineHoldRequest = (holdRequestId: number, reason: string) =>
  apiRequest<HoldAnswer>(`/venues/hold-requests/${holdRequestId}/decline`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });

export const extendVenueHold = (holdId: string, days: number) =>
  apiRequest<HoldAnswer>(`/venues/holds/${holdId}/extend`, {
    method: "POST",
    body: JSON.stringify({ days }),
  });

// Venue Staff, or the event's coordinator.
export const releaseVenueHold = (holdId: string) =>
  apiRequest<HoldAnswer>(`/venues/holds/${holdId}/release`, { method: "POST" });
