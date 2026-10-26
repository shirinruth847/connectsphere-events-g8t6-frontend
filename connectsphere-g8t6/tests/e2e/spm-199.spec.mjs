import { test, expect } from "@playwright/test";
import { installConnectSphereMocks, makeDraft } from "./support.mjs";

const event = (overrides = {}) => makeDraft({
  eventId: 42, requestId: "REQ-000042", title: "Organiser planning forum",
  status: "PLANNING", statusLabel: "Approved & Planning", description: "Talks and workshops.",
  startDatetime: "2030-02-01T02:00:00Z", endDatetime: "2030-02-01T04:00:00Z", expectedAttendance: 120,
  coordinatorName: "Alex Coordinator", isAssignedToCoordinator: true,
  permissions: { canEdit: false, editableFields: [], canViewDraftHistory: true, canViewStaffHistory: false },
  ...overrides,
});
const impact = (overrides = {}) => ({ status: "NOT_REPORTED", message: null, nextAction: null, ...overrides });
const booking = (overrides = {}) => ({
  bookingId: 1, venueId: 1, venueName: "Main Hall", label: "Opening session", status: "APPROVED", isPrimary: true,
  startDatetime: "2030-02-01T02:00:00Z", endDatetime: "2030-02-01T04:00:00Z", impact: impact(), ...overrides,
});
const hold = (overrides = {}) => ({
  holdId: "hold-a", venueName: "Workshop Hall", label: "Workshop option", status: "ACTIVE",
  startDatetime: "2030-02-01T02:00:00Z", endDatetime: "2030-02-01T04:00:00Z",
  holdExpiresAt: "2030-01-25T00:00:00Z", impact: impact(), ...overrides,
});
const review = (overrides = {}) => ({
  reviewId: 1, round: 1, status: "APPROVED", isCurrent: true, organiserComment: "Keep the emergency exits clear.",
  submittedAt: "2026-10-23T01:00:00Z", decidedAt: "2026-10-24T01:00:00Z", ...overrides,
});
const open = async (page, overrides = {}) => installConnectSphereMocks(page, { draft: event(overrides) });
const venues = (page) => page.getByRole("region", { name: "Venue arrangements", exact: true });
const technical = (page) => page.getByRole("region", { name: "Equipment & technical arrangements", exact: true });
const safety = (page) => page.getByRole("region", { name: "Safety review", exact: true });

test("[SPM-199 TC01/02] owned event details, backend label and coordinator survive direct navigation and reload", async ({ page }) => {
  const state = await open(page);
  await page.goto("/events/42");
  await expect(page.getByRole("heading", { name: "Organiser planning forum", exact: true })).toBeVisible();
  await expect(page.getByText("REQ-000042", { exact: true })).toBeVisible();
  await expect(page.getByText("120 people", { exact: true })).toBeVisible();
  await expect(page.getByText("Alex Coordinator", { exact: true })).toBeVisible();
  await expect(page.getByText("Approved & Planning", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Clarification requests", exact: true })).toHaveCount(1);
  await expect(safety(page)).toHaveCount(1);
  state.events[0] = event({ coordinatorName: "Sam Coordinator", statusNote: "Reconfirmation pending" });
  await page.reload();
  await expect(page.getByText("Sam Coordinator", { exact: true })).toBeVisible();
  await expect(page.getByText("Reconfirmation pending", { exact: true })).toBeVisible();
  expect(state.requestLog.filter(({ method }) => !["GET", "OPTIONS"].includes(method))).toEqual([]);
});

test("[SPM-199 TC02] unassigned requests show Unassigned and the current backend status note", async ({ page }) => {
  await open(page, { status: "SUBMITTED", statusLabel: "Submitted", isAssignedToCoordinator: false, coordinatorName: null, statusNote: "Waiting for a coordinator" });
  await page.goto("/events/42");
  await expect(page.getByText("Unassigned", { exact: true })).toBeVisible();
  await expect(page.getByText("Waiting for a coordinator", { exact: true })).toBeVisible();
});

for (const width of [1440, 390]) {
  test(`[SPM-199 TC03/05] all venues retain statuses, primary and next actions at ${width}px`, async ({ page }, testInfo) => {
    const state = await open(page);
    state.arrangements.venues = { ...state.arrangements.venues, primaryVenueStatus: "READY", bookings: [
      booking({ impact: impact({ status: "AFFECTED", message: "This venue arrangement is affected by unavailability.", nextAction: "Your coordinator will decide the next action." }) }),
      booking({ bookingId: 2, venueId: 2, venueName: "Breakout Hall", label: "Breakout A", status: "PENDING", isPrimary: false }),
      booking({ bookingId: 3, venueId: 3, venueName: "Previous Hall", label: null, status: "REJECTED", isPrimary: false }),
    ] };
    state.arrangements.technical.requests = [{ requestId: 7, status: "APPROVED", supportRequired: true, equipment: [{ equipmentId: 1, name: "Projector", quantity: 2 }] }];
    state.arrangements.safety.reviews = [review()];
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/events/42");
    await expect(venues(page).getByRole("heading", { name: "Main Hall · Opening session" })).toBeVisible();
    await expect(venues(page).getByText("Primary venue", { exact: true })).toHaveCount(1);
    await expect(venues(page).getByText("Pending approval", { exact: true })).toBeVisible();
    await expect(venues(page).getByText("Rejected", { exact: true })).toBeVisible();
    await expect(venues(page).getByText("Your coordinator will decide the next action.", { exact: true })).toBeVisible();
    await expect(safety(page).getByText("Approved", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`spm-199-${width}.png`), fullPage: true });
    await testInfo.attach(`SPM-199-${width}`, { path: testInfo.outputPath(`spm-199-${width}.png`), contentType: "image/png" });
  });
}

test("[SPM-199 TC04] active and expired holds show their expiry and never read as approved bookings", async ({ page }) => {
  const state = await open(page);
  state.arrangements.venues.holds = [hold(), hold({ holdId: "hold-b", status: "EXPIRED", venueName: "Expired option" })];
  await page.goto("/events/42");
  await expect(venues(page).getByText("Tentative hold", { exact: true })).toBeVisible();
  await expect(venues(page).getByText("Expired hold", { exact: true })).toBeVisible();
  await expect(venues(page).getByText(/Hold expiry:/)).toHaveCount(2);
  await expect(venues(page).getByText("A tentative hold is not an approved booking.")).toBeVisible();
  await expect(venues(page).getByText("This hold is no longer active.")).toBeVisible();
  await expect(venues(page).getByText("Approved", { exact: true })).toHaveCount(0);
});

test("[SPM-199 TC05] operational unavailability preserves booking decisions and recorded historical actions", async ({ page }) => {
  const state = await open(page);
  const affected = impact({ status: "AFFECTED", message: "This venue arrangement is affected by unavailability.",
    nextAction: "Your coordinator will decide the next action." });
  state.arrangements.venues = { ...state.arrangements.venues, primaryVenueStatus: "READY", availabilityStatus: "UNAVAILABLE",
    bookings: [booking({ impact: affected }),
      booking({ bookingId: 2, venueId: 2, venueName: "Available Hall", isPrimary: false }),
      booking({ bookingId: 3, venueId: 3, venueName: "Earlier Hall", label: null, status: "RELEASED", isPrimary: false,
        impact: impact({ status: "RESOLVED", message: "A venue availability issue was resolved.",
          nextAction: "A replacement venue has been arranged." }) })],
    holds: [hold({ impact: affected }), hold({ holdId: "old-hold", status: "EXPIRED", venueName: "Earlier option" })],
  };
  await page.goto("/events/42");
  const section = venues(page);
  await expect(section.getByText(affected.message, { exact: true })).toHaveCount(2);
  await expect(section.getByText(affected.nextAction, { exact: true })).toHaveCount(2);
  await expect(section.getByText("Approved", { exact: true })).toHaveCount(2);
  await expect(section.getByText("Released", { exact: true })).toBeVisible();
  await expect(section.getByText("Expired hold", { exact: true })).toBeVisible();
  await expect(section.getByText("A replacement venue has been arranged.", { exact: true })).toBeVisible();
  await expect(section.getByText(/Venue unavailability and next actions could not be fully verified/)).toBeVisible();
  await expect(page.getByText("Approved & Planning", { exact: true })).toBeVisible();
  state.arrangements.venues.bookings[0].impact = impact();
  state.arrangements.venues.holds[0].impact = impact();
  await page.getByRole("button", { name: "Refresh arrangements", exact: true }).click();
  await expect(section.getByText(affected.message, { exact: true })).toHaveCount(0);
  await expect(section.getByText("A replacement venue has been arranged.", { exact: true })).toBeVisible();
});

test("[SPM-199 TC06] requirements and technical decisions remain distinct", async ({ page }) => {
  const state = await open(page);
  state.arrangements.technical.requirements = [{ equipmentId: 1, name: "Projector", quantity: 3 }];
  state.arrangements.technical.requests = [
    { requestId: 7, status: "PENDING", supportRequired: true, equipment: [{ equipmentId: 1, name: "Projector", quantity: 2 }] },
    { requestId: 6, status: "REJECTED", supportRequired: false, equipment: [] },
    { requestId: 5, status: "PARTIALLY_FULFILLED", supportRequired: null, equipment: [{ equipmentId: 1, name: "Projector", quantity: 1 }] },
  ];
  await page.goto("/events/42");
  await expect(technical(page).getByText("Projector × 3", { exact: true })).toBeVisible();
  await expect(technical(page).getByText("Projector × 2", { exact: true })).toBeVisible();
  await expect(technical(page).getByText("Pending approval", { exact: true })).toBeVisible();
  await expect(technical(page).getByText("Rejected", { exact: true })).toBeVisible();
  await expect(technical(page).getByText("Partially fulfilled — not approved", { exact: true })).toBeVisible();
  await expect(technical(page).getByText("Technical support requested", { exact: true })).toBeVisible();
  await expect(technical(page).getByText("Approved", { exact: true })).toHaveCount(0);
});

test("[SPM-199 TC04] a hold expires while the organiser keeps the page open", async ({ page }) => {
  await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
  const state = await open(page);
  state.arrangements.venues.holds = [hold({ holdExpiresAt: "2030-01-01T00:01:00Z" })];
  await page.goto("/events/42");
  await expect(venues(page).getByText("Tentative hold", { exact: true })).toBeVisible();
  state.arrangements.venues.holds[0].status = "EXPIRED";
  await page.clock.fastForward(61_000);
  await expect(venues(page).getByText("Expired hold", { exact: true })).toBeVisible();
  await expect(venues(page).getByText("Tentative hold", { exact: true })).toHaveCount(0);
});

test("[SPM-199 TC07/08] safety outcome and external comments do not confirm the event or expose internal fields", async ({ page }) => {
  const state = await open(page);
  state.arrangements.safety.reviews = [review({ internal_notes: "INTERNAL SECRET", checklist: { comment: "INTERNAL SECRET" } })];
  await page.goto("/events/42");
  await expect(safety(page).getByText("Approved", { exact: true })).toBeVisible();
  await expect(safety(page).getByText("Keep the emergency exits clear.", { exact: true })).toBeVisible();
  await expect(page.getByText("Approved & Planning", { exact: true })).toBeVisible();
  await expect(page.getByText("Confirmed", { exact: true })).toHaveCount(0);
  await expect(page.getByText("INTERNAL SECRET", { exact: false })).toHaveCount(0);
  state.arrangements.safety.reviews[0].isCurrent = false;
  await page.getByRole("button", { name: "Refresh arrangements", exact: true }).click();
  await expect(safety(page).getByText("No safety review applies to the current arrangements.")).toBeVisible();
  await expect(safety(page).getByRole("heading", { name: "Round 1 · Previous arrangements" })).toBeVisible();
});

test("[SPM-199 TC09] event and arrangement denials reveal no arrangements", async ({ page }) => {
  const state = await open(page);
  state.failure = { path: "/api/events/42/arrangements", status: 404, body: { code: "EVENT_NOT_FOUND", error: "Not found" } };
  await page.goto("/events/42");
  await expect(page.getByText("Arrangements not available", { exact: true })).toBeVisible();
  await expect(venues(page)).toHaveCount(0);
  state.failure = { path: "/api/events/42", status: 404, body: { code: "EVENT_NOT_FOUND", error: "Not found" } };
  state.requestLog.length = 0;
  await page.reload();
  await expect(page.getByText("Event not available", { exact: true })).toBeVisible();
  expect(state.requestLog.some(({ pathname }) => pathname.endsWith("/arrangements"))).toBe(false);
});

test("[SPM-199 TC09] an expired arrangement session uses shared login recovery", async ({ page }) => {
  const state = await open(page);
  state.failure = { path: "/api/events/42/arrangements", status: 401, body: { code: "UNAUTHENTICATED", error: "Sign in again" } };
  await page.goto("/events/42");
  await expect(page).toHaveURL(/\/login\?/);
});

test("[SPM-199 TC10] no arrangements shows explicit empty states", async ({ page }) => {
  await open(page);
  await page.goto("/events/42");
  await expect(venues(page).getByText("No venue bookings have been arranged yet.")).toBeVisible();
  await expect(venues(page).getByText("No tentative venue holds.")).toBeVisible();
  await expect(technical(page).getByText("No technical arrangements have been recorded yet.")).toBeVisible();
  await expect(safety(page).getByText("No safety review has been submitted yet.")).toBeVisible();
});

test("[SPM-199] service failures stay distinct from empty arrangements and retry recovers", async ({ page }) => {
  const state = await open(page);
  state.arrangements.venues = { status: "UNAVAILABLE" };
  state.arrangements.technical.supportStatus = "UNAVAILABLE";
  state.arrangements.safety = { status: "UNAVAILABLE" };
  await page.goto("/events/42");
  await expect(venues(page).getByText("No venue bookings have been arranged yet.")).toHaveCount(0);
  await expect(venues(page).getByText(/Venue arrangements could not be loaded/)).toBeVisible();
  await expect(safety(page).getByText(/Safety reviews could not be loaded/)).toBeVisible();
  state.failure = { path: "/api/events/42/arrangements", status: 503, body: { error: "PRIVATE provider detail" } };
  await page.getByRole("button", { name: "Refresh arrangements", exact: true }).click();
  await expect(page.getByText("Could not load arrangements", { exact: true })).toBeVisible();
  await expect(page.getByText("PRIVATE provider detail")).toHaveCount(0);
  state.failure = null;
  state.arrangements.safety = { status: "READY", reviews: [review()] };
  await page.getByRole("button", { name: "Refresh arrangements", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(safety(page).getByText("Approved", { exact: true })).toBeVisible();
});

test("[SPM-199] drafts retain their private editing flow without loading arrangements", async ({ page }) => {
  await open(page, { status: "DRAFT", statusLabel: "Draft", permissions: { canEdit: true, editableFields: [], canViewDraftHistory: true, canViewStaffHistory: false } });
  await page.goto("/events/42");
  await expect(page.getByRole("link", { name: "Continue editing draft" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh arrangements" })).toHaveCount(0);
});


test("[SPM-199] a version conflict removes stale approvals and refresh loads the new arrangements", async ({ page }) => {
  const state = await open(page);
  state.arrangements.safety.reviews = [review()];
  await page.goto("/events/42");
  await expect(safety(page).getByText("Approved", { exact: true })).toBeVisible();
  state.failure = { path: "/api/events/42/arrangements", status: 409,
    body: { code: "ARRANGEMENTS_CHANGED", error: "PRIVATE provider detail" } };
  await page.getByRole("button", { name: "Refresh arrangements", exact: true }).click();
  await expect(page.getByText("Arrangements changed while loading", { exact: true })).toBeVisible();
  await expect(safety(page)).toHaveCount(0);
  await expect(page.getByText("PRIVATE provider detail")).toHaveCount(0);
  state.failure = null;
  state.arrangements.safety.reviews = [review({ isCurrent: false })];
  await page.getByRole("button", { name: "Refresh arrangements", exact: true }).click();
  await expect(safety(page).getByText("No safety review applies to the current arrangements.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Safety review", exact: true })).toHaveCount(1);
  expect(state.requestLog.some(({ pathname }) => pathname.endsWith("/safety-reviews"))).toBe(false);
});
