import { test, expect } from "@playwright/test";
import { attachScreenshot, installConnectSphereMocks, requirement, routeVenuePhotos, venueOption as venue } from "./support.mjs";

// SPM-188: the coordinator confirms an active hold as a booking (AC9), sees the
// time left on a hold about to expire (AC8), and is offered ways forward when
// another event's hold is in the way of a booking (AC4). SPM-200: each
// accessibility need is ticked or crossed in the venue details. The mocks
// return the backend's shapes; every rule is the backend's.

// The event runs 09:00–17:00 SGT on Sunday 10 March 2030; the hold covers 10:00–12:00.
const START = "2030-03-10T01:00:00.000Z";
const END = "2030-03-10T09:00:00.000Z";
const HOLD_START = "2030-03-10T02:00:00.000Z";
const HOLD_END = "2030-03-10T04:00:00.000Z";
const HOLD_ID = "c".repeat(24);

const eventView = {
  eventId: 42, requestId: "REQ-000042", status: "PLANNING", statusLabel: "Approved & Planning", statusNote: null,
  title: "Synthetic Planning Forum", purpose: "Annual planning forum", description: "Talks.", startDatetime: START, endDatetime: END,
  expectedAttendance: 150, preferredLayoutType: "THEATRE", accessibilityNeeds: ["Wheelchair access", "Hearing loop"], venuePreferences: [45], equipmentRequirements: [],
  isRegistrationEnabled: false, registrationCapacity: null, createdAt: "2026-10-10T09:00:00.000Z", updatedAt: "2026-10-12T09:00:00.000Z", version: 3,
  organisation: { organisationId: 1, name: "Synthetic Org A" }, isAssignedToCoordinator: true, isOwner: false, viewerRelationship: "ASSIGNED_COORDINATOR",
  permissions: { canEdit: true, editableFields: [], canViewDraftHistory: false, canViewStaffHistory: true, canSuggestVenue: true },
  coordinatorId: 11, coordinatorName: "Synthetic Coordinator", organiser: { userId: 5, name: "Synthetic Organiser" }, venueSuggestions: [],
};
const hall = venue({
  requirements: [
    requirement("capacity", "Capacity", "MET", "Holds 300; 150 expected"),
    requirement("availability", "Availability", "MET", "Available"),
    requirement("accessibility-0", "Accessibility", "MET", "Wheelchair access"),
    requirement("accessibility-1", "Accessibility", "UNMET", "Hearing loop"),
  ],
  unmetCount: 1,
  allRequirementsMet: false,
});
const options = {
  event: { eventId: 42, requestId: "REQ-000042", startDatetime: START, endDatetime: END, expectedAttendance: 150, preferredLayoutType: "THEATRE", accessibilityNeeds: [] },
  venues: [hall], preferredVenues: [{ rank: 1, venueId: 45, name: hall.name, option: hall }],
  detailsAvailable: true, availabilityChecked: true, filtersNotChecked: [], canSuggestVenue: true,
};
const activeHold = (expiresAt = "2030-03-01T03:00:00.000Z") => ({
  holdRequestId: 3, eventId: 42, requestId: "REQ-000042", eventTitle: eventView.title, venueId: 45, venueName: hall.name,
  label: "Keynote hall", start: HOLD_START, end: HOLD_END, expectedAttendance: 120, note: null,
  status: "PLACED", statusLabel: "On hold (tentative)", requestedAt: "2026-10-30T02:00:00.000Z", requestedByName: "Synthetic Coordinator",
  decidedAt: "2026-10-30T03:00:00.000Z", decidedByName: "Synthetic Venue Staff", declineReason: null,
  hold: { holdId: HOLD_ID, status: "ACTIVE", statusLabel: "On hold (tentative)", expiresAt, extended: false, occupiedStart: "2030-03-10T01:30:00.000Z", occupiedEnd: "2030-03-10T04:45:00.000Z", convertedBookingId: null, convertedBooking: null, bookingMissing: false },
  holdUnavailable: false,
});
const converted = (hold) => ({
  ...hold, statusLabel: "Converted to a booking request",
  hold: { ...hold.hold, status: "CONVERTED", statusLabel: "Converted to a booking request", convertedBookingId: 900, convertedBooking: { bookingId: 900, status: "PENDING", statusLabel: "Pending" } },
});
const VENUE_HELD = { code: "VENUE_HELD", message: "Held for another event 10 Mar, 09:30–12:45, until 1 Mar 11:00." };

async function routeEvent(page, { holds = [], bookingAnswer = null, blocking = [] } = {}) {
  const sent = { bookings: [] };
  let current = holds;
  await page.route(/\/api\/events\/42(\/.*)?(\?.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fallback();
    if (url.pathname === "/api/events/42") return route.fulfill({ json: { event: eventView } });
    if (url.pathname === "/api/events/42/readiness") return route.fulfill({ json: { ready: false, failures: [], status: "PLANNING", version: 3, arrangementVersion: 3 } });
    if (url.pathname === "/api/events/42/history") return route.fulfill({ json: { history: [], nextCursor: null } });
    if (url.pathname === "/api/events/42/venue-options") return route.fulfill({ json: options });
    if (url.pathname === "/api/events/42/venue-holds") return route.fulfill({ json: { holds: current } });
    if (url.pathname === "/api/events/42/venue-bookings" && request.method() === "GET") {
      return route.fulfill({ json: { eventId: 42, requestId: "REQ-000042", eventType: null, eventTypeLabel: null, canRequestVenueBookings: true, bookings: [] } });
    }
    if (url.pathname === "/api/events/42/venue-bookings/check") {
      const items = request.postDataJSON().bookings;
      return route.fulfill({ json: { bookings: items.map((item, index) => ({
        index, checked: true, fields: {}, venueId: item.venueId, availability: blocking.length ? "UNAVAILABLE" : "AVAILABLE",
        occupiedStart: "2030-03-10T01:30:00.000Z", occupiedEnd: "2030-03-10T04:45:00.000Z", blocking, warnings: [],
      })) } });
    }
    if (url.pathname === "/api/events/42/venue-bookings" && request.method() === "POST") {
      const body = request.postDataJSON();
      sent.bookings.push(body);
      if (bookingAnswer) return route.fulfill(bookingAnswer);
      current = current.map(converted);
      const [item] = body.bookings;
      return route.fulfill({ status: 201, json: {
        message: "Venue booking requested. Venue Staff will review it.", eventId: 42, requestId: "REQ-000042", arrangementVersion: 4, warnings: [],
        bookings: [{ index: 0, bookingId: 900, venueId: 45, venueName: hall.name, label: item.label, start: item.start, end: item.end, occupiedStart: "2030-03-10T01:30:00.000Z", occupiedEnd: "2030-03-10T04:45:00.000Z", expectedAttendance: item.expectedAttendance, layout: item.layout, requiredFacilities: [], accessibilityNeeds: [], specialRequirements: null, isPrimary: true, status: "PENDING", statusLabel: "Pending" }],
      } });
    }
    return route.fulfill({ status: 501, json: { error: `Unmocked ${url.pathname}` } });
  });
  await routeVenuePhotos(page);
  return sent;
}

const holdsRegion = (page) => page.getByRole("region", { name: "Tentative holds" });
const confirmDialog = (page) => page.getByRole("dialog", { name: "Confirm held venue as a booking" });

test.beforeEach(async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
});

test("[SPM-188-TC-13][AC9] the coordinator confirms an active hold as a booking with the hold's venue and times", async ({ page }) => {
  const sent = await routeEvent(page, { holds: [activeHold()] });
  await page.goto("/events/42");

  await holdsRegion(page).getByRole("button", { name: "Confirm as booking" }).click();
  const dialog = confirmDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: /Venue/ }).first()).toBeDisabled();
  await expect(dialog.getByLabel("Start (SGT)")).toHaveValue("2030-03-10T10:00");
  await expect(dialog.getByLabel("Start (SGT)")).toHaveAttribute("readonly", "");
  await expect(dialog.getByLabel("End (SGT)")).toHaveValue("2030-03-10T12:00");
  await expect(dialog.getByText("This confirms your tentative hold, so the venue and times stay as held.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Add another venue" })).toHaveCount(0);

  await dialog.getByRole("button", { name: "Send booking request" }).click();
  await expect(dialog).toBeHidden();
  expect(sent.bookings).toHaveLength(1);
  expect(sent.bookings[0].bookings[0]).toMatchObject({ venueId: 45, label: "Keynote hall", start: HOLD_START, end: HOLD_END, expectedAttendance: 120, holdId: HOLD_ID });
  // The booking's own status comes from the backend, never assumed.
  await expect(holdsRegion(page).getByText("Confirmed as Booking #900 · Pending")).toBeVisible();
  await expect(holdsRegion(page).getByRole("button", { name: "Confirm as booking" })).toHaveCount(0);
});

test("[SPM-188-TC-14][AC9][AC10] a hold that expired meanwhile cannot be confirmed", async ({ page }) => {
  const sent = await routeEvent(page, {
    holds: [activeHold()],
    bookingAnswer: { status: 409, json: { error: "This hold has expired, so it can no longer be confirmed. Request a booking instead.", code: "HOLD_EXPIRED", bookingIndex: 0 } },
  });
  await page.goto("/events/42");

  await holdsRegion(page).getByRole("button", { name: "Confirm as booking" }).click();
  const dialog = confirmDialog(page);
  await dialog.getByRole("button", { name: "Send booking request" }).click();
  await expect(dialog.getByText("This hold has expired, so it can no longer be confirmed. Request a booking instead.")).toBeVisible();
  expect(sent.bookings).toHaveLength(1);
});

test("[SPM-188-AC9] a precise hold keeps its instants and avoids a rounded calendar conflict", async ({ page }) => {
  const hold = { ...activeHold(), start: "2030-03-10T02:00:30.125Z", end: "2030-03-10T04:00:45.789Z" };
  const sent = await routeEvent(page, { holds: [hold] });
  let calendarReads = 0;
  await page.route("**/api/venues/availability**", (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    calendarReads += 1;
    return route.fulfill({ json: { venues: [{ venueId: 45, check: { conflicts: [{ type: "BOOKING", occupiedStart: "2030-03-10T01:00:00Z", occupiedEnd: "2030-03-10T01:30:15Z" }] } }] } });
  });
  await page.goto("/events/42");
  await holdsRegion(page).getByRole("button", { name: "Confirm as booking" }).click();
  const dialog = confirmDialog(page);
  await expect(dialog.getByLabel("Start (SGT)")).toHaveValue("2030-03-10T10:00:30.125");
  await expect(dialog.getByLabel("End (SGT)")).toHaveValue("2030-03-10T12:00:45.789");
  await dialog.getByRole("button", { name: "Send booking request" }).click();
  await expect(dialog).toBeHidden();
  expect(sent.bookings[0].bookings[0]).toMatchObject({ start: hold.start, end: hold.end, holdId: HOLD_ID });
  expect(calendarReads).toBe(0);
});

for (const width of [1440, 390]) {
  test(`[SPM-188] an unknown booking outcome is retryable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await routeEvent(page);
    const unknown = { ...converted(activeHold()), statusLabel: "Booking outcome unavailable" };
    unknown.hold = { ...unknown.hold, statusLabel: unknown.statusLabel, convertedBookingId: null, convertedBooking: null, bookingMissing: false, bookingUnavailable: true };
    let reads = 0;
    await page.route("**/api/events/42/venue-holds", (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback();
      return route.fulfill({ json: { holds: [++reads === 1 ? unknown : converted(activeHold())] } });
    });
    await page.goto("/events/42");
    const holds = holdsRegion(page);
    await expect(holds.getByText("Booking outcome unavailable")).toBeVisible();
    await expect(holds.getByText("The booking's outcome could not be checked. Reload holds to try again.")).toBeVisible();
    await expect(holds.getByText(/Confirmed as Booking/)).toHaveCount(0);
    await expect(holds.getByRole("button", { name: "Confirm as booking" })).toHaveCount(0);
    await attachScreenshot(testInfo, page, `booking-outcome-unavailable-${width}`);
    await holds.getByRole("button", { name: "Retry booking lookup" }).click();
    await expect(holds.getByText("Confirmed as Booking #900 · Pending")).toBeVisible();
    await expect(holds.getByText("Booking outcome unavailable")).toHaveCount(0);
  });
}

test("[SPM-188-TC-12][AC8] a hold expiring within 24 hours shows the time left", async ({ page }) => {
  const expiresAt = new Date(Date.now() + 6 * 3600 * 1000 + 30 * 60 * 1000).toISOString();
  await routeEvent(page, { holds: [activeHold(expiresAt)] });
  await page.goto("/events/42");

  await expect(holdsRegion(page).getByText(/^Hold expires in 6 hours \(.+\)$/)).toBeVisible();
});

test("[SPM-188-TC-07][AC4] another event's hold offers ways forward in the booking form", async ({ page }) => {
  await routeEvent(page, { blocking: [VENUE_HELD] });
  await page.goto("/events/42");

  await page.getByRole("article", { name: hall.name }).getByRole("button", { name: "Request booking" }).click();
  const dialog = page.getByRole("dialog", { name: "Request venue bookings" });
  await expect(dialog.getByText(VENUE_HELD.message)).toBeVisible();
  const ways = dialog.getByRole("group", { name: "Ways forward" });
  await expect(ways.getByText("This venue is tentatively held for another event at this time.")).toBeVisible();
  await expect(ways.getByText("To ask whether the hold will be released, contact Venue Staff. The hold's expiry is shown above.")).toBeVisible();
  await expect(ways.getByRole("button", { name: "Show availability calendar" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Send booking request" })).toBeDisabled();

  await ways.getByRole("button", { name: "Choose a different date or time" }).click();
  await expect(dialog.getByLabel("Start (SGT)")).toBeFocused();
  await ways.getByRole("button", { name: "Try a different venue" }).click();
  await expect(dialog.getByRole("combobox", { name: /Venue/ }).first()).toBeFocused();
});

test("[SPM-200-TC-03][AC1][AC2] each accessibility need is ticked when met and crossed when not", async ({ page }) => {
  await routeEvent(page);
  await page.goto("/events/42");

  const card = page.getByRole("region", { name: "Organiser's venue choices" }).getByRole("article", { name: hall.name, exact: true });
  await card.getByRole("button", { name: "View details" }).click();
  // The detail rows (each says what the venue has), not the closed card's chips.
  const rows = card.getByRole("listitem").filter({ hasText: "Venue has:" });
  // In the order the event lists its needs.
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("✓ AccessibilityWheelchair access");
  await expect(rows.nth(0)).toContainText("Venue has: Wheelchair accessible entrance");
  await expect(rows.nth(0)).toContainText(/Met$/);
  await expect(rows.nth(1)).toContainText("✗ AccessibilityHearing loop");
  await expect(rows.nth(1)).toContainText(/Not met$/);
});

test("[SPM-188][T35] a hold whose booking was not saved can be confirmed again and cannot be released", async ({ page }) => {
  const notSaved = { ...activeHold(), statusLabel: "Booking not saved – confirm again", hold: { ...activeHold().hold, status: "CONVERTED", statusLabel: "Booking not saved – confirm again", convertedBookingId: 899, bookingMissing: true } };
  const sent = await routeEvent(page, { holds: [notSaved] });
  await page.goto("/events/42");

  const item = holdsRegion(page).locator("li[data-hold-request-id='3']");
  await expect(item.getByText("Booking not saved – confirm again")).toBeVisible();
  await expect(item.getByText("The booking was not saved. Confirm the hold again to send it to Venue Staff.")).toBeVisible();
  await expect(item.getByRole("button", { name: "Release hold" })).toHaveCount(0);

  await item.getByRole("button", { name: "Confirm as booking" }).click();
  await confirmDialog(page).getByRole("button", { name: "Send booking request" }).click();
  await expect(confirmDialog(page)).toBeHidden();
  expect(sent.bookings[0].bookings[0]).toMatchObject({ holdId: HOLD_ID });
});

// Venue Staff's My Requests: the hold card's countdown and booking link, and
// the booking card that came from a hold.
async function routeVenueStaff(page, { requests, bookings }) {
  await page.route("**/api/venues/bookings**", (route) => {
    if (new URL(route.request().url()).pathname !== "/api/venues/bookings") return route.fallback();
    return route.fulfill({ json: { bookings, hasMore: false, pendingCount: bookings.length, approvedCount: 0 } });
  });
  await page.route(/\/api\/venues\/hold-requests(\?.*)?$/, (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    return route.fulfill({ json: { requests, pendingCount: 0 } });
  });
}
const bookingItem = (overrides = {}) => ({
  bookingId: 900, label: "Keynote hall", status: "PENDING", statusLabel: "Pending", venueId: 45, venueName: hall.name,
  startDatetime: HOLD_START, endDatetime: HOLD_END, expectedAttendance: 120, submittedAt: "2026-10-30T04:00:00.000Z", updatedAt: "2026-10-30T04:00:00.000Z",
  event: { eventId: 42, requestId: "REQ-000042", title: eventView.title, status: "PLANNING", eventType: null, eventTypeLabel: null },
  ...overrides,
});

test("[SPM-188-TC-09][AC8][AC9] Venue Staff see the countdown, the converted hold's booking and the From hold badge", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  const soon = new Date(Date.now() + 6 * 3600 * 1000 + 30 * 60 * 1000).toISOString();
  const expiring = { ...activeHold(soon), holdRequestId: 4 };
  await routeVenueStaff(page, {
    requests: [expiring, converted(activeHold())],
    bookings: [bookingItem({ fromHold: true }), bookingItem({ bookingId: 901, label: "Breakout", fromHold: false })],
  });
  await page.goto("/dashboard");

  await expect(page.locator('article[data-hold-request-id="4"]').getByText(/^Hold expires in 6 hours \(.+\)$/)).toBeVisible();
  const link = page.locator('article[data-hold-request-id="3"]').getByRole("link", { name: "Booking #900" });
  await expect(link).toHaveAttribute("href", "/events/42?booking=900");
  await expect(page.locator('article[data-booking-id="900"]').getByText("From hold")).toBeVisible();
  await expect(page.locator('article[data-booking-id="901"]').getByText("From hold")).toHaveCount(0);
});

test("[SPM-188] Venue Staff can retry an unavailable converted-booking lookup", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeVenueStaff(page, { requests: [], bookings: [] });
  const unknown = { ...converted(activeHold()), statusLabel: "Booking outcome unavailable" };
  unknown.hold = { ...unknown.hold, statusLabel: unknown.statusLabel, convertedBookingId: null, convertedBooking: null, bookingMissing: false, bookingUnavailable: true };
  let reads = 0;
  await page.route(/\/api\/venues\/hold-requests(\?.*)?$/, (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    return route.fulfill({ json: { requests: [++reads === 1 ? unknown : converted(activeHold())], pendingCount: 0 } });
  });
  await page.goto("/dashboard");
  const card = page.locator('article[data-hold-request-id="3"]');
  await expect(card.getByText("Booking outcome unavailable")).toBeVisible();
  await expect(card.getByRole("link", { name: "Booking #900" })).toHaveCount(0);
  await card.getByRole("button", { name: "Retry booking lookup" }).click();
  await expect(card.getByRole("link", { name: "Booking #900" })).toBeVisible();
});
