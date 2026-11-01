import { test, expect } from "@playwright/test";
import { installConnectSphereMocks, attachScreenshot, requirement, routeVenuePhotos, venueOption as venue } from "./support.mjs";

// SPM-72/74/75: the venue section inside an event request. It opens on the
// organiser's choices; "Find another venue" opens the search in a popup. Requirement
// matching, availability and permissions come from the backend; these mocks
// return the shapes GET /api/events/:id/venue-options and the suggestion route send.

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
  venuePreferences: [45, 99],
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
  venueSuggestions: [],
  ...overrides,
});

const seminar = venue({
  venueId: 46,
  name: "Synthetic Seminar Room",
  maxCapacity: 80,
  coverPhotoId: null,
  requirements: [
    requirement("capacity", "Capacity", "UNMET", "Holds 80; 150 expected"),
    requirement("availability", "Availability", "MET", "Available"),
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
    requirement("availability", "Availability", "UNMET", "Unavailable – booking"),
    requirement("layout", "Layout", "MET", "THEATRE layout"),
    requirement("accessibility-0", "Accessibility", "MET", "Wheelchair access"),
  ],
  unmetCount: 1,
  allRequirementsMet: false,
});

const options = (overrides = {}) => ({
  event: { eventId: 42, requestId: "REQ-000042", startDatetime: "2026-11-20T02:00:00.000Z", endDatetime: "2026-11-20T04:00:00.000Z", expectedAttendance: 150, preferredLayoutType: "THEATRE", accessibilityNeeds: ["Wheelchair access"] },
  venues: [venue(), rooftop, seminar],
  preferredVenues: [
    { rank: 1, venueId: 45, name: "Synthetic Grand Hall", option: venue() },
    { rank: 2, venueId: 99, name: "Synthetic Closed Hall", option: null },
  ],
  detailsAvailable: true,
  availabilityChecked: true,
  filtersNotChecked: [],
  canSuggestVenue: true,
  ...overrides,
});

// Routes the event, its venue section and the suggestion; returns what was sent.
async function routeVenueSection(page, { event = eventView(), venueOptions = options(), optionsStatus = 200, suggestStatus = 200, suggestBody = null, history = [] } = {}) {
  const sent = { options: [], suggestions: [], availability: [] };
  await page.route(/\/api\/events\/42(\/.*)?(\?.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fallback();
    if (url.pathname === "/api/events/42") return route.fulfill({ json: { event } });
    if (url.pathname === "/api/events/42/history") return route.fulfill({ json: { history, nextCursor: null } });
    // SPM-179's booking list in the same section; requests are covered in venue-booking-request.spec.mjs.
    if (url.pathname === "/api/events/42/venue-bookings") {
      return route.fulfill({ json: { eventId: 42, requestId: "REQ-000042", eventType: null, eventTypeLabel: null, canRequestVenueBookings: false, bookings: [] } });
    }
    if (url.pathname === "/api/events/42/venue-options") {
      const params = {};
      for (const [key, value] of url.searchParams) params[key] = key in params ? [].concat(params[key], value) : value;
      sent.options.push(params);
      return route.fulfill({ status: optionsStatus, json: optionsStatus === 200 ? venueOptions : { error: "Internal Server Error" } });
    }
    if (url.pathname === "/api/events/42/venue-suggestions") {
      sent.suggestions.push({ body: request.postDataJSON(), key: request.headers()["idempotency-key"] });
      const body = suggestBody ?? {
        message: "Sent to the organiser in Clarification Request 1. They can amend their venue choices there.",
        suggestions: [{ venueId: 47, name: "Synthetic Rooftop", address: "1 Harbourfront Walk", maxCapacity: 400, suggestedAt: "2026-11-01T04:00:00.000Z", suggestedBy: "Synthetic Coordinator", fromOrganiserChoices: false }],
        clarificationRound: 1,
      };
      return route.fulfill({ status: suggestStatus, json: body });
    }
    // The organiser's arrangements and clarifications come from the shared mocks.
    if (["/api/events/42/arrangements", "/api/events/42/clarifications"].includes(url.pathname)) return route.fallback();
    if (url.pathname === "/api/events/42/venue-choices") {
      return route.fulfill({ json: { preferredVenues: venueOptions.preferredVenues, suggestedVenues: venueOptions.suggestedVenues ?? [], detailsAvailable: true, availabilityChecked: true } });
    }
    return route.fulfill({ status: 501, json: { error: `Unmocked ${url.pathname}` } });
  });
  await routeVenuePhotos(page);
  await page.route((url) => url.pathname === "/api/events/42/venue-availability", (route) => {
    sent.availability.push(Object.fromEntries(new URL(route.request().url()).searchParams));
    return route.fulfill({ json: { from: "2026-11-01T16:00:00.000Z", to: "2026-12-08T16:00:00.000Z", generatedAt: "2026-10-23T04:00:00.000Z", venues: [{ venueId: 45, name: "Synthetic Grand Hall", address: "1 Harbourfront Walk", status: "ACTIVE", operatingHours: "08:00-22:00", setupMinutes: 30, turnaroundMinutes: 45, buffersRecorded: true, entries: [], overlaps: [], freePeriods: [], summary: "AVAILABLE", summaryLabel: "Available", check: null }] } });
  });
  return sent;
}

const choices = (page) => page.getByRole("region", { name: "Organiser's venue choices" });
const search = (page) => page.getByRole("region", { name: "Venue search" });
const card = (page, name) => search(page).getByRole("article", { name, exact: true });
const popup = (page) => page.getByRole("dialog", { name: "Find another venue" });
const openSearch = async (page) => {
  await page.getByRole("button", { name: "Find another venue" }).click();
  await expect(popup(page)).toBeVisible();
};

test("[SPM-72 TC-VC-001][AC1] the section opens on the organiser's choices with the search collapsed", async ({ page }, testInfo) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  await page.goto("/events/42");

  const first = choices(page).getByRole("article", { name: "Synthetic Grand Hall", exact: true });
  await expect(first.getByText("Organiser's choice 1")).toBeVisible();
  await expect(first.locator("img")).toBeVisible();
  await expect(first.getByText("Setup 30 · Turnaround 45 min")).toBeVisible();
  // Capacity sits in its check; availability is a check, not a separate chip.
  await expect(first.getByText("Capacity 300", { exact: true })).toBeVisible();
  // Its check is only in the closed (inert, zero-height) details.
  expect(await first.getByText("Available", { exact: true }).evaluate((element) => Boolean(element.closest("[inert]")) && element.closest("[inert]").getBoundingClientRect().height < 1)).toBe(true);
  const closed = choices(page).getByRole("article", { name: "Synthetic Closed Hall" });
  await expect(closed).toContainText("Organiser's choice 2");
  await expect(closed).toContainText("No longer available for new requests.");
  await expect(search(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show comparison view" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Find another venue" })).toHaveAttribute("aria-haspopup", "dialog");
  await expect(popup(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Assigned Events", exact: true })).toHaveAttribute("aria-current", "page");
  await attachScreenshot(testInfo, page, "coordinator-organiser-choices");
});

test("[SPM-72 TC-VC-005][AC5] the search ranks venues by requirements, three to a row, met in green and unmet in grey", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  await page.goto("/events/42");
  await openSearch(page);

  await expect(search(page).getByText("3 venues available · 1 meets every requirement")).toBeVisible();
  const names = await search(page).getByRole("article").evaluateAll((items) => items.map((item) => item.getAttribute("aria-label")));
  expect(names).toEqual(["Synthetic Grand Hall", "Synthetic Rooftop", "Synthetic Seminar Room"]);
  const tops = await search(page).getByRole("article").evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  await expect(card(page, "Synthetic Grand Hall").getByText("Organiser's choice 1")).toBeVisible();
  await expect(card(page, "Synthetic Grand Hall").getByText("Meets every requirement")).toBeVisible();
  const met = card(page, "Synthetic Grand Hall").getByRole("listitem").filter({ hasText: "Capacity: Holds 300" });
  await expect(met).toHaveClass(/bg-\[#DCFCE7\]/);
  const unmet = card(page, "Synthetic Seminar Room").getByRole("listitem").filter({ hasText: "Capacity: Holds 80" });
  await expect(unmet).toHaveClass(/bg-surface-container-low/);
  await expect(unmet).toContainText("(Not met)");
  await expect(card(page, "Synthetic Rooftop").getByText("Availability: Unavailable – booking")).toBeVisible();
  await expect(page.getByText("Venues meeting every requirement of this request come first")).toHaveCount(0);
  await expect(page.getByText("Free for the event, including setup and turnaround")).toHaveCount(0);
  await attachScreenshot(testInfo, page, "coordinator-venue-search");
});

test("[SPM-72 TC-VC-002][TC-VC-004][AC3][AC11] filters, required facilities and sort are sent to the backend", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const sent = await routeVenueSection(page);
  await page.goto("/events/42");
  await openSearch(page);
  await expect(search(page).getByRole("article")).toHaveCount(3);

  await page.getByLabel("Search", { exact: true }).fill("Hall");
  await page.getByLabel("Minimum capacity").fill("200");
  // Layout, facility, accessibility and ranking are dropdowns of the venues' values.
  // Layout, Facility and Accessibility are multi-selects of the venues'
  // values, named by greyed placeholder text; there is no Rank by filter.
  await expect(page.getByRole("button", { name: /Rank by|Required facilities/ })).toHaveCount(0);
  const pick = async (name, values) => {
    await page.getByRole("button", { name, exact: true }).click();
    const group = page.getByRole("group", { name });
    for (const value of values) await group.getByRole("checkbox", { name: value }).check();
    await page.keyboard.press("Escape");
    // Escape closes only the list, not the search popup.
    await expect(group).toHaveCount(0);
    await expect(popup(page)).toBeVisible();
  };
  await page.getByRole("button", { name: "Facility", exact: true }).click();
  expect(await page.getByRole("group", { name: "Facility" }).getByRole("checkbox").evaluateAll((items) => items.map((item) => item.closest("label").textContent))).toEqual(["Projector", "Stage"]);
  await page.keyboard.press("Escape");
  await pick("Layout", ["Theatre"]);
  await pick("Facility", ["Projector", "Stage"]);
  await expect(page.getByRole("button", { name: "Facility: Projector, Stage" })).toBeVisible();
  await page.getByRole("button", { name: "Apply filters" }).click();
  // Every spelling of the theatre layout is offered as "Theatre"; the backend matches either.
  await expect.poll(() => sent.options.at(-1)).toEqual({ search: "Hall", minCapacity: "200", layout: "Theatre", facility: ["Projector", "Stage"] });
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect.poll(() => sent.options.at(-1)).toEqual({});

  await page.getByLabel("Search", { exact: true }).fill("Hall");
  await page.getByLabel("Minimum capacity").fill("200");
  await pick("Accessibility", ["Wheelchair accessible entrance"]);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect.poll(() => sent.options.at(-1)).toEqual({ search: "Hall", minCapacity: "200", accessibility: "Wheelchair accessible entrance" });

  await page.getByLabel("Sort by").selectOption("capacity");
  await page.getByRole("button", { name: /Ascending order/ }).click();
  await expect.poll(() => sent.options.at(-1)).toEqual({ search: "Hall", minCapacity: "200", accessibility: "Wheelchair accessible entrance", sort: "capacity", order: "desc" });

  await page.getByLabel("Minimum capacity").fill("0");
  await page.getByLabel("Minimum capacity").press("Enter");
  await expect.poll(() => sent.options.at(-1)?.minCapacity).toBe("0");
});

test("[SPM-75 TC-VS-006][SPM-72 TC-VC-004][AC3] the list shows 12 results, then pages by the typed number", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const many = Array.from({ length: 23 }, (_, index) => venue({ venueId: 100 + index, name: `Synthetic Venue ${String(index + 1).padStart(2, "0")}`, coverPhotoId: null }));
  await routeVenueSection(page, { venueOptions: options({ venues: many }) });
  await page.goto("/events/42");
  await openSearch(page);

  const show = page.getByRole("spinbutton", { name: "Show" });
  await expect(show).toHaveValue("12");
  await expect(page.getByText("results", { exact: true })).toBeVisible();
  await expect(search(page).getByRole("article")).toHaveCount(12);
  await page.getByRole("button", { name: "Show more venues (11 more)" }).click();
  await expect(search(page).getByRole("article")).toHaveCount(23);
  await expect(page.getByRole("button", { name: /Show more venues/ })).toHaveCount(0);

  await show.fill("7");
  await expect(search(page).getByRole("article")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Show more venues (7 more)" })).toBeVisible();
  // An invalid number keeps the last size and is put back on blur.
  await show.fill("0");
  await expect(search(page).getByRole("article")).toHaveCount(7);
  await show.blur();
  await expect(show).toHaveValue("7");
  await show.fill("50");
  await expect(search(page).getByRole("article")).toHaveCount(23);
  await expect(page.getByRole("button", { name: /Show more venues/ })).toHaveCount(0);
});

test("[SPM-72 TC-VC-006][AC4][AC6] View details shows photos, details and availability, read-only and without wordy notes", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  await page.goto("/events/42");
  await openSearch(page);

  await card(page, "Synthetic Grand Hall").getByRole("button", { name: "View details" }).click();
  const panel = page.getByRole("region", { name: "Venue details" });
  await expect(panel.getByRole("button", { name: "Enlarge photo: Front entrance" })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Synthetic Grand Hall" })).toBeVisible();
  await expect(panel.getByText("30 min", { exact: true })).toBeVisible();
  await expect(panel.getByText("45 min", { exact: true })).toBeVisible();
  await expect(panel.getByText("Projector, Stage")).toBeVisible();
  await expect(panel.getByText("Available", { exact: true }).first()).toBeVisible();
  // SPM-185 AC1: the event's own occupied time is the one occupied line.
  await expect(panel.getByText(/^Occupied .*09:30–12:45 SGT with setup and turnaround$/)).toBeVisible();
  await expect(panel.getByText(/Occupied/)).toHaveCount(1);
  await expect(panel.getByText(/Availability for the event date/)).toHaveCount(0);
  await expect(panel.getByRole("textbox")).toHaveCount(0);

  await panel.getByRole("combobox", { name: "Venue details" }).fill("Synthetic Rooftop");
  // No backend message: the conflict keeps its label and occupied window.
  await expect(panel.getByRole("list", { name: "Conflicts" })).toContainText(/Confirmed booking: .*08:00–10:15 SGT/);
});

test("[SPM-185 AC1][AC2] View details shows the backend's conflict message, and no occupied time without setup/turnaround", async ({ page }) => {
  const message = "Venue's turnaround period (12:00pm–12:45pm) overlaps with your requested booking, including its 30-minute setup from 12:00pm.";
  const explained = venue({
    ...rooftop,
    availability: { ...rooftop.availability, conflicts: [{ ...rooftop.availability.conflicts[0], message }] },
  });
  const unbuffered = venue({
    venueId: 48,
    name: "Synthetic Annex",
    setupMinutes: null,
    turnaroundMinutes: null,
    availability: { status: "NOT_BOOKABLE", label: "Not bookable yet", occupiedStart: "2026-11-20T02:00:00.000Z", occupiedEnd: "2026-11-20T04:00:00.000Z", conflicts: [], operatingHoursWarning: null },
  });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page, { venueOptions: options({ venues: [explained, unbuffered], preferredVenues: [] }) });
  await page.goto("/events/42");
  await openSearch(page);

  await card(page, "Synthetic Rooftop").getByRole("button", { name: "View details" }).click();
  const panel = page.getByRole("region", { name: "Venue details" });
  const conflicts = panel.getByRole("list", { name: "Conflicts" });
  await expect(conflicts).toHaveText(message);
  await expect(panel.getByText(/^Occupied .*09:30–12:45 SGT with setup and turnaround$/)).toBeVisible();

  await panel.getByRole("combobox", { name: "Venue details" }).fill("Synthetic Annex");
  await expect(panel.getByRole("heading", { name: "Synthetic Annex" })).toBeVisible();
  await expect(panel.getByText(/Occupied/)).toHaveCount(0);
});

test("[SPM-72 TC-VC-007][AC7] the comparison panel is hidden until Show comparison view opens it", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  await page.goto("/events/42");
  await openSearch(page);

  await expect(page.getByRole("region", { name: "Compare with" })).toHaveCount(0);
  await card(page, "Synthetic Grand Hall").getByRole("button", { name: "View details" }).click();
  await page.getByRole("button", { name: "Show comparison view" }).click();
  await expect(page.getByRole("button", { name: "Hide comparison view" })).toHaveAttribute("aria-pressed", "true");
  await card(page, "Synthetic Rooftop").getByRole("button", { name: "Compare" }).click();

  const left = page.getByRole("region", { name: "Venue details" });
  const right = page.getByRole("region", { name: "Compare with" });
  await expect(left.getByRole("heading", { name: "Synthetic Grand Hall" })).toBeVisible();
  await expect(right.getByRole("heading", { name: "Synthetic Rooftop" })).toBeVisible();
  const [leftBox, rightBox] = [await left.boundingBox(), await right.boundingBox()];
  expect(rightBox.x).toBeGreaterThan(leftBox.x + leftBox.width - 1);
  await attachScreenshot(testInfo, page, "venue-comparison");

  await page.getByRole("button", { name: "Hide comparison view" }).click();
  await expect(right).toHaveCount(0);
});

test("[SPM-72 TC-VC-008][TC-VC-009][AC8] suggested venues go on the list and are sent to the organiser in a clarification", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const sent = await routeVenueSection(page);
  await page.goto("/events/42");
  await openSearch(page);

  await expect(card(page, "Synthetic Seminar Room").getByRole("button", { name: "Suggest" })).toBeDisabled();
  await card(page, "Synthetic Rooftop").getByRole("button", { name: "Suggest" }).click();
  await expect(card(page, "Synthetic Rooftop").getByRole("button", { name: "On your list" })).toHaveAttribute("aria-pressed", "true");
  // Nothing is sent until the coordinator sends the list.
  expect(sent.suggestions).toHaveLength(0);
  await page.keyboard.press("Escape");

  const list = page.getByRole("region", { name: /Venues for the organiser/ });
  await expect(list.getByRole("list", { name: "Venues on the list" })).toContainText("Synthetic Rooftop");
  await list.getByRole("button", { name: "Send to organiser" }).click();
  const dialog = page.getByRole("dialog", { name: "Send these venues to the organiser?" });
  await expect(dialog).toContainText("Suggested: Synthetic Rooftop");
  await expect(dialog).toContainText("This opens a clarification request for the organiser");
  await dialog.getByLabel("Note to the organiser (optional)").fill("It has a stage.");
  await dialog.getByRole("button", { name: "Send to organiser" }).click();

  await expect(page.getByText("Sent to the organiser in Clarification Request 1. They can amend their venue choices there. It is recorded in the event history.")).toBeVisible();
  expect(sent.suggestions).toHaveLength(1);
  expect(sent.suggestions[0].body).toEqual({ venueIds: [47], expectedVenueIds: [], note: "It has a stage." });
  expect(sent.suggestions[0].key).toMatch(/^[0-9a-f-]{36}$/);
});

test("[SPM-72 TC-VC-008][AC8] the organiser's own choices are selected, not suggested back to them", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const sent = await routeVenueSection(page, {
    suggestBody: { message: "The organiser has been notified.", suggestions: [{ venueId: 45, name: "Synthetic Grand Hall", address: "1 Harbourfront Walk", maxCapacity: 300, suggestedAt: "2026-11-01T04:00:00.000Z", suggestedBy: "Synthetic Coordinator", fromOrganiserChoices: true }], clarificationRound: null },
  });
  await page.goto("/events/42");

  const grandHall = choices(page).getByRole("article", { name: "Synthetic Grand Hall" });
  await expect(grandHall.getByRole("button", { name: "Suggest" })).toHaveCount(0);
  await grandHall.getByRole("button", { name: "Select" }).click();
  await page.getByRole("button", { name: "Send to organiser" }).click();
  const dialog = page.getByRole("dialog", { name: "Send these venues to the organiser?" });
  await expect(dialog).toContainText("Selected from their choices: Synthetic Grand Hall");
  await expect(dialog).toContainText("The organiser is notified.");
  await expect(dialog.getByLabel("Note to the organiser (optional)")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Send to organiser" }).click();
  await expect.poll(() => sent.suggestions.length).toBe(1);
  expect(sent.suggestions[0].body).toEqual({ venueIds: [45], expectedVenueIds: [], note: "" });
});

test("[SPM-72 TC-VC-010][AC10] a list changed elsewhere is refused with a reload option", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page, {
    suggestStatus: 409,
    suggestBody: { error: "The venues for the organiser were changed after you loaded them. Reload the event, then try again.", code: "VENUE_SUGGESTION_VERSION_CONFLICT" },
  });
  await page.goto("/events/42");

  await choices(page).getByRole("article", { name: "Synthetic Grand Hall" }).getByRole("button", { name: "Select" }).click();
  await page.getByRole("button", { name: "Send to organiser" }).click();
  const dialog = page.getByRole("dialog", { name: "Send these venues to the organiser?" });
  await dialog.getByRole("button", { name: "Send to organiser" }).click();
  await expect(dialog.getByText("The venues for the organiser were changed after you loaded them.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Send to organiser" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Reload" })).toBeVisible();
});

test("[SPM-74 TC16][AC1] the calendar toggle sits right above the calendar, which opens on the event window", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-03T10:00:00+08:00"));
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const sent = await routeVenueSection(page);
  await page.goto("/events/42");
  await openSearch(page);

  await card(page, "Synthetic Grand Hall").getByRole("button", { name: "View details" }).click();
  // The button is in the venue's card, under its photos (developer request of 25 October 2026).
  const panel = page.getByRole("region", { name: "Venue details" });
  const toggle = panel.getByRole("button", { name: "Show availability calendar" });
  const photo = await panel.getByRole("button", { name: /^Enlarge photo/ }).boundingBox();
  const toggleAt = await toggle.boundingBox();
  expect(toggleAt.y).toBeGreaterThan(photo.y + photo.height - 1);
  expect(Math.abs(toggleAt.x - photo.x)).toBeLessThan(2);
  await toggle.click();
  const calendar = panel.getByRole("region", { name: "Venue availability calendar" });
  await expect(calendar).toBeVisible();
  // Order: the panel with its calendar, then the venue list.
  const calendarBox = await calendar.boundingBox();
  const listBox = await page.getByRole("region", { name: "Venue list" }).boundingBox();
  expect(listBox.y).toBeGreaterThan(calendarBox.y + calendarBox.height - 1);
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
  await openSearch(page);
  await expect(page.getByRole("button", { name: "Select" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Suggest" })).toHaveCount(0);
  await card(page, "Synthetic Grand Hall").getByRole("button", { name: "View details" }).click();
  await page.getByRole("button", { name: "Show comparison view" }).click();
  await expect(page.getByRole("region", { name: "Compare with" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Suggest this venue" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show availability calendar" })).toHaveCount(0);
  await expect(page.locator('a[aria-current="page"]')).toHaveText(/Assignments/);
});

test("[SPM-72 TC-VC-011][AC9] the organiser sees their choices and the suggested venues as cards", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "ORGANISER" });
  const event = eventView({
    viewerRelationship: "OWNER",
    isOwner: true,
    permissions: { canEdit: false, editableFields: [], canViewDraftHistory: true, canViewStaffHistory: false, canSuggestVenue: false },
    venueSuggestions: [{ venueId: 47, name: "Synthetic Rooftop", address: "1 Harbourfront Walk", maxCapacity: 400, suggestedAt: "2026-11-01T04:00:00.000Z", suggestedBy: "Synthetic Coordinator", fromOrganiserChoices: false }],
  });
  delete event.status;
  const sent = await routeVenueSection(page, {
    event,
    venueOptions: options({ suggestedVenues: [{ venueId: 47, name: "Synthetic Rooftop", option: rooftop, fromOrganiserChoices: false }] }),
  });
  await page.goto("/events/42");

  await expect(page.getByRole("article", { name: "Synthetic Grand Hall" }).getByText("Ideal venue")).toBeVisible();
  const rooftopCard = page.getByRole("article", { name: "Synthetic Rooftop" });
  await expect(rooftopCard.getByText("Suggested", { exact: true })).toBeVisible();
  // Without an open clarification there is nothing to amend.
  await expect(rooftopCard.getByRole("button", { name: "Add to my choices" })).toHaveCount(0);
  expect(sent.options).toHaveLength(0);
});

test("[SPM-72 TC-VC-008][AC8] the change history reads a suggestion as a venue, not a From/To edit", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const entry = (historyId, before, after) => ({
    historyId,
    action: "VENUE_SUGGESTED",
    actor: { userId: 11, name: "Synthetic Coordinator", role: "COORDINATOR" },
    occurredAt: "2026-10-23T04:00:00.000Z",
    summary: `Coordinator suggested ${after} as the venue.`,
    changes: [{ field: "suggestedVenue", before, after }],
    audience: "ORGANISER_SAFE",
  });
  await routeVenueSection(page, { history: [entry(2, "Campus Central Hall", "Synthetic Grand Hall"), entry(1, null, "Campus Central Hall")] });
  await page.goto("/events/42");

  const history = page.getByRole("region", { name: "Change history" });
  await expect(history.getByText("Venue suggested")).toHaveCount(2);
  await expect(history.getByText("Suggested venue").first()).toBeVisible();
  await expect(history.getByText("Replaces Campus Central Hall")).toBeVisible();
  await expect(history.getByText("suggestedVenue")).toHaveCount(0);
  await expect(history.getByText("From:")).toHaveCount(0);
});

test("[SPM-72 TC-VC-014][AC11] a failed load offers a retry; unchecked details and availability say so", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page, { optionsStatus: 500 });
  await page.goto("/events/42");
  const failure = page.getByRole("alert").filter({ hasText: "Unable to load venues" });
  await expect(failure).toBeVisible();
  await expect(failure.getByRole("button", { name: "Retry" })).toBeVisible();

  await page.unroute(/\/api\/events\/42(\/.*)?(\?.*)?$/);
  const unchecked = venue({
    detailStatus: "NOT_CHECKED",
    availability: { status: "NOT_CHECKED", label: "Error checking availability", occupiedStart: null, occupiedEnd: null, conflicts: [], operatingHoursWarning: null },
    requirements: [
      requirement("availability", "Availability", "NOT_CHECKED", "Error checking availability"),
      requirement("layout", "Layout", "NOT_CHECKED", "THEATRE layout"),
    ],
    unmetCount: 2,
    allRequirementsMet: false,
  });
  await routeVenueSection(page, { venueOptions: options({ detailsAvailable: false, availabilityChecked: false, venues: [unchecked], preferredVenues: [] }) });
  await failure.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("The organiser did not choose a venue.")).toBeVisible();
  await openSearch(page);
  await expect(page.getByText("Error loading venue details")).toBeVisible();
  await expect(card(page, "Synthetic Grand Hall").getByText("Layout: Error loading details")).toBeVisible();
  await expect(card(page, "Synthetic Grand Hall")).toContainText("Availability: Error checking availability");
  await expect(page.getByText("Available", { exact: true })).toHaveCount(0);
});

test("[SPM-75 AC8] the details outage notice explains basic-record fallback", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const fallback = venue({
    detailStatus: "NOT_CHECKED",
    availability: { status: "NOT_CHECKED", label: "Error checking availability", occupiedStart: null, occupiedEnd: null, conflicts: [], operatingHoursWarning: null },
    requirements: [
      requirement("layout", "Layout", "MET", "THEATRE layout"),
      requirement("accessibility-0", "Accessibility", "MET", "Wheelchair access"),
      requirement("facility-0", "Facility", "NOT_CHECKED", "Projector"),
      requirement("availability", "Availability", "NOT_CHECKED", "Error checking availability"),
    ],
    allRequirementsMet: false,
    unmetCount: 2,
  });
  await routeVenueSection(page, { venueOptions: options({ venues: [fallback], preferredVenues: [], detailsAvailable: false, availabilityChecked: false, filtersNotChecked: ["facility"] }) });
  await page.goto("/events/42");
  await openSearch(page);
  await expect(search(page)).toContainText("Layout and accessibility filters use recorded room layouts and accessibility notes.");
  await expect(search(page)).toContainText("The facility filter could not be checked.");
  const hall = card(page, "Synthetic Grand Hall");
  await expect(hall.locator('li[title="Layout: THEATRE layout (Met)"]')).toBeVisible();
  await expect(hall).toContainText("Facility: Error loading details");
  await expect(page.getByText("Available", { exact: true })).toHaveCount(0);
});

test("[SPM-72] the venue section works at mobile width", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  await page.goto("/events/42");
  await openSearch(page);
  await card(page, "Synthetic Grand Hall").getByRole("button", { name: "View details" }).click();
  await page.getByRole("button", { name: "Show comparison view" }).click();
  await expect(page.getByRole("region", { name: "Compare with" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await attachScreenshot(testInfo, page, "venue-section-mobile");
});

test("[SPM-75 TC-VS-005][SPM-72 AC3] six cards fit the list window at a glance and the rest scroll inside it", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const many = Array.from({ length: 14 }, (_, index) => venue({ venueId: 100 + index, name: `Synthetic Venue ${String(index + 1).padStart(2, "0")}`, coverPhotoId: null }));
  await routeVenueSection(page, { venueOptions: options({ venues: many }) });
  await page.goto("/events/42");
  await openSearch(page);

  const list = page.getByRole("region", { name: "Venue list" });
  await expect(list.getByRole("article")).toHaveCount(12);
  const box = await list.boundingBox();
  expect(box.height).toBeLessThanOrEqual(832 + 1);
  const cards = await list.getByRole("article").evaluateAll((items) => items.map((item) => item.getBoundingClientRect()).map(({ top, bottom }) => ({ top, bottom })));
  for (const card of cards.slice(0, 6)) expect(card.bottom).toBeLessThanOrEqual(box.y + box.height + 1);
  expect(cards[6].top).toBeGreaterThan(cards[0].top);
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await list.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const more = await page.getByRole("button", { name: "Show more venues (2 more)" }).boundingBox();
  expect(more.y + more.height).toBeLessThanOrEqual(box.y + box.height + 1);
  await attachScreenshot(testInfo, page, "venue-list-window");
});

test("[SPM-75 TC-VS-001][AC1] the search and filter box is compact: search and capacity on one line, detail filters on the next", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  await page.goto("/events/42");
  await openSearch(page);

  const box = await page.getByRole("search", { name: "Search and filter venues" }).boundingBox();
  expect(box.height).toBeLessThan(140);
  const searchBox = await page.getByLabel("Search", { exact: true }).boundingBox();
  const capacityBox = await page.getByLabel("Minimum capacity").boundingBox();
  expect(Math.abs(searchBox.y - capacityBox.y)).toBeLessThan(2);
  await expect(page.getByLabel("Search", { exact: true })).toHaveAttribute("placeholder", "Search by venue name or location");
});

test("[SPM-74 TC16][SPM-72 AC6] the calendar checks every day of a multi-day event", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-03T10:00:00+08:00"));
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const sent = await routeVenueSection(page, { event: eventView({ startDatetime: "2026-11-20T01:00:00.000Z", endDatetime: "2026-11-22T09:00:00.000Z" }) });
  await page.goto("/events/42");
  await openSearch(page);

  await card(page, "Synthetic Grand Hall").getByRole("button", { name: "View details" }).click();
  await page.getByRole("button", { name: "Show availability calendar" }).click();
  await expect(page.getByRole("region", { name: "Venue availability calendar" })).toBeVisible();
  await expect.poll(() => sent.availability.at(-1)).toEqual(expect.objectContaining({
    checkStart: "2026-11-20T09:00:00+08:00",
    checkEnd: "2026-11-22T17:00:00+08:00",
  }));
  await expect(page.getByLabel("End date")).toHaveValue("2026-11-22");
});

test("[SPM-72 AC3][AC4] on a laptop screen the search popup shows three cards a row, and the list and calendar fit the screen", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-11-03T10:00:00+08:00"));
  await page.setViewportSize({ width: 1366, height: 768 });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const many = Array.from({ length: 9 }, (_, index) => venue({ venueId: 100 + index, name: `Synthetic Venue ${index + 1}`, coverPhotoId: null }));
  await routeVenueSection(page, { venueOptions: options({ venues: many }) });
  await page.goto("/events/42");
  await openSearch(page);

  const list = page.getByRole("region", { name: "Venue list" });
  const tops = await list.getByRole("article").evaluateAll((items) => items.slice(0, 3).map((item) => Math.round(item.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  expect((await list.boundingBox()).height).toBeLessThanOrEqual(768);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1366);

  await list.getByRole("article").first().getByRole("button", { name: "View details" }).click();
  await page.getByRole("button", { name: "Show availability calendar" }).click();
  const calendar = page.getByRole("region", { name: "Venue availability calendar" });
  await expect(calendar).toBeVisible();
  for (const view of ["Week", "Day", "Month", "Year"]) {
    await calendar.getByRole("button", { name: view, exact: true }).click();
    expect((await calendar.boundingBox()).height, `${view} view`).toBeLessThanOrEqual(768);
  }
  await calendar.getByRole("button", { name: "Week", exact: true }).click();
  const wrap = calendar.locator(".cal-week-time-grid-wrap");
  expect(await wrap.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await attachScreenshot(testInfo, page, "venue-section-laptop");
});

test("[SPM-72 AC4] details a venue does not record show a dash, not wordy notes", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page, { venueOptions: options({ venues: [venue({ operatingHours: null, facilities: null, knownRestrictions: [], emergencyAccess: null, setupMinutes: null })] }) });
  await page.goto("/events/42");
  await openSearch(page);
  await card(page, "Synthetic Grand Hall").getByRole("button", { name: "View details" }).click();
  const panel = page.getByRole("region", { name: "Venue details" });
  for (const term of ["Operating hours", "Facilities", "Setup time"]) {
    await expect(panel.locator("dl > div", { has: page.locator("dt", { hasText: term }) }).locator("dd")).toHaveText("-");
  }
  await expect(panel.getByText(/Not listed|None listed|Not recorded/)).toHaveCount(0);
  // Description, emergency access, known restrictions and rooms are not shown;
  // capacity, layout and accessibility are in their checks.
  for (const term of ["Description", "Emergency access", "Known restrictions", "Rooms", "Capacity", "Supported layouts"]) {
    await expect(panel.locator("dt").filter({ hasText: new RegExp(`^${term}$`) })).toHaveCount(0);
  }
  await expect(panel.getByText("Venue has: THEATRE")).toBeVisible();
});


// ---------- developer feedback of 24 October 2026 ----------

const cardWidth = (page, title) => page.getByRole("heading", { name: title }).evaluate((heading) => heading.closest("section").getBoundingClientRect().width);

test("[SPM-72 AC1] the venue section keeps the width of the schedule column on a laptop screen", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  await page.goto("/events/42");
  await expect(choices(page).getByRole("article")).toHaveCount(2);

  const venueWidth = await cardWidth(page, /Venue & layout/);
  expect(Math.abs(venueWidth - (await cardWidth(page, /Schedule & attendance/)))).toBeLessThan(2);
  expect(venueWidth).toBeLessThan(1000);
});

test("[SPM-72] the venue search popup never stretches the page below the app frame", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const many = Array.from({ length: 10 }, (_, index) => venue({ venueId: 100 + index, name: `Synthetic Venue ${index + 1}`, coverPhotoId: null }));
  await routeVenueSection(page, { venueOptions: options({ venues: many }) });
  await page.goto("/events/42");
  await openSearch(page);
  const list = page.getByRole("region", { name: "Venue list" });
  await expect(list.getByRole("article")).toHaveCount(10);

  // Screen-reader text of cards scrolled out of the list window stays inside
  // it; before, it stretched the page past the sidebar frame.
  expect(await list.evaluate((element) => [...element.querySelectorAll(".sr-only")].filter((node) => !element.contains(node.offsetParent)).length)).toBe(0);
  expect(await popup(page).evaluate((dialog) => dialog.scrollHeight - dialog.clientHeight)).toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0);
  const { documentHeight, shellHeight } = await page.evaluate(() => ({
    documentHeight: document.documentElement.scrollHeight,
    shellHeight: Math.ceil(document.querySelector("[data-dashboard-shell]").getBoundingClientRect().height),
  }));
  expect(documentHeight).toBeLessThanOrEqual(shellHeight + 1);
});

test("[SPM-72 AC4] View details opens the organiser's choice in place: name over the photo, status under it, calendar at the foot", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-11-03T10:00:00+08:00"));
  await page.setViewportSize({ width: 1366, height: 900 });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  await page.goto("/events/42");

  const first = choices(page).getByRole("article", { name: "Synthetic Grand Hall", exact: true });
  const top = async (locator) => (await locator.boundingBox()).y;
  // Name and address above the photo, the status under it, no venue ID.
  const heading = first.getByRole("heading", { name: "Synthetic Grand Hall" });
  expect(await top(heading)).toBeLessThan(await top(first.locator("img").first()));
  expect(await top(first.getByText("Organiser's choice 1"))).toBeGreaterThan(await top(first.locator("img").first()));
  await expect(first.getByText("VENUE-45")).toHaveCount(0);

  const view = first.getByRole("button", { name: "View details" });
  await expect(view).toHaveAttribute("aria-expanded", "false");
  const details = page.locator(`[id="${await view.getAttribute("aria-controls")}"]`);
  await expect(details).toHaveAttribute("inert", "");
  await view.click();
  const hide = first.getByRole("button", { name: "Hide details" });
  await expect(hide).toHaveAttribute("aria-expanded", "true");
  await expect(details).not.toHaveAttribute("inert", "");
  // The details open with motion: a 200 ms height transition.
  expect(await details.evaluate((element) => getComputedStyle(element).transitionDuration)).toMatch(/0\.2s/);
  await expect(first.getByRole("heading", { name: "Event requirements" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Venue details" })).toHaveCount(0);
  await expect(first.getByRole("combobox")).toHaveCount(0);

  // Hide details sits in the details column, under the checks; the calendar
  // button at the foot of the photo column.
  const enlarge = await first.getByRole("button", { name: "Enlarge photo: Front entrance" }).boundingBox();
  const requirements = await first.getByRole("heading", { name: "Event requirements" }).boundingBox();
  const hideAt = await hide.boundingBox();
  expect(Math.abs(hideAt.x - requirements.x)).toBeLessThan(2);
  expect(hideAt.y).toBeGreaterThan(requirements.y);
  const calendarButton = first.getByRole("button", { name: "Show availability calendar" });
  const calendarAt = await calendarButton.boundingBox();
  expect(Math.abs(calendarAt.x - enlarge.x)).toBeLessThan(2);
  expect(calendarAt.y).toBeGreaterThan(enlarge.y + enlarge.height - 1);
  expect((await first.boundingBox()).height).toBeLessThanOrEqual(900);
  await attachScreenshot(testInfo, page, "venue-choice-expanded");

  await calendarButton.click();
  await expect(first.getByRole("region", { name: "Venue availability calendar" })).toBeVisible();
  await hide.click();
  await expect(first.getByRole("button", { name: "View details" })).toHaveAttribute("aria-expanded", "false");
  await expect(first.getByRole("region", { name: "Venue availability calendar" })).toHaveCount(0);
});

test("[SPM-72 TC-VC-012][AC2] the Lead's expanded choice has no calendar and no Select", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR_LEAD" });
  await routeVenueSection(page, {
    event: eventView({ viewerRelationship: "SUPERVISING_LEAD", permissions: { canEdit: false, editableFields: [], canViewDraftHistory: false, canViewStaffHistory: false, canSuggestVenue: false } }),
    venueOptions: options({ canSuggestVenue: false }),
  });
  await page.goto("/events/42");
  const first = choices(page).getByRole("article", { name: "Synthetic Grand Hall", exact: true });
  await first.getByRole("button", { name: "View details" }).click();
  await expect(first.getByRole("heading", { name: "Event requirements" })).toBeVisible();
  await expect(first.getByRole("button", { name: /availability calendar/ })).toHaveCount(0);
  await expect(first.getByRole("button", { name: /Select/ })).toHaveCount(0);
});

test("[SPM-72 AC4] a photo opens enlarged in a popup", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  await page.goto("/events/42");
  const first = choices(page).getByRole("article", { name: "Synthetic Grand Hall", exact: true });
  await first.getByRole("button", { name: "View details" }).click();
  await first.getByRole("button", { name: "Enlarge photo: Front entrance" }).click();

  const enlarged = page.getByRole("dialog", { name: "Synthetic Grand Hall" });
  await expect(enlarged.getByRole("img", { name: "Front entrance" })).toBeVisible();
  expect((await enlarged.getByRole("img", { name: "Front entrance" }).boundingBox()).width).toBeGreaterThan(600);
  await enlarged.getByRole("button", { name: "Close dialog" }).click();
  await expect(enlarged).toHaveCount(0);
});

test("[SPM-72 AC4] related venues link a hall and its rooms both ways", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const hall = venue({ relatedVenues: [{ venueId: 47, name: "Synthetic Rooftop" }] });
  const room = { ...rooftop, relatedVenues: [{ venueId: 45, name: "Synthetic Grand Hall" }] };
  await routeVenueSection(page, {
    venueOptions: options({ venues: [hall, room, seminar], preferredVenues: [{ rank: 1, venueId: 45, name: "Synthetic Grand Hall", option: hall }] }),
  });
  await page.goto("/events/42");

  // From an organiser's choice, a related venue opens in a popup with its own Select.
  const first = choices(page).getByRole("article", { name: "Synthetic Grand Hall", exact: true });
  await first.getByRole("button", { name: "View details" }).click();
  await first.getByRole("list", { name: "Related venues" }).getByRole("button", { name: "Synthetic Rooftop" }).click();
  const related = page.getByRole("dialog", { name: "Venue details" });
  await expect(related.getByRole("heading", { name: "Synthetic Rooftop" })).toBeVisible();
  await expect(related.getByRole("button", { name: "Suggest this venue" })).toBeVisible();
  await related.getByRole("list", { name: "Related venues" }).getByRole("button", { name: "Synthetic Grand Hall" }).click();
  await expect(related.getByRole("heading", { name: "Synthetic Grand Hall" })).toBeVisible();
  await related.getByRole("button", { name: "Close dialog" }).click();

  // In the search, it switches the details panel.
  await openSearch(page);
  await card(page, "Synthetic Grand Hall").getByRole("button", { name: "View details" }).click();
  const panel = page.getByRole("region", { name: "Venue details" });
  await panel.getByRole("list", { name: "Related venues" }).getByRole("button", { name: "Synthetic Rooftop" }).click();
  await expect(panel.getByRole("heading", { name: "Synthetic Rooftop" })).toBeVisible();
});

test("[SPM-72 TC-VC-007][AC7] the venue boxes search by name, start blank, and never offer the venue in the other panel", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  await page.goto("/events/42");
  await openSearch(page);

  await card(page, "Synthetic Grand Hall").getByRole("button", { name: "View details" }).click();
  await page.getByRole("button", { name: "Show comparison view" }).click();
  const compare = page.getByRole("region", { name: "Compare with" });
  const box = compare.getByRole("combobox", { name: "Compare with" });
  await expect(box).toHaveValue("");
  const offered = await box.evaluate((input) => [...input.list.options].map((option) => option.value));
  expect(offered).toEqual(["Synthetic Rooftop", "Synthetic Seminar Room"]);
  // The Grand Hall card offers no Compare: it is already in the first panel.
  await expect(card(page, "Synthetic Grand Hall").getByRole("button", { name: "Compare" })).toHaveCount(0);

  await box.fill("Synthetic Grand Hall");
  await expect(compare.getByRole("heading")).toHaveCount(0);
  await box.fill("Synthetic Seminar Room");
  await expect(compare.getByRole("heading", { name: "Synthetic Seminar Room" })).toBeVisible();
});

test("[SPM-72 AC8] a suggested venue outside the organiser's choices gets its own card with the Suggested status", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page, {
    event: eventView({ venueSuggestions: [{ venueId: 47, name: "Synthetic Rooftop", address: "1 Harbourfront Walk", maxCapacity: 400, suggestedAt: "2026-11-01T04:00:00.000Z", suggestedBy: "Synthetic Coordinator", fromOrganiserChoices: false }] }),
    venueOptions: options({ suggestedVenues: [{ venueId: 47, name: "Synthetic Rooftop", option: rooftop, fromOrganiserChoices: false }] }),
  });
  await page.goto("/events/42");

  const suggested = page.getByRole("region", { name: "Suggested venues" }).getByRole("article", { name: "Synthetic Rooftop" });
  await expect(suggested.getByText("Suggested", { exact: true })).toBeVisible();
  await expect(choices(page).getByText("Suggested", { exact: true })).toHaveCount(0);
  await suggested.getByRole("button", { name: "View details" }).click();
  await expect(suggested.getByRole("heading", { name: "Event requirements" })).toBeVisible();
});

test("[SPM-74 TC16][SPM-72 AC6] the calendar shows the request as a yellow block, overlaps in red and closed hours in grey", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-11-03T10:00:00+08:00"));
  await page.setViewportSize({ width: 1366, height: 900 });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  const booking = { entryId: "booking-9", type: "BOOKING", status: "APPROVED", label: "Confirmed booking", blocking: true, start: "2026-11-20T01:00:00.000Z", end: "2026-11-20T02:00:00.000Z", occupiedStart: "2026-11-20T00:30:00.000Z", occupiedEnd: "2026-11-20T02:30:00.000Z", bookingId: 9, eventId: 7, requestId: "REQ-000007", eventTitle: "Synthetic breakfast", holdExpiresAt: null, reason: null, reasonLabel: null, note: null, operatingHoursWarning: null };
  await page.route((url) => url.pathname === "/api/events/42/venue-availability", (route) => route.fulfill({ json: {
    from: "2026-10-25T16:00:00.000Z", to: "2026-12-08T16:00:00.000Z",
    venues: [{
      venueId: 45, name: "Synthetic Grand Hall", address: "1 Harbourfront Walk", status: "ACTIVE", operatingHours: "08:00-22:00", setupMinutes: 30, turnaroundMinutes: 45, buffersRecorded: true,
      entries: [booking], overlaps: [], freePeriods: [], summary: "UNAVAILABLE", summaryLabel: "Unavailable",
      check: { start: "2026-11-20T02:00:00.000Z", end: "2026-11-20T04:00:00.000Z", occupiedStart: "2026-11-20T01:30:00.000Z", occupiedEnd: "2026-11-20T04:45:00.000Z", availability: "UNAVAILABLE_BOOKING", availabilityLabel: "Unavailable – booking", canRequest: false, conflicts: [{ entryId: "booking-9", type: "BOOKING", occupiedStart: booking.occupiedStart, occupiedEnd: booking.occupiedEnd }], operatingHoursWarning: null },
    }],
  } }));
  await page.goto("/events/42");
  const first = choices(page).getByRole("article", { name: "Synthetic Grand Hall", exact: true });
  await first.getByRole("button", { name: "View details" }).click();
  await first.getByRole("button", { name: "Show availability calendar" }).click();
  const calendar = first.getByRole("region", { name: "Venue availability calendar" });
  await expect(calendar).toBeVisible();

  const request = calendar.locator(".cal-overlay--request");
  await expect(request).toHaveCount(1);
  const label = request.locator(".cal-overlay-label");
  expect(await label.evaluate((element) => element.firstChild.textContent)).toBe("REQ-000042 · 10:00–12:00");
  await expect(label).toHaveAttribute("aria-label", /Unavailable – booking[\s\S]*Overlaps Confirmed booking/);
  await label.hover();
  await expect(request.locator(".cal-overlay-tip")).toBeVisible();
  // Red only where the occupied time overlaps: 09:30–10:30, an hour of the day.
  const conflict = calendar.locator(".cal-overlay--conflict");
  await expect(conflict).toHaveCount(1);
  const column = await conflict.evaluate((element) => element.parentElement.getBoundingClientRect().height);
  expect(Math.abs((await conflict.boundingBox()).height - column / 24)).toBeLessThan(2);
  // Closed before 08:00 and after 22:00, each day of the week.
  expect(await calendar.locator(".cal-overlay--closed").count()).toBeGreaterThanOrEqual(14);
  // All seven days fit the card; Saturday is not cut off.
  const box = await calendar.boundingBox();
  const headers = await calendar.locator(".cal-week-day-header").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().right));
  expect(headers).toHaveLength(7);
  for (const right of headers) expect(right).toBeLessThanOrEqual(box.x + box.width + 1);
  await expect(page.getByLabel("Venue summaries")).toHaveCount(0);
  await expect(page.getByText(/Requested period: /)).toHaveCount(0);
  await attachScreenshot(testInfo, page, "venue-calendar-overlays");
});


test("[SPM-74][SPM-72 AC6] the month view shows entries as labelled bars and the request as a yellow bar; the year view tints those days", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-11-03T10:00:00+08:00"));
  await page.setViewportSize({ width: 1366, height: 900 });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  const booking = { entryId: "booking-9", type: "BOOKING", status: "APPROVED", label: "Confirmed booking", blocking: true, start: "2026-11-17T01:00:00.000Z", end: "2026-11-19T09:00:00.000Z", occupiedStart: "2026-11-17T00:30:00.000Z", occupiedEnd: "2026-11-19T09:30:00.000Z", bookingId: 9, eventId: 7, requestId: "REQ-000007", eventTitle: "Synthetic summit", holdExpiresAt: null, reason: null, reasonLabel: null, note: null, operatingHoursWarning: null };
  await page.route((url) => url.pathname === "/api/events/42/venue-availability", (route) => route.fulfill({ json: {
    from: "2026-10-25T16:00:00.000Z", to: "2026-12-08T16:00:00.000Z",
    venues: [{
      venueId: 45, name: "Synthetic Grand Hall", address: "1 Harbourfront Walk", status: "ACTIVE", operatingHours: "08:00-22:00", setupMinutes: 30, turnaroundMinutes: 45, buffersRecorded: true,
      entries: [booking], overlaps: [], freePeriods: [], summary: "AVAILABLE", summaryLabel: "Available",
      check: { start: "2026-11-20T02:00:00.000Z", end: "2026-11-20T04:00:00.000Z", occupiedStart: "2026-11-20T01:30:00.000Z", occupiedEnd: "2026-11-20T04:45:00.000Z", availability: "AVAILABLE", availabilityLabel: "Available", canRequest: true, conflicts: [], operatingHoursWarning: null },
    }],
  } }));
  await page.goto("/events/42");
  const first = choices(page).getByRole("article", { name: "Synthetic Grand Hall", exact: true });
  await first.getByRole("button", { name: "View details" }).click();
  await first.getByRole("button", { name: "Show availability calendar" }).click();
  const calendar = first.getByRole("region", { name: "Venue availability calendar" });
  await calendar.getByRole("button", { name: "Month", exact: true }).click();

  // A three-day booking: one labelled bar, continued on the next two days in the same lane.
  const bars = calendar.locator(".cal-month-bar:not(.cal-month-bar--request)");
  await expect(bars).toHaveCount(3);
  // SPM-186: each entry names its event and its start and end.
  await expect(bars.first()).toHaveText(/^08:30 Synthetic summit · Tue, 17 Nov 2026 09:00 – Thu, 19 Nov 2026 17:00 SGT$/);
  const tops = await bars.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  await expect(calendar.locator(".cal-month-bar--request")).toHaveText(/^REQ-000042 · 10:00–12:00/);
  await bars.first().click();
  await expect(page.getByRole("dialog", { name: "Synthetic Grand Hall" }).getByText("Booking #9")).toBeVisible();
  await page.getByRole("dialog", { name: "Synthetic Grand Hall" }).getByRole("button", { name: "Close dialog" }).click();
  await attachScreenshot(testInfo, page, "venue-calendar-month");

  await calendar.getByRole("button", { name: "Year", exact: true }).click();
  await expect(calendar.locator(".cal-year-day.is-requested")).toHaveCount(1);
  expect(await calendar.locator(".cal-year-day.has-events").count()).toBeGreaterThanOrEqual(3);
});

test("[SPM-72 AC11] an unexpected venue reply shows no venues and never breaks the event page", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  // A reply without venue lists, e.g. from a misrouted proxy or an older backend.
  await routeVenueSection(page, { venueOptions: { event: { eventId: 42 } } });
  await page.goto("/events/42");

  await expect(page.getByText("The organiser did not choose a venue.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Schedule & attendance/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Suggest" })).toHaveCount(0);
  await openSearch(page);
  await expect(page.getByText("No venues are currently available")).toBeVisible();
});


test("[SPM-75 regression] empty and repeated Apply always finish loading", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const sent = await routeVenueSection(page);
  await page.goto("/events/42");
  await openSearch(page);
  await expect(search(page).getByRole("article")).toHaveCount(3);
  for (let i = 0; i < 2; i += 1) {
    const before = sent.options.length;
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect.poll(() => sent.options.length).toBe(before + 1);
    await expect(search(page).getByRole("article")).toHaveCount(3);
    await expect(search(page).getByLabel("Loading venues")).toHaveCount(0);
  }
});

test("[SPM-75 regression] rejected filters retain results and comparison with field errors", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  await page.goto("/events/42");
  await openSearch(page);
  await card(page, "Synthetic Grand Hall").getByRole("button", { name: "View details" }).click();
  await page.getByRole("button", { name: "Show comparison view" }).click();
  await card(page, "Synthetic Rooftop").getByRole("button", { name: "Compare", exact: true }).click();
  await page.route((url) => url.pathname.endsWith("/venue-options") && url.searchParams.has("minCapacity"), (route) => route.fulfill({
    status: 400, json: { code: "VALIDATION_FAILED", fields: { minCapacity: "Minimum capacity must be a positive whole number." } },
  }));
  await page.getByLabel("Minimum capacity").fill("0");
  await page.getByLabel("Minimum capacity").press("Enter");
  await expect(page.getByLabel("Minimum capacity")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Minimum capacity")).toHaveAccessibleDescription("Minimum capacity must be a positive whole number.");
  await expect(search(page).getByRole("article")).toHaveCount(3);
  await expect(page.getByRole("region", { name: "Venue details", exact: true })).toContainText("Synthetic Grand Hall");
  await expect(page.getByRole("region", { name: "Compare with", exact: true })).toContainText("Synthetic Rooftop");
  await expect(search(page)).toContainText("3 venues available");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByLabel("Minimum capacity")).toHaveAttribute("aria-invalid", "false");
  await expect(search(page).getByRole("article")).toHaveCount(3);
});

// SPM-190 (1 November 2026): a booking request is the venue's hold until Venue
// Staff decide; the coordinator has no "Request hold" and no holds section.
test("[SPM-190] the coordinator requests bookings only, and sees until when a pending request keeps the venue", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeVenueSection(page);
  const pending = {
    bookingId: 501, venueId: 45, venueName: "Synthetic Grand Hall", label: "Plenary", status: "PENDING", statusLabel: "Pending",
    isPrimary: true, start: "2026-11-20T02:00:00.000Z", end: "2026-11-20T04:00:00.000Z", occupiedStart: null, occupiedEnd: null,
    expectedAttendance: 150, layout: null, requiredFacilities: [], accessibilityNeeds: [], specialRequirements: null,
    rejectionReason: null, requestedAt: "2026-11-01T02:00:00.000Z", decideBy: "2026-11-08T02:00:00.000Z",
  };
  await page.route((url) => url.pathname === "/api/events/42/venue-bookings", (route) => (route.request().method() === "GET"
    ? route.fulfill({ json: { eventId: 42, requestId: "REQ-000042", eventType: null, eventTypeLabel: null, canRequestVenueBookings: true, bookings: [pending] } })
    : route.fallback()));
  await page.goto("/events/42");

  await expect(page.getByText(/The venue is kept for this event until Venue Staff decide, or until 8 Nov 2026/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Tentative holds/ })).toHaveCount(0);
  await openSearch(page);
  await expect(popup(page).getByRole("button", { name: "Request hold" })).toHaveCount(0);
});
