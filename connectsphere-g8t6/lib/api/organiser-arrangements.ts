import { apiRequest } from "@/lib/api";
import type { RoundStatus } from "@/lib/api/safety-reviews";

type Section<T> = ({ status: "READY" } & T) | { status: "UNAVAILABLE" };

export interface VenueImpact {
  status: "AFFECTED" | "RESOLVED" | "UNKNOWN" | "NOT_REPORTED" | "INACTIVE";
  message: string | null;
  nextAction: string | null;
}

interface VenueArrangement {
  label: string | null;
  venueName: string;
  startDatetime: string;
  endDatetime: string;
  status: string;
  impact: VenueImpact;
}

export interface VenueBooking extends VenueArrangement {
  bookingId: number;
  venueId: number;
  isPrimary: boolean;
}

export interface VenueHold extends VenueArrangement {
  holdId: string;
  holdExpiresAt: string | null;
}

export interface EquipmentItem {
  equipmentId: number;
  name: string;
  quantity: number;
}

// One technical request with its lines (SPM-286/287). requestId is null for
// equipment lines recorded without a request (seed and legacy data).
export interface TechnicalArrangement {
  requestId: number | null;
  status: string;
  supportRequired: boolean | null;
  createdAt?: string | null;
  decidedAt?: string | null;
  equipment: EquipmentItem[];
}

export interface OrganiserArrangements {
  venues: Section<{
    holdsStatus: "READY" | "UNAVAILABLE";
    availabilityStatus: "READY" | "UNAVAILABLE";
    primaryVenueStatus: "READY" | "NOT_DESIGNATED";
    bookings: VenueBooking[];
    holds: VenueHold[];
  }>;
  technical: Section<{
    supportStatus: "READY" | "UNAVAILABLE";
    requirements: EquipmentItem[];
    requests: TechnicalArrangement[];
  }>;
  safety: Section<{
    reviews: Array<{
      reviewId: number;
      round: number;
      status: RoundStatus;
      isCurrent: boolean;
      organiserComment: string | null;
      submittedAt: string;
      decidedAt: string | null;
    }>;
  }>;
}

export const getOrganiserArrangements = (eventId: number) =>
  apiRequest<{ arrangements: OrganiserArrangements }>(`/events/${eventId}/arrangements`);
