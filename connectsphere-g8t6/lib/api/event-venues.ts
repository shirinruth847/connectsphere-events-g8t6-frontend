// SPM-72/74/75: choosing a venue. Field names, codes and statuses are the
// backend's (GET /api/events/:id/venue-options, the photo routes under
// /api/venues/options and PUT /api/events/:id/venue-suggestion);
// do not rename them here.
import { ApiError, apiRequest, getBackendBaseUrl } from "@/lib/api";
import { getAccessToken } from "@/lib/supabase";
import { venueOptionsQuery, type VenueOptionsQuery } from "@/components/venues/venue-queries";
import type { Venue, VenuePhoto } from "@/lib/api/venues";
import type { VenueSuggestion } from "@/lib/api/event-workspace";
import type { VenueIncident } from "@/lib/api/venue-blocks";
import type { BookingChecks } from "@/lib/api/venue-bookings";

export type { VenueOptionsQuery };

// MET is shown light green and anything else light grey; NOT_CHECKED means the
// detail service could not be read (or, for availability, the event has no dates), never
// that the venue fails.
export type RequirementStatus = "MET" | "UNMET" | "NOT_CHECKED";

export interface VenueRequirement {
  key: string;
  label: string;
  status: RequirementStatus;
  detail: string;
}

export interface VenueConflict {
  type: "BOOKING" | "HOLD" | "BLOCK";
  label: string;
  occupiedStart: string;
  occupiedEnd: string;
  holdExpiresAt: string | null;
  reasonLabel: string | null;
  // SPM-185 AC2: which part of the entry the event's occupied time hits, e.g.
  // "Venue's turnaround period (12:00pm–12:45pm) overlaps with your requested
  // booking, …". Null when the backend does not explain the conflict.
  message?: string | null;
}

export interface VenueOptionAvailability {
  // The backend's code and label; NOT_CHECKED and NO_DATES are never shown as available.
  status: string;
  label: string;
  occupiedStart: string | null;
  occupiedEnd: string | null;
  conflicts: VenueConflict[];
  operatingHoursWarning: { message: string } | null;
}

export type EventVenueOption = Omit<Venue, "setupTurnaroundMinutes"> & {
  coverPhotoId: string | null;
  availability: VenueOptionAvailability;
  requirements: VenueRequirement[];
  unmetCount: number;
  allRequirementsMet: boolean;
};

export interface VenueOptionsResult {
  venues: EventVenueOption[];
  detailsAvailable: boolean;
  availabilityChecked: boolean;
  filtersNotChecked: string[];
}

// One of the organiser's ranked venue choices; option is null when the venue
// is no longer available.
export interface PreferredVenue {
  rank: number;
  venueId: number;
  name: string | null;
  option: EventVenueOption | null;
}

export interface EventVenueOptions extends VenueOptionsResult {
  event: {
    eventId: number;
    requestId: string;
    startDatetime: string | null;
    endDatetime: string | null;
    expectedAttendance: number | null;
    preferredLayoutType: string | null;
    accessibilityNeeds: string[];
  };
  preferredVenues: PreferredVenue[];
  canSuggestVenue: boolean;
}

// Lists the venue section needs are always arrays and its flags booleans, so
// a partial or unexpected reply shows as "no venues" instead of crashing the
// event page (which also holds the lifecycle and safety review panels).
export const getEventVenueOptions = async (eventId: number, query: VenueOptionsQuery = {}): Promise<EventVenueOptions> => {
  const data = await apiRequest<Partial<EventVenueOptions>>(`/events/${eventId}/venue-options${venueOptionsQuery(query)}`);
  return {
    ...data,
    venues: Array.isArray(data.venues) ? data.venues : [],
    preferredVenues: Array.isArray(data.preferredVenues) ? data.preferredVenues : [],
    filtersNotChecked: Array.isArray(data.filtersNotChecked) ? data.filtersNotChecked : [],
    detailsAvailable: data.detailsAvailable === true,
    availabilityChecked: data.availabilityChecked === true,
    canSuggestVenue: data.canSuggestVenue === true,
  } as EventVenueOptions;
};

// Read-only photos of an available venue, for coordinators and Leads.
export const listSelectableVenuePhotos = (venueId: number) =>
  apiRequest<{ photos: VenuePhoto[] }>(`/venues/options/${venueId}/photos`);

// Image bytes need the bearer token, so they are fetched and shown as a blob URL.
export const fetchSelectableVenuePhotoBlob = async (venueId: number, photoId: string, signal?: AbortSignal): Promise<Blob> => {
  const token = await getAccessToken();
  if (!token) throw new ApiError("Your session has expired. Sign in again to continue.", 401, "UNAUTHENTICATED");
  const response = await fetch(`${getBackendBaseUrl()}/api/venues/options/${venueId}/photos/${photoId}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!response.ok) throw new ApiError("The photo could not be loaded.", response.status);
  return response.blob();
};

// PUT /api/events/:id/venue-suggestion. version is the suggestion version the
// coordinator loaded (0 when there was none); a retry reuses the same key.
export const suggestEventVenue = (eventId: number, venueId: number, version: number, idempotencyKey: string) =>
  apiRequest<{ message: string; suggestion: VenueSuggestion }>(`/events/${eventId}/venue-suggestion`, {
    method: "PUT",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ venueId, version }),
  });

// ---------- venue booking requests (SPM-179) ----------
// GET and POST /api/events/:id/venue-bookings. Field names, states and labels
// are the backend's; the frontend never maps booking states itself.

export interface EventVenueBooking {
  bookingId: number;
  venueId: number;
  venueName: string | null;
  label: string | null;
  status: string;
  statusLabel: string;
  isPrimary: boolean;
  start: string;
  end: string;
  occupiedStart: string | null;
  occupiedEnd: string | null;
  expectedAttendance: number | null;
  layout: string | null;
  requiredFacilities: string[];
  accessibilityNeeds: string[];
  specialRequirements: string | null;
  rejectionReason: string | null;
  requestedAt: string | null;
  // SPM-195: the open incident, otherwise the latest resolved one.
  incident?: VenueIncident | null;
}

export interface EventVenueBookingList {
  eventId: number;
  requestId: string;
  eventType: string | null;
  eventTypeLabel: string | null;
  // True only for the assigned coordinator while the event is in planning.
  canRequestVenueBookings: boolean;
  bookings: EventVenueBooking[];
}

export interface VenueBookingRequestItem {
  venueId: number;
  label: string;
  // ISO 8601 with an offset.
  start: string;
  end: string;
  expectedAttendance: number;
  layout: string;
  requiredFacilities: string[];
  accessibilityNeeds: string[];
  specialRequirements: string | null;
  isPrimary: boolean;
}

export interface VenueBookingRequestResult {
  message: string;
  eventId: number;
  requestId: string;
  arrangementVersion: number;
  bookings: Array<Omit<EventVenueBooking, "rejectionReason" | "requestedAt"> & { index: number }>;
  // Advisory only (Master 5.4): Venue Staff decide.
  warnings: Array<{ index: number; venueId: number; messages: string[] }>;
  replayed?: boolean;
}

// The booking error body's extra fields: which venue section it belongs to and,
// for a clash, the conflicting periods.
export interface VenueBookingErrorDetails {
  bookingIndex?: number;
  venueId?: number;
  conflicts?: Array<{ index?: number; type: string; occupiedStart: string; occupiedEnd: string }>;
}

export const listEventVenueBookings = async (eventId: number): Promise<EventVenueBookingList> => {
  const data = await apiRequest<Partial<EventVenueBookingList>>(`/events/${eventId}/venue-bookings`);
  return {
    eventId: data.eventId ?? eventId,
    requestId: data.requestId ?? "",
    eventType: data.eventType ?? null,
    eventTypeLabel: data.eventTypeLabel ?? null,
    canRequestVenueBookings: data.canRequestVenueBookings === true,
    bookings: Array.isArray(data.bookings) ? data.bookings : [],
  };
};

// A retry of the same form reuses its key, so a double click or a network
// retry cannot create a second set of bookings (AC13).
// POST /api/events/:id/venue-bookings/check (SPM-186): each booking's checks
// for its own venue and window while the request is prepared. Advisory: nothing
// is saved; sending the request checks again under the venue lock. A booking
// whose venue or times are not valid yet comes back unchecked with its fields.
export type VenueBookingCheckResult = BookingChecks & { index: number; checked: boolean; fields: Record<string, string> };

export const checkEventVenueBookings = (eventId: number, bookings: VenueBookingRequestItem[]) =>
  apiRequest<{ bookings: VenueBookingCheckResult[] }>(`/events/${eventId}/venue-bookings/check`, {
    method: "POST",
    body: JSON.stringify({ bookings }),
  });

export const requestEventVenueBookings = (eventId: number, bookings: VenueBookingRequestItem[], idempotencyKey: string) =>
  apiRequest<VenueBookingRequestResult>(`/events/${eventId}/venue-bookings`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ bookings }),
  });
