import { apiRequest } from "@/lib/api";

export type VenueRoom = {
  roomId: number;
  layoutType: string;
  capacity: number;
};

export type Venue = {
  venueId: number;
  name: string;
  address: string;
  maxCapacity: number;
  operatingHours: string | null;
  accessibilityFeatures: string[] | null;
  setupTurnaroundMinutes: number | null;
  rooms: VenueRoom[];
  // The only signal for the detail fields below: CURRENT (detail read),
  // NOT_AVAILABLE (no detail recorded) or NOT_CHECKED (detail service down).
  detailStatus: "CURRENT" | "NOT_AVAILABLE" | "NOT_CHECKED";
  description: string | null;
  facilities: string[] | null;
  supportedLayouts: string[] | null;
  emergencyAccess: string | null;
  knownRestrictions: string[] | null;
};

export type VenueCatalogue = {
  venues: Venue[];
  detailsAvailable: boolean;
};

export const getVenueCatalogue = () => apiRequest<VenueCatalogue>("/venues");
