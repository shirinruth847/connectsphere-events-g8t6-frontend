// Query strings for the venue APIs. Pure (no imports), so they are unit tested.

export interface CatalogueFilters {
  search?: string;
  minCapacity?: string;
  layout?: string;
  facility?: string;
  accessibility?: string;
}

export interface ManagedVenueFilters {
  search?: string;
  location?: string;
  status?: string;
}

export interface AvailabilityParams {
  // A Singapore calendar day (YYYY-MM-DD) and how many days to show.
  date: string;
  days: number;
  venueIds: number[];
  // An optional period to check, in the same day/time inputs the form uses.
  check?: { date: string; startTime: string; endTime: string } | null;
}

const SGT_OFFSET = "+08:00";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const build = (entries: [string, string | number | undefined | null][]) => {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    const text = value === undefined || value === null ? "" : String(value).trim();
    if (text) params.set(key, text);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
};

export const catalogueQuery = (filters: CatalogueFilters) =>
  build([
    ["search", filters.search],
    ["minCapacity", filters.minCapacity],
    ["layout", filters.layout],
    ["facility", filters.facility],
    ["accessibility", filters.accessibility],
  ]);

export const managedVenueQuery = (filters: ManagedVenueFilters, offset = 0) =>
  build([
    ["search", filters.search],
    ["location", filters.location],
    ["status", filters.status],
    ["offset", offset > 0 ? offset : undefined],
  ]);

export const addDays = (date: string, days: number) => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};

export const sgtInstant = (date: string, time = "00:00") => `${date}T${time}:00${SGT_OFFSET}`;

// Returns "" when the inputs are incomplete, so nothing partial is requested.
export const availabilityQuery = ({ date, days, venueIds, check }: AvailabilityParams) => {
  if (!DATE.test(date) || !Number.isInteger(days) || days < 1) return "";
  const params = new URLSearchParams();
  params.set("from", sgtInstant(date));
  params.set("to", sgtInstant(addDays(date, days)));
  if (venueIds.length) params.set("venueId", venueIds.join(","));
  if (check && DATE.test(check.date) && TIME.test(check.startTime) && TIME.test(check.endTime)) {
    params.set("checkStart", sgtInstant(check.date, check.startTime));
    // An end time at or before the start time ends on the next day.
    const endDate = check.endTime <= check.startTime ? addDays(check.date, 1) : check.date;
    params.set("checkEnd", sgtInstant(endDate, check.endTime));
  }
  return `?${params.toString()}`;
};
