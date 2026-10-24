// Query strings for the venue APIs. Pure (no imports), so they are unit tested.

// layout, facility and accessibility take several values (developer request
// of 25 October 2026), sent as repeated parameters: any of the layouts, all
// of the facilities and accessibility features.
export interface CatalogueFilters {
  search?: string;
  minCapacity?: string;
  layout?: string | string[];
  facility?: string | string[];
  accessibility?: string | string[];
}

export type ManagedVenueSort = "name" | "capacity" | "updatedAt" | "setupMinutes" | "turnaroundMinutes";

export const MANAGED_VENUE_SORT_OPTIONS: { value: ManagedVenueSort; label: string }[] = [
  { value: "name", label: "Alphabetical" },
  { value: "capacity", label: "Capacity" },
  { value: "updatedAt", label: "Last updated" },
  { value: "setupMinutes", label: "Setup time" },
  { value: "turnaroundMinutes", label: "Turnaround time" },
];

export interface ManagedVenueFilters {
  search?: string;
  location?: string;
  status?: string;
  sort?: ManagedVenueSort;
  order?: "asc" | "desc";
}

export interface AvailabilityParams {
  // A Singapore calendar day (YYYY-MM-DD) and how many days to show.
  date: string;
  days: number;
  venueIds: number[];
  // An optional period to check, in the same day/time inputs the form uses.
  // endDate (optional) lets the period span several days: a multi-day event
  // occupies the venue as one block, nights included (Master 5.4.1).
  check?: { date: string; startTime: string; endTime: string; endDate?: string } | null;
}

const SGT_OFFSET = "+08:00";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const build = (entries: [string, string | string[] | number | undefined | null][]) => {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    const values = Array.isArray(value) ? value : [value];
    const seen = new Set<string>();
    for (const item of values) {
      const text = item === undefined || item === null ? "" : String(item).trim();
      if (text && !seen.has(text.toLowerCase())) {
        seen.add(text.toLowerCase());
        params.append(key, text);
      }
    }
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

// The venue section of an event (SPM-72/74). Required facilities rank and
// highlight venues; they never filter them out.
export type VenueOptionSort = "match" | "name" | "capacity" | "setup" | "turnaround";

export const VENUE_OPTION_SORT_OPTIONS: { value: VenueOptionSort; label: string }[] = [
  { value: "match", label: "Best match" },
  { value: "name", label: "Name" },
  { value: "capacity", label: "Capacity" },
  { value: "setup", label: "Setup time" },
  { value: "turnaround", label: "Turnaround time" },
];

export interface VenueOptionsQuery extends CatalogueFilters {
  requiredFacilities?: string;
  sort?: VenueOptionSort;
  order?: "asc" | "desc";
}

// "Projector, stage ,, Projector" → "Projector,stage"
const facilityList = (text: string | undefined) =>
  [...new Set((text ?? "").split(",").map((item) => item.trim()).filter(Boolean))].join(",");

export const venueOptionsQuery = (query: VenueOptionsQuery) =>
  build([
    ["search", query.search],
    ["minCapacity", query.minCapacity],
    ["layout", query.layout],
    ["facility", query.facility],
    ["accessibility", query.accessibility],
    ["requiredFacilities", facilityList(query.requiredFacilities)],
    ["sort", query.sort && query.sort !== "match" ? query.sort : undefined],
    ["order", query.order === "desc" ? "desc" : undefined],
  ]);

export const managedVenueQuery = (filters: ManagedVenueFilters, offset = 0) =>
  build([
    ["search", filters.search],
    ["location", filters.location],
    ["status", filters.status],
    ["sort", filters.sort && filters.sort !== "name" ? filters.sort : undefined],
    ["order", filters.order === "desc" ? "desc" : undefined],
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
    // A later end date ends the period that day; otherwise an end time at or
    // before the start time ends on the next day.
    const endDate = check.endDate && DATE.test(check.endDate) && check.endDate > check.date
      ? check.endDate
      : check.endTime <= check.startTime ? addDays(check.date, 1) : check.date;
    params.set("checkEnd", sgtInstant(endDate, check.endTime));
  }
  return `?${params.toString()}`;
};
