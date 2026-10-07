// Response shapes of the Express backend (connectsphere-events-g8t6-backend,
// README "Authentication (SPM-32)"). The backend is the source of truth.

import type { Role } from "@/lib/permissions/roles";

export type AuthenticatedUser = {
  user_id: string | number;
  email: string;
  name: string;
  role: Role;
  roles: Role[];
  home_path: string;
};

export type Page = {
  limit: number;
  offset: number;
  next_offset: number | null;
};

export type OrganiserEventRequest = {
  event_id: string | number;
  title: string | null;
  status: string;
  start_datetime: string | null;
  end_datetime: string | null;
  expected_attendance: number | null;
  organisation: { organisation_id: string | number; name: string } | null;
  is_owner: boolean;
  created_at: string;
  updated_at: string;
};

export type AttendeeEventStatus = "CONFIRMED" | "COMPLETED" | "CANCELLED" | "PENDING_CONFIRMATION";

export type AttendeeRegistration = {
  registration_id: string | number;
  registration_status: string;
  registered_at: string;
  event: {
    event_id: string | number;
    title: string;
    description: string | null;
    start_datetime: string | null;
    end_datetime: string | null;
    attendee_status: AttendeeEventStatus;
    venue: { name: string; address: string | null } | null;
  };
};
