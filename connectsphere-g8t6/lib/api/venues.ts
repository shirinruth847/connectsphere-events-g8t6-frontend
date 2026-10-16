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
  accessibilityFeatures: string | string[] | null;
  setupTurnaroundMinutes: number | null;
  rooms: VenueRoom[];
  detailStatus: "CURRENT" | "NOT_AVAILABLE" | "NOT_CHECKED";
  description: string | null;
  facilities: string[] | string;
  supportedLayouts: string[] | string;
  emergencyAccess: string | null;
  knownRestrictions: string[] | string;
};

export const getVenueCatalogue = () => apiRequest<{ venues: Venue[] }>("/venues");
