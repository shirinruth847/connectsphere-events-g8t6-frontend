import { test, expect } from "@playwright/test";
import { installConnectSphereMocks } from "./support.mjs";

// SPM-181: Venue Staff review of venue booking requests. The mocks return the
// shapes of GET /api/venues/bookings and /api/venues/bookings/events/:eventId.
const venue = (venueId, name) => ({
  venueId,
  name,
  address: `${name} Road`,
  maxCapacity: 300,
  operatingHours: "08:00-22:00",
  setupTurnaroundMinutes: 30,
  roomId: venueId * 10,
  roomLayoutType: "Theater",
  roomCapacity: 200,
});

const summary = (bookingId, status, venueId, venueName, overrides = {}) => ({
  bookingId,
  bookingReference: `VB-${String(bookingId).padStart(6, "0")}`,
  label: null,
  status,
  statusLabel: status.charAt(0) + status.slice(1).toLowerCase(),
  venueId,
  venueName,
  startDatetime: "2026-11-04T01:00:00.000Z",
  endDatetime: "2026-11-04T04:00:00.000Z",
  expectedAttendance: 120,
  submittedAt: "2026-10-07T13:32:08.000Z",
  ...overrides,
});

const event = { eventId: 442, requestId: "REQ-000442", title: "Synthetic planning forum", status: "PLANNING", eventType: "SEMINAR", eventTypeLabel: "Seminar" };

const listItems = [
  { ...summary(110, "PENDING", 45, "Synthetic Hall", { label: "Plenary hall" }), event },
  { ...summary(111, "PENDING", 46, "Synthetic Room B"), event },
  { ...summary(112, "REJECTED", 47, "Synthetic Room C"), event },
];

const detail = (item, extra = {}) => ({
  ...summary(item.bookingId, item.status, item.venueId, item.venueName, { label: item.label }),
  venue: venue(item.venueId, item.venueName),
  layoutType: "Theater",
  requiredFacilities: ["Stage", "PA system"],
  accessibilityRequirements: ["Hearing loop"],
  specialRequirements: "Reserved front row for speakers.",
  rejectionReason: null,
  ...extra,
});

const eventBookings = {
  event: {
    ...event,
    purpose: "Annual planning",
    description: "Talks and workshops.",
    startDatetime: "2026-11-04T00:00:00.000Z",
    endDatetime: "2026-11-04T06:00:00.000Z",
    expectedAttendance: 120,
    preferredLayoutType: "THEATRE",
    accessibilityNeeds: ["Wheelchair access"],
    submittedAt: "2026-10-01T09:00:00.000Z",
    organisationName: "Synthetic Org A",
    coordinatorName: "Synthetic Coordinator",
  },
  bookings: [detail(listItems[0]), detail(listItems[1]), detail(listItems[2], { rejectionReason: "Too small." })],
};

async function routeBookings(page, requests = []) {
  await page.route("**/api/venues/bookings**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/venues/bookings/events/442") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(eventBookings) });
    }
    if (url.pathname !== "/api/venues/bookings") return route.fallback();
    requests.push(Object.fromEntries(url.searchParams));
    const status = url.searchParams.get("status");
    const venueId = url.searchParams.get("venueId");
    const bookings = listItems.filter((item) => (!status || item.status === status) && (!venueId || String(item.venueId) === venueId));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bookings, hasMore: false, pendingCount: 2 }) });
  });
}

test("[SPM-181 AC1][AC5] Venue Staff see every booking request on My Requests and can filter it", async ({ page }) => {
  const requests = [];
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeBookings(page, requests);
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "My Requests", exact: true })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main Navigation", exact: true });
  await expect(nav.getByRole("link", { name: "My Requests", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "My Venues", exact: true })).toHaveAttribute("href", "/venues");

  const card = page.getByRole("article").filter({ hasText: "VB-000110" });
  for (const text of ["Synthetic Hall · Plenary hall", "Synthetic planning forum", "REQ-000442", "Seminar", "120 people", "Pending"]) {
    await expect(card.getByText(text, { exact: false }).first()).toBeVisible();
  }
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByText("2 pending requests awaiting review")).toBeVisible();

  await page.getByLabel("Status").selectOption("REJECTED");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article").getByText("VB-000112")).toBeVisible();

  await page.getByLabel("Date (SGT)").fill("2026-11-04");
  await expect.poll(() => requests.at(-1)).toEqual({ status: "REJECTED", from: "2026-11-04T00:00:00+08:00", to: "2026-11-05T00:00:00+08:00" });

  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(page.getByRole("article")).toHaveCount(3);
});

test("[SPM-181 AC6] the list says when nothing is pending", async ({ page }) => {
  const state = await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  state.venueBookings = { bookings: [{ ...listItems[2] }], hasMore: false, pendingCount: 0 };
  await page.goto("/dashboard");

  await expect(page.getByText("No pending booking requests.", { exact: true })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);
});

test("[SPM-181 AC2][AC3][AC4] a booking opens in the coordinator layout with only the venue section interactive", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeBookings(page);
  await page.goto("/dashboard");
  await page.getByRole("article").filter({ hasText: "VB-000110" }).getByRole("link", { name: "Review booking" }).click();

  await expect(page).toHaveURL(/\/events\/442\?booking=110$/);
  await expect(page.getByRole("heading", { name: "Synthetic planning forum", exact: true })).toBeVisible();
  await expect(page.getByText("Coordinated by Synthetic Coordinator · Synthetic Org A")).toBeVisible();
  await expect(page.getByText("Read-only", { exact: true })).toHaveCount(4);
  await expect(page.getByText("Venue Staff review", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);

  // AC2: the selected booking's own requirements.
  for (const text of ["Stage", "PA system", "Hearing loop", "Reserved front row for speakers."]) {
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  }
  // AC3: the other bookings under the same event, with their statuses.
  const related = page.getByRole("complementary", { name: "Coordination and related bookings" });
  await expect(related.getByRole("heading", { name: "Other bookings for this event" })).toBeVisible();
  await expect(related.getByRole("button")).toHaveCount(2);
  await related.getByRole("button", { name: /Synthetic Room C/ }).click();
  await expect(page).toHaveURL(/booking=112$/);
  await expect(page.getByText("Too small.")).toBeVisible();

  // AC4: the event view lists every booking with its own status.
  await page.goto("/events/442");
  await expect(page.getByText("Event venue bookings")).toBeVisible();
  await expect(page.getByRole("button", { expanded: false })).toHaveCount(3);
  const nav = page.getByRole("navigation", { name: "Main Navigation", exact: true });
  await expect(nav.getByRole("link", { name: "My Requests", exact: true })).toHaveAttribute("aria-current", "page");
});

test("[SPM-181] the review page works at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeBookings(page);
  await page.goto("/events/442?booking=111");

  await expect(page.getByText("VB-000111").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
