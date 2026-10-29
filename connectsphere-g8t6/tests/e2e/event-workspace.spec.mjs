import { test, expect } from "@playwright/test";
import { installConnectSphereMocks, organiserView, venueOption } from "./support.mjs";

// SPM-33 event workspace inside the shared dashboard shell. The backend decides
// the viewer's relationship; these mocks return the shapes it sends.
const eventView = (overrides = {}) => ({
  eventId: 42,
  requestId: "REQ-000042",
  status: "UNDER_REVIEW",
  statusLabel: "Under Review",
  statusNote: null,
  title: "Workspace review event",
  purpose: "Annual planning forum",
  description: "Talks and workshops.",
  startDatetime: "2026-11-20T09:00:00.000Z",
  endDatetime: "2026-11-20T11:00:00.000Z",
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
  organisation: { organisationId: 1, name: "Synthetic Org A" },
  isAssignedToCoordinator: true,
  isOwner: false,
  viewerRelationship: "ASSIGNED_COORDINATOR",
  permissions: { canEdit: true, editableFields: ["title", "purpose", "description"], canViewDraftHistory: false, canViewStaffHistory: true },
  coordinatorId: 11,
  organiser: { userId: 5, name: "Synthetic Organiser", email: "organiser@example.test" },
  ...overrides,
});

async function routeEvent(page, event, { history = [], unavailableStatus = 404 } = {}) {
  // Main's coordinator view loads venue choices through its scoped endpoint.
  await page.route(/\/api\/events\/42\/venue-options(?:\?.*)?$/, (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    const venues = (event?.venuePreferences ?? []).map((venueId) => venueOption({ venueId, coverPhotoId: null }));
    return route.fulfill({ json: {
      event, venues, preferredVenues: venues.map((option, index) => ({ rank: index + 1, venueId: option.venueId, name: option.name, option })),
      canSuggestVenue: false, filtersNotChecked: [], detailsAvailable: true, availabilityChecked: true,
    } });
  });
  await page.route(/\/api\/events\/42(\/history.*)?$|\/api\/events\/42\/history\?/, (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    if (new URL(route.request().url()).pathname.endsWith("/history")) {
      return route.fulfill({ json: { history, nextCursor: null } });
    }
    return event
      ? route.fulfill({ json: { event } })
      : route.fulfill({ status: unavailableStatus, json: { error: "Not found.", code: "NOT_FOUND" } });
  });
}

test("[SPM-33 TC-05] assigned coordinator gets the coordination view in the shared shell", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeEvent(page, eventView());
  await page.goto("/events/42");
  await expect(page.locator('[data-dashboard-shell="COORDINATOR"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspace review event", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Assigned Events", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Assigned coordinator • Title, purpose & description editable")).toBeVisible();
  await expect(page.getByText("Access denied")).toHaveCount(0);
});

test("[SPM-33 AC1 / Master 3.5] owner sees organiser labels in the shared shell", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "ORGANISER" });
  // A label equal to the stored state means the backend had none; show the organiser label.
  await routeEvent(page, eventView({ status: "PLANNING", statusLabel: "PLANNING", viewerRelationship: "OWNER", isOwner: true, permissions: { canEdit: false, editableFields: [], canViewDraftHistory: true, canViewStaffHistory: false } }));
  await page.goto("/events/42");
  await expect(page.locator('[data-dashboard-shell="ORGANISER"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspace review event", exact: true })).toBeVisible();
  await expect(page.getByText("Approved & Planning", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Planning", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "My Requests", exact: true })).toHaveAttribute("aria-current", "page");
});

test("[SPM-173 AC6] an owner's view without a stored status uses the organiser label", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "ORGANISER" });
  await routeEvent(page, organiserView(eventView({ status: "SAFETY_REVIEW", statusLabel: "Approved & Planning", viewerRelationship: "OWNER", isOwner: true, permissions: { canEdit: false, editableFields: [], canViewDraftHistory: true, canViewStaffHistory: false } })));
  await page.goto("/events/42");
  await expect(page.getByRole("heading", { name: "Workspace review event", exact: true })).toBeVisible();
  await expect(page.getByText("Approved & Planning", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Owner • Changes by request")).toBeVisible();
  await expect(page.getByText("Only you can see this draft")).toHaveCount(0);
});

test("[SPM-33 AC5 / TC-14] an event outside the viewer's scope is not found, inside the shell", async ({ page }) => {
  // Venue Staff have their own booking view of events (SPM-181), so Technical
  // Support stands in for a role with no relationship to the event.
  await installConnectSphereMocks(page, { role: "TECH_SUPPORT" });
  await routeEvent(page, null);
  await page.goto("/events/42");
  await expect(page.locator('[data-dashboard-shell="TECH_SUPPORT"]')).toBeVisible();
  await expect(page.getByText("Event not available")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to your workspace" })).toHaveAttribute("href", "/dashboard");
});

test("[SPM-33] coordinator workspace works at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeEvent(page, eventView());
  await page.goto("/events/42");
  await expect(page.getByRole("heading", { name: "Workspace review event", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("link", { name: "Assigned Events", exact: true })).toBeVisible();
});


test("[SPM-177 AC2] a reloaded organiser event displays its Coordinator as point of contact", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "ORGANISER" });
  await routeEvent(page, eventView({ isOwner: true, viewerRelationship: "OWNER", coordinatorName: "Alex Coordinator", permissions: { canEdit: false, editableFields: [], canViewDraftHistory: true, canViewStaffHistory: false } }));
  await page.goto("/events/42");
  await expect(page.getByText("Alex Coordinator", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Alex Coordinator", { exact: true })).toBeVisible();
});

test("[SPM-38 AC1 / TC-1, TC-3] coordinator can review assigned request details and long text", async ({ page }) => {
  const description = "Full request detail. ".repeat(100).slice(0, 2000);
  const submittedHistory = [
    {
      historyId: 2,
      action: "COORDINATOR_ASSIGNED",
      actor: { userId: 10, name: "Synthetic Lead", role: "COORDINATOR_LEAD" },
      occurredAt: "2026-10-12T10:00:00.000Z",
      summary: "Coordinator assigned.",
      changes: [{ field: "status", before: "SUBMITTED", after: "UNDER_REVIEW" }],
      audience: "STAFF_ONLY",
    },
    {
      historyId: 1,
      action: "EVENT_SUBMITTED",
      actor: { userId: 5, name: "Synthetic Organiser", role: "ORGANISER" },
      occurredAt: "2026-10-12T09:00:00.000Z",
      summary: null,
      changes: [],
      audience: "ORGANISER_SAFE",
    },
  ];
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeEvent(page, eventView({
    description,
    technicalSupportNeeds: "AV setup and presentation assistance.",
    venuePreferences: [7, 8],
    equipmentRequirements: [{ equipmentId: 12, quantity: 2 }],
  }), { history: submittedHistory });
  const venues = [7, 8].map((venueId) => venueOption({ venueId, name: `Synthetic Venue ${venueId}`, coverPhotoId: null }));
  await page.route(/\/api\/events\/42\/venue-options(?:\?.*)?$/, (route) => route.fulfill({ json: {
    event: eventView(), venues, preferredVenues: venues.map((option, index) => ({ rank: index + 1, venueId: option.venueId, name: option.name, option })),
    canSuggestVenue: false, filtersNotChecked: [], detailsAvailable: true, availabilityChecked: true,
  } }));
  await page.goto("/events/42");

  await expect(page.getByRole("heading", { name: "Workspace review event", exact: true })).toBeVisible();
  await expect(page.getByText("Under Review", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Annual planning forum", { exact: true })).toBeVisible();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  await expect(page.getByText("AV setup and presentation assistance.", { exact: true })).toBeVisible();
  await expect(page.getByText("Date & time").locator("..").getByText(/20 Nov 2026 · 17:00–19:00 SGT/)).toBeVisible();
  await expect(page.getByText("120 people", { exact: true })).toBeVisible();
  const preferred = page.getByRole("region", { name: "Organiser's venue choices" }).getByRole("article");
  await expect(preferred).toHaveCount(2);
  await expect(preferred.nth(0)).toContainText("Synthetic Venue 7");
  await expect(preferred.nth(1)).toContainText("Synthetic Venue 8");
  await expect(page.getByText("Equipment #12 × 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Section 5: Technical & equipment", exact: true })).toBeVisible();
  await expect(page.getByText("Technical-support requests are created during Planning.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Synthetic Organiser", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "organiser@example.test", exact: true })).toHaveAttribute("href", "mailto:organiser@example.test");
  await expect(page.getByRole("heading", { name: "Change history" })).toBeVisible();
  await expect(page.getByText("Request submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("Request status: Submitted", { exact: true })).toBeVisible();
  await expect(page.getByText("Request status: Submitted → Under Review", { exact: true })).toBeVisible();
});


test("[SPM-38 AC2 / Master 4.2] an unassigned coordinator cannot open an event", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeEvent(page, null);
  await page.goto("/events/42");
  await expect(page.locator('[data-dashboard-shell="COORDINATOR"]')).toBeVisible();
  await expect(page.getByText("Event not available")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to your workspace" })).toHaveAttribute("href", "/dashboard");
});


test("[SPM-38 AC2] an attendee opening an event directly cannot see its details", async ({ page }) => {
  const state = await installConnectSphereMocks(page, { role: "ATTENDEE" });
  await page.route("**/api/events/discovery/42", (route) => route.fulfill({ status: 404, json: { error: "Not found.", code: "NOT_FOUND" } }));
  await routeEvent(page, null);
  await page.goto("/events/42");
  await expect(page.getByText("This event is not available", { exact: true })).toBeVisible();
  expect(state.requestLog.some(({ pathname }) => pathname === "/api/events/42" || pathname === "/api/events/42/history")).toBe(false);
  await expect(page.getByRole("heading", { name: "Workspace review event", exact: true })).toHaveCount(0);
});


test("[SPM-38 TC-2] an unauthenticated user is redirected from the review URL to sign-in", async ({ page }) => {
  await installConnectSphereMocks(page, { authenticated: false });
  await page.goto("/events/42");
  await expect(page).toHaveURL(/\/login\?next=%2Fevents%2F42/);
});


test("[SPM-38 / Master 4.2] a forbidden response does not reveal private event details", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeEvent(page, null, { unavailableStatus: 403 });
  await page.goto("/events/42");
  await expect(page.getByText("Event not available")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspace review event", exact: true })).toHaveCount(0);
});


for (const width of [390, 1440]) {
  test(`[SPM-38] maximum email and support needs fit at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await installConnectSphereMocks(page, { role: "COORDINATOR" });
    const email = "a".repeat(64) + "@" + "b".repeat(60) + "." + "c".repeat(19) + ".test";
    const technicalSupportNeeds = "Support needed. ".repeat(134).slice(0, 2000);
    await routeEvent(page, eventView({ technicalSupportNeeds, organiser: { userId: 5, name: "Synthetic Organiser", email } }));
    await page.goto("/events/42");
    await expect(page.getByRole("link", { name: email, exact: true })).toBeVisible();
    await expect(page.getByText(technicalSupportNeeds, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await testInfo.attach(`spm38-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });
}

test("[SPM-38] organiser history uses the backend's organiser labels", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "ORGANISER" });
  await routeEvent(page, organiserView(eventView({ statusLabel: "Approved & Planning", viewerRelationship: "OWNER", isOwner: true, permissions: { canEdit: false, editableFields: [], canViewDraftHistory: true, canViewStaffHistory: false } })), {
    history: [{ historyId: 1, action: "SAFETY_REVIEW_SUBMITTED", actor: { userId: 11, name: "Synthetic Coordinator", role: "COORDINATOR" }, occurredAt: "2026-10-12T09:00:00Z", summary: null, audience: "ORGANISER_SAFE", changes: [{ field: "status", before: "PLANNING", after: "SAFETY_REVIEW", beforeLabel: "Approved & Planning", afterLabel: "Approved & Planning" }] }],
  });
  await page.goto("/events/42");
  await expect(page.getByText("Request status: Approved & Planning → Approved & Planning", { exact: true })).toBeVisible();
  await expect(page.getByText("Planning", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Safety Review", { exact: true })).toHaveCount(0);
});

test("[SPM-38] legacy requests show an explicit empty support state", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeEvent(page, eventView());
  await page.goto("/events/42");
  await expect(page.getByText("No technical support needs were provided.", { exact: true })).toBeVisible();
});
