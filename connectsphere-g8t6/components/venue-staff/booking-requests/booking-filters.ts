// Query string for GET /api/venues/bookings (SPM-181). Pure, so it is unit tested.

// "lastAccessed" is the later of this viewer's last opening (kept in the
// browser) and the booking's last edit, so the list is fetched in the default
// order and sorted in the browser.
export type BookingSort = "default" | "date" | "attendance" | "lastAccessed" | "alphabetical";
export type SortOrder = "asc" | "desc";

export const BOOKING_SORT_OPTIONS: { value: BookingSort; label: string }[] = [
  { value: "default", label: "Request status" },
  { value: "date", label: "Date/time" },
  { value: "attendance", label: "Venue attendance" },
  { value: "lastAccessed", label: "Last accessed" },
  { value: "alphabetical", label: "Alphabetical (event)" },
];

// The backend refuses a longer search (GET /api/venues/bookings `q`).
export const MAX_SEARCH_LENGTH = 100;

export interface VenueBookingFilters {
  status?: string;
  venueId?: string;
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
  if (filters.date && /^\d{4}-\d{2}-\d{2}$/.test(filters.date)) {
    params.set("from", `${filters.date}T00:00:00${SGT_OFFSET}`);
    params.set("to", `${nextDay(filters.date)}T00:00:00${SGT_OFFSET}`);
  }
  const text = filters.q?.trim();
  if (text) params.set("q", text);
  if (filters.sort && filters.sort !== "default" && filters.sort !== "lastAccessed") params.set("sort", filters.sort);
  if (filters.order === "desc" && filters.sort !== "lastAccessed") params.set("order", "desc");
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

// When this viewer last accessed a booking: the later of their last opening
// and the booking's last edit. Null when neither is known.
export const lastAccessedAt = (item: { bookingId: number; updatedAt?: string | null }, record: OpenedRecord): number | null => {
  const opened = record[String(item.bookingId)];
  const edited = item.updatedAt ? Date.parse(item.updatedAt) : Number.NaN;
  const times = [opened, edited].filter((time): time is number => typeof time === "number" && Number.isFinite(time));
  return times.length ? Math.max(...times) : null;
};

// Most recently accessed first by default; bookings with no known access go
// last, keeping the order they arrived in.
export const sortByLastAccessed = <T extends { bookingId: number; updatedAt?: string | null }>(items: T[], record: OpenedRecord, order: SortOrder = "desc"): T[] =>
  items
    .map((item, index) => ({ item, index, time: lastAccessedAt(item, record) }))
    .sort((a, b) => {
      if (a.time === null && b.time === null) return a.index - b.index;
      if (a.time === null) return 1;
      if (b.time === null) return -1;
      return (order === "asc" ? a.time - b.time : b.time - a.time) || a.index - b.index;
    })
    .map(({ item }) => item);
