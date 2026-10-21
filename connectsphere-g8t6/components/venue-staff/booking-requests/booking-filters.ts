// Query string for GET /api/venues/bookings (SPM-181). Pure, so it is unit tested.

// "lastOpened" is per viewer: the list is fetched in the default order and the
// browser sorts it by its own record of when each booking was opened.
export type BookingSort = "default" | "date" | "attendance" | "lastOpened" | "lastEdited" | "alphabetical";
export type SortOrder = "asc" | "desc";

export const BOOKING_SORT_OPTIONS: { value: BookingSort; label: string }[] = [
  { value: "default", label: "Pending first" },
  { value: "date", label: "Date/time" },
  { value: "attendance", label: "Venue attendance" },
  { value: "lastOpened", label: "Last opened" },
  { value: "lastEdited", label: "Last edited" },
  { value: "alphabetical", label: "Alphabetical (event)" },
];

export interface VenueBookingFilters {
  status?: string;
  venueId?: string;
  eventId?: string;
  // A calendar day (YYYY-MM-DD) in Singapore time, matching lib/datetime.ts.
  date?: string;
  q?: string;
  sort?: BookingSort;
  order?: SortOrder;
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
  const text = filters.q?.trim();
  if (text) params.set("q", text);
  if (filters.sort && filters.sort !== "default" && filters.sort !== "lastOpened") params.set("sort", filters.sort);
  if (filters.order === "desc" && filters.sort !== "lastOpened") params.set("order", "desc");
  const query = params.toString();
  return query ? `?${query}` : "";
};

// The booking reference is the booking's own ID (venue_booking.booking_id).
export const formatBookingId = (bookingId: number) => `Booking #${bookingId}`;

// ---------- "last opened" (per viewer, kept in this browser) ----------

export type OpenedRecord = Record<string, number>;

const MAX_OPENED_RECORDS = 500;

export const openedStorageKey = (userId: number | string) => `connectsphere:venue-bookings-opened:${userId}`;

// Unreadable or tampered storage reads as "nothing opened yet".
export const parseOpenedRecord = (text: string | null): OpenedRecord => {
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(([key, time]) => /^\d+$/.test(key) && typeof time === "number" && Number.isFinite(time)),
    ) as OpenedRecord;
  } catch {
    return {};
  }
};

// Records an opening and keeps only the most recent MAX_OPENED_RECORDS.
export const recordOpened = (record: OpenedRecord, bookingId: number, now: number): OpenedRecord => {
  const next = Object.entries({ ...record, [String(bookingId)]: now })
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_OPENED_RECORDS);
  return Object.fromEntries(next);
};

// Most recently opened first by default; never-opened bookings always go last,
// keeping the order they arrived in.
export const sortByLastOpened = <T extends { bookingId: number }>(items: T[], record: OpenedRecord, order: SortOrder = "desc"): T[] =>
  items
    .map((item, index) => ({ item, index, time: record[String(item.bookingId)] }))
    .sort((a, b) => {
      if (a.time === undefined && b.time === undefined) return a.index - b.index;
      if (a.time === undefined) return 1;
      if (b.time === undefined) return -1;
      return order === "asc" ? a.time - b.time : b.time - a.time;
    })
    .map(({ item }) => item);
