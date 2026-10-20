import { test, expect } from "@playwright/test";
import { installConnectSphereMocks } from "./support.mjs";

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
  organiser: { userId: 5, name: "Synthetic Organiser" },
  ...overrides,
});

async function routeEvent(page, event) {
  await page.route(/\/api\/events\/42(\/history.*)?$|\/api\/events\/42\/history\?/, (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    if (new URL(route.request().url()).pathname.endsWith("/history")) {
      return route.fulfill({ json: { history: [], nextCursor: null } });
    }
    return event
      ? route.fulfill({ json: { event } })
      : route.fulfill({ status: 404, json: { error: "Not found.", code: "NOT_FOUND" } });
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
