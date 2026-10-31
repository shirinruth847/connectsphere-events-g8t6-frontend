import { test, expect } from "@playwright/test";
import { attachScreenshot, installConnectSphereMocks, routeVenuePhotos, venueOption as venue } from "./support.mjs";

// SPM-190: the coordinator requests a tentative hold from the event's venue
// section; Venue Staff place or decline it on My Requests, extend it once and
// release it. The mocks return the shapes of the backend routes (backend
// README "Tentative Holds (SPM-190)"); every rule is the backend's.

// The event runs 09:00–17:00 SGT on Sunday 10 March 2030.
const START = "2030-03-10T01:00:00.000Z";
const END = "2030-03-10T09:00:00.000Z";
const HOLD_ID = "c".repeat(24);

const eventView = (overrides = {}) => ({
  eventId: 42, requestId: "REQ-000042", status: "PLANNING", statusLabel: "Approved & Planning", statusNote: null,
  title: "Synthetic Planning Forum", purpose: "Annual planning forum", description: "Talks.", startDatetime: START, endDatetime: END,
  expectedAttendance: 150, preferredLayoutType: "THEATRE", accessibilityNeeds: [], venuePreferences: [45], equipmentRequirements: [],
  isRegistrationEnabled: false, registrationCapacity: null, createdAt: "2026-10-10T09:00:00.000Z", updatedAt: "2026-10-12T09:00:00.000Z", version: 3,
  organisation: { organisationId: 1, name: "Synthetic Org A" }, isAssignedToCoordinator: true, isOwner: false, viewerRelationship: "ASSIGNED_COORDINATOR",
  permissions: { canEdit: true, editableFields: [], canViewDraftHistory: false, canViewStaffHistory: true, canSuggestVenue: true },
  coordinatorId: 11, coordinatorName: "Synthetic Coordinator", organiser: { userId: 5, name: "Synthetic Organiser" }, venueSuggestion: null,
  ...overrides,
});
const hall = venue();
const options = (event) => ({
  event: { eventId: 42, requestId: "REQ-000042", startDatetime: event.startDatetime, endDatetime: event.endDatetime, expectedAttendance: 150, preferredLayoutType: "THEATRE", accessibilityNeeds: [] },
  venues: [hall], preferredVenues: [{ rank: 1, venueId: 45, name: hall.name, option: hall }],
  detailsAvailable: true, availabilityChecked: true, filtersNotChecked: [], canSuggestVenue: true,
});

const holdRequest = (overrides = {}) => ({
  holdRequestId: 3, eventId: 42, requestId: "REQ-000042", eventTitle: "Synthetic Planning Forum", venueId: 45, venueName: hall.name,
  label: "Synthetic Grand Hall", start: START, end: END, expectedAttendance: 150, note: null, status: "PENDING", statusLabel: "Hold requested",
  requestedAt: "2026-10-30T02:00:00.000Z", requestedByName: "Synthetic Coordinator", decidedAt: null, decidedByName: null, declineReason: null,
  hold: null, holdUnavailable: false, ...overrides,
});
const placed = (overrides = {}) => holdRequest({
  status: "PLACED", statusLabel: "On hold (tentative)", decidedAt: "2026-10-30T03:00:00.000Z", decidedByName: "Synthetic Venue Staff",
  hold: { holdId: HOLD_ID, status: "ACTIVE", statusLabel: "On hold (tentative)", expiresAt: "2026-11-06T03:00:00.000Z", extended: false, occupiedStart: "2030-03-10T00:30:00.000Z", occupiedEnd: "2030-03-10T09:45:00.000Z" },
  ...overrides,
});

// The coordinator's event page with its venue section and holds.
async function routeCoordinator(page, { event = eventView(), holds = [], occupiedStart = "2030-03-10T00:30:00.000Z" } = {}) {
  const sent = { holds: [], withdrawn: [], released: [] };
  let current = holds;
  await page.route(/\/api\/events\/42(\/.*)?(\?.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fallback();
    if (url.pathname === "/api/events/42") return route.fulfill({ json: { event } });
    if (url.pathname === "/api/events/42/readiness") return route.fulfill({ json: { ready: false, failures: [], status: event.status, version: 3, arrangementVersion: 3 } });
    if (url.pathname === "/api/events/42/history") return route.fulfill({ json: { history: [], nextCursor: null } });
    if (url.pathname === "/api/events/42/venue-options") return route.fulfill({ json: options(event) });
    if (url.pathname === "/api/events/42/venue-bookings") return route.fulfill({ json: { eventId: 42, requestId: "REQ-000042", eventType: null, eventTypeLabel: null, canRequestVenueBookings: event.status === "PLANNING", bookings: [] } });
    if (url.pathname === "/api/events/42/venue-bookings/check") {
      const items = request.postDataJSON().bookings;
      return route.fulfill({ json: { bookings: items.map((item, index) => ({ index, checked: true, fields: {}, venueId: item.venueId, availability: "AVAILABLE", occupiedStart, occupiedEnd: "2030-03-10T09:45:00.000Z", blocking: [], warnings: [] })) } });
    }
    if (url.pathname === "/api/events/42/venue-holds" && request.method() === "GET") return route.fulfill({ json: { holds: current } });
    if (url.pathname === "/api/events/42/venue-holds" && request.method() === "POST") {
      const body = request.postDataJSON();
      sent.holds.push({ body, key: request.headers()["idempotency-key"] ?? null });
      const saved = holdRequest({ label: body.label, start: body.start, end: body.end, expectedAttendance: body.expectedAttendance, note: body.note });
      current = [saved, ...current];
      return route.fulfill({ status: 201, json: { message: "Hold requested. Venue Staff will place it or tell you why not.", holdRequest: saved } });
    }
    return route.fulfill({ status: 501, json: { error: `Unmocked ${url.pathname}` } });
  });
  await page.route(/\/api\/venues\/(hold-requests|holds)\//, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/withdraw")) {
      sent.withdrawn.push(url.pathname);
      current = current.map((item) => ({ ...item, status: "WITHDRAWN", statusLabel: "Request withdrawn" }));
      return route.fulfill({ json: { message: "Hold request withdrawn.", holdRequest: current[0] } });
    }
    if (url.pathname.endsWith("/release")) {
      sent.released.push(url.pathname);
      current = current.map((item) => ({ ...item, statusLabel: "Hold released", hold: { ...item.hold, status: "RELEASED", statusLabel: "Hold released" } }));
      return route.fulfill({ json: { message: "Hold released. The venue is free for that time again.", holdRequest: current[0] } });
    }
    return route.fallback();
  });
  await routeVenuePhotos(page);
  return sent;
}

const holdsRegion = (page) => page.getByRole("region", { name: "Tentative holds" });
const holdForm = (page) => page.getByRole("dialog", { name: "Request a tentative hold" });

test("[SPM-190 AC1] the coordinator requests a hold from a venue card and can withdraw it", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const sent = await routeCoordinator(page);
  await page.goto("/events/42");

  await expect(holdsRegion(page).getByText("No holds have been requested.")).toBeVisible();
  await page.getByRole("article", { name: hall.name }).getByRole("button", { name: "Request hold" }).click();

  const form = holdForm(page);
  await expect(form.getByRole("combobox", { name: "Venue (required)", exact: true })).toHaveValue("45");
  await expect(form.getByRole("textbox", { name: "Label (required)" })).toHaveValue(hall.name);
  await expect(form.getByLabel("Start (SGT)")).toHaveValue("2030-03-10T09:00");
  await expect(form.getByLabel("End (SGT)")).toHaveValue("2030-03-10T17:00");
  // Live checks with the booking rules (SPM-186), for this venue and window.
  await expect(form.getByTestId("booking-checks").getByText("Available")).toBeVisible();

  await form.getByLabel("Start (SGT)").fill("2030-03-10T10:00");
  await form.getByLabel("Note for Venue Staff").fill("Keynote rehearsal");
  await form.getByRole("button", { name: "Request hold" }).click();

  await expect(form).toBeHidden();
  await expect(holdsRegion(page).getByText("Hold requested. Venue Staff will place it or tell you why not.")).toBeVisible();
  expect(sent.holds).toHaveLength(1);
  expect(sent.holds[0].key).toBeTruthy();
  expect(sent.holds[0].body).toEqual({
    venueId: 45, label: hall.name, start: "2030-03-10T02:00:00.000Z", end: END, expectedAttendance: 150, note: "Keynote rehearsal",
  });
  const item = holdsRegion(page).locator("li[data-hold-request-id='3']");
  await expect(item.getByText("Hold requested", { exact: true })).toBeVisible();

  await item.getByRole("button", { name: "Withdraw request" }).click();
  await expect(item.getByText("Request withdrawn", { exact: true })).toBeVisible();
  expect(sent.withdrawn).toEqual(["/api/venues/hold-requests/3/withdraw"]);
});

test("[SPM-190 AC3] no hold is possible when setup starts within 24 hours", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const soon = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
  await routeCoordinator(page, { occupiedStart: soon });
  await page.goto("/events/42");

  await holdsRegion(page).getByRole("button", { name: "Request hold" }).click();
  const form = holdForm(page);
  await form.getByRole("combobox", { name: "Venue (required)", exact: true }).selectOption("45");
  await expect(form.getByText("Setup starts within 24 hours, so no hold is possible. Request a booking instead.")).toBeVisible();
  await expect(form.getByRole("button", { name: "Request hold" })).toBeDisabled();
});

test("[SPM-190 AC2][AC6] the coordinator sees a placed hold's expiry and can release it; the Lead only reads", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const sent = await routeCoordinator(page, { holds: [placed()] });
  await page.goto("/events/42");

  const item = holdsRegion(page).locator("li[data-hold-request-id='3']");
  await expect(item.getByText("On hold (tentative)", { exact: true })).toBeVisible();
  await expect(item.getByText(/^Held until /)).toBeVisible();
  await item.getByRole("button", { name: "Release hold" }).click();
  await expect(item.getByText("Hold released", { exact: true })).toBeVisible();
  expect(sent.released).toEqual([`/api/venues/holds/${HOLD_ID}/release`]);
});

test("[SPM-190 AC1] the supervising Lead reads holds without actions", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR_LEAD" });
  await routeCoordinator(page, { event: eventView({ viewerRelationship: "SUPERVISING_LEAD", isAssignedToCoordinator: false }), holds: [placed()] });
  await page.goto("/events/42");

  const region = holdsRegion(page);
  await expect(region.getByText("On hold (tentative)", { exact: true })).toBeVisible();
  await expect(region.getByRole("button")).toHaveCount(0);
});

// ---------- Venue Staff ----------

async function routeVenueStaff(page, requests) {
  const sent = { placed: [], declined: [], extended: [], released: [], lists: [] };
  let current = requests;
  await page.route("**/api/venues/bookings**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/venues/bookings") return route.fallback();
    return route.fulfill({ json: { bookings: [], hasMore: false, pendingCount: 0, approvedCount: 0 } });
  });
  await page.route(/\/api\/venues\/(hold-requests|holds)(\/.*)?(\?.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fallback();
    if (url.pathname === "/api/venues/hold-requests") {
      const status = url.searchParams.get("status");
      sent.lists.push(status);
      const shown = current.filter((item) => !status || item.status === status);
      return route.fulfill({ json: { requests: shown, pendingCount: current.filter((item) => item.status === "PENDING").length } });
    }
    const replace = (next) => { current = current.map((item) => (item.holdRequestId === next.holdRequestId ? next : item)); return next; };
    const id = Number(url.pathname.split("/")[4]);
    if (url.pathname.endsWith("/place")) {
      sent.placed.push({ id, key: request.headers()["idempotency-key"] ?? null });
      const next = replace(placed({ holdRequestId: id }));
      return route.fulfill({ json: { message: "Hold placed. The coordinator has been told when it expires.", holdRequest: next } });
    }
    if (url.pathname.endsWith("/decline")) {
      const { reason } = request.postDataJSON();
      sent.declined.push({ id, reason });
      const next = replace(holdRequest({ holdRequestId: id, status: "DECLINED", statusLabel: "Hold declined", declineReason: reason, decidedAt: "2026-10-30T03:00:00.000Z" }));
      return route.fulfill({ json: { message: "Hold request declined. The coordinator has the reason.", holdRequest: next } });
    }
    if (url.pathname.endsWith("/extend")) {
      const { days } = request.postDataJSON();
      sent.extended.push(days);
      const base = current.find((item) => item.hold?.holdId === HOLD_ID);
      const next = replace({ ...base, hold: { ...base.hold, extended: true, expiresAt: "2026-11-09T03:00:00.000Z" } });
      return route.fulfill({ json: { message: "Hold extended. The coordinator has been told the new expiry.", holdRequest: next } });
    }
    return route.fulfill({ status: 501, json: { error: `Unmocked ${url.pathname}` } });
  });
  return sent;
}

const preview = (overrides = {}) => ({
  venueId: 45, availability: "AVAILABLE", occupiedStart: "2030-03-10T00:30:00.000Z", occupiedEnd: "2030-03-10T09:45:00.000Z",
  blocking: [], warnings: [], expiresAt: "2026-11-06T03:00:00.000Z", ...overrides,
});
const holdCard = (page, id) => page.locator(`article[data-hold-request-id="${id}"]`);

test("[SPM-190 AC1][AC2] Venue Staff place a pending hold after its checks and see its expiry", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  const sent = await routeVenueStaff(page, [holdRequest({ preview: preview() })]);
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Hold requests (1 pending)" })).toBeVisible();
  const card = holdCard(page, 3);
  await expect(card.getByRole("heading", { name: "Synthetic Planning Forum" })).toBeVisible();
  await expect(card.getByTestId("booking-checks").getByText("All checks passed.")).toBeVisible();
  await expect(card.getByText(/If placed now, held until/)).toBeVisible();

  await card.getByRole("button", { name: "Place hold" }).click();
  await expect(page.getByText("Hold placed. The coordinator has been told when it expires.")).toBeVisible();
  expect(sent.placed).toHaveLength(1);
  expect(sent.placed[0].key).toBeTruthy();
  // The pending view no longer lists it; All shows it held.
  await expect(page.getByText("No pending hold requests.")).toBeVisible();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(holdCard(page, 3).getByText("On hold (tentative)", { exact: true })).toBeVisible();
});

test("[SPM-190 AC4] a blocked window cannot be placed; Venue Staff decline it with a reason", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  const sent = await routeVenueStaff(page, [holdRequest({
    preview: preview({ availability: "UNAVAILABLE", blocking: [{ code: "VENUE_BOOKING_CONFLICT", message: "Overlaps an approved booking for REQ-000005 (10 Mar, 10:30–13:45)." }] }),
  })]);
  await page.goto("/dashboard");

  const card = holdCard(page, 3);
  await expect(card.getByText("Overlaps an approved booking for REQ-000005 (10 Mar, 10:30–13:45).")).toBeVisible();
  await expect(card.getByRole("button", { name: "Place hold" })).toBeDisabled();

  await card.getByRole("button", { name: "Decline" }).click();
  const dialog = page.getByRole("dialog", { name: "Decline hold request?" });
  await dialog.getByRole("button", { name: "Decline request" }).click();
  await expect(dialog.getByText("Enter a reason for the coordinator.")).toBeVisible();
  await dialog.getByLabel("Reason").fill("The hall is booked that morning; try the Annex.");
  await dialog.getByRole("button", { name: "Decline request" }).click();

  await expect(dialog).toBeHidden();
  expect(sent.declined).toEqual([{ id: 3, reason: "The hall is booked that morning; try the Annex." }]);
});

test("[SPM-190 AC6] Venue Staff extend an active hold once", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  const sent = await routeVenueStaff(page, [placed()]);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "All", exact: true }).click();
  const card = holdCard(page, 3);
  await card.getByLabel("Extend by").selectOption("3");
  await card.getByRole("button", { name: "Extend", exact: true }).click();

  await expect(page.getByText("Hold extended. The coordinator has been told the new expiry.")).toBeVisible();
  expect(sent.extended).toEqual([3]);
  await expect(card.getByText(/\(extended once\)/)).toBeVisible();
  // Extended once: no second extension is offered.
  await expect(card.getByRole("button", { name: "Extend", exact: true })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Release hold" })).toBeVisible();
});

test('[SPM-190 recovery] an uncertain coordinator request survives reload with its body and key', async ({ page }) => {
  await installConnectSphereMocks(page, { role: 'COORDINATOR' });
  await routeCoordinator(page);
  const commands = [];
  await page.route('**/api/events/42/venue-holds', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON();
    commands.push({ body, key: route.request().headers()['idempotency-key'] });
    return commands.length === 1
      ? route.fulfill({ status: 503, json: { error: 'Commit outcome unknown.' } })
      : route.fulfill({ json: { message: 'Hold requested.', holdRequest: holdRequest(body) } });
  });
  await page.goto('/events/42');
  await holdsRegion(page).getByRole('button', { name: 'Request hold', exact: true }).click();
  let form = holdForm(page);
  await form.getByRole('combobox', { name: 'Venue (required)', exact: true }).selectOption('45');
  await form.getByLabel('Note for Venue Staff').fill('Recover this exact request');
  await expect(form.getByText('Available', { exact: true })).toBeVisible();
  await form.getByRole('button', { name: 'Request hold', exact: true }).click();
  await expect(form.getByText('Commit outcome unknown.')).toBeVisible();
  await page.reload();
  await holdsRegion(page).getByRole('button', { name: 'Request hold', exact: true }).click();
  form = holdForm(page);
  await expect(form.getByLabel('Note for Venue Staff')).toHaveValue('Recover this exact request');
  await form.getByRole('button', { name: 'Request hold', exact: true }).click();
  await expect(form).toBeHidden();
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
});

test('[SPM-190 recovery] an uncertain placement reuses its key after reload', async ({ page }) => {
  await installConnectSphereMocks(page, { role: 'VENUE_STAFF' });
  const requests = [holdRequest({ preview: preview() })];
  await routeVenueStaff(page, requests);
  const keys = [];
  await page.route('**/api/venues/hold-requests/3/place', async route => {
    keys.push(route.request().headers()['idempotency-key']);
    requests[0] = holdRequest({ preview: preview({ availability: 'UNAVAILABLE', blocking: [{ code: 'VENUE_HELD', message: 'Venue already held.' }] }) });
    return keys.length === 1
      ? route.fulfill({ status: 503, json: { error: 'Commit outcome unknown.' } })
      : route.fallback();
  });
  await page.goto('/dashboard');
  await holdCard(page, 3).getByRole('button', { name: 'Place hold', exact: true }).click();
  await expect(page.getByText('Commit outcome unknown.')).toBeVisible();
  await expect(holdCard(page, 3).getByText('Venue already held.')).toBeVisible();
  await expect(holdCard(page, 3).getByRole('button', { name: 'Place hold', exact: true })).toBeEnabled();
  await page.reload();
  await holdCard(page, 3).getByRole('button', { name: 'Place hold', exact: true }).click();
  await expect(page.getByText('No pending hold requests.')).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
});

test('[SPM-190 expiry] an open page removes expired actions and refreshes on focus', async ({ page }, testInfo) => {
  const now = Date.now();
  await page.clock.install({ time: new Date(now) });
  await installConnectSphereMocks(page, { role: 'VENUE_STAFF' });
  const requests = [placed({ hold: { ...placed().hold, expiresAt: new Date(now + 60000).toISOString() } })];
  const sent = await routeVenueStaff(page, requests);
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  const card = holdCard(page, 3);
  await expect(card.getByRole('button', { name: 'Extend', exact: true })).toBeVisible();
  await page.clock.fastForward(120000);
  await expect(card.getByText('Hold expired', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Extend', exact: true })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Release hold', exact: true })).toHaveCount(0);
  await attachScreenshot(testInfo, page, 'expired-hold-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await attachScreenshot(testInfo, page, 'expired-hold-mobile');
  const before = sent.lists.length;
  requests[0] = { ...requests[0], statusLabel: 'Hold released', hold: { ...requests[0].hold, status: 'RELEASED' } };
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => sent.lists.length).toBeGreaterThan(before);
  await expect(card.getByText('Hold released', { exact: true })).toBeVisible();
});

test('[SPM-190 recovery] a definitive conflict ends the saved placement retry', async ({ page }) => {
  await installConnectSphereMocks(page, { role: 'VENUE_STAFF' });
  const requests = [holdRequest({ preview: preview() })];
  await routeVenueStaff(page, requests);
  const keys = [];
  await page.route('**/api/venues/hold-requests/3/place', async route => {
    keys.push(route.request().headers()['idempotency-key']);
    requests[0] = holdRequest({ preview: preview({ availability: 'UNAVAILABLE', blocking: [{ code: 'VENUE_HELD', message: 'Another event holds this venue.' }] }) });
    return route.fulfill({ status: keys.length === 1 ? 503 : 409, json: {
      error: keys.length === 1 ? 'Placement unconfirmed.' : 'Placement rejected: venue conflict.',
    } });
  });
  await page.goto('/dashboard');
  const place = holdCard(page, 3).getByRole('button', { name: 'Place hold', exact: true });
  await place.click();
  await expect(page.getByText('Placement unconfirmed.')).toBeVisible();
  await expect(holdCard(page, 3).getByText('Another event holds this venue.')).toBeVisible();
  await place.click();
  await expect(page.getByText('Placement rejected: venue conflict.')).toBeVisible();
  await expect(place).toBeDisabled();
  await page.reload();
  await expect(holdCard(page, 3).getByRole('button', { name: 'Place hold', exact: true })).toBeDisabled();
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
});
