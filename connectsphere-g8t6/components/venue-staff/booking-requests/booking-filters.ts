// Query string for GET /api/venues/bookings (SPM-181). Pure, so it is unit tested.

export interface VenueBookingFilters {
  status?: string;
  venueId?: string;
  eventId?: string;
  // A calendar day (YYYY-MM-DD) in Singapore time, matching lib/datetime.ts.
  date?: string;
}

const SGT_OFFSET = "+08:00";

const nextDay = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
};

// The day is sent as an instant range so the backend never guesses a time zone.
export const bookingFilterQuery = (filters: VenueBookingFilters) => {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.venueId) params.set("venueId", filters.venueId);
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.date && /^\d{4}-\d{2}-\d{2}$/.test(filters.date)) {
    params.set("from", `${filters.date}T00:00:00${SGT_OFFSET}`);
    params.set("to", `${nextDay(filters.date)}T00:00:00${SGT_OFFSET}`);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
};
