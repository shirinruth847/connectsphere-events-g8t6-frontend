// SPM-72/74/75: choosing a venue. Field names, codes and statuses are the
// backend's (GET /api/events/:id/venue-options, the photo routes under
// /api/venues/options and PUT /api/events/:id/venue-suggestion);
// do not rename them here.
import { ApiError, apiRequest, getBackendBaseUrl } from "@/lib/api";
import { getAccessToken } from "@/lib/supabase";
import { venueOptionsQuery, type VenueOptionsQuery } from "@/components/venues/venue-queries";
import type { Venue, VenuePhoto } from "@/lib/api/venues";
import type { VenueSuggestion } from "@/lib/api/event-workspace";

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

export const getEventVenueOptions = (eventId: number, query: VenueOptionsQuery = {}) =>
  apiRequest<EventVenueOptions>(`/events/${eventId}/venue-options${venueOptionsQuery(query)}`);

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
