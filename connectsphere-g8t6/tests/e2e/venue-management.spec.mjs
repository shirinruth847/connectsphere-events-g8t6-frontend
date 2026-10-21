import { test, expect } from "@playwright/test";
import { installConnectSphereMocks } from "./support.mjs";

// SPM-73 venue maintenance, the SPM-72 catalogue search, and the SPM-74
// availability calendar, with the shapes the backend returns.
const managed = (venueId, name, overrides = {}) => ({
  venueId,
  name,
  address: `${venueId} Bayfront Avenue`,
  maxCapacity: 500,
  status: "ACTIVE",
  statusReason: null,
  contactPerson: "Alex Tan",
  contactEmail: "alex.tan@example.com",
  contactNumber: "+65 6123 4567",
  version: 3,
  createdAt: "2026-10-01T01:00:00.000Z",
  updatedAt: "2026-10-19T03:00:00.000Z",
  createdBy: { userId: 7, name: "Synthetic Venue Staff" },
  updatedBy: { userId: 7, name: "Synthetic Venue Staff" },
  ...overrides,
});

const details = (overrides = {}) => ({
  description: "Harbour-view hall",
  facilities: ["Stage", "PA system"],
  accessibilityFeatures: ["Step-free access"],
  supportedLayouts: ["Theater"],
  emergencyAccess: "North exit",
  knownRestrictions: [],
  setupMinutes: 30,
  turnaroundMinutes: 45,
  version: 2,
  updatedAt: "2026-10-19T03:00:00.000Z",
  ...overrides,
});

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function routeManagement(page, state) {
  await page.route("**/api/venues**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    state.requests.push({ method, path: url.pathname, query: Object.fromEntries(url.searchParams), body: request.postDataJSON?.() ?? null });
    if (url.pathname === "/api/venues/manage") {
      const search = (url.searchParams.get("search") ?? "").toLowerCase();
      const status = url.searchParams.get("status");
      const venues = state.venues.filter((venue) => (!search || venue.name.toLowerCase().includes(search)) && (!status || venue.status === status));
      return json(route, { venues, nextOffset: null });
    }
    if (url.pathname === "/api/venues" && method === "POST") {
      const body = request.postDataJSON();
      if (state.venues.some((venue) => venue.name.toLowerCase() === body.name.toLowerCase())) {
        return json(route, { error: "A venue with this name already exists", code: "VENUE_NAME_TAKEN", fields: { name: "A venue with this name already exists" } }, 409);
      }
      const created = managed(900, body.name, { address: body.address, maxCapacity: Number(body.maxCapacity), status: body.status, version: 1 });
      state.venues.push(created);
      return json(route, { message: "Venue created.", venue: created }, 201);
    }
    if (url.pathname === "/api/venues/900/details") return json(route, { message: "Venue details updated.", details: details({ version: 1 }), changed: true });
    if (url.pathname === "/api/venues/7" && method === "GET") return json(route, { venue: state.venues[0], details: state.details, detailStatus: "CURRENT" });
    if (url.pathname === "/api/venues/7" && method === "PUT") {
      const body = request.postDataJSON();
      state.venues[0] = { ...state.venues[0], ...body, maxCapacity: Number(body.maxCapacity ?? state.venues[0].maxCapacity), version: state.venues[0].version + 1 };
      return json(route, { message: "Venue updated.", venue: state.venues[0], changed: true });
    }
    if (url.pathname === "/api/venues/7/status") {
      const body = request.postDataJSON();
      if (!body.confirmUpcomingBookings) {
        return json(route, { error: "This venue has 2 upcoming bookings. Confirm to continue; existing bookings are kept.", code: "VENUE_HAS_UPCOMING_BOOKINGS", upcomingBookings: 2, firstStart: "2026-11-04T01:00:00.000Z" }, 409);
      }
      state.venues[0] = { ...state.venues[0], status: body.status, statusReason: body.reason ?? null, version: state.venues[0].version + 1 };
      return json(route, { message: "Venue status updated.", venue: state.venues[0], changed: true, upcomingBookings: 2 });
    }
    if (url.pathname === "/api/venues/7/details") {
      const body = request.postDataJSON();
      state.details = { ...state.details, ...body, version: state.details.version + 1 };
      return json(route, { message: "Venue details updated.", details: state.details, changed: true });
    }
    return route.fallback();
  });
}

const managementState = () => ({
  requests: [],
  venues: [managed(7, "Marina Conference Hall"), managed(8, "Studio Room", { status: "UNDER_MAINTENANCE", statusReason: "Lift repair" })],
  details: details(),
});

test("[SPM-73 TC1][TC11] Venue Staff list, search, filter and create venues from My Venues", async ({ page }) => {
  const state = managementState();
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues");

  await expect(page.getByRole("heading", { name: "My Venues", exact: true })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main Navigation", exact: true });
  await expect(nav.getByRole("link", { name: "My Venues", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("list", { name: "Venues" }).getByRole("listitem")).toHaveCount(2);

  // The closed Create dialog stays in the DOM, so the filters are scoped to their form.
  const filters = page.getByRole("form", { name: "Search and filter venues" });
  await filters.getByLabel("Venue name").fill("MARINA");
  await filters.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("list", { name: "Venues" }).getByRole("listitem")).toHaveCount(1);
  await filters.getByLabel("Status").selectOption("UNDER_MAINTENANCE");
  await expect(page.getByText("No venues match these filters")).toBeVisible();
  await filters.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("list", { name: "Venues" }).getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Create venue" }).click();
  const dialog = page.getByRole("dialog", { name: "Create venue" });
  await dialog.getByRole("button", { name: "Save venue" }).click();
  await expect(dialog.getByText("Venue name is required")).toBeVisible();
  await expect(dialog.getByText("Capacity is required")).toBeVisible();
  expect(state.requests.filter((item) => item.method === "POST")).toHaveLength(0);

  await dialog.getByLabel("Venue name").fill("Harbour Pavilion");
  await dialog.getByLabel("Address / location").fill("10 Bayfront Avenue");
  await dialog.getByLabel("Capacity").fill("10.5");
  await dialog.getByLabel("Contact person").fill("Alex Tan");
  await dialog.getByLabel("Contact email").fill("alex.tan@example.com");
  await dialog.getByLabel("Setup time (minutes)").fill("30");
  await dialog.getByLabel("Turnaround time (minutes)").fill("45");
  await dialog.getByRole("button", { name: "Save venue" }).click();
  await expect(dialog.getByText("Capacity must be a positive whole number")).toBeVisible();
  await dialog.getByLabel("Capacity").fill("500");
  await dialog.getByRole("button", { name: "Save venue" }).click();

  await expect(page.getByText("Venue “Harbour Pavilion” created with Active status.")).toBeVisible();
  expect(state.requests.find((item) => item.path === "/api/venues/900/details").body).toEqual({ version: 0, setupMinutes: 30, turnaroundMinutes: 45 });
  await expect(page.getByRole("list", { name: "Venues" }).getByRole("listitem")).toHaveCount(3);
});

test("[SPM-73 TC5] a duplicate name is refused with the backend message", async ({ page }) => {
  const state = managementState();
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues");
  await page.getByRole("button", { name: "Create venue" }).click();
  const dialog = page.getByRole("dialog", { name: "Create venue" });
  await dialog.getByLabel("Venue name").fill("marina conference hall");
  await dialog.getByLabel("Address / location").fill("1 Road");
  await dialog.getByLabel("Capacity").fill("100");
  await dialog.getByLabel("Contact person").fill("Alex Tan");
  await dialog.getByLabel("Contact number").fill("+65 6123 4567");
  await dialog.getByRole("button", { name: "Save venue" }).click();

  await expect(dialog.getByText("A venue with this name already exists").first()).toBeVisible();
  expect(state.venues).toHaveLength(2);
});

test("[SPM-73 TC10] cancelling creation asks first and saves nothing", async ({ page }) => {
  const state = managementState();
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues");
  await page.getByRole("button", { name: "Create venue" }).click();
  const dialog = page.getByRole("dialog", { name: "Create venue" });
  await dialog.getByLabel("Venue name").fill("Unsaved Hall");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog.getByText("Discard this venue?")).toBeVisible();
  await dialog.getByRole("button", { name: "Discard and close" }).click();

  await expect(dialog).toBeHidden();
  expect(state.requests.filter((item) => item.method === "POST")).toHaveLength(0);
  await expect(page.getByRole("list", { name: "Venues" }).getByRole("listitem")).toHaveCount(2);
});

test("[SPM-73 TC6][TC8] Venue Staff edit a venue and confirm deactivation with upcoming bookings", async ({ page }) => {
  const state = managementState();
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues/7");

  await expect(page.getByRole("heading", { name: "Marina Conference Hall", exact: true })).toBeVisible();
  await page.getByLabel("Capacity").fill("650");
  await page.getByLabel("Contact number").fill("+65 6999 0000");
  await page.getByRole("button", { name: "Save venue record" }).click();
  await expect(page.getByText("Venue updated.")).toBeVisible();
  expect(state.requests.find((item) => item.method === "PUT" && item.path === "/api/venues/7").body).toEqual({ maxCapacity: "650", contactNumber: "+65 6999 0000", version: 3 });

  await page.getByLabel("Status", { exact: true }).selectOption("INACTIVE");
  await page.getByRole("button", { name: "Deactivate venue" }).click();
  const confirm = page.getByRole("dialog", { name: "Deactivate this venue?" });
  await confirm.getByRole("button", { name: "Confirm" }).click();
  await expect(confirm.getByText("This venue has upcoming bookings")).toBeVisible();
  await expect(confirm.getByText(/2 upcoming bookings/)).toBeVisible();
  await confirm.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/Venue status updated\. 2 upcoming booking\(s\) were kept\./)).toBeVisible();
  expect(state.venues[0].status).toBe("INACTIVE");
});

test("[T16] setup and turnaround times are set once, then locked", async ({ page }) => {
  const state = managementState();
  state.details = details({ setupMinutes: 30, turnaroundMinutes: null });
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues/7");

  const setup = page.getByLabel("Setup time (minutes)");
  const turnaround = page.getByLabel("Turnaround time (minutes)");
  await expect(setup).toHaveValue("30");
  await expect(setup).toHaveAttribute("readonly", "");
  await expect(page.getByText("Set once; it cannot be changed.")).toHaveCount(1);
  await expect(turnaround).toBeEditable();

  await turnaround.fill("45");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Venue details updated.")).toBeVisible();
  expect(state.requests.find((item) => item.path === "/api/venues/7/details").body).toEqual({ version: 2, turnaroundMinutes: 45 });

  await expect(page.getByLabel("Turnaround time (minutes)")).toHaveAttribute("readonly", "");
  await expect(page.getByText("Set once; it cannot be changed.")).toHaveCount(2);
});

test("[SPM-73 TC9] other roles cannot open venue management", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await page.goto("/venues/7");
  await expect(page.getByRole("heading", { name: "Marina Conference Hall" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save venue record" })).toHaveCount(0);
});

// ---------- SPM-72 catalogue search ----------

test("[SPM-72] coordinators search and filter the catalogue", async ({ page }) => {
  const requests = [];
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await page.route((url) => url.pathname === "/api/venues", (route) => {
    requests.push(Object.fromEntries(new URL(route.request().url()).searchParams));
    return json(route, { venues: [], detailsAvailable: true, filtersNotChecked: [] });
  });
  await page.goto("/venues");

  await page.getByLabel("Search", { exact: true }).fill("Hall");
  await page.getByLabel("Minimum capacity").fill("200");
  await page.getByLabel("Facility").fill("Stage");
  await page.getByRole("button", { name: "Apply filters" }).click();

  await expect.poll(() => requests.at(-1)).toEqual({ search: "Hall", minCapacity: "200", facility: "Stage" });
  await expect(page.getByText("No venues match these filters")).toBeVisible();
});

// ---------- SPM-74 availability calendar ----------

const calendarVenue = (overrides = {}) => ({
  venueId: 45,
  name: "Synthetic Grand Hall",
  address: "1 Harbourfront Walk",
  status: "ACTIVE",
  operatingHours: "09:00-18:00",
  setupMinutes: 30,
  turnaroundMinutes: 45,
  buffersRecorded: true,
  entries: [
    {
      entryId: "booking-110", type: "BOOKING", status: "APPROVED", label: "Confirmed booking", blocking: true,
      start: "2026-11-04T02:00:00.000Z", end: "2026-11-04T04:00:00.000Z",
      occupiedStart: "2026-11-04T01:30:00.000Z", occupiedEnd: "2026-11-04T04:45:00.000Z",
      bookingId: 110, bookingReference: "VB-000110", eventId: 442, requestId: "REQ-000442", eventTitle: null,
      holdExpiresAt: null, reason: null, reasonLabel: null, note: null, operatingHoursWarning: null,
    },
    {
      entryId: "hold-h1", type: "HOLD", status: "ACTIVE", label: "Active hold", blocking: true,
      start: "2026-11-04T10:00:00.000Z", end: "2026-11-04T12:00:00.000Z",
      occupiedStart: "2026-11-04T10:00:00.000Z", occupiedEnd: "2026-11-04T12:00:00.000Z",
      bookingId: null, bookingReference: null, eventId: 2, requestId: "REQ-000002", eventTitle: null,
      holdExpiresAt: "2026-10-27T01:00:00.000Z", reason: null, reasonLabel: null, note: null,
      operatingHoursWarning: { message: "Occupied time 18:00–20:00 is outside operating hours (09:00-18:00)." },
    },
    {
      entryId: "hold-h2", type: "HOLD", status: "EXPIRED", label: "Expired hold", blocking: false,
      start: "2026-11-05T02:00:00.000Z", end: "2026-11-05T04:00:00.000Z",
      occupiedStart: "2026-11-05T02:00:00.000Z", occupiedEnd: "2026-11-05T04:00:00.000Z",
      bookingId: null, bookingReference: null, eventId: 1, requestId: "REQ-000001", eventTitle: null,
      holdExpiresAt: "2026-10-19T01:00:00.000Z", reason: null, reasonLabel: null, note: null, operatingHoursWarning: null,
    },
  ],
  overlaps: [],
  freePeriods: [{ start: "2026-11-03T16:00:00.000Z", end: "2026-11-04T01:30:00.000Z" }],
  summary: "UNAVAILABLE_BOOKING",
  summaryLabel: "Partly unavailable",
  check: {
    start: "2026-11-04T04:44:00.000Z", end: "2026-11-04T06:00:00.000Z",
    occupiedStart: "2026-11-04T04:14:00.000Z", occupiedEnd: "2026-11-04T06:45:00.000Z",
    availability: "UNAVAILABLE_BOOKING", availabilityLabel: "Unavailable – booking", canRequest: false,
    conflicts: [{ entryId: "booking-110", type: "BOOKING", occupiedStart: "2026-11-04T01:30:00.000Z", occupiedEnd: "2026-11-04T04:45:00.000Z" }],
    operatingHoursWarning: null,
  },
  ...overrides,
});

async function routeAvailability(page, { status = 200, body } = {}) {
  const requests = [];
  await page.route("**/api/venues**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/venues") {
      return json(route, { venues: [{ venueId: 45, name: "Synthetic Grand Hall", address: "1 Road" }, { venueId: 46, name: "Synthetic Seminar Centre", address: "2 Road" }], detailsAvailable: true, filtersNotChecked: [] });
    }
    if (url.pathname === "/api/venues/availability") {
      requests.push(Object.fromEntries(url.searchParams));
      return json(route, body ?? { from: "2026-11-03T16:00:00.000Z", to: "2026-11-04T16:00:00.000Z", generatedAt: "2026-10-20T04:00:00.000Z", venues: [calendarVenue()] }, status);
    }
    return route.fallback();
  });
  return requests;
}

test("[SPM-74 AC][TC2][TC6][TC7] the calendar distinguishes bookings, active and expired holds and checks a period", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const requests = await routeAvailability(page);
  await page.goto("/venues?view=availability");

  await expect(page.getByRole("heading", { name: "Venue Availability", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Availability", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByLabel("Synthetic Grand Hall").check();
  await page.getByLabel("From (SGT)").fill("2026-11-04");
  await page.getByLabel("Days").selectOption("1");
  await page.getByText("Check a requested period").click();
  await page.getByLabel("Date", { exact: true }).fill("2026-11-04");
  await page.getByLabel("Start", { exact: true }).fill("12:44");
  await page.getByLabel("End", { exact: true }).fill("14:00");
  await page.getByRole("button", { name: "Show availability" }).click();

  await expect.poll(() => requests.at(-1)).toEqual({
    from: "2026-11-04T00:00:00+08:00",
    to: "2026-11-05T00:00:00+08:00",
    venueId: "45",
    checkStart: "2026-11-04T12:44:00+08:00",
    checkEnd: "2026-11-04T14:00:00+08:00",
  });
  const entries = page.getByRole("list", { name: "Calendar entries for Synthetic Grand Hall" });
  await expect(entries.getByText("Confirmed booking")).toBeVisible();
  await expect(entries.getByText("VB-000110")).toBeVisible();
  await expect(entries.getByText("Occupied Wed, 4 Nov 2026 · 09:30–12:45 SGT")).toBeVisible();
  await expect(entries.getByText("Active hold")).toBeVisible();
  await expect(entries.getByText(/Hold expires 27 Oct 2026/)).toBeVisible();
  await expect(entries.getByText("Expired hold")).toBeVisible();
  await expect(entries.getByText(/Hold expired 19 Oct 2026/)).toBeVisible();
  await expect(entries.getByText(/outside operating hours/)).toBeVisible();
  await expect(page.getByText("Requested period: Unavailable – booking")).toBeVisible();
  await expect(page.getByText(/This period cannot be requested/)).toBeVisible();
});

test("[SPM-74 TC8][TC14] blocks show reason and note; an empty range says the venue is available", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeAvailability(page, {
    body: {
      from: "2026-11-03T16:00:00.000Z",
      to: "2026-11-04T16:00:00.000Z",
      venues: [
        calendarVenue({
          venueId: 46, name: "Synthetic Seminar Centre", check: null, summary: "UNAVAILABLE_BLOCK",
          entries: [{
            entryId: "block-b1", type: "BLOCK", status: "ACTIVE", label: "Operational block", blocking: true,
            start: "2026-11-04T00:00:00.000Z", end: "2026-11-04T10:00:00.000Z", occupiedStart: "2026-11-04T00:00:00.000Z", occupiedEnd: "2026-11-04T10:00:00.000Z",
            bookingId: null, bookingReference: null, eventId: null, requestId: null, eventTitle: null, holdExpiresAt: null,
            reason: "MAINTENANCE", reasonLabel: "Maintenance", note: "Air-conditioning service", operatingHoursWarning: null,
          }],
        }),
        calendarVenue({ check: null, entries: [], freePeriods: [], summary: "AVAILABLE", summaryLabel: "Available" }),
      ],
    },
  });
  await page.goto("/venues?view=availability");
  await page.getByLabel("Synthetic Grand Hall").check();
  await page.getByLabel("Synthetic Seminar Centre").check();
  await page.getByRole("button", { name: "Show availability" }).click();

  await expect(page.getByText("Reason: Maintenance")).toBeVisible();
  await expect(page.getByText("Note: Air-conditioning service")).toBeVisible();
  await expect(page.getByText("No bookings, holds or blocks in this period. The venue is available for the whole range.")).toBeVisible();
});

test("[SPM-74 TC13] a failed load shows an error and no availability, with retry", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeAvailability(page, { status: 503, body: { error: "Venue availability cannot be loaded right now, so no venue is shown as available. Try again shortly.", code: "AVAILABILITY_UNAVAILABLE" } });
  await page.goto("/venues?view=availability&venueId=45");
  await page.getByRole("button", { name: "Show availability" }).click();

  await expect(page.getByText("Availability could not be loaded")).toBeVisible();
  await expect(page.getByText(/No venue is shown as available until availability loads/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByText("Available", { exact: true })).toHaveCount(0);
});

test("[SPM-74 TC11] Coordinator Leads have no availability view", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR_LEAD" });
  await routeAvailability(page);
  await page.goto("/venues?view=availability");

  await expect(page.getByRole("heading", { name: "Venue Catalogue", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show availability" })).toHaveCount(0);
});

test("[SPM-74] the availability view works at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeAvailability(page);
  await page.goto("/venues?view=availability&venueId=45");
  await page.getByRole("button", { name: "Show availability" }).click();

  await expect(page.getByText("Confirmed booking", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
