import { test, expect } from "@playwright/test";
import { attachScreenshot, installConnectSphereMocks, localDateTimeInput } from "./support.mjs";
import { installInbox, makeNotification, updatesButton } from "./spm-155-mocks.mjs";

// SPM-286 / SPM-287: equipment in the event request, the coordinator's
// technical request and the Technical Support review. The mocks answer like
// GET /api/events/equipment-options, POST /api/events/:id/technical-requests
// and GET|POST /api/equipment/requests[/:id[/decision]] on backend branch
// feature/SPM-286-287-equipment-requests; every rule is re-checked there.

// The event runs 09:00–17:00 SGT on Sunday 10 March 2030.
const START = "2030-03-10T01:00:00.000Z";
const END = "2030-03-10T09:00:00.000Z";
const NOTE = "Availability is confirmed once the event's date and time are chosen.";

const option = (equipmentId, name, category, totalQuantity, availableQuantity) => ({ equipmentId, name, category, description: null, totalQuantity, availableQuantity });

// Stock is total without a window, `available` with one.
async function routeEquipmentOptions(page, available = { 1: 3, 2: 6 }) {
  const queries = [];
  await page.route(/\/api\/events\/equipment-options(\?.*)?$/, (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    const params = new URL(route.request().url()).searchParams;
    const window = params.has("start") ? { start: params.get("start"), end: params.get("end") } : null;
    queries.push(window);
    return route.fulfill({ json: {
      window,
      note: window ? null : NOTE,
      equipment: [option(1, "Projector", "Visual", 10, window ? available[1] : 10), option(2, "Microphone", "Audio", 6, window ? available[2] : 6)],
    } });
  });
  return queries;
}

test("[SPM-286 AC1][AC2][AC3] the organiser chooses equipment for the event's time and cannot save above what is available", async ({ page }, testInfo) => {
  const state = await installConnectSphereMocks(page, { role: "ORGANISER" });
  const queries = await routeEquipmentOptions(page);
  await page.goto("/events/new");
  const next = () => page.getByRole("button", { name: "Next", exact: true }).click();

  await page.getByLabel("Event Title").fill("Equipment showcase");
  await page.getByLabel("Event Purpose").fill("Product demonstrations");
  await page.getByLabel("Executive Abstract & Event Scope").fill("Demos and talks.");
  // Before dates are entered the form asks for stock only (AC2).
  await expect.poll(() => queries.length).toBeGreaterThan(0);
  expect(queries[0]).toBeNull();
  await next();

  const start = new Date(await page.evaluate(() => Date.now()) + 7 * 24 * 60 * 60 * 1000);
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  await page.getByLabel("Primary Proposed Date").fill(localDateTimeInput(start));
  await page.getByLabel("Event End Date & Time").fill(localDateTimeInput(end));
  await page.getByLabel("Targeted In-Person Headcount").fill("80");
  await next(); await next(); await next();
  await expect(page.getByRole("heading", { name: "Technical & Equipment Requirements" })).toBeVisible();
  // The settled dates are sent as the window (AC1).
  // The typed times are Singapore time, sent with their offset.
  await expect.poll(() => queries.at(-1)).toEqual({ start: `${localDateTimeInput(start)}:00+08:00`, end: `${localDateTimeInput(end)}:00+08:00` });

  const equipment = page.getByRole("region", { name: "Equipment", exact: true });
  await expect(equipment.getByText("No equipment requested.")).toBeVisible();
  await equipment.getByRole("button", { name: "Add equipment", exact: true }).click();
  await expect(equipment.getByLabel("Equipment 1", { exact: true })).toHaveValue("1");
  await expect(equipment.getByText("Visual · 3 of 10 available for the event's time")).toBeVisible();

  // Above the available quantity: flagged, and neither Next nor Save as Draft goes through (AC3).
  await equipment.getByLabel("Quantity 1", { exact: true }).fill("5");
  await expect(equipment.getByText("Only 3 Projector available for the event's time.")).toBeVisible();
  await next();
  await expect(page.getByRole("heading", { name: "Technical & Equipment Requirements" })).toBeVisible();
  await expect(equipment.getByText("Reduce the highlighted equipment quantities to what is available.")).toBeVisible();
  await page.getByRole("button", { name: "Save as Draft" }).click();
  expect(state.draftCreateRequests).toHaveLength(0);

  // Add, change and remove lines.
  await equipment.getByLabel("Quantity 1", { exact: true }).fill("3");
  await equipment.getByRole("button", { name: "Add equipment", exact: true }).click();
  await expect(equipment.getByLabel("Equipment 2", { exact: true })).toHaveValue("2");
  await equipment.getByLabel("Quantity 2", { exact: true }).fill("2");
  await expect(equipment.getByText("Audio · 6 of 6 available for the event's time")).toBeVisible();
  await attachScreenshot(testInfo, page, "wizard-equipment");
  await equipment.getByRole("button", { name: "Remove equipment 1", exact: true }).click();
  await expect(equipment.getByLabel("Equipment 1", { exact: true })).toHaveValue("2");

  await page.getByRole("button", { name: "Save as Draft" }).click();
  await expect.poll(() => state.draftCreateRequests.length).toBe(1);
  expect(state.draftCreateRequests[0].equipmentRequirements).toEqual([{ equipmentId: 2, quantity: 2 }]);
});

test("[SPM-286 AC3] a refusal from the backend shows on the equipment step", async ({ page }) => {
  const state = await installConnectSphereMocks(page, { role: "ORGANISER" });
  await routeEquipmentOptions(page, { 1: 10, 2: 6 });
  await page.route("**/api/events/drafts", (route) => route.request().method() !== "POST" ? route.fallback() : route.fulfill({
    status: 400,
    json: { error: "Please correct the highlighted fields.", code: "VALIDATION_FAILED", fields: { equipmentRequirements: "Not enough equipment for the event's date and time: Projector (1 available)." } },
  }));
  await page.goto("/events/new");
  await page.getByLabel("Event Title").fill("Late stock change");
  await page.getByRole("button", { name: "Save as Draft" }).click();
  // Draft fields are optional, so the refusal is the backend's; it opens the equipment step.
  await expect(page.getByRole("heading", { name: "Technical & Equipment Requirements" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Equipment", exact: true }).getByText("Not enough equipment for the event's date and time: Projector (1 available).")).toBeVisible();
  expect(state.draftCreateRequests).toHaveLength(0);
});

// The assigned coordinator's view of an event in Planning.
const coordinatorEvent = (overrides = {}) => ({
  eventId: 42, requestId: "REQ-000042", status: "PLANNING", statusLabel: "Approved & Planning", statusNote: null,
  title: "Synthetic Planning Forum", purpose: "Annual planning forum", description: "Talks and workshops.",
  startDatetime: START, endDatetime: END, expectedAttendance: 150, preferredLayoutType: "THEATRE",
  accessibilityNeeds: [], venuePreferences: [], equipmentRequirements: [{ equipmentId: 1, quantity: 2 }, { equipmentId: 2, quantity: 1 }],
  isRegistrationEnabled: false, registrationCapacity: null, createdAt: "2026-10-10T09:00:00.000Z", updatedAt: "2026-10-12T09:00:00.000Z",
  version: 3, arrangementVersion: 3, organisation: { organisationId: 1, name: "Synthetic Org A" }, isAssignedToCoordinator: true, isOwner: false,
  viewerRelationship: "ASSIGNED_COORDINATOR",
  permissions: { canEdit: true, editableFields: ["title", "purpose", "description"], canViewDraftHistory: false, canViewStaffHistory: true, canSuggestVenue: false },
  coordinatorId: 11, coordinatorName: "Synthetic Coordinator", organiser: { userId: 5, name: "Synthetic Organiser" }, venueSuggestion: null,
  ...overrides,
});

const NAMES = { 1: "Projector", 2: "Microphone" };

async function routeCoordinatorEvent(page, event, respond = null, { requests = [], history = [] } = {}) {
  const sent = { requests: [], arrangementLoads: 0 };
  // The coordinator gets the technical section only (backend SPM-286 AC5).
  const technical = { status: "READY", supportStatus: "UNAVAILABLE", requirements: [], requests };
  await page.route(/\/api\/events\/42(\/.*)?(\?.*)?$/, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fallback();
    if (pathname === "/api/events/42") return route.fulfill({ json: { event } });
    if (pathname === "/api/events/42/history") return route.fulfill({ json: { history, nextCursor: null, lastViewedAt: null } });
    if (pathname === "/api/events/42/readiness") return route.fulfill({ json: { ready: false, failures: [], status: event.status, version: event.version, arrangementVersion: 3 } });
    if (pathname === "/api/events/42/venue-options") return route.fulfill({ json: { event: { eventId: 42 }, venues: [], preferredVenues: [], detailsAvailable: true, availabilityChecked: true, filtersNotChecked: [], canSuggestVenue: false } });
    if (pathname === "/api/events/42/venue-bookings") return route.fulfill({ json: { eventId: 42, requestId: "REQ-000042", eventType: "CONFERENCE", eventTypeLabel: "Conference", canRequestVenueBookings: false, bookings: [] } });
    if (pathname === "/api/events/42/arrangements") {
      sent.arrangementLoads += 1;
      return route.fulfill({ json: { arrangements: { technical } } });
    }
    if (pathname === "/api/events/42/technical-requests" && request.method() === "POST") {
      const body = request.postDataJSON();
      sent.requests.push({ body, key: request.headers()["idempotency-key"] });
      const items = body.items.map((item) => ({ ...item, name: NAMES[item.equipmentId], category: null }));
      const answer = respond?.(body, sent.requests.length) ?? { status: 201, json: {
        technicalRequestId: 7, eventId: 42, requestId: "REQ-000042", status: "PENDING", items, arrangementVersion: 4, createdAt: "2026-10-31T02:00:00.000Z",
      } };
      if (answer.status < 300) technical.requests = [{ requestId: 7, status: "PENDING", supportRequired: null, createdAt: "2026-10-31T02:00:00.000Z", decidedAt: null, equipment: items }, ...technical.requests];
      return route.fulfill(answer);
    }
    return route.fallback();
  });
  return sent;
}

const technicalSection = (page) => page.getByRole("region", { name: "Technical requests", exact: true });

test("[SPM-286 AC5][AC6][AC7] the coordinator sends the event's equipment as one technical request", async ({ page }, testInfo) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const queries = await routeEquipmentOptions(page, { 1: 5, 2: 0 });
  const sent = await routeCoordinatorEvent(page, coordinatorEvent());
  await page.goto("/events/42");

  const section = technicalSection(page);
  await expect(section.getByText("No technical request has been sent yet.")).toBeVisible();
  await section.getByRole("button", { name: "Send technical request" }).click();
  const dialog = page.getByRole("dialog", { name: "Send technical request" });
  // Starts from the organiser's lines, checked against the event's window.
  await expect(dialog.getByLabel("Equipment 1", { exact: true })).toHaveValue("1");
  await expect(dialog.getByLabel("Quantity 1", { exact: true })).toHaveValue("2");
  // 09:00–17:00 SGT, sent with its offset.
  await expect.poll(() => queries.at(-1)).toEqual({ start: "2030-03-10T09:00:00+08:00", end: "2030-03-10T17:00:00+08:00" });
  await expect(dialog.getByText("Audio · 0 of 6 available for the event's time")).toBeVisible();
  await expect(dialog.getByText("Only 0 Microphone available for the event's time.")).toBeVisible();

  // A line above what is free is refused before sending (AC6).
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(dialog.getByText("Reduce the highlighted quantities to what is available, then send.")).toBeVisible();
  expect(sent.requests).toHaveLength(0);

  await dialog.getByRole("button", { name: "Remove equipment 2", exact: true }).click();
  await attachScreenshot(testInfo, page, "coordinator-send-dialog");
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect.poll(() => sent.requests.length).toBe(1);
  expect(sent.requests[0].body).toEqual({ items: [{ equipmentId: 1, quantity: 2 }] });
  expect(sent.requests[0].key).toMatch(/^[0-9a-f-]{36}$/);

  await expect(dialog).toBeHidden();
  await expect(section.getByText("Technical request sent")).toBeVisible();
  await expect(section.getByText("Technical request #7")).toBeVisible();
  await expect(section.getByText("Pending", { exact: true })).toBeVisible();
  await expect(section.getByText("Projector × 2", { exact: true })).toBeVisible();
  // One active request per event.
  await expect(section.getByRole("button", { name: "Send technical request" })).toHaveCount(0);
  await expect(section.getByText("This event already has a pending technical request.")).toBeVisible();
  await attachScreenshot(testInfo, page, "coordinator-request-sent");
});

test("[SPM-286 AC6][AC7] a stock refusal is shown and the coordinator can send again; outside Planning nothing can be sent", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeEquipmentOptions(page, { 1: 5, 2: 6 });
  const sent = await routeCoordinatorEvent(page, coordinatorEvent(), (body, count) => count === 1 ? { status: 409, json: {
    error: "Not enough equipment for the event's time: Projector (2 requested, 1 available).",
    code: "EQUIPMENT_NOT_AVAILABLE",
    items: [{ equipmentId: 1, name: "Projector", requested: 2, available: 1 }],
  } } : null);
  await page.goto("/events/42");
  await technicalSection(page).getByRole("button", { name: "Send technical request" }).click();
  const dialog = page.getByRole("dialog", { name: "Send technical request" });
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(dialog.getByText("Not enough equipment for the event's time: Projector (2 requested, 1 available).")).toBeVisible();
  await dialog.getByLabel("Quantity 1", { exact: true }).fill("1");
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect.poll(() => sent.requests.length).toBe(2);
  expect(sent.requests[1].body.items[0]).toEqual({ equipmentId: 1, quantity: 1 });
  await expect(technicalSection(page).getByText("Technical request sent")).toBeVisible();
});

test("[SPM-286 AC5] a coordinator cannot send a technical request before Planning", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeCoordinatorEvent(page, coordinatorEvent({ status: "UNDER_REVIEW", statusLabel: "Under Review" }));
  await page.goto("/events/42");
  const section = technicalSection(page);
  await expect(section.getByText("Technical requests can be sent while the event is in planning.")).toBeVisible();
  await expect(section.getByRole("button", { name: "Send technical request" })).toHaveCount(0);
});

// ---------- Technical Support (SPM-287) ----------

const listItem = (technicalRequestId, status, title, overrides = {}) => ({
  technicalRequestId, status, createdAt: "2026-10-30T02:00:00.000Z", decidedAt: status === "PENDING" ? null : "2026-10-30T05:00:00.000Z",
  event: { eventId: 40 + technicalRequestId, requestId: `REQ-0000${40 + technicalRequestId}`, title, status: "PLANNING", start: START, end: END, venue: { venueId: 45, name: "Synthetic Grand Hall" } },
  requestedBy: { userId: 11, name: "Synthetic Coordinator" },
  items: [{ equipmentId: 1, name: "Projector", category: "Visual", quantity: 2 }],
  ...overrides,
});

const detailOf = (item, available = 5) => ({
  ...item,
  rejectionReason: item.rejectionReason ?? null,
  decidedBy: item.status === "PENDING" ? null : { userId: 31, name: "Synthetic Technical Support" },
  event: { ...item.event, venue: { ...item.event.venue, address: "1 Harbourfront Walk" } },
  items: item.items.map((line) => ({ ...line, availableQuantity: available })),
  history: [{ action: "TECHNICAL_REQUEST_SENT", details: "Projector x 2", actorRole: "COORDINATOR", actor: { userId: 11, name: "Synthetic Coordinator" }, rejectionReason: null, at: "2026-10-30T02:00:00.000Z" }],
});

async function routeTechnicalRequests(page, { requests, available = {}, decidedElsewhere = new Set() }) {
  const state = { requests, queries: [], decisions: [] };
  await page.route(/\/api\/equipment\/requests(\/.*)?(\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fallback();
    const url = new URL(request.url());
    if (url.pathname === "/api/equipment/requests") {
      const query = Object.fromEntries(url.searchParams);
      state.queries.push(query);
      const search = (query.search ?? "").toLowerCase();
      const matching = state.requests.filter((item) => (!query.status || item.status === query.status) && item.event.title.toLowerCase().includes(search));
      return route.fulfill({ json: { technicalRequests: matching, total: matching.length, nextOffset: null } });
    }
    const match = url.pathname.match(/^\/api\/equipment\/requests\/(\d+)(\/decision)?$/);
    const index = state.requests.findIndex((item) => item.technicalRequestId === Number(match?.[1]));
    if (index < 0) return route.fulfill({ status: 404, json: { error: "Technical request not found.", code: "TECHNICAL_REQUEST_NOT_FOUND" } });
    const current = state.requests[index];
    if (!match[2]) return route.fulfill({ json: detailOf(current, available[current.technicalRequestId] ?? 5) });

    const body = request.postDataJSON();
    state.decisions.push({ id: current.technicalRequestId, body, key: request.headers()["idempotency-key"] });
    if (decidedElsewhere.has(current.technicalRequestId)) {
      decidedElsewhere.delete(current.technicalRequestId);
      state.requests[index] = { ...current, status: "APPROVED", decidedAt: "2026-10-31T01:00:00.000Z" };
      return route.fulfill({ status: 409, json: { error: "This technical request has already been decided.", code: "TECHNICAL_REQUEST_ALREADY_DECIDED", status: "APPROVED" } });
    }
    if (body.decision === "REJECT" && !body.reason?.trim()) {
      return route.fulfill({ status: 400, json: { error: "Please correct the highlighted fields.", code: "VALIDATION_FAILED", fields: { reason: "A reason is required to reject the request." } } });
    }
    const status = body.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    state.requests[index] = { ...current, status, decidedAt: "2026-10-31T03:00:00.000Z", rejectionReason: status === "REJECTED" ? body.reason : null };
    return route.fulfill({ json: { technicalRequestId: current.technicalRequestId, eventId: current.event.eventId, status, rejectionReason: state.requests[index].rejectionReason, decidedAt: "2026-10-31T03:00:00.000Z", arrangementVersion: 5 } });
  });
  return state;
}

const sampleRequests = () => [
  listItem(7, "PENDING", "Synthetic Planning Forum"),
  listItem(8, "PENDING", "Robotics Expo"),
  listItem(6, "APPROVED", "Alumni Gala"),
  listItem(5, "REJECTED", "Film Night", { rejectionReason: "Projectors are out for repair." }),
];

const requestCards = (page) => page.locator("article[data-technical-request-id]");

test("[SPM-287 AC1][AC2][AC3][AC4] Technical Support filter, search, open and approve a request", async ({ page }, testInfo) => {
  await installConnectSphereMocks(page, { role: "TECH_SUPPORT" });
  const state = await routeTechnicalRequests(page, { requests: sampleRequests() });
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Technical Support dashboard", level: 1 })).toBeVisible();
  await expect(requestCards(page)).toHaveCount(4);
  await expect(requestCards(page).first()).toContainText("Synthetic Planning Forum");
  await expect(requestCards(page).first()).toContainText("Projector × 2");
  await expect(page.getByText("2 pending requests awaiting review")).toBeVisible();
  await attachScreenshot(testInfo, page, "technical-support-dashboard");

  await page.getByLabel("Status", { exact: true }).selectOption("APPROVED");
  await expect(requestCards(page)).toHaveCount(1);
  await expect(requestCards(page)).toContainText("Alumni Gala");
  expect(state.queries.at(-1)).toMatchObject({ status: "APPROVED" });

  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByLabel("Search", { exact: true }).fill("robot");
  await expect(requestCards(page)).toHaveCount(1);
  await expect(requestCards(page)).toContainText("Robotics Expo");
  expect(state.queries.at(-1)).toMatchObject({ search: "robot" });
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(requestCards(page)).toHaveCount(4);

  await requestCards(page).first().getByRole("link", { name: /Review/ }).click();
  await expect(page).toHaveURL(/\/technical-requests\/7$/);
  await expect(page.getByRole("heading", { name: "Synthetic Planning Forum", level: 1 })).toBeVisible();
  await expect(page.locator('aside [aria-current="page"]')).toHaveText(/Dashboard/);
  const table = page.getByRole("table");
  await expect(table.getByRole("row", { name: /Projector/ })).toContainText("Visual");
  await expect(page.getByText("Request sent", { exact: true })).toBeVisible();
  await expect(page.getByText("Synthetic Grand Hall, 1 Harbourfront Walk")).toBeVisible();

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Approve this technical request?" });
  await dialog.getByRole("button", { name: "Approve request" }).click();
  await expect.poll(() => state.decisions.length).toBe(1);
  expect(state.decisions[0].body).toEqual({ decision: "APPROVE", reason: null });
  expect(state.decisions[0].key).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByText(/^Technical request approved\./)).toBeVisible();
  await expect(page.getByText("Approved by Synthetic Technical Support", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await attachScreenshot(testInfo, page, "technical-request-approved");
});

test("[SPM-287 AC5][AC6] rejecting needs a reason, which is shown with the decision", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "TECH_SUPPORT" });
  const state = await routeTechnicalRequests(page, { requests: sampleRequests() });
  await page.goto("/technical-requests/8");
  await expect(page.getByRole("heading", { name: "Robotics Expo", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Reject", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Reject this technical request?" });
  await dialog.getByRole("button", { name: "Reject request" }).click();
  await expect(dialog.getByText("Enter a reason for rejecting this request.")).toBeVisible();
  expect(state.decisions).toHaveLength(0);

  await dialog.getByLabel("Reason").fill("All projectors are booked for the career fair.");
  await dialog.getByRole("button", { name: "Reject request" }).click();
  await expect.poll(() => state.decisions.length).toBe(1);
  expect(state.decisions[0].body).toEqual({ decision: "REJECT", reason: "All projectors are booked for the career fair." });
  await expect(page.getByText(/^Technical request rejected\./)).toBeVisible();
  await expect(page.getByText("Reason: All projectors are booked for the career fair.", { exact: true })).toBeVisible();
});

test("[SPM-287 AC6][AC7] approval is blocked when stock is short, and a decision made elsewhere first is reported", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "TECH_SUPPORT" });
  const state = await routeTechnicalRequests(page, { requests: sampleRequests(), available: { 7: 1 }, decidedElsewhere: new Set([8]) });
  await page.goto("/technical-requests/7");
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
  await expect(page.getByText("Can't approve: not enough Projector (1 available).", { exact: false })).toBeVisible();

  await page.goto("/technical-requests/8");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("dialog", { name: "Approve this technical request?" }).getByRole("button", { name: "Approve request" }).click();
  await expect(page.getByText("This technical request has already been decided. The current decision is shown.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  expect(state.decisions).toHaveLength(1);
});

test("[SPM-287] Technical Support see new requests in Updates and the Notifications tab", async ({ page }, testInfo) => {
  await installInbox(page, {
    role: "TECH_SUPPORT",
    notifications: [makeNotification(1, {
      type: "TECHNICAL_REQUEST_SENT",
      title: "New technical request",
      message: "Synthetic Coordinator sent a technical request for Synthetic Planning Forum.",
      event: { event_id: 42, title: "Synthetic Planning Forum" },
      target: { page: "TECHNICAL_REQUESTS", event_id: 42 },
    })],
  });
  await page.goto("/dashboard");
  await expect(updatesButton(page)).toHaveAccessibleName("Updates, 1 unread");
  const tab = page.locator("aside").getByRole("link", { name: "Notifications", exact: true });
  await expect(tab).toHaveAttribute("href", "/notifications");
  await tab.click();
  await expect(page.getByRole("heading", { name: "Notifications", level: 1 })).toBeVisible();
  await expect(tab).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("New technical request")).toBeVisible();
  await attachScreenshot(testInfo, page, "technical-support-inbox");
  // There is no event workspace for Technical Support; the request is on the dashboard.
  await page.getByRole("button", { name: "Go to Event: Synthetic Planning Forum" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Technical requests", exact: true })).toBeVisible();
});
