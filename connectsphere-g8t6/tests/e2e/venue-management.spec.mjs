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

// Events with bookings ahead at a venue being taken out of service (T32).
const AFFECTED_EVENTS = [
  { eventId: 442, requestId: "REQ-000442", title: "Synthetic planning forum", status: "CONFIRMED", firstStart: "2026-11-04T01:00:00.000Z", bookings: 1 },
  { eventId: 443, requestId: "REQ-000443", title: "Synthetic product launch", status: "PLANNING", firstStart: "2026-11-09T02:00:00.000Z", bookings: 1 },
];

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

// A real 1x1 PNG, so the browser decodes and shows the photo.
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const photo = (photoId, position, caption = null, overrides = {}) => ({
  photoId, position, caption, contentType: "image/png", size: PNG_1PX.length,
  uploadedAt: "2026-10-21T01:00:00.000Z", updatedAt: null, version: 1, ...overrides,
});
const renumber = (photos) => photos.map((item, index) => ({ ...item, position: index }));

// The T28 gallery routes, held in state.photos (venue 7 only).
function routePhotos(route, url, method, body, state) {
  const [, , , venueId, , photoId, image] = url.pathname.split("/");
  if (venueId !== "7") return json(route, { error: "Venue not found.", code: "VENUE_NOT_FOUND" }, 404);
  if (state.photosUnavailable) return json(route, { error: "Venue photos cannot be loaded or saved right now. Try again shortly.", code: "VENUE_PHOTOS_UNAVAILABLE" }, 503);
  const index = state.photos.findIndex((item) => item.photoId === photoId);
  if (!photoId && method === "GET") return json(route, { photos: state.photos });
  if (!photoId && method === "POST") {
    if (state.photos.length >= 20) return json(route, { error: "This venue already has 20 photos. Delete one before adding another.", code: "PHOTO_LIMIT_REACHED" }, 409);
    const added = photo(`p${state.nextPhoto++}`, state.photos.length, url.searchParams.get("caption"), { contentType: body.contentType });
    state.photos.push(added);
    return json(route, { message: "Photo added.", photo: added }, 201);
  }
  if (index < 0) return json(route, { error: "Photo not found.", code: "PHOTO_NOT_FOUND" }, 404);
  const current = state.photos[index];
  if (method === "GET") return route.fulfill({ status: 200, contentType: "image/png", body: PNG_1PX });
  if (method === "DELETE") {
    state.photos = renumber(state.photos.filter((item) => item.photoId !== photoId));
    return json(route, { message: "Photo deleted." });
  }
  if (image) {
    state.photos[index] = { ...current, contentType: body.contentType, version: current.version + 1 };
    return json(route, { message: "Photo replaced.", photo: state.photos[index] });
  }
  const updated = { ...current, ...("caption" in body ? { caption: body.caption } : {}), version: current.version + 1 };
  const rest = state.photos.filter((item) => item.photoId !== photoId);
  rest.splice("position" in body ? Math.min(body.position, rest.length) : index, 0, updated);
  state.photos = renumber(rest);
  return json(route, { message: "Photo updated.", photo: state.photos.find((item) => item.photoId === photoId) });
}

async function routeManagement(page, state) {
  await page.route("**/api/venues**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    let body = null;
    try { body = request.postDataJSON(); } catch { body = { bytes: request.postDataBuffer()?.length ?? 0, contentType: request.headers()["content-type"] }; }
    state.requests.push({ method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });
    if (/^\/api\/venues\/\d+\/photos/.test(url.pathname)) return routePhotos(route, url, method, body, state);
    if (url.pathname === "/api/venues/manage") {
      const search = (url.searchParams.get("search") ?? "").toLowerCase();
      const status = url.searchParams.get("status");
      // One box searches name or location (SPM-186).
      const venues = state.venues.filter((venue) => (!search || `${venue.name} ${venue.address}`.toLowerCase().includes(search)) && (!status || venue.status === status));
      return json(route, { venues, nextOffset: null, sortNotChecked: Boolean(state.sortNotChecked) });
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
    if (url.pathname === "/api/venues/7/history") return json(route, { history: state.history ?? [], nextCursor: null });
    if (url.pathname === "/api/venues/7" && method === "GET") return json(route, { venue: state.venues[0], details: state.details, detailStatus: "CURRENT" });
    if (url.pathname === "/api/venues/7" && method === "PUT") {
      const body = request.postDataJSON();
      state.venues[0] = { ...state.venues[0], ...body, maxCapacity: Number(body.maxCapacity ?? state.venues[0].maxCapacity), version: state.venues[0].version + 1 };
      return json(route, { message: "Venue updated.", venue: state.venues[0], changed: true });
    }
    if (url.pathname === "/api/venues/7/status") {
      const body = request.postDataJSON();
      if (!body.confirmUpcomingBookings) {
        return json(route, { error: "This venue has 2 upcoming bookings. Confirm to continue; existing bookings and events are kept, and their coordinators and organisers are notified.", code: "VENUE_HAS_UPCOMING_BOOKINGS", upcomingBookings: 2, firstStart: "2026-11-04T01:00:00.000Z", affectedEvents: AFFECTED_EVENTS }, 409);
      }
      state.venues[0] = { ...state.venues[0], status: body.status, statusReason: body.reason ?? null, version: state.venues[0].version + 1 };
      return json(route, { message: "Venue status updated.", venue: state.venues[0], changed: true, upcomingBookings: 2, affectedEvents: AFFECTED_EVENTS });
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
  photos: [],
  nextPhoto: 1,
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

  // The closed Create dialog stays in the DOM, so the filters are scoped to their section.
  const filters = page.getByRole("region", { name: "Search, sort and filter venues" });
  // Search runs as you type: there is no Search button to press.
  await expect(filters.getByRole("button", { name: "Search", exact: true })).toHaveCount(0);
  await filters.getByLabel("Search", { exact: true }).fill("MARINA");
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
  // T32: the warning names the affected events and says who will be told.
  await expect(confirm.getByText(/coordinator and organiser are notified/)).toBeVisible();
  await expect(confirm.getByText("Synthetic planning forum")).toBeVisible();
  await expect(confirm.getByText("REQ-000443")).toBeVisible();
  await confirm.getByRole("button", { name: "Proceed and notify" }).click();
  await expect(page.getByText(/Venue status updated\. 2 upcoming booking\(s\) were kept\. The coordinators and organisers of 2 affected events were notified\./)).toBeVisible();
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

// ---------- SPM-72/74: no /venues page for coordinators or Leads ----------

for (const role of ["COORDINATOR", "COORDINATOR_LEAD"]) {
  test(`[SPM-72 AC1] ${role} cannot open /venues and gets no venue tab`, async ({ page }) => {
    const calls = [];
    await installConnectSphereMocks(page, { role });
    await page.route((url) => url.pathname.startsWith("/api/venues"), (route) => {
      calls.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 403, json: { error: "Forbidden", code: "FORBIDDEN" } });
    });
    await page.goto("/venues");

    await expect(page.getByText("This page is not available for your role.")).toBeVisible();
    await expect(page.getByRole("link", { name: /venues/i })).toHaveCount(0);
    expect(calls).toEqual([]);
  });
}

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
      bookingId: 110, eventId: 442, requestId: "REQ-000442", eventTitle: null,
      holdExpiresAt: null, reason: null, reasonLabel: null, note: null, operatingHoursWarning: null,
    },
    {
      entryId: "hold-h1", type: "HOLD", status: "ACTIVE", label: "Active hold", blocking: true,
      start: "2026-11-04T10:00:00.000Z", end: "2026-11-04T12:00:00.000Z",
      occupiedStart: "2026-11-04T10:00:00.000Z", occupiedEnd: "2026-11-04T12:00:00.000Z",
      bookingId: null, eventId: 2, requestId: "REQ-000002", eventTitle: null,
      holdExpiresAt: "2026-10-27T01:00:00.000Z", reason: null, reasonLabel: null, note: null,
      operatingHoursWarning: { message: "Occupied time 18:00–20:00 is outside operating hours (09:00-18:00)." },
    },
    {
      entryId: "hold-h2", type: "HOLD", status: "EXPIRED", label: "Expired hold", blocking: false,
      start: "2026-11-05T02:00:00.000Z", end: "2026-11-05T04:00:00.000Z",
      occupiedStart: "2026-11-05T02:00:00.000Z", occupiedEnd: "2026-11-05T04:00:00.000Z",
      bookingId: null, eventId: 1, requestId: "REQ-000001", eventTitle: null,
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
    if (url.pathname === "/api/venues/manage/options") {
      return json(route, { venues: [{ venueId: 45, name: "Synthetic Grand Hall", status: "ACTIVE" }, { venueId: 46, name: "Synthetic Seminar Centre", status: "ACTIVE" }] });
    }
    if (url.pathname === "/api/venues/availability") {
      requests.push(Object.fromEntries(url.searchParams));
      return json(route, body ?? { from: "2026-11-03T16:00:00.000Z", to: "2026-11-04T16:00:00.000Z", generatedAt: "2026-10-20T04:00:00.000Z", venues: [calendarVenue()] }, status);
    }
    return route.fallback();
  });
  return requests;
}

// The calendar opens on "today"; pinning the clock keeps these journeys on the
// mocked dates (Singapore time).
const pinClock = (page) => page.clock.setFixedTime(new Date("2026-11-03T10:00:00+08:00"));
const calendarRegion = (page) => page.getByRole("region", { name: "Venue availability calendar" });
const openDay = async (page, day) => {
  await calendarRegion(page).locator(".cal-month-day:not(.other-month) .cal-month-day-number").filter({ hasText: new RegExp(`^${day}$`) }).click();
};

// Coordinators see the same calendar inside each event's venue section
// (event-venue-options.spec.mjs); /venues is Venue Staff only.
test("[SPM-74 AC][TC2][TC6][TC7] the calendar timeline shows bookings, active and expired holds, and checks a period", async ({ page }) => {
  await pinClock(page);
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  const requests = await routeAvailability(page);
  await page.goto("/venues?view=availability");

  await expect(page.getByRole("heading", { name: "Venue Availability", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Availability", exact: true })).toHaveAttribute("aria-current", "page");
  // Venues are chosen in a dropdown (SPM-186).
  await page.getByRole("button", { name: /^Venues:/ }).click();
  await page.getByLabel("Synthetic Grand Hall").check();

  // Month view loads November with a week either side, without a Show button.
  await expect.poll(() => requests.at(-1)).toEqual({ from: "2026-10-25T00:00:00+08:00", to: "2026-12-08T00:00:00+08:00", venueId: "45" });
  await expect(calendarRegion(page)).toBeVisible();
  await expect(calendarRegion(page).getByRole("button", { name: "Month", exact: true })).toHaveAttribute("aria-pressed", "true");

  // Day timeline for 4 November: entries span the occupied range.
  await openDay(page, 4);
  await expect(calendarRegion(page).getByRole("button", { name: "Day", exact: true })).toHaveAttribute("aria-pressed", "true");
  // SPM-186: each entry names its event (here its request ID) and its start and end.
  await calendarRegion(page).getByLabel(/^09:30–12:45: Confirmed booking · REQ-000442 · Wed, 4 Nov 2026 · 10:00–12:00 SGT/).click();
  const details = page.getByRole("dialog", { name: "Synthetic Grand Hall" });
  await expect(details.getByText("Occupied Wed, 4 Nov 2026 · 09:30–12:45 SGT")).toBeVisible();
  await expect(details.getByText("Booking #110")).toBeVisible();
  await details.getByRole("button", { name: "Close dialog" }).click();

  await calendarRegion(page).getByLabel(/^18:00–20:00: Active hold · REQ-000002/).click();
  await expect(details.getByText(/Hold expires 27 Oct 2026/)).toBeVisible();
  await expect(details.getByText(/outside operating hours/)).toBeVisible();
  await details.getByRole("button", { name: "Close dialog" }).click();

  await calendarRegion(page).getByRole("button", { name: "Next" }).click();
  await calendarRegion(page).getByLabel(/^10:00–12:00: Expired hold · REQ-000001/).click();
  await expect(details.getByText(/Hold expired 19 Oct 2026/)).toBeVisible();
  await details.getByRole("button", { name: "Close dialog" }).click();

  // Check a requested period: the fields are always shown (SPM-186).
  await expect(page.getByText("Check a requested period")).toHaveCount(0);
  await page.getByLabel("Date", { exact: true }).fill("2026-11-04");
  await page.getByLabel("Start", { exact: true }).fill("12:44");
  await page.getByLabel("End", { exact: true }).fill("14:00");
  await page.getByRole("button", { name: "Check period" }).click();
  await expect.poll(() => requests.at(-1)).toMatchObject({ checkStart: "2026-11-04T12:44:00+08:00", checkEnd: "2026-11-04T14:00:00+08:00" });
  // The period shows on the timeline (developer request of 24 October 2026):
  // a labelled block whose hover detail gives the result, red where it overlaps.
  const requested = calendarRegion(page).locator(".cal-overlay--request .cal-overlay-label");
  await expect(requested).toHaveAttribute("aria-label", /^Requested period · 12:44–14:00\. .*Unavailable – booking/s);
  await expect(calendarRegion(page).locator(".cal-overlay--conflict")).not.toHaveCount(0);
});

test("[SPM-74] the calendar's year view loads the whole year and its legend names venues", async ({ page }) => {
  await pinClock(page);
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  const requests = await routeAvailability(page);
  await page.goto("/venues?view=availability&venueId=45");

  await expect(calendarRegion(page)).toBeVisible();
  // The page picks the venues, so the calendar has no second venue filter (SPM-186).
  await expect(calendarRegion(page).getByRole("button", { name: "All venues" })).toHaveCount(0);
  await expect(calendarRegion(page).getByText(/coordinator/i)).toHaveCount(0);

  await calendarRegion(page).getByRole("button", { name: "Year" }).click();
  await expect.poll(() => requests.at(-1)).toEqual({ from: "2026-01-01T00:00:00+08:00", to: "2027-01-01T00:00:00+08:00", venueId: "45" });
});

test("[SPM-74 TC8][TC14] blocks show reason and note; an empty range says the venue is available", async ({ page }) => {
  await pinClock(page);
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeAvailability(page, {
    body: {
      from: "2026-10-24T16:00:00.000Z",
      to: "2026-12-07T16:00:00.000Z",
      venues: [
        calendarVenue({
          venueId: 46, name: "Synthetic Seminar Centre", check: null, summary: "UNAVAILABLE_BLOCK",
          entries: [{
            entryId: "block-b1", type: "BLOCK", status: "ACTIVE", label: "Operational block", blocking: true,
            start: "2026-11-04T00:00:00.000Z", end: "2026-11-04T10:00:00.000Z", occupiedStart: "2026-11-04T00:00:00.000Z", occupiedEnd: "2026-11-04T10:00:00.000Z",
            bookingId: null, eventId: null, requestId: null, eventTitle: null, holdExpiresAt: null,
            reason: "MAINTENANCE", reasonLabel: "Maintenance", note: "Air-conditioning service", operatingHoursWarning: null,
          }],
        }),
        calendarVenue({ check: null, entries: [], freePeriods: [], summary: "AVAILABLE", summaryLabel: "Available" }),
      ],
    },
  });
  await page.goto("/venues?view=availability");
  await page.getByRole("button", { name: /^Venues:/ }).click();
  await page.getByLabel("Synthetic Grand Hall").check();
  await page.getByLabel("Synthetic Seminar Centre").check();

  await openDay(page, 4);
  await calendarRegion(page).getByLabel(/^08:00–18:00: Operational block · Maintenance/).click();
  const details = page.getByRole("dialog", { name: "Synthetic Seminar Centre" });
  await expect(details.getByText("Reason: Maintenance")).toBeVisible();
  await expect(details.getByText("Note: Air-conditioning service")).toBeVisible();
  await details.getByRole("button", { name: "Close dialog" }).click();
  // An empty range: the timeline shows no entry for the free venue, and there
  // are no summary cards (developer request of 24 October 2026).
  await expect(calendarRegion(page).getByLabel(/Synthetic Grand Hall/)).toHaveCount(0);
  await expect(page.getByLabel("Venue summaries")).toHaveCount(0);
});

test("[SPM-74 TC13] a failed load shows an error and no calendar, with retry", async ({ page }) => {
  await pinClock(page);
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeAvailability(page, { status: 503, body: { error: "Venue availability cannot be loaded right now, so no venue is shown as available. Try again shortly.", code: "AVAILABILITY_UNAVAILABLE" } });
  await page.goto("/venues?view=availability&venueId=45");

  await expect(page.getByText("Availability could not be loaded")).toBeVisible();
  await expect(page.getByText(/No venue is shown as available until availability loads/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(calendarRegion(page)).toHaveCount(0);
  await expect(page.getByText("Available", { exact: true })).toHaveCount(0);
});

test("[SPM-74 TC11] Coordinator Leads have no availability view", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR_LEAD" });
  await routeAvailability(page);
  await page.goto("/venues?view=availability");

  await expect(page.getByText("This page is not available for your role.")).toBeVisible();
  await expect(calendarRegion(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Availability", exact: true })).toHaveCount(0);
});

test("[SPM-74] the availability calendar works at mobile width", async ({ page }) => {
  await pinClock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeAvailability(page);
  await page.goto("/venues?view=availability&venueId=45");

  await expect(calendarRegion(page)).toBeVisible();
  await openDay(page, 4);
  await expect(calendarRegion(page).getByLabel(/Confirmed booking · REQ-000442 · /)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

// ---------- My Venues sort and layout (SPM-181 follow-up) ----------

for (const [label, sort] of [
  ["Capacity", "capacity"],
  ["Last updated", "updatedAt"],
  ["Setup time", "setupMinutes"],
  ["Turnaround time", "turnaroundMinutes"],
]) {
  test(`[TC-VENUE-181-60] My Venues sorts by ${label} in both directions`, async ({ page }) => {
    const state = managementState();
    await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
    await routeManagement(page, state);
    await page.goto("/venues");
    const filters = page.getByRole("region", { name: "Search, sort and filter venues" });
    const lastQuery = () => state.requests.filter((item) => item.path === "/api/venues/manage").at(-1)?.query;

    await filters.getByLabel("Sort by").selectOption({ label });
    await expect.poll(lastQuery).toEqual({ sort });
    await filters.getByRole("button", { name: "Ascending order. Switch to descending" }).click();
    await expect.poll(lastQuery).toEqual({ sort, order: "desc" });
  });
}

test("[TC-VENUE-181-61] alphabetical is the default My Venues order and can be reversed", async ({ page }) => {
  const state = managementState();
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues");
  const filters = page.getByRole("region", { name: "Search, sort and filter venues" });
  const lastQuery = () => state.requests.filter((item) => item.path === "/api/venues/manage").at(-1)?.query;

  await expect(filters.getByLabel("Sort by").locator("option:checked")).toHaveText("Alphabetical");
  await expect.poll(lastQuery).toEqual({});
  await filters.getByRole("button", { name: "Ascending order. Switch to descending" }).click();
  await expect.poll(lastQuery).toEqual({ order: "desc" });
});

test("[TC-VENUE-181-62][SPM-186] one search box finds a venue by its location as you type", async ({ page }) => {
  const state = managementState();
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues");
  const filters = page.getByRole("region", { name: "Search, sort and filter venues" });

  await expect(filters.getByLabel("Location")).toHaveCount(0);
  await filters.getByLabel("Search", { exact: true }).pressSequentially("7 Bay", { delay: 30 });
  await expect.poll(() => state.requests.filter((item) => item.path === "/api/venues/manage").at(-1)?.query).toEqual({ search: "7 Bay" });
});

test("[TC-VENUE-181-63] large icons show a picture area with name, location, capacity and update time; list hides it", async ({ page }) => {
  const state = managementState();
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues");
  const venues = page.getByRole("list", { name: "Venues" });
  await expect(venues.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByTestId("venue-tile-placeholder")).toHaveCount(0);

  await page.getByRole("button", { name: "Large icons" }).click();
  await expect(page.getByRole("button", { name: "Large icons" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("venue-tile-placeholder")).toHaveCount(2);
  const tile = venues.getByRole("listitem").filter({ hasText: "Marina Conference Hall" });
  for (const text of ["7 Bayfront Avenue", "500", "capacity", "Updated 19 Oct 2026"]) {
    await expect(tile.getByText(text, { exact: false }).first()).toBeVisible();
  }
  await expect(tile.getByRole("link")).toHaveAttribute("href", "/venues/7");

  // The choice is remembered in this browser.
  await page.reload();
  await expect(page.getByTestId("venue-tile-placeholder")).toHaveCount(2);
  await page.getByRole("button", { name: "List" }).click();
  await expect(page.getByTestId("venue-tile-placeholder")).toHaveCount(0);
});

test("[TC-VENUE-181-64] the list shows setup and turnaround times and warns when they cannot be sorted", async ({ page }) => {
  const state = managementState();
  state.venues[0] = { ...state.venues[0], setupMinutes: 30, turnaroundMinutes: 45 };
  state.sortNotChecked = true;
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues");

  await expect(page.getByText("Setup 30 min · Turnaround 45 min")).toBeVisible();
  await expect(page.getByText("Setup Not recorded · Turnaround Not recorded")).toBeVisible();
  await expect(page.getByText(/cannot be read right now, so venues are shown in name order/)).toBeVisible();
});

// ---------- photo gallery (T28, SPM-181) ----------

const gallery = (page) => page.getByRole("region", { name: "Photo gallery" });
const pngFile = (name) => ({ name, mimeType: "image/png", buffer: PNG_1PX });

// Drops files on the gallery the way a browser does for a drag from the desktop.
async function dropFiles(page, files) {
  const transfer = await page.evaluateHandle((items) => {
    const data = new DataTransfer();
    for (const { name, type, bytes } of items) data.items.add(new File([new Uint8Array(bytes)], name, { type }));
    return data;
  }, files.map(({ name, mimeType, buffer }) => ({ name, type: mimeType, bytes: [...buffer] })));
  const region = gallery(page);
  await region.dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(region.getByText("Drop photos to upload")).toBeVisible();
  await region.dispatchEvent("drop", { dataTransfer: transfer });
}

test("[TC-VENUE-181-150] should_show_the_gallery_above_the_venue_name_with_an_upload_area_when_there_are_no_photos", async ({ page }) => {
  const state = managementState();
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues/7");

  const region = gallery(page);
  await expect(region.getByText("No photos yet")).toBeVisible();
  await expect(region.getByText(/Drag photos here, or choose files/)).toBeVisible();
  const galleryBox = await region.boundingBox();
  const headingBox = await page.getByRole("heading", { name: "Marina Conference Hall", exact: true }).boundingBox();
  expect(galleryBox.y + galleryBox.height).toBeLessThanOrEqual(headingBox.y);
  await expect(region.getByText(/0 of 20 photos/)).toBeVisible();
  // No photo yet, so nothing to edit or delete.
  await expect(region.getByRole("button", { name: "Edit photo" })).toHaveCount(0);
  await expect(region.getByRole("button", { name: "Delete photo" })).toHaveCount(0);
});

test("[TC-VENUE-181-151] should_open_the_file_picker_when_upload_photos_is_clicked_or_activated_from_the_keyboard", async ({ page }) => {
  const state = managementState();
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues/7");
  const upload = gallery(page).getByRole("button", { name: "Upload photos" });
  await expect(upload).toBeVisible();

  const clicked = page.waitForEvent("filechooser");
  await upload.click();
  expect((await clicked).isMultiple()).toBe(true);

  const keyed = page.waitForEvent("filechooser");
  await upload.focus();
  await page.keyboard.press("Enter");
  await (await keyed).setFiles(pngFile("hall.png"));
  await expect(gallery(page).getByText("1 photo added. Use Edit photo to add a caption.")).toBeVisible();
  expect(state.photos).toHaveLength(1);
});

test("[TC-VENUE-181-152] should_upload_several_photos_at_once_when_files_are_chosen_or_dropped", async ({ page }) => {
  const state = managementState();
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues/7");
  const region = gallery(page);
  await expect(region.getByText("No photos yet")).toBeVisible();

  await page.getByTestId("gallery-add-input").setInputFiles([pngFile("hall.png"), pngFile("stage.png")]);
  await expect(region.getByText("2 photos added. Use Edit photo to add a caption.")).toBeVisible();
  await expect(region.getByText("2 / 2")).toBeVisible();
  const uploads = state.requests.filter((item) => item.method === "POST" && item.path === "/api/venues/7/photos");
  expect(uploads.map((item) => item.body)).toEqual([
    { bytes: PNG_1PX.length, contentType: "image/png" },
    { bytes: PNG_1PX.length, contentType: "image/png" },
  ]);

  await dropFiles(page, [pngFile("foyer.png"), { name: "notes.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") }]);
  await expect(region.getByText(/1 photo added\..*notes\.gif: Upload a JPEG, PNG or WebP image\./)).toBeVisible();
  expect(state.photos).toHaveLength(3);
});

test("[TC-VENUE-181-153] should_edit_caption_and_position_in_the_edit_photo_dialog", async ({ page }) => {
  const state = managementState();
  state.photos = [photo("p1", 0, "Front"), photo("p2", 1, null)];
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues/7");
  const region = gallery(page);
  await region.getByRole("button", { name: "Next photo" }).click();
  await expect(region.getByTestId("gallery-caption")).toHaveText("No caption");

  await region.getByRole("button", { name: "Edit photo" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit photo" });
  await expect(dialog.getByText("Photo 2 of 2")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save caption" })).toBeDisabled();
  await dialog.getByLabel("Caption (optional)").fill("Stage view");
  await dialog.getByRole("button", { name: "Save caption" }).click();
  await expect(region.getByText("Photo updated.")).toBeVisible();
  await expect(region.getByTestId("gallery-caption")).toHaveText("Stage view");

  await dialog.getByRole("button", { name: "Set as cover" }).click();
  await expect(region.getByText("Cover photo updated.")).toBeVisible();
  await expect(dialog.getByText("Photo 1 of 2 · cover photo")).toBeVisible();
  expect(state.photos.map((item) => item.caption)).toEqual(["Stage view", "Front"]);
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(region.getByText("Cover · 1 / 2")).toBeVisible();

  // Arrow keys and the previous/next buttons move through the gallery.
  await region.getByRole("group", { name: "Marina Conference Hall photos" }).press("ArrowRight");
  await expect(region.getByTestId("gallery-caption")).toHaveText("Front");
  await region.getByRole("button", { name: "Previous photo" }).click();
  await expect(region.getByTestId("gallery-caption")).toHaveText("Stage view");
});

test("[TC-VENUE-181-154] should_replace_from_the_edit_dialog_and_delete_only_after_confirmation", async ({ page }) => {
  const state = managementState();
  state.photos = [photo("p1", 0, "Front"), photo("p2", 1, "Back")];
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues/7");
  const region = gallery(page);
  await expect(region.getByTestId("gallery-caption")).toHaveText("Front");

  await region.getByRole("button", { name: "Edit photo" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit photo" });
  const chooser = page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: "Replace image" }).click();
  await (await chooser).setFiles(pngFile("front-new.png"));
  await expect(region.getByText("Photo replaced.")).toBeVisible();
  expect(state.requests.some((item) => item.method === "PUT" && item.path === "/api/venues/7/photos/p1/image")).toBe(true);

  await dialog.getByRole("button", { name: "Delete photo…" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this photo?" });
  await expect(confirm.getByText(/The next photo becomes the cover\./)).toBeVisible();
  await confirm.getByRole("button", { name: "Keep photo" }).click();
  expect(state.photos).toHaveLength(2);

  await region.getByRole("button", { name: "Delete photo" }).click();
  await page.getByRole("dialog", { name: "Delete this photo?" }).getByRole("button", { name: "Delete photo" }).click();
  await expect(region.getByText("Photo deleted.")).toBeVisible();
  await expect(region.getByTestId("gallery-caption")).toHaveText("Back");
  expect(state.photos.map((item) => item.photoId)).toEqual(["p2"]);
});

test("[TC-VENUE-181-155] should_refuse_wrong_files_and_disable_upload_when_the_gallery_is_full", async ({ page }) => {
  const state = managementState();
  state.photos = Array.from({ length: 20 }, (_, index) => photo(`p${index + 1}`, index, `Photo ${index + 1}`));
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues/7");
  const region = gallery(page);

  await expect(region.getByRole("button", { name: "Upload photos" })).toBeDisabled();
  await expect(region.getByText("20 photos (the limit). Delete one to add another.")).toBeVisible();

  state.photos = state.photos.slice(0, 19);
  await page.reload();
  await expect(region.getByRole("button", { name: "Upload photos" })).toBeEnabled();
  // Two chosen with one place left: one is sent, the other explained.
  await page.getByTestId("gallery-add-input").setInputFiles([pngFile("a.png"), pngFile("b.png")]);
  await expect(region.getByText(/1 photo added\..*1 photo not added: a venue can have 20 photos\./)).toBeVisible();

  state.photos = state.photos.slice(0, 1);
  await page.reload();
  await page.getByTestId("gallery-add-input").setInputFiles({ name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(region.getByText("huge.png: Images must be 2 MB or smaller.")).toBeVisible();
  expect(state.requests.filter((item) => item.method === "POST")).toHaveLength(1);
});

test("[TC-VENUE-181-156] should_keep_the_venue_page_usable_when_photos_are_unavailable", async ({ page }) => {
  const state = managementState();
  state.photosUnavailable = true;
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues/7");

  await expect(gallery(page).getByText("Photos unavailable")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Marina Conference Hall", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save venue record" })).toBeVisible();

  state.photosUnavailable = false;
  state.photos = [photo("p1", 0, "Front")];
  await gallery(page).getByRole("button", { name: "Try again" }).click();
  await expect(gallery(page).getByTestId("gallery-caption")).toHaveText("Front");
});

test("[TC-VENUE-181-157] should_show_the_cover_with_even_padding_and_no_overflow_on_large_icon_cards", async ({ page }) => {
  const state = managementState();
  state.photos = [photo("p1", 0, "Front")];
  state.venues[0] = { ...state.venues[0], coverPhotoId: "p1" };
  state.venues[1] = {
    ...state.venues[1],
    coverPhotoId: null,
    name: "Studio Room With An Unusually Long Venue Name For Testing Wrapping",
    address: "Level 12, Tower B, 1234 Extremely Long Boulevard Name, Singapore 018989",
  };
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues");
  await page.getByRole("button", { name: "Large icons" }).click();

  const venues = page.getByRole("list", { name: "Venues" });
  const withCover = venues.getByRole("listitem").filter({ hasText: "Marina Conference Hall" });
  await expect(withCover.getByTestId("venue-tile-cover")).toBeVisible();
  expect(await withCover.getByTestId("venue-tile-cover").evaluate((img) => img.naturalWidth)).toBe(1);
  const long = venues.getByRole("listitem").filter({ hasText: "Unusually Long" });
  await expect(long.getByTestId("venue-tile-placeholder")).toBeVisible();
  await expect(long.getByText("Under Maintenance")).toBeVisible();

  // Every card: nothing reaches past the card's edges, and the text block has the same padding.
  const cards = await venues.locator(":scope > li > a").evaluateAll((links) => links.map((link) => {
    const box = link.getBoundingClientRect();
    const overflow = [...link.querySelectorAll("*")].some((child) => child.getBoundingClientRect().right > box.right + 0.5);
    const body = link.lastElementChild;
    return { overflow, padding: getComputedStyle(body).padding };
  }));
  expect(cards.every((item) => !item.overflow)).toBe(true);
  expect(new Set(cards.map((item) => item.padding)).size).toBe(1);

  // The list layout shows no pictures at all.
  await page.getByRole("button", { name: "List" }).click();
  await expect(page.getByTestId("venue-tile-cover")).toHaveCount(0);
});

test("[TC-VENUE-181-158] should_flip_my_venues_order_with_the_funnel_toggle", async ({ page }) => {
  const state = managementState();
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues");
  const filters = page.getByRole("region", { name: "Search, sort and filter venues" });
  const lastQuery = () => state.requests.filter((item) => item.path === "/api/venues/manage").at(-1)?.query;

  await expect(filters.getByLabel("Order", { exact: true })).toHaveCount(0);
  await filters.getByRole("button", { name: "Ascending order. Switch to descending" }).click();
  await expect.poll(lastQuery).toMatchObject({ order: "desc" });
  await filters.getByRole("button", { name: "Descending order. Switch to ascending" }).click();
  await expect.poll(lastQuery).not.toHaveProperty("order");
});

test("[SPM-186-AC15] the venue page shows the venue's change history, newest first", async ({ page }) => {
  const state = managementState();
  state.history = [
    {
      historyId: 31, action: "VENUE_STATUS_CHANGED", actor: { userId: 5, name: "Synthetic Venue Staff", role: "VENUE_STAFF" },
      occurredAt: "2026-10-29T02:00:00.000Z", summary: "Venue status changed",
      changes: [{ field: "status", before: "ACTIVE", after: "UNDER_MAINTENANCE" }, { field: "statusReason", before: null, after: "Roof repairs" }],
      audience: "STAFF_ONLY",
    },
    {
      historyId: 30, action: "VENUE_CREATED", actor: { userId: 5, name: "Synthetic Venue Staff", role: "VENUE_STAFF" },
      occurredAt: "2026-10-20T02:00:00.000Z", summary: "Venue created", changes: [], audience: "STAFF_ONLY",
    },
  ];
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await page.goto("/venues/7");

  const history = page.getByRole("region", { name: "Change history" });
  await expect(history.getByRole("listitem")).toHaveCount(2);
  await expect(history.getByRole("listitem").first()).toContainText("Venue status changed");
  await expect(history.getByText("To: Under Maintenance")).toBeVisible();
  await expect(history.getByText("To: Roof repairs")).toBeVisible();
  await expect(history.getByText("Staff only").first()).toBeVisible();
});

test("[SPM-186] from a venue's availability, Manage venues returns to that venue", async ({ page }) => {
  const state = managementState();
  await pinClock(page);
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeManagement(page, state);
  await routeAvailability(page);
  await page.goto("/venues/7");

  await page.getByRole("link", { name: "View availability" }).click();
  await expect(page).toHaveURL(/view=availability&venueId=7&from=venue$/);
  await page.getByRole("link", { name: "Manage venues", exact: true }).click();
  await expect(page).toHaveURL(/\/venues\/7$/);
  await expect(page.getByRole("heading", { name: "Marina Conference Hall", exact: true })).toBeVisible();
});
