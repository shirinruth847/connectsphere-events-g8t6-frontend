import { test, expect } from "@playwright/test";
import { attachScreenshot, installConnectSphereMocks, makeDraft } from "./support.mjs";

// SPM-286/287 follow-ups: technical requests grouped from
// GET /api/events/:id/arrangements, technical request history labels, the
// Technical Support dashboard order and equipment schedule
// (GET /api/equipment/schedule), the request's Available column, and typed
// times read as Singapore time in any browser time zone.

const START = "2030-03-10T01:00:00.000Z"; // 09:00 SGT
const END = "2030-03-10T09:00:00.000Z"; // 17:00 SGT

const projector = (quantity) => ({ equipmentId: 1, name: "Projector", quantity });
const microphone = (quantity) => ({ equipmentId: 2, name: "Microphone", quantity });
const groupedRequests = () => [
  { requestId: 9, status: "PENDING", supportRequired: null, createdAt: "2026-10-31T02:00:00.000Z", decidedAt: null, equipment: [microphone(1), projector(2)] },
  { requestId: 8, status: "REJECTED", supportRequired: null, createdAt: "2026-10-30T02:00:00.000Z", decidedAt: "2026-10-30T05:00:00.000Z", equipment: [projector(4)] },
  // A line recorded without a request (seed data).
  { requestId: null, status: "APPROVED", supportRequired: null, createdAt: null, decidedAt: null, equipment: [microphone(3)] },
];

const historyEntry = (historyId, action, changes, extra = {}) => ({
  historyId, action, actor: { userId: 11, name: "Synthetic Coordinator", role: "COORDINATOR" },
  occurredAt: `2026-10-3${historyId % 2}T0${historyId}:00:00.000Z`, summary: null, changes, audience: "STAFF_ONLY", ...extra,
});

const coordinatorEvent = (overrides = {}) => ({
  eventId: 42, requestId: "REQ-000042", status: "PLANNING", statusLabel: "Approved & Planning", statusNote: null,
  title: "Synthetic Planning Forum", purpose: "Annual planning forum", description: "Talks and workshops.",
  startDatetime: START, endDatetime: END, expectedAttendance: 150, preferredLayoutType: "THEATRE",
  accessibilityNeeds: [], venuePreferences: [], equipmentRequirements: [{ equipmentId: 1, quantity: 2 }],
  isRegistrationEnabled: false, registrationCapacity: null, createdAt: "2026-10-10T09:00:00.000Z", updatedAt: "2026-10-12T09:00:00.000Z",
  version: 3, arrangementVersion: 3, organisation: { organisationId: 1, name: "Synthetic Org A" }, isAssignedToCoordinator: true, isOwner: false,
  viewerRelationship: "ASSIGNED_COORDINATOR",
  permissions: { canEdit: true, editableFields: ["title", "purpose", "description"], canViewDraftHistory: false, canViewStaffHistory: true, canSuggestVenue: false },
  coordinatorId: 11, coordinatorName: "Synthetic Coordinator", organiser: { userId: 5, name: "Synthetic Organiser" }, venueSuggestions: [],
  ...overrides,
});

async function routeCoordinatorEvent(page, { requests = [], history = [] } = {}) {
  const event = coordinatorEvent();
  await page.route(/\/api\/events\/42(\/.*)?(\?.*)?$/, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fallback();
    if (pathname === "/api/events/42") return route.fulfill({ json: { event } });
    if (pathname === "/api/events/42/history") return route.fulfill({ json: { history, nextCursor: null, lastViewedAt: null } });
    if (pathname === "/api/events/42/readiness") return route.fulfill({ json: { ready: false, failures: [], status: event.status, version: event.version, arrangementVersion: 3 } });
    if (pathname === "/api/events/42/venue-options") return route.fulfill({ json: { event: { eventId: 42 }, venues: [], preferredVenues: [], detailsAvailable: true, availabilityChecked: true, filtersNotChecked: [], canSuggestVenue: false } });
    if (pathname === "/api/events/42/venue-bookings") return route.fulfill({ json: { eventId: 42, requestId: "REQ-000042", eventType: "CONFERENCE", eventTypeLabel: "Conference", canRequestVenueBookings: false, bookings: [] } });
    // The coordinator gets the technical section only.
    if (pathname === "/api/events/42/arrangements") return route.fulfill({ json: { arrangements: { technical: { status: "READY", supportStatus: "UNAVAILABLE", requirements: [], requests } } } });
    return route.fallback();
  });
}

const card = (scope, name) => scope.getByRole("listitem", { name, exact: true });

test("[SPM-286 AC5] the coordinator sees one card per technical request with its items", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeCoordinatorEvent(page, { requests: groupedRequests() });
  await page.goto("/events/42");
  const section = page.getByRole("region", { name: "Technical requests", exact: true });
  await expect(section.getByRole("list", { name: "Technical requests" }).locator(":scope > li")).toHaveCount(3);
  const pending = card(section, "Technical request #9");
  await expect(pending.getByRole("listitem")).toHaveText(["Microphone × 1", "Projector × 2"]);
  await expect(pending.getByText("Pending", { exact: true })).toBeVisible();
  await expect(card(section, "Technical request #8").getByText("Rejected", { exact: true })).toBeVisible();
  await expect(card(section, "Equipment request").getByText("Microphone × 3")).toBeVisible();
  // The pending request blocks another; the seed line does not count.
  await expect(section.getByText("This event already has a pending technical request.")).toBeVisible();
});

test("[SPM-199][SPM-286] the organiser sees grouped technical requests without the support notice", async ({ page }) => {
  const state = await installConnectSphereMocks(page, { draft: makeDraft({
    eventId: 42, requestId: "REQ-000042", title: "Organiser planning forum", status: "PLANNING", statusLabel: "Approved & Planning",
    startDatetime: START, endDatetime: END, expectedAttendance: 120, coordinatorName: "Alex Coordinator", isAssignedToCoordinator: true,
    permissions: { canEdit: false, editableFields: [], canViewDraftHistory: true, canViewStaffHistory: false },
  }) });
  state.arrangements.technical = { status: "READY", supportStatus: "UNAVAILABLE", requirements: [projector(2)], requests: groupedRequests() };
  await page.goto("/events/42");
  const technical = page.getByRole("region", { name: "Equipment & technical arrangements", exact: true });
  await expect(card(technical, "Technical request #9").getByRole("listitem")).toHaveText(["Microphone × 1", "Projector × 2"]);
  await expect(card(technical, "Technical request #9").getByText("Pending approval", { exact: true })).toBeVisible();
  await expect(card(technical, "Technical request #8").getByText("Projector × 4")).toBeVisible();
  await expect(page.getByText("Some arrangement information is unavailable")).toHaveCount(0);
  await expect(page.getByText(/Technical support arrangements are not available yet/)).toHaveCount(0);
});

test("[SPM-286/287] history labels technical request changes and hides empty ones", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeCoordinatorEvent(page, { history: [
    historyEntry(3, "TECHNICAL_REQUEST_APPROVED", [{ field: "technicalRequestStatus", before: "PENDING", after: "APPROVED", label: "Technical request", beforeLabel: "Pending", afterLabel: "Approved" }]),
    // The earlier shape: a bare id key with no values and a status object.
    historyEntry(2, "TECHNICAL_REQUEST_SENT", [{ field: "technicalRequestId", before: null, after: null }, { field: "technicalRequest", before: null, after: "PENDING" }]),
    historyEntry(1, "EVENT_DETAILS_UPDATED", [{ field: "purpose", before: null, after: null }], { audience: "ORGANISER_SAFE" }),
  ] });
  await page.goto("/events/42");
  const history = page.getByRole("region", { name: "Change history" });
  const approved = history.getByRole("listitem").filter({ hasText: "Technical request approved" });
  await expect(approved.locator("dt")).toHaveText(["Technical request"]);
  await expect(approved.getByText("From: Pending")).toBeVisible();
  await expect(approved.getByText("To: Approved")).toBeVisible();
  const sent = history.getByRole("listitem").filter({ hasText: "Technical request sent" });
  await expect(sent.locator("dt")).toHaveText(["Technical request"]);
  await expect(sent.getByText("To: Pending")).toBeVisible();
  await expect(history.getByText("technicalRequestId")).toHaveCount(0);
  // An entry whose only change is empty shows no change list.
  await expect(history.getByRole("listitem").filter({ hasText: "Event details updated" }).locator("dl")).toHaveCount(0);
});

// ---------- Technical Support ----------

const scheduleDay = (date, events) => ({ date, events });
const scheduleEvent = (eventId, title, start, end, equipment, venue = { venueId: 45, name: "Synthetic Grand Hall" }) => ({
  eventId, requestId: `REQ-0000${eventId}`, title, status: "PLANNING", start, end, venue, equipment,
});

async function routeSchedule(page, byMonth) {
  const queries = [];
  await page.route(/\/api\/equipment\/schedule(\?.*)?$/, (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    const query = { from: params.get("from"), to: params.get("to") };
    queries.push(query);
    return route.fulfill({ json: { ...query, days: byMonth[query.from.slice(0, 7)] ?? [] } });
  });
  return queries;
}

// Pin the browser clock to 15 March 2030, 10:00 SGT.
const pinClock = (page) => page.clock.setFixedTime(new Date("2030-03-15T02:00:00Z"));

test("[SPM-287 schedule] Technical Support open the schedule from the dashboard and move between months", async ({ page }, testInfo) => {
  // Before the mocks, so the signed-in session is issued at the pinned time.
  await pinClock(page);
  await installConnectSphereMocks(page, { role: "TECH_SUPPORT" });
  const queries = await routeSchedule(page, {
    "2030-03": [
      scheduleDay("2030-03-10", [scheduleEvent(42, "Synthetic Planning Forum", START, END, [
        { equipmentId: 1, name: "Projector", quantity: 2, status: "APPROVED", technicalRequestId: 7 },
        { equipmentId: 2, name: "Microphone", quantity: 4, status: "PENDING", technicalRequestId: 9 },
      ])]),
      scheduleDay("2030-03-11", []),
      scheduleDay("2030-03-21", [scheduleEvent(43, "Robotics Expo", "2030-03-21T06:00:00.000Z", "2030-03-21T08:00:00.000Z", [
        { equipmentId: 3, name: "PA Speaker", quantity: 1, status: "PENDING", technicalRequestId: 10 },
      ], null)]),
    ],
  });
  await page.goto("/dashboard");

  // The catalogue banner sits above the technical requests.
  const banner = page.getByRole("heading", { name: "Equipment catalogue" });
  const requests = page.getByRole("heading", { name: "Technical requests", exact: true });
  expect((await banner.boundingBox()).y).toBeLessThan((await requests.boundingBox()).y);

  await page.getByRole("link", { name: "Equipment schedule" }).click();
  await expect(page).toHaveURL(/\/equipment\/schedule$/);
  await expect(page.getByRole("heading", { name: "Equipment schedule", level: 1 })).toBeVisible();
  await expect(page.locator('aside [aria-current="page"]')).toHaveText(/Schedule/);
  await expect.poll(() => queries.at(-1)).toEqual({ from: "2030-03-01", to: "2030-03-31" });
  await expect(page.getByRole("heading", { name: "March 2030" })).toBeVisible();

  // Only dates with events.
  const dates = page.getByRole("list", { name: "Dates in March 2030" }).locator(":scope > li");
  await expect(dates).toHaveCount(2);
  await expect(dates.nth(0)).toContainText("Sun, 10 Mar 2030");
  const forum = dates.nth(0).getByRole("listitem", { name: "Synthetic Planning Forum" });
  await expect(forum).toContainText("09:00–17:00 SGT");
  await expect(forum).toContainText("Synthetic Grand Hall");
  const items = forum.getByRole("list", { name: "Equipment for Synthetic Planning Forum" }).getByRole("listitem");
  await expect(items.nth(0)).toContainText("Projector × 2");
  await expect(items.nth(0)).toContainText("Approved");
  await expect(items.nth(1)).toContainText("Microphone × 4");
  await expect(items.nth(1)).toContainText("Pending");
  await expect(items.nth(0).getByRole("link", { name: "Request #7" })).toHaveAttribute("href", "/technical-requests/7");
  await expect(dates.nth(1)).toContainText("No venue booked yet");
  await attachScreenshot(testInfo, page, "equipment-schedule-desktop");

  await page.getByRole("button", { name: "Next month" }).click();
  await expect.poll(() => queries.at(-1)).toEqual({ from: "2030-04-01", to: "2030-04-30" });
  await expect(page.getByText("No equipment booked in April 2030")).toBeVisible();
  await page.getByRole("button", { name: "This month" }).click();
  await expect(dates).toHaveCount(2);
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect.poll(() => queries.at(-1)).toEqual({ from: "2030-02-01", to: "2030-02-28" });
});

test("[SPM-287 schedule] the schedule fits a phone and is reached from the sidebar", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Before the mocks, so the signed-in session is issued at the pinned time.
  await pinClock(page);
  await installConnectSphereMocks(page, { role: "TECH_SUPPORT" });
  await routeSchedule(page, { "2030-03": [scheduleDay("2030-03-10", [scheduleEvent(42, "Synthetic Planning Forum with a long title for small screens", START, END, [
    { equipmentId: 1, name: "High-Lumen Laser Projector", quantity: 2, status: "APPROVED", technicalRequestId: 7 },
  ])])] });
  await page.goto("/equipment/schedule");
  await expect(page.getByText("High-Lumen Laser Projector × 2")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await attachScreenshot(testInfo, page, "equipment-schedule-mobile");
});

test("[SPM-287] other roles cannot open the equipment schedule", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await page.goto("/equipment/schedule");
  await expect(page.getByText("This page is not available for your role.", { exact: false })).toBeVisible();
});

const detail = (status, availableQuantity) => ({
  technicalRequestId: 7, status, createdAt: "2026-10-30T02:00:00.000Z", decidedAt: status === "PENDING" ? null : "2026-10-31T02:00:00.000Z",
  rejectionReason: null, requestedBy: { userId: 11, name: "Synthetic Coordinator" }, decidedBy: status === "PENDING" ? null : { userId: 31, name: "Synthetic Technical Support" },
  event: { eventId: 42, requestId: "REQ-000042", title: "Synthetic Planning Forum", status: "PLANNING", start: START, end: END, venue: null },
  items: [{ equipmentId: 1, name: "Projector", category: "Visual", quantity: 2, availableQuantity }],
  history: [],
});

for (const [status, shown] of [["PENDING", true], ["APPROVED", false]]) {
  test(`[SPM-287 AC3] a ${status.toLowerCase()} request ${shown ? "shows" : "does not show"} what is available now`, async ({ page }) => {
    await installConnectSphereMocks(page, { role: "TECH_SUPPORT" });
    await page.route(/\/api\/equipment\/requests\/7$/, (route) => route.request().method() === "OPTIONS" ? route.fallback() : route.fulfill({ json: detail(status, 3) }));
    await page.goto("/technical-requests/7");
    const table = page.getByRole("table");
    await expect(table.getByRole("row", { name: /Projector/ })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Available now" })).toHaveCount(shown ? 1 : 0);
    if (shown) await expect(table.getByRole("row", { name: /Projector/ }).getByRole("cell").last()).toHaveText("3");
  });
}

// ---------- typed times are Singapore time ----------

test.describe("in a UTC browser", () => {
  test.use({ timezoneId: "UTC" });

  test("[SPM-35 / all times SGT] a typed 10:00 is saved and shown as 10:00 SGT", async ({ page }) => {
    const state = await installConnectSphereMocks(page, { role: "ORGANISER" });
    const queries = [];
    await page.route(/\/api\/events\/equipment-options(\?.*)?$/, (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback();
      const params = new URL(route.request().url()).searchParams;
      if (params.has("start")) queries.push({ start: params.get("start"), end: params.get("end") });
      return route.fallback();
    });
    await page.goto("/events/new");
    await page.getByLabel("Event Title").fill("Singapore time check");
    await page.getByLabel("Event Purpose").fill("Purpose");
    await page.getByLabel("Executive Abstract & Event Scope").fill("Scope");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Primary Proposed Date").fill("2030-03-10T10:00");
    await page.getByLabel("Event End Date & Time").fill("2030-03-10T12:00");
    await page.getByLabel("Targeted In-Person Headcount").fill("40");
    await expect.poll(() => queries.at(-1)).toEqual({ start: "2030-03-10T10:00:00+08:00", end: "2030-03-10T12:00:00+08:00" });
    await page.getByRole("button", { name: "Save as Draft" }).click();
    await expect.poll(() => state.draftCreateRequests.length).toBe(1);
    expect(state.draftCreateRequests[0].startDatetime).toBe("2030-03-10T10:00:00+08:00");
    expect(Date.parse(state.draftCreateRequests[0].startDatetime)).toBe(Date.parse("2030-03-10T02:00:00Z"));

    // Stored as 02:00 UTC, the draft opens at 10:00 again.
    state.draft.startDatetime = "2030-03-10T02:00:00.000Z";
    state.draft.endDatetime = "2030-03-10T04:00:00.000Z";
    await page.goto(`/events/new?draft=${state.draft.eventId}`);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByLabel("Primary Proposed Date")).toHaveValue("2030-03-10T10:00");
    await expect(page.getByLabel("Event End Date & Time")).toHaveValue("2030-03-10T12:00");
  });
});
