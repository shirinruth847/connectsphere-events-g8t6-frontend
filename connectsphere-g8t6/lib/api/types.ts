/**
 * Response shapes the frontend expects from the Express backend.
 * Field names follow the master and the live `event`/`venue` tables where they exist.
 * PROPOSED: no attendee discovery route exists yet; confirm these shapes when it is built.
 */

/** Decided by the backend from registration settings, window, capacity and queue (master §5.6). */
export type RegistrationAvailability =
  | "OPEN"
  | "FULL"
  | "NOT_YET_OPEN"
  | "CLOSED"
  | "NOT_ENABLED";

export interface AttendeeVenueSummary {
  venue_id: string;
  name: string;
  address: string;
}

export interface AttendeeRegistrationSummary {
  is_registration_enabled: boolean;
  availability: RegistrationAvailability;
  registration_capacity: number | null;
  /** Confirmed registrations plus active waitlist-offer holds. */
  allocated_count: number | null;
  /** Aggregate queue length only; never other attendees' details. */
  waitlist_count: number | null;
  registration_open_at: string | null;
  registration_close_at: string | null;
}

/**
 * Attendee-safe view of a confirmed, published event (master §5.3).
 * Internal planning data (owner, coordinator, requirements, comments, bookings,
 * technical arrangements) is intentionally absent, not merely hidden.
 */
export interface AttendeeEvent {
  /** String so UUIDs (master §6.1) and the dev database's integer IDs both fit. */
  event_id: string;
  title: string;
  description: string;
  start_datetime: string;
  end_datetime: string;
  venue: AttendeeVenueSummary | null;
  /** Not yet in the schema; cards fall back to a gradient when null. */
  image_url: string | null;
  registration: AttendeeRegistrationSummary;
}
