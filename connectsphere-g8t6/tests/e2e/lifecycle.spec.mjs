import { test, expect } from "@playwright/test";
import { attachScreenshot, installConnectSphereMocks } from "./support.mjs";

// SPM-173 coordinator lifecycle panel. The mocks return the shapes the backend
// sends (backend README, "Event Lifecycle (SPM-173)"); the backend decides.
const eventView = (overrides = {}) => ({
  eventId: 42,
  requestId: "REQ-000042",
  status: "PLANNING",
  statusLabel: "Approved & Planning",
  statusNote: null,
  title: "Lifecycle event",
  purpose: "Annual planning forum",
  description: "Talks and workshops.",
  startDatetime: "2027-11-20T09:00:00.000Z",
  endDatetime: "2027-11-20T11:00:00.000Z",
  expectedAttendance: 120,
  preferredLayoutType: "THEATRE",
  accessibilityNeeds: [],
  venuePreferences: [],
  equipmentRequirements: [],
  isRegistrationEnabled: false,
  registrationCapacity: null,
  createdAt: "2026-10-10T09:00:00.000Z",
  updatedAt: "2026-10-12T09:00:00.000Z",
  version: 3,
  arrangementVersion: 2,
  organisation: { organisationId: 1, name: "Synthetic Org A" },
  isAssignedToCoordinator: true,
  isOwner: false,
  viewerRelationship: "ASSIGNED_COORDINATOR",
  permissions: { canEdit: true, editableFields: ["title", "purpose", "description"], canViewDraftHistory: false, canViewStaffHistory: true },
  coordinatorId: 11,
  organiser: { userId: 5, name: "Synthetic Organiser" },
  ...overrides,
});

const notReady = {
  ready: false,
  failures: [
    { code: "BOOKING_NOT_APPROVED", message: "Every venue booking must be approved; holds and pending requests do not count." },
    { code: "NO_PRIMARY_VENUE", message: "Choose one approved venue booking as the primary venue." },
  ],
};

// One route for the event, its history, readiness and the four actions. A POST
// answers "refusal" ({ status, json }) when given, otherwise succeeds with "next".
async function routeLifecycle(page, { event, readiness = { ready: true, failures: [] }, next = null, refusal = null, requests = [] }) {
  let current = event;
  await page.route(/\/api\/events\/42(\/.*)?(\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fallback();
    const { pathname } = new URL(request.url());
    if (pathname.endsWith("/history")) return route.fulfill({ json: { history: [], nextCursor: null } });
    if (pathname.endsWith("/readiness")) {
      return route.fulfill({ json: { ...readiness, status: current.status, version: current.version, arrangementVersion: 2 } });
    }
    if (request.method() === "POST") {
      requests.push({ path: pathname, body: request.postDataJSON(), key: request.headers()["idempotency-key"] });
      if (refusal) return route.fulfill({ status: refusal.status, json: refusal.json });
      current = next;
      return route.fulfill({ json: { message: "Event submitted for safety review.", event: current } });
    }
    return route.fulfill({ json: { event: current } });
  });
}

test("[SPM-173 AC8 / TC-14] the coordinator sees each readiness item and cannot submit yet", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeLifecycle(page, { event: eventView(), readiness: notReady });
  await page.goto("/events/42");
  const panel = page.getByRole("region", { name: "Next step" });
  await expect(panel.getByText("Not ready yet")).toBeVisible();
  await expect(panel.getByText("Choose one approved venue booking as the primary venue.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Submit for safety review" })).toBeDisabled();
});

test("[SPM-173 AC9 / TC-12] a ready event is submitted for safety review with its version and a key", async ({ page }, testInfo) => {
  const requests = [];
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeLifecycle(page, {
    event: eventView(),
    next: eventView({ status: "SAFETY_REVIEW", version: 4 }),
    requests,
  });
  await page.goto("/events/42");
  const panel = page.getByRole("region", { name: "Next step" });
  await expect(panel.getByText("Ready", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Submit for safety review" }).click();

  await expect(page.getByText("Status updated")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Confirm event" })).toBeVisible();
  await expect(panel.getByText("Confirmation also needs a Safety Officer's approval")).toBeVisible();
  expect(requests).toEqual([
    { path: "/api/events/42/submit-for-safety-review", body: { version: 3 }, key: expect.stringMatching(/^[0-9a-f-]{36}$/) },
  ]);
  await attachScreenshot(testInfo, page, "lifecycle-desktop");
});

test("[SPM-173 TC-17] a refused confirmation is explained and nothing changes", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeLifecycle(page, {
    event: eventView({ status: "SAFETY_REVIEW" }),
    refusal: { status: 409, json: { error: "x", code: "SAFETY_APPROVAL_REQUIRED" } },
  });
  await page.goto("/events/42");
  const panel = page.getByRole("region", { name: "Next step" });
  await panel.getByRole("button", { name: "Confirm event" }).click();
  await expect(panel.getByText("The event needs a safety approval for its current arrangements before you can confirm it.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Confirm event" })).toBeEnabled();
});

test("[SPM-173 AC5] a stale version shows the latest event instead", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeLifecycle(page, {
    event: eventView({ status: "CONFIRMED" }),
    refusal: {
      status: 409,
      json: { error: "x", code: "EVENT_VERSION_CONFLICT", event: eventView({ status: "PREPARATION", version: 5 }) },
    },
  });
  await page.goto("/events/42");
  const panel = page.getByRole("region", { name: "Next step" });
  await panel.getByRole("button", { name: "Start preparation" }).click();
  await expect(panel.getByText("This event changed after you opened it.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Start preparation" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Mark as completed" })).toBeVisible();
});

test("[SPM-173 TC-24] completion is offered only after the event ends", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeLifecycle(page, { event: eventView({ status: "PREPARATION" }) });
  await page.goto("/events/42");
  const panel = page.getByRole("region", { name: "Next step" });
  await expect(panel.getByRole("button", { name: "Mark as completed" })).toBeDisabled();
  await expect(panel.getByText("Available after the event has ended.")).toBeVisible();
});

test("[SPM-173] lifecycle panel works at mobile width", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeLifecycle(page, { event: eventView(), readiness: notReady });
  await page.goto("/events/42");
  await expect(page.getByRole("region", { name: "Next step" }).getByText("Not ready yet")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await attachScreenshot(testInfo, page, "lifecycle-mobile");
});
