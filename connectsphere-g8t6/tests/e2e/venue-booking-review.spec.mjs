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
  label: null,
  status,
  statusLabel: status.charAt(0) + status.slice(1).toLowerCase(),
  venueId,
  venueName,
  startDatetime: "2026-11-04T01:00:00.000Z",
  endDatetime: "2026-11-04T04:00:00.000Z",
  expectedAttendance: 120,
  submittedAt: "2026-10-07T13:32:08.000Z",
  updatedAt: "2026-10-08T02:00:00.000Z",
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

// The mock filters like the backend for status, venue and search; the order
// it returns is the backend's job, so tests assert the parameters sent.
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
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const bookings = listItems.filter((item) => (!status || item.status === status)
      && (!venueId || String(item.venueId) === venueId)
      && (!q || `${item.venueName} ${item.label ?? ""} ${item.event.title} #${item.bookingId}`.toLowerCase().includes(q)));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bookings, hasMore: false, pendingCount: 2 }) });
  });
}

const OPTIONS = [
  { venueId: 45, name: "Synthetic Hall", status: "ACTIVE" },
  { venueId: 46, name: "Synthetic Room B", status: "ACTIVE" },
  { venueId: 47, name: "Synthetic Room C", status: "UNDER_MAINTENANCE" },
];

const card = (page, bookingId) => page.getByRole("article").filter({ hasText: `Booking #${bookingId}` });

test("[SPM-181 AC1][AC5] Venue Staff see every booking request on My Requests and can filter it", async ({ page }) => {
  const requests = [];
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeBookings(page, requests);
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "My Requests", exact: true })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main Navigation", exact: true });
  await expect(nav.getByRole("link", { name: "My Requests", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "My Venues", exact: true })).toHaveAttribute("href", "/venues");

  const first = card(page, 110);
  for (const text of ["Synthetic Hall · Plenary hall", "Synthetic planning forum", "REQ-000442", "Seminar", "120 people", "Pending"]) {
    await expect(first.getByText(text, { exact: false }).first()).toBeVisible();
  }
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByText("2 pending requests awaiting review")).toBeVisible();

  await page.getByLabel("Status").selectOption("REJECTED");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article").getByText("Booking #112")).toBeVisible();

  await page.getByLabel("Date (SGT)").fill("2026-11-04");
  await expect.poll(() => requests.at(-1)).toEqual({ status: "REJECTED", from: "2026-11-04T00:00:00+08:00", to: "2026-11-05T00:00:00+08:00" });

  await page.getByRole("button", { name: "Clear search and filters" }).first().click();
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
  await card(page, 110).getByRole("link", { name: "Review booking" }).click();

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

  await expect(page.getByText("Booking #111").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

// ---------- SPM-181 follow-up: booking ID, search, sort, live venue filter ----------

test("[TC-VENUE-181-50] each card shows the booking ID and only a Review booking action", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeBookings(page);
  await page.goto("/dashboard");

  await expect(page.getByRole("article")).toHaveCount(3);
  for (const id of [110, 111, 112]) {
    await expect(card(page, id).getByRole("link")).toHaveCount(1);
    await expect(card(page, id).getByRole("link", { name: "Review booking" })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Event view" })).toHaveCount(0);
  await expect(page.getByText(/VB-0/)).toHaveCount(0);
});

test("[TC-VENUE-181-51] pending requests come first by default", async ({ page }) => {
  const requests = [];
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeBookings(page, requests);
  await page.goto("/dashboard");

  await expect(page.getByLabel("Sort by")).toHaveValue("default");
  await expect(page.getByLabel("Sort by").locator("option:checked")).toHaveText("Pending first");
  // The default sort is the backend's pending-first order: no sort parameter.
  await expect.poll(() => requests.at(-1)).toEqual({});
});

test("[TC-VENUE-181-52] the search runs as you type, without pressing Enter", async ({ page }) => {
  const requests = [];
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeBookings(page, requests);
  await page.goto("/dashboard");
  await expect(page.getByRole("article")).toHaveCount(3);

  await page.getByLabel("Search", { exact: true }).pressSequentially("room c", { delay: 30 });

  await expect.poll(() => requests.at(-1)).toEqual({ q: "room c" });
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(card(page, 112)).toBeVisible();
  // Typing settles before a request is sent, so not every key press is sent.
  expect(requests.filter((request) => request.q).length).toBeLessThan("room c".length);

  await page.getByLabel("Search", { exact: true }).fill("");
  await expect(page.getByRole("article")).toHaveCount(3);
});

for (const [label, sort, order] of [
  ["Date/time", "date", "asc"],
  ["Venue attendance", "attendance", "desc"],
  ["Last edited", "lastEdited", "desc"],
  ["Alphabetical (event)", "alphabetical", "asc"],
]) {
  test(`[TC-VENUE-181-53] sorting by ${label} asks the backend in both directions`, async ({ page }) => {
    const requests = [];
    await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
    await routeBookings(page, requests);
    await page.goto("/dashboard");

    await page.getByLabel("Sort by").selectOption({ label });
    await expect.poll(() => requests.at(-1)).toEqual(order === "desc" ? { sort, order: "desc" } : { sort });

    await page.getByLabel("Order").selectOption(order === "desc" ? "asc" : "desc");
    await expect.poll(() => requests.at(-1)).toEqual(order === "desc" ? { sort } : { sort, order: "desc" });
  });
}

test("[TC-VENUE-181-54] Last opened sorts by this viewer's openings, never-opened last", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeBookings(page);
  await page.addInitScript(() => {
    localStorage.setItem("connectsphere:venue-bookings-opened:11", JSON.stringify({ 112: 2000, 111: 1000 }));
  });
  await page.goto("/dashboard");

  await page.getByLabel("Sort by").selectOption({ label: "Last opened" });
  const order = () => page.getByRole("article").evaluateAll((cards) => cards.map((node) => node.textContent.match(/Booking #(\d+)/)[1]));
  await expect.poll(order).toEqual(["112", "111", "110"]);

  await page.getByLabel("Order").selectOption("asc");
  await expect.poll(order).toEqual(["111", "112", "110"]);

  // Opening a booking records it as the most recent.
  await card(page, 110).getByRole("link", { name: "Review booking" }).click();
  await expect(page).toHaveURL(/booking=110$/);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("connectsphere:venue-bookings-opened:11")));
  expect(stored["110"]).toBeGreaterThan(2000);
});

test("[TC-VENUE-181-55] the venue filter lists every venue and follows venue changes when the page regains focus", async ({ page }) => {
  const state = await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  state.venueOptions = OPTIONS;
  await routeBookings(page);
  await page.goto("/dashboard");

  const venueFilter = page.getByLabel("Venue", { exact: true });
  await expect(venueFilter.locator("option")).toHaveText(["All venues", "Synthetic Hall", "Synthetic Room B", "Synthetic Room C"]);

  // A venue added, renamed and removed in My Venues.
  state.venueOptions = [
    { venueId: 45, name: "Synthetic Grand Hall", status: "ACTIVE" },
    { venueId: 46, name: "Synthetic Room B", status: "ACTIVE" },
    { venueId: 48, name: "New Pavilion", status: "ACTIVE" },
  ];
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(venueFilter.locator("option")).toHaveText(["All venues", "Synthetic Grand Hall", "Synthetic Room B", "New Pavilion"]);
});
