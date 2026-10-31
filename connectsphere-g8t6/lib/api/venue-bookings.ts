import { apiRequest } from "@/lib/api";
import type { VenueIncident } from "@/lib/api/venue-blocks";
import type { EventHistoryEntry } from "@/lib/api/event-workspace";
import { bookingFilterQuery, type VenueBookingFilters } from "@/components/venue-staff/booking-requests/booking-filters";

export type { VenueBookingFilters };

// Venue Staff booking review (SPM-181). Labels come from the backend; the
// frontend never maps booking states itself.

export type VenueBookingStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export const VENUE_BOOKING_STATUSES: VenueBookingStatus[] = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];

export interface VenueBookingSummary {
  bookingId: number;
  label: string | null;
  status: string;
  statusLabel: string;
  venueId: number;
  venueName: string;
  startDatetime: string;
  endDatetime: string;
  expectedAttendance: number | null;
  submittedAt: string;
  updatedAt?: string;
}

export interface VenueBookingListItem extends VenueBookingSummary {
  event: {
    eventId: number;
    requestId: string;
    title: string;
    status: string;
    eventType: string | null;
    eventTypeLabel: string | null;
  };
}

// One booking against its own venue and window (SPM-186): blocking problems
// stop approval and requests; warnings are for Venue Staff to weigh. The
// backend never reports "AVAILABLE" when it could not check.
export type BookingAvailability = "AVAILABLE" | "UNAVAILABLE" | "NOT_CHECKED";
export interface BookingChecks {
  venueId: number | null;
  availability: BookingAvailability;
  occupiedStart: string | null;
  occupiedEnd: string | null;
  blocking: { code: string; message: string }[];
  warnings: string[];
}

export interface VenueBookingDetail extends VenueBookingSummary {
  venue: {
    venueId: number;
    name: string;
    address: string;
    maxCapacity: number;
    operatingHours: string | null;
    // From MongoDB venue_details; null when not recorded or when detailsAvailable is false.
    setupMinutes: number | null;
    turnaroundMinutes: number | null;
    detailsAvailable: boolean;
    roomId: number;
    roomLayoutType: string;
    roomCapacity: number;
  };
  layoutType: string | null;
  requiredFacilities: string[];
  accessibilityRequirements: string[];
  specialRequirements: string | null;
  rejectionReason: string | null;
  // SPM-195: the open incident, otherwise the latest resolved one.
  incident?: VenueIncident | null;
  // Who decided the booking and when (SPM-186 AC1); null while pending.
  reviewedAt?: string | null;
  reviewedByName?: string | null;
  // Which decisions the backend allows now (SPM-186 AC4, SPM-189 AC6, T32).
  actions?: { canApprove: boolean; canReject: boolean };
  // This booking's checks for its own venue and window; null once decided (SPM-186).
  checks?: BookingChecks | null;
}

export interface VenueBookingEvent {
  eventId: number;
  requestId: string;
  title: string;
  status: string;
  eventType: string | null;
  eventTypeLabel: string | null;
  purpose: string | null;
  description: string | null;
  startDatetime: string | null;
  endDatetime: string | null;
  expectedAttendance: number | null;
  preferredLayoutType: string | null;
  accessibilityNeeds: string[];
  submittedAt: string | null;
  organisationName: string | null;
  coordinatorName: string | null;
}

export interface VenueBookingList {
  bookings: VenueBookingListItem[];
  hasMore: boolean;
  pendingCount: number;
  approvedCount: number;
}

export interface EventVenueBookings {
  event: VenueBookingEvent;
  bookings: VenueBookingDetail[];
}

export const listVenueBookings = (filters: VenueBookingFilters = {}) =>
  apiRequest<VenueBookingList>(`/venues/bookings${bookingFilterQuery(filters)}`);


const historyQuery = ({ limit, cursor }: { limit: number; cursor?: string }) => {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  return query.toString();
};

// The venue-relevant part of an event's history (SPM-186).
export const getEventBookingHistory = (eventId: number, options: { limit: number; cursor?: string }) =>
  apiRequest<{ history: EventHistoryEntry[]; nextCursor: string | null }>(`/venues/bookings/events/${eventId}/history?${historyQuery(options)}`);

export const getEventVenueBookings = (eventId: number) =>
  apiRequest<EventVenueBookings>(`/venues/bookings/events/${eventId}`);

// Venue Staff decisions (SPM-186, SPM-189). The status the user saw is sent
// back so a decision already made by someone else is refused (409
// BOOKING_ALREADY_DECIDED) instead of being overwritten.
export interface VenueBookingDecisionResult {
  message: string;
  booking: VenueBookingDetail;
  event: VenueBookingEvent;
}

export const approveVenueBooking = (bookingId: number, expectedStatus: string) =>
  apiRequest<VenueBookingDecisionResult>(`/venues/bookings/${bookingId}/approve`, {
    method: "POST",
    body: JSON.stringify({ expectedStatus }),
  });

export const rejectVenueBooking = (bookingId: number, reason: string, expectedStatus: string) =>
  apiRequest<VenueBookingDecisionResult>(`/venues/bookings/${bookingId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason, expectedStatus }),
  });

export const MAX_REJECTION_REASON_LENGTH = 1000;
