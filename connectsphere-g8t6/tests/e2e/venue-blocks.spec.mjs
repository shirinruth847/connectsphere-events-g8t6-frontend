import { test, expect } from "@playwright/test";
import { installConnectSphereMocks } from "./support.mjs";

// SPM-195: Venue Staff record, shorten and lift operational blocks on the
// venue page and restore affected bookings. The mocks return the shapes of the
// backend routes under /api/venues (backend README "Venue Blocks and Restoration").
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const VENUE = {
  venueId: 7, name: "Marina Conference Hall", address: "7 Bayfront Avenue", maxCapacity: 500, status: "ACTIVE", statusReason: null,
  contactPerson: "Alex Tan", contactEmail: "alex.tan@example.com", contactNumber: "+65 6123 4567", version: 3,
  createdAt: "2026-10-01T01:00:00.000Z", updatedAt: "2026-10-19T03:00:00.000Z",
  createdBy: { userId: 7, name: "Synthetic Venue Staff" }, updatedBy: { userId: 7, name: "Synthetic Venue Staff" },
};
const DETAILS = {
  description: "Harbour-view hall", facilities: [], accessibilityFeatures: [], supportedLayouts: ["Theater"], emergencyAccess: null,
  knownRestrictions: [], setupMinutes: 30, turnaroundMinutes: 0, version: 2, updatedAt: "2026-10-19T03:00:00.000Z",
};
const BLOCK_ID = "b".repeat(24);

const block = (overrides = {}) => ({
  blockId: BLOCK_ID, venueId: 7, reason: "MAINTENANCE", reasonLabel: "Maintenance",
  // 13:00–15:00 SGT on 10 March 2030.
  start: "2030-03-10T05:00:00.000Z", end: "2030-03-10T07:00:00.000Z",
  note: "Air conditioning repair", status: "ACTIVE", statusLabel: "Active", version: 1,
  createdAt: "2030-03-01T00:00:00.000Z", updatedAt: null, ...overrides,
});
const incident = (overrides = {}) => ({
  incidentId: 5, eventId: 42, requestId: "REQ-000042", eventTitle: "Synthetic planning forum", bookingId: 900, calendarHoldId: null,
  calendarBlockId: BLOCK_ID, venueId: 7, occupiedStart: "2030-03-10T05:30:00.000Z", occupiedEnd: "2030-03-10T08:00:00.000Z",
  status: "OPEN", statusLabel: "Open", resolution: null, resolutionLabel: null, createdAt: "2030-03-01T00:00:00.000Z", resolvedAt: null,
  block: block(), canBeRestored: false, restoreLabel: "Venue still blocked", ...overrides,
});

// The Venue Staff event view (GET /api/venues/bookings/events/42): the event
// and booking #900 at the venue, approved unless the journey says otherwise.
const VENUE_STAFF_EVENT = {
  eventId: 42, requestId: "REQ-000042", title: "Synthetic planning forum", status: "PLANNING", eventType: null, eventTypeLabel: null,
  purpose: "Planning", description: null, startDatetime: "2030-03-10T01:00:00.000Z", endDatetime: "2030-03-10T09:00:00.000Z",
  expectedAttendance: 120, preferredLayoutType: "THEATRE", accessibilityNeeds: [], submittedAt: null, organisationName: null, coordinatorName: "Synthetic Coordinator",
};
const BOOKING_VENUE = {
  venueId: 7, name: VENUE.name, address: VENUE.address, maxCapacity: 500, operatingHours: "08:00-22:00",
  setupTurnaroundMinutes: null, roomId: 70, roomLayoutType: "Theater", roomCapacity: 500,
};
const bookingDetail = (overrides = {}) => ({
  bookingId: 900, label: null, status: "APPROVED", statusLabel: "Approved", venueId: 7, venueName: VENUE.name,
  startDatetime: "2030-03-10T06:00:00.000Z", endDatetime: "2030-03-10T08:00:00.000Z", expectedAttendance: 120,
  submittedAt: "2030-02-01T00:00:00.000Z", venue: BOOKING_VENUE, layoutType: "Theater", requiredFacilities: [], accessibilityRequirements: [],
  specialRequirements: null, rejectionReason: null, ...overrides,
});

async function routeVenuePage(page, state) {
  await page.route("**/api/venues/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    let body = null;
    try { body = request.postDataJSON(); } catch { body = null; }
    state.requests.push({ method, path: url.pathname, body, key: request.headers()["idempotency-key"] ?? null });
    if (url.pathname === "/api/venues/7" && method === "GET") return json(route, { venue: VENUE, details: DETAILS, detailStatus: "CURRENT" });
    if (url.pathname === "/api/venues/7/photos") return json(route, { photos: [] });
    if (url.pathname === "/api/venues/7/blocks" && method === "GET") {
      if (state.blocksUnavailable) return json(route, { error: "The venue calendar cannot be read or saved right now, so nothing was changed. Try again shortly.", code: "VENUE_CALENDAR_UNAVAILABLE" }, 503);
      return json(route, { venueId: 7, venueName: VENUE.name, blocks: state.blocks, hasMore: Boolean(state.hasMore) });
    }
    if (url.pathname === "/api/venues/7/blocks" && method === "POST") {
      state.blocks = [{ ...block({ ...body }), incidents: [incident()] }];
      return json(route, { message: "Block recorded. One booking or hold is affected; their coordinators have been told.", block: block(body), incidents: [{ incidentId: 5, eventId: 42, requestId: "REQ-000042", bookingId: 900, calendarHoldId: null }], affectedEvents: [], replayed: false }, 201);
    }
    if (url.pathname === `/api/venues/7/blocks/${BLOCK_ID}` && method === "PUT") {
      const shortened = block({ start: body.start, end: body.end, version: 2 });
      state.blocks = [{ ...shortened, incidents: [incident({ block: shortened, canBeRestored: true, restoreLabel: "Can be restored" })] }];
      return json(route, { message: "Block shortened.", block: shortened, incidents: state.blocks[0].incidents, changed: true });
    }
    if (url.pathname === `/api/venues/7/blocks/${BLOCK_ID}/lift` && state.liftConflict) {
      return json(route, { error: "This block was changed after you loaded it. Reload it, then try again.", code: "BLOCK_VERSION_CONFLICT" }, 409);
    }
    if (url.pathname === `/api/venues/7/blocks/${BLOCK_ID}/lift`) {
      const lifted = block({ status: "LIFTED", statusLabel: "Lifted", version: state.blocks[0].version + 1 });
      state.blocks = [{ ...lifted, incidents: state.blocks[0].incidents }];
      return json(route, { message: "Block lifted.", block: lifted, incidents: state.blocks[0].incidents, changed: true });
    }
    if (url.pathname === "/api/venues/incidents/5/restore") {
      state.blocks = state.blocks.map((item) => ({
        ...item,
        incidents: item.incidents.map((entry) => ({ ...entry, status: "RESOLVED", statusLabel: "Resolved", resolution: "RESTORED", resolutionLabel: "Booking restored", canBeRestored: null, restoreLabel: null })),
      }));
      return json(route, { message: "Booking restored. The coordinator and organiser have been told.", incidentId: 5, eventId: 42, requestId: "REQ-000042", bookingId: 900, calendarHoldId: null, status: "RESOLVED", statusLabel: "Resolved", resolution: "RESTORED", resolutionLabel: "Booking restored", arrangementVersion: 4, changed: true });
    }
    return route.fallback();
  });
}


test("[SPM-195-TC-01][TC-02][TC-12][TC-13][TC-11] Venue Staff record, shorten and lift a block and restore the affected booking", async ({ page }) => {
  const state = { requests: [], blocks: [] };
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeVenuePage(page, state);
  await page.goto("/venues/7");

  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Operational blocks" }) });
  await expect(section.getByText("No current or upcoming blocks")).toBeVisible();

  // TC-02: nothing is sent until the form is complete.
  await section.getByRole("button", { name: "Record a block" }).click();
  const dialog = page.getByRole("dialog", { name: `Block ${VENUE.name}` });
  await dialog.getByRole("button", { name: "Record block" }).click();
  await expect(dialog.getByText("Choose a reason", { exact: true }).last()).toBeVisible();
  await expect(dialog.getByText("Enter a note for the coordinators and Venue Staff")).toBeVisible();
  expect(state.requests.filter((item) => item.method === "POST")).toHaveLength(0);

  await dialog.getByLabel("Reason").selectOption("MAINTENANCE");
  await dialog.getByLabel("Start (SGT)").fill("2030-03-10T15:00");
  await dialog.getByLabel("End (SGT)").fill("2030-03-10T13:00");
  await dialog.getByLabel("Note").fill("Air conditioning repair");
  await dialog.getByRole("button", { name: "Record block" }).click();
  await expect(dialog.getByText("The end must be after the start")).toBeVisible();
  await dialog.getByLabel("Start (SGT)").fill("2030-03-10T13:00");
  await dialog.getByLabel("End (SGT)").fill("2030-03-10T15:00");
  await dialog.getByRole("button", { name: "Record block" }).click();

  await expect(section.getByText("Block recorded. One booking or hold is affected")).toBeVisible();
  const created = state.requests.find((item) => item.method === "POST" && item.path === "/api/venues/7/blocks");
  expect(created.body).toEqual({ reason: "MAINTENANCE", start: "2030-03-10T05:00:00.000Z", end: "2030-03-10T07:00:00.000Z", note: "Air conditioning repair" });
  expect(created.key).toMatch(/^[0-9a-f-]{36}$/);

  // The affected booking is listed and cannot be restored while still blocked.
  const affected = section.getByRole("list", { name: "Current and upcoming blocks" });
  await expect(affected.getByText("REQ-000042", { exact: true })).toBeVisible();
  await expect(affected.getByText("Venue still blocked")).toBeVisible();
  await expect(affected.getByRole("button", { name: "Restore booking" })).toBeDisabled();
  await expect(affected.getByRole("link", { name: "Open booking" })).toHaveAttribute("href", "/events/42?booking=900");

  // TC-13: a longer block is refused in the form, without a request.
  await section.getByRole("button", { name: /Shorten the block/ }).click();
  const shorten = page.getByRole("dialog", { name: "Shorten this block" });
  await shorten.getByLabel("End (SGT)").fill("2030-03-10T16:00");
  await shorten.getByRole("button", { name: "Shorten block" }).click();
  await expect(shorten.getByText("Record a new block for additional time.")).toBeVisible();
  expect(state.requests.filter((item) => item.method === "PUT")).toHaveLength(0);

  // TC-12: shortening to 13:00–13:30 frees the booking (occupied from 13:30).
  await shorten.getByLabel("End (SGT)").fill("2030-03-10T13:30");
  await shorten.getByRole("button", { name: "Shorten block" }).click();
  await expect(section.getByText("Block shortened.")).toBeVisible();
  expect(state.requests.find((item) => item.method === "PUT").body).toEqual({ start: "2030-03-10T05:00:00.000Z", end: "2030-03-10T05:30:00.000Z", version: 1 });
  await expect(affected.getByText("Can be restored")).toBeVisible();

  // TC-11: Venue Staff confirm the restoration.
  await affected.getByRole("button", { name: "Restore booking" }).click();
  const confirm = page.getByRole("dialog", { name: "Restore this booking?" });
  await expect(confirm.getByText(/Booking #900 for REQ-000042/)).toBeVisible();
  await confirm.getByRole("button", { name: "Restore booking" }).click();
  await expect(section.getByText("Booking restored. The coordinator and organiser have been told.")).toBeVisible();
  expect(state.requests.find((item) => item.path === "/api/venues/incidents/5/restore").key).toMatch(/^[0-9a-f-]{36}$/);
  await expect(affected.getByText("Booking restored")).toBeVisible();

  // Lift asks first, then sends the loaded version.
  await section.getByRole("button", { name: /Lift the block/ }).click();
  await page.getByRole("dialog", { name: "Lift this block?" }).getByRole("button", { name: "Lift block" }).click();
  await expect(section.getByText("Block lifted.")).toBeVisible();
  expect(state.requests.find((item) => item.path.endsWith("/lift")).body).toEqual({ version: 2 });
  await expect(affected.getByText("Lifted", { exact: true })).toBeVisible();
});

test("[SPM-195-AC9] a lift from a stale page is refused once, explained and the blocks reloaded", async ({ page }) => {
  const state = { requests: [], blocks: [{ ...block(), incidents: [incident()] }], liftConflict: true };
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeVenuePage(page, state);
  await page.goto("/venues/7");
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Operational blocks" }) });
  await section.getByRole("button", { name: /Lift the block/ }).click();
  await page.getByRole("dialog", { name: "Lift this block?" }).getByRole("button", { name: "Lift block" }).click();

  await expect(section.getByText("This block was changed after you loaded it. Reload it, then try again. The blocks have been reloaded.")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Lift this block?" })).toBeHidden();
  // Not retried: one lift request, then a fresh list.
  expect(state.requests.filter((item) => item.path.endsWith("/lift"))).toHaveLength(1);
  expect(state.requests.filter((item) => item.method === "GET" && item.path === "/api/venues/7/blocks").length).toBeGreaterThanOrEqual(2);
});

test("[SPM-195-TC-14] the blocks section reports an unavailable calendar and offers a retry", async ({ page }) => {
  const state = { requests: [], blocks: [], blocksUnavailable: true };
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeVenuePage(page, state);
  await page.goto("/venues/7");
  await expect(page.getByText("The blocks could not be loaded")).toBeVisible();
  state.blocksUnavailable = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("No current or upcoming blocks")).toBeVisible();
});

test("[SPM-195-AC9][AC10] Venue Staff see an affected booking on the event view and restore it", async ({ page }) => {
  let restored = false;
  const booking = () => bookingDetail({
    incident: restored
      ? incident({ status: "RESOLVED", statusLabel: "Resolved", resolution: "RESTORED", resolutionLabel: "Booking restored", resolvedAt: "2030-03-02T00:00:00.000Z", canBeRestored: null, restoreLabel: null })
      : incident({ canBeRestored: true, restoreLabel: "Can be restored", block: block({ status: "LIFTED", statusLabel: "Lifted" }) }),
  });
  const restoreKeys = [];
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await page.route("**/api/venues/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/venues/bookings/events/42") {
      return json(route, {
        event: VENUE_STAFF_EVENT,
        bookings: [booking()],
      });
    }
    if (url.pathname === "/api/venues/incidents/5/restore") {
      restoreKeys.push(route.request().headers()["idempotency-key"]);
      if (restoreKeys.length === 1) {
        return json(route, { error: "Part of this booking's time, including setup and turnaround, is still blocked.", code: "INCIDENT_STILL_BLOCKED", blocks: [{ start: "2030-03-10T05:00:00.000Z", end: "2030-03-10T06:30:00.000Z", reasonLabel: "Maintenance" }] }, 409);
      }
      restored = true;
      return json(route, { message: "Booking restored. The coordinator and organiser have been told.", incidentId: 5, eventId: 42, requestId: "REQ-000042", bookingId: 900, calendarHoldId: null, status: "RESOLVED", statusLabel: "Resolved", resolution: "RESTORED", resolutionLabel: "Booking restored", arrangementVersion: 4, changed: true });
    }
    return route.fallback();
  });
  await page.goto("/events/42?booking=900");

  const card = page.getByRole("group", { name: "Venue unavailable" });
  await expect(card.getByText("Air conditioning repair")).toBeVisible();
  await expect(card.getByText("Can be restored")).toBeVisible();

  // A conflict found under the lock keeps the dialog open and names the block.
  await card.getByRole("button", { name: "Restore booking" }).click();
  const confirm = page.getByRole("dialog", { name: "Restore this booking?" });
  await confirm.getByRole("button", { name: "Restore booking" }).click();
  await expect(confirm.getByText(/Still blocked: .*Maintenance/)).toBeVisible();
  await confirm.getByRole("button", { name: "Restore booking" }).click();
  await expect(page.getByText("Booking restored. The coordinator and organiser have been told.")).toBeVisible();
  // A refused attempt gets a fresh key; nothing was saved by it.
  expect(new Set(restoreKeys).size).toBe(2);
  await expect(page.getByRole("group", { name: "Venue incident resolved" }).getByText("Booking restored")).toBeVisible();
});

test("[SPM-195] the blocks section works at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = { requests: [], blocks: [{ ...block(), incidents: [incident()] }] };
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeVenuePage(page, state);
  await page.goto("/venues/7");
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Operational blocks" }) });
  await expect(section.getByText("Venue still blocked")).toBeVisible();
  // The section adds no width of its own: removing it leaves the page as wide.
  // (The venue page is already wider than a phone screen before SPM-195.)
  const withSection = await page.evaluate(() => document.documentElement.scrollWidth);
  await section.evaluate((root) => root.remove());
  const withoutSection = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(withSection).toBe(withoutSection);
});

test("[SPM-195] an incident closed because its booking ended offers no restore, and a cut list says so", async ({ page }) => {
  const closed = incident({
    status: "RESOLVED", statusLabel: "Resolved", resolution: "RELEASED", resolutionLabel: "Booking released",
    resolvedAt: "2030-03-02T00:00:00.000Z", canBeRestored: null, restoreLabel: null,
  });
  const state = { requests: [], hasMore: true, blocks: [{ ...block(), incidents: [closed] }] };
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeVenuePage(page, state);
  await page.goto("/venues/7");
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "Operational blocks" }) });
  await expect(section.getByText("Booking released")).toBeVisible();
  await expect(section.getByRole("button", { name: "Restore booking" })).toHaveCount(0);
  await expect(section.getByText("Later blocks are not shown.", { exact: false })).toBeVisible();
  // The note is not one of the listed blocks.
  const list = section.getByRole("list", { name: "Current and upcoming blocks" });
  await expect(list.getByText("Later blocks are not shown.", { exact: false })).toHaveCount(0);
  await expect(list.locator(":scope > li")).toHaveCount(1);
});

test("[SPM-195] a rejected booking shows its incident as closed, not as available again", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await page.route("**/api/venues/bookings/events/42", (route) => json(route, {
    event: VENUE_STAFF_EVENT,
    bookings: [bookingDetail({
      status: "REJECTED", statusLabel: "Rejected", rejectionReason: "Venue under maintenance",
      incident: incident({ status: "RESOLVED", statusLabel: "Resolved", resolution: "RELEASED", resolutionLabel: "Booking released", resolvedAt: "2030-03-02T00:00:00.000Z", canBeRestored: null, restoreLabel: null }),
    })],
  }));
  await page.goto("/events/42?booking=900");
  const card = page.getByRole("group", { name: "Venue incident closed" });
  await expect(card.getByText("Booking released")).toBeVisible();
  await expect(card.getByText("Venue available again")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Restore booking" })).toHaveCount(0);
});
