import { apiRequest } from "@/lib/api";
import type { VenueIncident } from "@/lib/api/venue-blocks";
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

export interface VenueBookingDetail extends VenueBookingSummary {
  venue: {
    venueId: number;
    name: string;
    address: string;
    maxCapacity: number;
    operatingHours: string | null;
    setupTurnaroundMinutes: number | null;
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
}

export interface EventVenueBookings {
  event: VenueBookingEvent;
  bookings: VenueBookingDetail[];
}

export const listVenueBookings = (filters: VenueBookingFilters = {}) =>
  apiRequest<VenueBookingList>(`/venues/bookings${bookingFilterQuery(filters)}`);

export const getEventVenueBookings = (eventId: number) =>
  apiRequest<EventVenueBookings>(`/venues/bookings/events/${eventId}`);
