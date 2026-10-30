import { test, expect } from "@playwright/test";
import { installConnectSphereMocks } from "./support.mjs";

// SPM-186 / SPM-189: Venue Staff approve and reject venue bookings from the
// event view. The mock keeps booking state and answers like
// POST /api/venues/bookings/:id/approve|reject, including 409 when another
// staff member decided first.
const venue = (venueId, name) => ({
  venueId, name, address: `${name} Road`, maxCapacity: 300, operatingHours: "08:00-22:00",
  setupMinutes: 30, turnaroundMinutes: 45, detailsAvailable: true, roomId: venueId * 10, roomLayoutType: "Theater", roomCapacity: 200,
});

const LABELS = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected" };

const booking = (bookingId, status, venueId, venueName, overrides = {}) => ({
  bookingId, label: null, status, statusLabel: LABELS[status], venueId, venueName,
  startDatetime: "2026-11-04T01:00:00.000Z", endDatetime: "2026-11-04T04:00:00.000Z",
  expectedAttendance: 120, submittedAt: "2026-10-07T13:32:08.000Z", updatedAt: "2026-10-08T02:00:00.000Z",
  venue: venue(venueId, venueName), layoutType: "Theater", requiredFacilities: [], accessibilityRequirements: [],
  specialRequirements: null, rejectionReason: null, reviewedAt: null, reviewedByName: null,
  actions: { canApprove: status === "PENDING", canReject: status !== "REJECTED" },
  ...overrides,
});

const eventFor = (status = "PLANNING") => ({
  eventId: 442, requestId: "REQ-000442", title: "Synthetic planning forum", status, eventType: "SEMINAR", eventTypeLabel: "Seminar",
  purpose: "Annual planning", description: "Talks.", startDatetime: "2026-11-04T00:00:00.000Z", endDatetime: "2026-11-04T06:00:00.000Z",
  expectedAttendance: 120, preferredLayoutType: "THEATRE", accessibilityNeeds: [], submittedAt: "2026-10-01T09:00:00.000Z",
  organisationName: "Synthetic Org A", coordinatorName: "Synthetic Coordinator",
});

const decisionState = (bookings) => ({ requests: [], conflictOnce: false, bookings, event: eventFor() });

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function routeDecisions(page, state) {
  await page.route("**/api/venues/bookings/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/venues/bookings/events/442") return json(route, { event: state.event, bookings: state.bookings });
    if (url.pathname === "/api/venues/bookings/events/442/history") {
      state.historyQueries = (state.historyQueries ?? 0) + 1;
      return json(route, { history: state.history ?? [], nextCursor: null });
    }
    const match = url.pathname.match(/^\/api\/venues\/bookings\/(\d+)\/(approve|reject)$/);
    if (!match || request.method() !== "POST") return route.fallback();
    const body = request.postDataJSON();
    state.requests.push({ bookingId: Number(match[1]), decision: match[2], body });
    const index = state.bookings.findIndex((item) => item.bookingId === Number(match[1]));
    if (state.conflictOnce) {
      state.conflictOnce = false;
      state.bookings[index] = booking(state.bookings[index].bookingId, "APPROVED", state.bookings[index].venueId, state.bookings[index].venueName, {
        reviewedAt: "2026-10-24T02:00:00.000Z", reviewedByName: "Other Venue Staff", actions: { canApprove: false, canReject: true },
      });
      return json(route, { error: "This booking has already been actioned by another staff member. Reload it to see the decision.", code: "BOOKING_ALREADY_DECIDED", currentStatus: "APPROVED" }, 409);
    }
    if (match[2] === "reject" && !(body.reason ?? "").trim()) {
      return json(route, { error: "Please correct the highlighted fields.", code: "VALIDATION_FAILED", fields: { reason: "Enter a reason for rejecting this booking." } }, 400);
    }
    const current = state.bookings[index];
    const status = match[2] === "approve" ? "APPROVED" : "REJECTED";
    state.bookings[index] = booking(current.bookingId, status, current.venueId, current.venueName, {
      rejectionReason: status === "REJECTED" ? body.reason.trim() : null,
      reviewedAt: "2026-10-24T03:00:00.000Z", reviewedByName: "Synthetic Venue Staff",
      actions: { canApprove: false, canReject: status === "APPROVED" },
    });
    return json(route, {
      message: status === "APPROVED" ? "Venue booking approved." : "Venue booking rejected.",
      booking: state.bookings[index], event: state.event,
    });
  });
}

const panel = (page, bookingId) => page.locator(`#booking-panel-${bookingId}`);

test("[SPM-186 AC1][AC2][AC4][AC6] Venue Staff approve one booking and the others keep their status", async ({ page }) => {
  const state = decisionState([booking(110, "PENDING", 45, "Synthetic Hall"), booking(111, "PENDING", 46, "Synthetic Room B")]);
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeDecisions(page, state);
  await page.goto("/events/442?booking=110");

  const selected = panel(page, 110);
  await expect(selected.getByText("Awaiting your decision.")).toBeVisible();
  // One booking per decision: no approve-all control anywhere (AC6).
  await expect(page.getByRole("button", { name: /approve all/i })).toHaveCount(0);

  await selected.getByRole("button", { name: "Approve", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Approve this venue booking?" });
  await expect(dialog.getByText("Other bookings under the event keep their status.")).toBeVisible();
  await dialog.getByRole("button", { name: "Approve booking" }).click();

  await expect(page.getByText("Venue booking approved. The coordinator and organiser have been notified.")).toBeVisible();
  expect(state.requests).toEqual([{ bookingId: 110, decision: "approve", body: { expectedStatus: "PENDING" } }]);
  await expect(selected.getByText(/Approved by Synthetic Venue Staff/)).toBeVisible();
  // AC4: Approve is gone once decided; AC2: the sibling stays pending.
  await expect(selected.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  const related = page.getByRole("complementary", { name: "Coordination and related bookings" });
  await expect(related.getByRole("button", { name: /Synthetic Room B/ }).getByText("Pending")).toBeVisible();
});

test("[SPM-186 AC5] the second staff member is told the booking was already actioned", async ({ page }) => {
  const state = decisionState([booking(110, "PENDING", 45, "Synthetic Hall")]);
  state.conflictOnce = true;
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeDecisions(page, state);
  await page.goto("/events/442?booking=110");

  await panel(page, 110).getByRole("button", { name: "Reject", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Reject this venue booking?" });
  await dialog.getByLabel(/Reason/).fill("No staff that day");
  await dialog.getByRole("button", { name: "Reject booking" }).click();

  await expect(page.getByText("This booking has already been actioned by another staff member. Reload it to see the decision.")).toBeVisible();
  await expect(panel(page, 110).getByText(/Approved by Other Venue Staff/)).toBeVisible();
  await expect(panel(page, 110).getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
});

test("[SPM-189 AC1][AC2][AC3][AC5][AC6] rejecting needs a reason, which may suggest alternatives", async ({ page }) => {
  const state = decisionState([booking(110, "PENDING", 45, "Synthetic Hall"), booking(111, "PENDING", 46, "Synthetic Room B")]);
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeDecisions(page, state);
  await page.goto("/events/442?booking=110");

  await panel(page, 110).getByRole("button", { name: "Reject", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Reject this venue booking?" });
  await expect(dialog.getByText("Explain why. You can also suggest other dates or venues.")).toBeVisible();
  await dialog.getByRole("button", { name: "Reject booking" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Enter a reason for rejecting this booking.");
  expect(state.requests).toHaveLength(0);

  const reason = "Projector bay closed. Alternatives: Hall B on 5 Nov, or 9 Nov here.";
  await dialog.getByLabel(/Reason/).fill(reason);
  await dialog.getByRole("button", { name: "Reject booking" }).click();

  await expect(page.getByText(/Venue booking rejected\./)).toBeVisible();
  expect(state.requests).toEqual([{ bookingId: 110, decision: "reject", body: { reason, expectedStatus: "PENDING" } }]);
  const selected = panel(page, 110);
  await expect(selected.getByText(reason)).toBeVisible();
  await expect(selected.getByRole("button", { name: /Reject/ })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Coordination and related bookings" }).getByText("Pending")).toBeVisible();
});

test("[T32] an approved booking can be rejected when the venue can no longer host it", async ({ page }) => {
  const state = decisionState([booking(110, "APPROVED", 45, "Synthetic Hall", {
    reviewedAt: "2026-10-20T03:00:00.000Z", reviewedByName: "Synthetic Venue Staff", actions: { canApprove: false, canReject: true },
  })]);
  state.event = eventFor("CONFIRMED");
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeDecisions(page, state);
  await page.goto("/events/442?booking=110");

  const selected = panel(page, 110);
  await expect(selected.getByText("Only if the venue can no longer host it (e.g. maintenance). The event is not cancelled.")).toBeVisible();
  await selected.getByRole("button", { name: "Reject approved booking" }).click();
  const dialog = page.getByRole("dialog", { name: "Reject this approved booking?" });
  await expect(dialog.getByText(/The organiser is told the venue is no longer available/)).toBeVisible();
  await dialog.getByLabel(/Reason/).fill("Emergency roof repair");
  await dialog.getByRole("button", { name: "Reject booking" }).click();

  await expect(page.getByText(/Venue booking rejected\./)).toBeVisible();
  expect(state.requests[0].body).toEqual({ reason: "Emergency roof repair", expectedStatus: "APPROVED" });
});

test("a booking whose event is not in planning cannot be approved yet", async ({ page }) => {
  const state = decisionState([booking(110, "PENDING", 45, "Synthetic Hall", { actions: { canApprove: false, canReject: true } })]);
  state.event = eventFor("SAFETY_REVIEW");
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeDecisions(page, state);
  await page.goto("/events/442?booking=110");

  await expect(panel(page, 110).getByText("Can be approved once the event is in planning.")).toBeVisible();
  await expect(panel(page, 110).getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
});

test("[SPM-186] My Requests shows the pending and approved counts at the top right", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await page.route("**/api/venues/bookings?**", (route) => json(route, { bookings: [], hasMore: false, pendingCount: 3, approvedCount: 7 }));
  await page.route("**/api/venues/bookings", (route) => json(route, { bookings: [], hasMore: false, pendingCount: 3, approvedCount: 7 }));
  await page.goto("/dashboard");

  const header = page.locator("header").filter({ has: page.getByRole("heading", { name: "My Requests", exact: true }) });
  const tile = header.locator("span").filter({ hasText: /^\d+Pending$/ });
  await expect(tile).toHaveText("3Pending");
  await expect(tile.locator("strong")).toHaveText("3");
  await expect(header.locator("span").filter({ hasText: /^\d+Approved$/ })).toHaveText("7Approved");
});

test("[SPM-186-AC14] the booking panel leads with the venue and requirements and gives the date once", async ({ page }) => {
  const state = decisionState([booking(110, "PENDING", 45, "Synthetic Hall")]);
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeDecisions(page, state);
  await page.goto("/events/442?booking=110");

  const selected = panel(page, 110);
  await expect(selected.getByText("Setup / turnaround")).toBeVisible();
  await expect(selected.getByText("30 / 45 min")).toBeVisible();
  await expect(selected.getByText("Attendance / capacity")).toBeVisible();
  // The booking window is in the row header only, not repeated in the panel or the page header.
  await expect(selected.getByText(/4 Nov 2026/).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText("Booking window")).toHaveCount(0);
  await expect(page.getByText("Submitted", { exact: true })).toHaveCount(0);
});

test("[SPM-186-AC15] Venue Staff see the venue-relevant history of the event", async ({ page }) => {
  const state = decisionState([booking(110, "PENDING", 45, "Synthetic Hall")]);
  state.history = [{
    historyId: 9, action: "VENUE_BOOKING_APPROVED", actor: { userId: 8, name: "Other Venue Staff", role: "VENUE_STAFF" },
    occurredAt: "2026-10-29T01:00:00.000Z", summary: "Venue booking approved", changes: [], audience: "ORGANISER_SAFE",
  }];
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeDecisions(page, state);
  await page.goto("/events/442?booking=110");

  const history = page.getByRole("region", { name: "Change history" });
  await expect(history.getByText("Venue booking approved")).toBeVisible();
  await expect(history.getByText(/Other Venue Staff · Venue Staff/)).toBeVisible();
  const before = state.historyQueries;

  // A decision reloads the history.
  await panel(page, 110).getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("dialog", { name: "Approve this venue booking?" }).getByRole("button", { name: "Approve booking" }).click();
  await expect.poll(() => state.historyQueries).toBeGreaterThan(before);
});

const checks = (overrides = {}) => ({
  venueId: 45, availability: "AVAILABLE",
  occupiedStart: "2026-11-04T00:30:00.000Z", occupiedEnd: "2026-11-04T04:45:00.000Z",
  blocking: [], warnings: [], ...overrides,
});

test("[SPM-186-AC7][SPM-186-AC8][SPM-189-AC14] a blocking check disables Approve with its reason; Reject stays", async ({ page }) => {
  const blocked = checks({ availability: "UNAVAILABLE", blocking: [{ code: "VENUE_BLOCKED", message: "Blocked (Maintenance) 4 Nov, 11:00–11:30." }] });
  const state = decisionState([
    booking(110, "PENDING", 45, "Synthetic Hall", { checks: blocked }),
    booking(111, "PENDING", 46, "Synthetic Room B", { checks: checks({ venueId: 46 }) }),
  ]);
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeDecisions(page, state);
  await page.goto("/events/442?booking=110");

  const selected = panel(page, 110);
  const shown = selected.getByTestId("booking-checks");
  await expect(shown.getByText("Unavailable", { exact: true })).toBeVisible();
  await expect(shown.getByText("Blocked (Maintenance) 4 Nov, 11:00–11:30.")).toBeVisible();
  await expect(selected.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
  await expect(selected.getByText("Can't approve: Blocked (Maintenance) 4 Nov, 11:00–11:30.")).toBeVisible();
  await expect(selected.getByRole("button", { name: "Reject", exact: true })).toBeEnabled();

  // The other booking is checked on its own venue and window.
  await page.getByRole("button", { name: /Synthetic Room B/ }).first().click();
  await expect(panel(page, 111).getByText("All checks passed.")).toBeVisible();
  await expect(panel(page, 111).getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
});

test("[SPM-186-AC9][SPM-186-TC11] warnings do not block, and the confirmation lists them", async ({ page }) => {
  const warned = checks({ warnings: ["Occupied time 22:00–22:45 is outside operating hours (08:00-22:00).", "Synthetic Hall does not list the Banquet layout."] });
  const state = decisionState([booking(110, "PENDING", 45, "Synthetic Hall", { checks: warned })]);
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeDecisions(page, state);
  await page.goto("/events/442?booking=110");

  await expect(panel(page, 110).getByText("Synthetic Hall does not list the Banquet layout.")).toBeVisible();
  await panel(page, 110).getByRole("button", { name: "Approve", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Approve this venue booking?" });
  await expect(dialog.getByText("You are approving with 2 warnings:")).toBeVisible();
  await expect(dialog.getByText("Occupied time 22:00–22:45 is outside operating hours (08:00-22:00).")).toBeVisible();
  await dialog.getByRole("button", { name: "Approve booking" }).click();
  expect(state.requests).toEqual([{ bookingId: 110, decision: "approve", body: { expectedStatus: "PENDING" } }]);
});

test("[SPM-186-AC11][SPM-186-TC13] availability that cannot be checked is never shown as available", async ({ page }) => {
  const unknown = checks({ availability: "NOT_CHECKED", occupiedStart: null, occupiedEnd: null, blocking: [{ code: "AVAILABILITY_NOT_CHECKED", message: "Availability cannot be checked right now. Try again shortly." }] });
  const state = decisionState([booking(110, "PENDING", 45, "Synthetic Hall", { checks: unknown })]);
  await installConnectSphereMocks(page, { role: "VENUE_STAFF" });
  await routeDecisions(page, state);
  await page.goto("/events/442?booking=110");

  const shown = panel(page, 110).getByTestId("booking-checks");
  await expect(shown.getByText("Cannot be checked", { exact: true })).toBeVisible();
  await expect(shown.getByText("Available", { exact: true })).toHaveCount(0);
  await expect(panel(page, 110).getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
});
