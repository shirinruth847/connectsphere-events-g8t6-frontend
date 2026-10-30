import { ApiError, apiRequest, getBackendBaseUrl } from "@/lib/api";
import { getAccessToken } from "@/lib/supabase";
import {
  availabilityQuery,
  managedVenueQuery,
  type AvailabilityParams,
  type CatalogueFilters,
  type ManagedVenueFilters,
} from "@/components/venues/venue-queries";

export type { AvailabilityParams, CatalogueFilters, ManagedVenueFilters };

export type VenueRoom = {
  roomId: number;
  layoutType: string;
  capacity: number;
};

export type DetailStatus = "CURRENT" | "NOT_AVAILABLE" | "NOT_CHECKED";

// A venue's catalogue fields; the event venue section (lib/api/event-venues.ts)
// adds each event's requirements and availability to them.
export type Venue = {
  venueId: number;
  name: string;
  address: string;
  maxCapacity: number;
  operatingHours: string | null;
  accessibilityFeatures: string[] | null;
  setupTurnaroundMinutes: number | null;
  // MongoDB owns these (Master 1.2, T27); null when not recorded or not checked,
  // absent from backends older than T27.
  setupMinutes?: number | null;
  turnaroundMinutes?: number | null;
  rooms: VenueRoom[];
  // The only signal for the detail fields below: CURRENT (detail read),
  // NOT_AVAILABLE (no detail recorded) or NOT_CHECKED (detail service down).
  detailStatus: DetailStatus;
  description: string | null;
  facilities: string[] | null;
  supportedLayouts: string[] | null;
  emergencyAccess: string | null;
  knownRestrictions: string[] | null;
  // Venues of the same building (a hall and its rooms), each bookable on its
  // own; only those still available. null when the detail service is down;
  // absent from older backends.
  relatedVenues?: { venueId: number; name: string }[] | null;
};

// ---------- maintenance (SPM-73, Venue Staff) ----------

export type VenueStatus = "ACTIVE" | "INACTIVE" | "UNDER_MAINTENANCE";

export const VENUE_STATUS_LABELS: Record<VenueStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  UNDER_MAINTENANCE: "Under Maintenance",
};

type Person = { userId: number; name: string | null } | null;

export type ManagedVenue = {
  venueId: number;
  name: string;
  address: string;
  maxCapacity: number;
  status: VenueStatus;
  statusReason: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  contactNumber: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: Person;
  updatedBy: Person;
  // MongoDB-owned minutes, on list rows only; null when not recorded or not checked.
  setupMinutes?: number | null;
  turnaroundMinutes?: number | null;
  // First gallery photo (T28), on list rows only; null when there is none or MongoDB is down.
  coverPhotoId?: string | null;
};

export type VenueDetails = {
  description: string | null;
  facilities: string[];
  accessibilityFeatures: string[];
  supportedLayouts: string[];
  emergencyAccess: string | null;
  knownRestrictions: string[];
  setupMinutes: number | null;
  turnaroundMinutes: number | null;
  version: number;
  updatedAt: string | null;
};

export type VenueInput = {
  name: string;
  address: string;
  maxCapacity: string | number;
  contactPerson: string;
  contactEmail: string;
  contactNumber: string;
};

export type VenueDetailsInput = Partial<Omit<VenueDetails, "version" | "updatedAt">> & { version: number };

export type ManagedVenueList = {
  venues: ManagedVenue[];
  nextOffset: number | null;
  detailsAvailable?: boolean;
  // true when a setup/turnaround sort could not read MongoDB and fell back to names.
  sortNotChecked?: boolean;
};

export const listManagedVenues = (filters: ManagedVenueFilters = {}, offset = 0) =>
  apiRequest<ManagedVenueList>(`/venues/manage${managedVenueQuery(filters, offset)}`);

export type VenueOption = { venueId: number; name: string; status: VenueStatus };

export const listVenueOptions = () => apiRequest<{ venues: VenueOption[] }>("/venues/manage/options");

export const getManagedVenue = (venueId: number) =>
  apiRequest<{ venue: ManagedVenue; details: VenueDetails | null; detailStatus: DetailStatus }>(`/venues/${venueId}`);

export const createVenue = (input: VenueInput & { status: VenueStatus; statusReason?: string }) =>
  apiRequest<{ message: string; venue: ManagedVenue }>("/venues", { method: "POST", body: JSON.stringify(input) });

export const updateVenue = (venueId: number, input: Partial<VenueInput> & { version: number }) =>
  apiRequest<{ message: string; venue: ManagedVenue; changed: boolean }>(`/venues/${venueId}`, { method: "PUT", body: JSON.stringify(input) });

export const changeVenueStatus = (
  venueId: number,
  input: { version: number; status: VenueStatus; reason?: string; confirmUpcomingBookings?: boolean },
) =>
  apiRequest<{ message: string; venue: ManagedVenue; changed: boolean; upcomingBookings: number }>(
    `/venues/${venueId}/status`,
    { method: "PUT", body: JSON.stringify(input) },
  );

export const updateVenueDetails = (venueId: number, input: VenueDetailsInput) =>
  apiRequest<{ message: string; details: VenueDetails; changed: boolean }>(`/venues/${venueId}/details`, {
    method: "PUT",
    body: JSON.stringify(input),
  });

// ---------- photo gallery (T28, SPM-181, Venue Staff) ----------

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_PHOTOS_PER_VENUE = 20;
export const MAX_CAPTION_LENGTH = 200;

export type VenuePhoto = {
  photoId: string;
  position: number;
  caption: string | null;
  contentType: string;
  size: number;
  uploadedAt: string;
  updatedAt: string | null;
  version: number;
};

export const listVenuePhotos = (venueId: number) => apiRequest<{ photos: VenuePhoto[] }>(`/venues/${venueId}/photos`);

export const addVenuePhoto = (venueId: number, file: File, caption?: string) =>
  apiRequest<{ message: string; photo: VenuePhoto }>(
    `/venues/${venueId}/photos${caption?.trim() ? `?caption=${encodeURIComponent(caption.trim())}` : ""}`,
    { method: "POST", body: file, headers: { "Content-Type": file.type } },
  );

export const updateVenuePhoto = (venueId: number, photoId: string, changes: { caption?: string | null; position?: number }) =>
  apiRequest<{ message: string; photo: VenuePhoto }>(`/venues/${venueId}/photos/${photoId}`, {
    method: "PUT",
    body: JSON.stringify(changes),
  });

export const replaceVenuePhotoImage = (venueId: number, photoId: string, file: File) =>
  apiRequest<{ message: string; photo: VenuePhoto }>(`/venues/${venueId}/photos/${photoId}/image`, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });

export const deleteVenuePhoto = (venueId: number, photoId: string) =>
  apiRequest<{ message: string }>(`/venues/${venueId}/photos/${photoId}`, { method: "DELETE" });

// Image bytes need the bearer token, so they are fetched and shown as a blob URL.
export const fetchVenuePhotoBlob = async (venueId: number, photoId: string, signal?: AbortSignal): Promise<Blob> => {
  const token = await getAccessToken();
  if (!token) throw new ApiError("Your session has expired. Sign in again to continue.", 401, "UNAUTHENTICATED");
  const response = await fetch(`${getBackendBaseUrl()}/api/venues/${venueId}/photos/${photoId}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!response.ok) throw new ApiError("The photo could not be loaded.", response.status);
  return response.blob();
};

// Checks done before upload; the backend repeats them from the file's bytes.
export const photoFileProblem = (file: File): string | null => {
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return "Upload a JPEG, PNG or WebP image.";
  if (file.size > MAX_PHOTO_BYTES) return "Images must be 2 MB or smaller.";
  if (file.size === 0) return "This file is empty.";
  return null;
};

// ---------- availability calendar (SPM-74) ----------

export type CalendarEntry = {
  entryId: string;
  type: "BOOKING" | "HOLD" | "BLOCK";
  status: string;
  label: string;
  blocking: boolean;
  start: string;
  end: string;
  occupiedStart: string;
  occupiedEnd: string;
  bookingId: number | null;
  eventId: number | null;
  requestId: string | null;
  eventTitle: string | null;
  holdExpiresAt: string | null;
  reason: string | null;
  reasonLabel: string | null;
  note: string | null;
  operatingHoursWarning: { message: string } | null;
};

export type PeriodCheck = {
  start: string;
  end: string;
  occupiedStart: string;
  occupiedEnd: string;
  availability: string;
  availabilityLabel: string;
  canRequest: boolean;
  conflicts: { entryId: string; type: string; occupiedStart: string; occupiedEnd: string }[];
  operatingHoursWarning: { message: string } | null;
};

export type VenueCalendar = {
  venueId: number;
  name: string;
  address: string;
  status: VenueStatus;
  operatingHours: string | null;
  setupMinutes: number | null;
  turnaroundMinutes: number | null;
  buffersRecorded: boolean;
  entries: CalendarEntry[];
  overlaps: { entryIds: [string, string] }[];
  freePeriods: { start: string; end: string }[];
  summary: string;
  summaryLabel: string;
  check: PeriodCheck | null;
};

export type VenueAvailability = { from: string; to: string; generatedAt?: string; venues: VenueCalendar[] };

export const getVenueAvailability = (params: AvailabilityParams) =>
  apiRequest<VenueAvailability>(`${params.eventId ? `/events/${params.eventId}/venue-availability` : "/venues/availability"}${availabilityQuery(params)}`);
