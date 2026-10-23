import { test, expect } from "@playwright/test";
import { installConnectSphereMocks, attachScreenshot } from "./support.mjs";

// SPM-72/74: the venue section inside an event request. Requirement matching,
// availability and permissions come from the backend; these mocks return the
// shapes GET /api/events/:id/venue-options and the suggestion route send.
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005050201a5d9ad9c0000000049454e44ae426082", "hex");

const eventView = (overrides = {}) => ({
  eventId: 42,
  requestId: "REQ-000042",
  status: "PLANNING",
  statusLabel: "Approved & Planning",
  statusNote: null,
  title: "Venue planning event",
  purpose: "Annual planning forum",
  description: "Talks and workshops.",
  startDatetime: "2026-11-20T02:00:00.000Z",
  endDatetime: "2026-11-20T04:00:00.000Z",
  expectedAttendance: 150,
  preferredLayoutType: "THEATRE",
  accessibilityNeeds: ["Wheelchair access"],
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
  permissions: { canEdit: true, editableFields: ["title", "purpose", "description"], canViewDraftHistory: false, canViewStaffHistory: true, canSuggestVenue: true },
  coordinatorId: 11,
  coordinatorName: "Synthetic Coordinator",
  organiser: { userId: 5, name: "Synthetic Organiser" },
  venueSuggestion: null,
  ...overrides,
});

const requirement = (key, label, status, detail) => ({ key, label, status, detail });
const venue = (overrides = {}) => ({
  venueId: 45,
  name: "Synthetic Grand Hall",
  address: "1 Harbourfront Walk",
  maxCapacity: 300,
  operatingHours: "08:00-22:00",
  accessibilityFeatures: ["Wheelchair accessible entrance"],
  setupMinutes: 30,
  turnaroundMinutes: 45,
  rooms: [{ roomId: 1, layoutType: "THEATRE", capacity: 300 }],
  detailStatus: "CURRENT",
  description: "Main hall with a stage.",
  facilities: ["Projector", "Stage"],
  supportedLayouts: ["THEATRE"],
  emergencyAccess: "Two exits on the north side",
  knownRestrictions: ["No open flames"],
  coverPhotoId: "6716f0c2a1b2c3d4e5f60718",
  availability: { status: "AVAILABLE", label: "Available", occupiedStart: "2026-11-20T01:30:00.000Z", occupiedEnd: "2026-11-20T04:45:00.000Z", conflicts: [], operatingHoursWarning: null },
  requirements: [
    requirement("capacity", "Capacity", "MET", "Holds 300; 150 expected"),
    requirement("availability", "Available on the event date", "MET", "Free for the event, including setup and turnaround"),
    requirement("layout", "Layout", "MET", "THEATRE layout"),
    requirement("accessibility-0", "Accessibility", "MET", "Wheelchair access"),
  ],
  unmetCount: 0,
  allRequirementsMet: true,
  ...overrides,
});
const seminar = venue({
  venueId: 46,
  name: "Synthetic Seminar Room",
  maxCapacity: 80,
  coverPhotoId: null,
  requirements: [
    requirement("capacity", "Capacity", "UNMET", "Holds 80; 150 expected"),
    requirement("availability", "Available on the event date", "MET", "Free for the event, including setup and turnaround"),
    requirement("layout", "Layout", "UNMET", "THEATRE layout"),
    requirement("accessibility-0", "Accessibility", "MET", "Wheelchair access"),
  ],
  unmetCount: 2,
  allRequirementsMet: false,
});
const rooftop = venue({
  venueId: 47,
  name: "Synthetic Rooftop",
  maxCapacity: 400,
  coverPhotoId: null,
  availability: {
    status: "UNAVAILABLE_BOOKING",
    label: "Unavailable – booking",
    occupiedStart: "2026-11-20T01:30:00.000Z",
    occupiedEnd: "2026-11-20T04:45:00.000Z",
    conflicts: [{ type: "BOOKING", label: "Confirmed booking", occupiedStart: "2026-11-20T00:00:00.000Z", occupiedEnd: "2026-11-20T02:15:00.000Z", holdExpiresAt: null, reasonLabel: null }],
    operatingHoursWarning: null,
  },
  requirements: [
    requirement("capacity", "Capacity", "MET", "Holds 400; 150 expected"),
    requirement("availability", "Available on the event date", "UNMET", "Another booking, hold or block overlaps the event"),
    requirement("layout", "Layout", "MET", "THEATRE layout"),
    requirement("accessibility-0", "Accessibility", "MET", "Wheelchair access"),
  ],
  unmetCount: 1,
  allRequirementsMet: false,
});

const options = (overrides = {}) => ({
  event: { eventId: 42, requestId: "REQ-000042", startDatetime: "2026-11-20T02:00:00.000Z", endDatetime: "2026-11-20T04:00:00.000Z", expectedAttendance: 150, preferredLayoutType: "THEATRE", accessibilityNeeds: ["Wheelchair access"] },
  venues: [venue(), rooftop, seminar],
  detailsAvailable: true,
  availabilityChecked: true,
  filtersNotChecked: [],
  canSuggestVenue: true,
  ...overrides,
});

// Routes the event, its venue section and the suggestion; returns what was sent.
async function routeVenueSection(page, { event = eventView(), venueOptions = options(), optionsStatus = 200, suggestStatus = 200, suggestBody = null } = {}) {
  const sent = { options: [], suggestions: [], availability: [] };
  await page.route(/\/api\/events\/42(\/.*)?(\?.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fallback();
    if (url.pathname === "/api/events/42") return route.fulfill({ json: { event } });
    if (url.pathname === "/api/events/42/history") return route.fulfill({ json: { history: [], nextCursor: null } });
    if (url.pathname === "/api/events/42/venue-options") {
      sent.options.push(Object.fromEntries(url.searchParams));
      return route.fulfill({ status: optionsStatus, json: optionsStatus === 200 ? venueOptions : { error: "Internal Server Error" } });
    }
    if (/\/venue-options\/\d+\/photos$/.test(url.pathname)) {
      return route.fulfill({ json: { photos: [{ photoId: "6716f0c2a1b2c3d4e5f60718", position: 0, caption: "Front entrance", contentType: "image/png", size: PNG.length, uploadedAt: "2026-10-20T00:00:00.000Z", updatedAt: null, version: 1 }] } });
    }
    if (/\/venue-options\/\d+\/photos\/\w+$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    if (url.pathname === "/api/events/42/venue-suggestion") {
      sent.suggestions.push({ body: request.postDataJSON(), key: request.headers()["idempotency-key"] });
      const body = suggestBody ?? {
        message: "Synthetic Grand Hall was suggested to the organiser.",
        suggestion: { venueId: 45, name: "Synthetic Grand Hall", address: "1 Harbourfront Walk", maxCapacity: 300, suggestedAt: "2026-10-23T04:00:00.000Z", suggestedBy: "Synthetic Coordinator", version: 1 },
      };
      return route.fulfill({ status: suggestStatus, json: body });
    }
    return route.fulfill({ status: 501, json: { error: `Unmocked ${url.pathname}` } });
  });
  await page.route((url) => url.pathname === "/api/venues/availability", (route) => {
    sent.availability.push(Object.fromEntries(new URL(route.request().url()).searchParams));
    return route.fulfill({ json: { from: "2026-11-01T16:00:00.000Z", to: "2026-12-08T16:00:00.000Z", generatedAt: "2026-10-23T04:00:00.000Z", venues: [{ venueId: 45, name: "Synthetic Grand Hall", address: "1 Harbourfront Walk", status: "ACTIVE", operatingHours: "08:00-22:00", setupMinutes: 30, turnaroundMinutes: 45, buffersRecorded: true, entries: [], overlaps: [], freePeriods: [], summary: "AVAILABLE", summaryLabel: "Available", check: null }] } });
  });
  return sent;
}

const card = (page, name) => page.getByRole("article", { name, exact: true });

test("[SPM-72 TC-VC-001][TC-VC-005][AC1][AC5] the coordinator sees available venues ranked by requirements inside the event", async ({ page }, testInfo) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  await page.goto("/events/42");

  await expect(page.getByText("3 venues available · 1 meets every requirement")).toBeVisible();
  const names = await page.getByRole("article").evaluateAll((items) => items.map((item) => item.getAttribute("aria-label")));
  expect(names).toEqual(["Synthetic Grand Hall", "Synthetic Rooftop", "Synthetic Seminar Room"]);
  await expect(card(page, "Synthetic Grand Hall").getByText("Meets every requirement")).toBeVisible();
  const met = card(page, "Synthetic Grand Hall").getByRole("listitem").filter({ hasText: "Capacity: Holds 300" });
  await expect(met).toHaveClass(/bg-\[#DCFCE7\]/);
  const unmet = card(page, "Synthetic Seminar Room").getByRole("listitem").filter({ hasText: "Capacity: Holds 80" });
  await expect(unmet).toHaveClass(/bg-surface-container-low/);
  await expect(unmet).toContainText("(Not met)");
  await expect(card(page, "Synthetic Rooftop").getByText("Unavailable – booking")).toBeVisible();
  await expect(page.getByRole("link", { name: "Assigned Events", exact: true })).toHaveAttribute("aria-current", "page");
  await attachScreenshot(testInfo, page, "coordinator-venue-section");
});

test("[SPM-72 TC-VC-002][TC-VC-004][AC3][AC11] filters, required facilities and sort are sent to the backend", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const sent = await routeVenueSection(page, { venueOptions: options({ venues: [] }) });
  await page.goto("/events/42");
  await expect(page.getByText("No venues are currently available")).toBeVisible();

  await page.getByLabel("Search", { exact: true }).fill("Hall");
  await page.getByLabel("Minimum capacity").fill("200");
  await page.getByLabel("Required facilities").fill("Projector, Stage");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect.poll(() => sent.options.at(-1)).toEqual({ search: "Hall", minCapacity: "200", requiredFacilities: "Projector,Stage" });
  await expect(page.getByText("No venues match these filters")).toBeVisible();

  await page.getByLabel("Sort by").selectOption("capacity");
  await page.getByRole("button", { name: /Ascending order/ }).click();
  await expect.poll(() => sent.options.at(-1)).toEqual({ search: "Hall", minCapacity: "200", requiredFacilities: "Projector,Stage", sort: "capacity", order: "desc" });
});

test("[SPM-72 TC-VC-006][AC4][AC6] View details shows photos, details and availability for the event date, read-only", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  await page.goto("/events/42");

  await card(page, "Synthetic Grand Hall").getByRole("button", { name: "View details" }).click();
  const panel = page.getByRole("region", { name: "Venue details" });
  await expect(panel.getByRole("img", { name: "Front entrance" })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Synthetic Grand Hall" })).toBeVisible();
  await expect(panel.getByText("30 min", { exact: true })).toBeVisible();
  await expect(panel.getByText("45 min", { exact: true })).toBeVisible();
  await expect(panel.getByText("Projector, Stage")).toBeVisible();
  await expect(panel.getByText(/Occupied .* including setup and turnaround/)).toBeVisible();
  await expect(panel.getByRole("textbox")).toHaveCount(0);

  await panel.getByRole("combobox", { name: "Venue details" }).selectOption({ label: "Synthetic Rooftop" });
  await expect(panel.getByRole("list", { name: "Conflicts" })).toContainText("Confirmed booking");
});

test("[SPM-72 TC-VC-007][AC7] the comparison panel is hidden until the toggle opens it", async ({ page }, testInfo) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  await page.goto("/events/42");

  await expect(page.getByRole("region", { name: "Compare with" })).toHaveCount(0);
  await card(page, "Synthetic Grand Hall").getByRole("button", { name: "View details" }).click();
  await page.getByRole("button", { name: "Compare side by side" }).click();
  await expect(page.getByRole("button", { name: "Hide comparison" })).toHaveAttribute("aria-pressed", "true");
  await card(page, "Synthetic Rooftop").getByRole("button", { name: "Compare" }).click();

  const left = page.getByRole("region", { name: "Venue details" });
  const right = page.getByRole("region", { name: "Compare with" });
  await expect(left.getByRole("heading", { name: "Synthetic Grand Hall" })).toBeVisible();
  await expect(right.getByRole("heading", { name: "Synthetic Rooftop" })).toBeVisible();
  const [leftBox, rightBox] = [await left.boundingBox(), await right.boundingBox()];
  expect(rightBox.x).toBeGreaterThan(leftBox.x + leftBox.width - 1);
  await attachScreenshot(testInfo, page, "venue-comparison");

  await page.getByRole("button", { name: "Hide comparison" }).click();
  await expect(right).toHaveCount(0);
});

test("[SPM-72 TC-VC-008][TC-VC-009][AC8] selecting a venue suggests it to the organiser after confirmation", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const sent = await routeVenueSection(page);
  await page.goto("/events/42");

  await expect(card(page, "Synthetic Seminar Room").getByRole("button", { name: "Select" })).toBeDisabled();
  await card(page, "Synthetic Grand Hall").getByRole("button", { name: "Select" }).click();
  const dialog = page.getByRole("dialog", { name: "Suggest this venue?" });
  await expect(dialog).toContainText("This does not hold or book the venue");
  await dialog.getByRole("button", { name: "Suggest venue" }).click();

  await expect(page.getByText("Synthetic Grand Hall was suggested to the organiser. It is recorded in the event history.")).toBeVisible();
  await expect(card(page, "Synthetic Grand Hall").getByText("Suggested", { exact: true })).toBeVisible();
  expect(sent.suggestions).toHaveLength(1);
  expect(sent.suggestions[0].body).toEqual({ venueId: 45, version: 0 });
  expect(sent.suggestions[0].key).toMatch(/^[0-9a-f-]{36}$/);
});

test("[SPM-72 TC-VC-010][AC10] a suggestion changed elsewhere is refused with a reload option", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page, {
    suggestStatus: 409,
    suggestBody: { error: "The suggested venue was changed after you loaded it. Reload the event, then try again.", code: "VENUE_SUGGESTION_VERSION_CONFLICT" },
  });
  await page.goto("/events/42");

  await card(page, "Synthetic Grand Hall").getByRole("button", { name: "Select" }).click();
  const dialog = page.getByRole("dialog", { name: "Suggest this venue?" });
  await dialog.getByRole("button", { name: "Suggest venue" }).click();
  await expect(dialog.getByText("The suggested venue was changed after you loaded it.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Suggest venue" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Reload" })).toBeVisible();
});

test("[SPM-74 TC16][AC1] the coordinator opens the availability calendar on the event's window", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-03T10:00:00+08:00"));
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const sent = await routeVenueSection(page);
  await page.goto("/events/42");

  await card(page, "Synthetic Grand Hall").getByRole("button", { name: "View details" }).click();
  await page.getByRole("button", { name: "Show availability calendar" }).click();
  await expect(page.getByRole("region", { name: "Venue availability calendar" })).toBeVisible();
  await expect(page.getByLabel("Find a venue")).toHaveCount(0);
  await expect.poll(() => sent.availability.at(-1)).toEqual(expect.objectContaining({
    venueId: "45",
    checkStart: "2026-11-20T10:00:00+08:00",
    checkEnd: "2026-11-20T12:00:00+08:00",
  }));
});

test("[SPM-72 TC-VC-012][AC2] the supervising Lead browses and compares but cannot select", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR_LEAD" });
  await routeVenueSection(page, {
    event: eventView({ viewerRelationship: "SUPERVISING_LEAD", permissions: { canEdit: false, editableFields: [], canViewDraftHistory: false, canViewStaffHistory: false, canSuggestVenue: false } }),
    venueOptions: options({ canSuggestVenue: false }),
  });
  await page.goto("/events/42");

  await expect(page.getByText("Supervising Lead • Read-only")).toBeVisible();
  await expect(page.getByText("Read-only: only the assigned coordinator can select a venue.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Select" })).toHaveCount(0);
  await card(page, "Synthetic Grand Hall").getByRole("button", { name: "View details" }).click();
  await page.getByRole("button", { name: "Compare side by side" }).click();
  await expect(page.getByRole("region", { name: "Compare with" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select this venue" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show availability calendar" })).toHaveCount(0);
  await expect(page.locator('a[aria-current="page"]')).toHaveText(/Assignments/);
});

test("[SPM-72 TC-VC-011][AC9] the organiser sees the suggested venue on their request", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "ORGANISER" });
  const event = eventView({
    viewerRelationship: "OWNER",
    isOwner: true,
    permissions: { canEdit: false, editableFields: [], canViewDraftHistory: true, canViewStaffHistory: false, canSuggestVenue: false },
    venueSuggestion: { venueId: 45, name: "Synthetic Grand Hall", address: "1 Harbourfront Walk", maxCapacity: 300, suggestedAt: "2026-10-23T04:00:00.000Z", suggestedBy: "Synthetic Coordinator", version: 1 },
  });
  delete event.status;
  const sent = await routeVenueSection(page, { event });
  await page.goto("/events/42");

  const suggested = page.getByRole("region", { name: "Suggested venue" });
  await expect(suggested).toContainText("Synthetic Grand Hall");
  await expect(suggested).toContainText("It is not booked yet");
  expect(sent.options).toHaveLength(0);
});

test("[SPM-72 TC-VC-014][AC11] a failed load offers a retry; details unavailable are reported, not shown as unmet", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page, { optionsStatus: 500 });
  await page.goto("/events/42");
  const failure = page.getByRole("alert").filter({ hasText: "Unable to load venues" });
  await expect(failure).toBeVisible();
  await expect(failure.getByRole("button", { name: "Retry" })).toBeVisible();

  await page.unroute(/\/api\/events\/42(\/.*)?(\?.*)?$/);
  await routeVenueSection(page, { venueOptions: options({ detailsAvailable: false, availabilityChecked: false, venues: [venue({ detailStatus: "NOT_CHECKED", availability: { status: "NOT_CHECKED", label: "Availability not checked", occupiedStart: null, occupiedEnd: null, conflicts: [], operatingHoursWarning: null }, requirements: [requirement("availability", "Available on the event date", "NOT_CHECKED", "Availability cannot be checked right now")], unmetCount: 1, allRequirementsMet: false })] }) });
  await failure.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Venue details are temporarily unavailable")).toBeVisible();
  await expect(page.getByText("Availability not checked", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Available", { exact: true })).toHaveCount(0);
});

test("[SPM-72] the venue section works at mobile width", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  await page.goto("/events/42");
  await card(page, "Synthetic Grand Hall").getByRole("button", { name: "View details" }).click();
  await page.getByRole("button", { name: "Compare side by side" }).click();
  await expect(page.getByRole("region", { name: "Compare with" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await attachScreenshot(testInfo, page, "venue-section-mobile");
});
