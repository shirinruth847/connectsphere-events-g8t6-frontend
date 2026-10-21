import { apiRequest } from "@/lib/api";
import {
  availabilityQuery,
  catalogueQuery,
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
};

export type VenueCatalogue = {
  venues: Venue[];
  detailsAvailable: boolean;
  filtersNotChecked?: string[];
};

export const getVenueCatalogue = (filters: CatalogueFilters = {}) =>
  apiRequest<VenueCatalogue>(`/venues${catalogueQuery(filters)}`);

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

export const listManagedVenues = (filters: ManagedVenueFilters = {}, offset = 0) =>
  apiRequest<{ venues: ManagedVenue[]; nextOffset: number | null }>(`/venues/manage${managedVenueQuery(filters, offset)}`);

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
  bookingReference: string | null;
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
  apiRequest<VenueAvailability>(`/venues/availability${availabilityQuery(params)}`);
