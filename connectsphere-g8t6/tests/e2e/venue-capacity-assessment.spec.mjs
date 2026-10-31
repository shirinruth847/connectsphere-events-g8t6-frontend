import { test, expect } from "@playwright/test";
import { installConnectSphereMocks, attachScreenshot, requirement, routeVenuePhotos, venueOption as venue } from "./support.mjs";

// SPM-198: the coordinator sees whether each venue's capacity suits the
// expected attendance (150): sufficient, adequate (exactly full) or
// insufficient, with the backend's wording, and a too-small venue offers
// "Find Alternative Venues", the venue search filtered to venues of at least 150.

const capacity = (maxCapacity, level, title, message) => ({
  ...requirement("capacity", "Capacity", level === "INSUFFICIENT" ? "UNMET" : "MET", `Holds ${maxCapacity}; 150 expected`),
  assessment: { level, title, message },
});
const SUFFICIENT = capacity(300, "SUFFICIENT", "Capacity Sufficient", "Venue capacity is adequate (300 seats for 150 guests). Comfortable spacing available.");
const EXACT = capacity(150, "EXACT", "Capacity Adequate", "Venue exactly meets expected attendance (150 seats for 150 guests). No buffer space. May feel crowded.");
const INSUFFICIENT = capacity(100, "INSUFFICIENT", "Capacity Insufficient", "Venue is too small (100 seats for 150 expected guests). Cannot accommodate. Recommend alternative venue.");
const AVAILABLE = requirement("availability", "Availability", "MET", "Available");

const grandHall = venue({ requirements: [SUFFICIENT, AVAILABLE], unmetCount: 0, allRequirementsMet: true });
const studio = venue({ venueId: 48, name: "Synthetic Studio", maxCapacity: 150, coverPhotoId: null, requirements: [EXACT, AVAILABLE], unmetCount: 0, allRequirementsMet: true });
const seminar = venue({ venueId: 46, name: "Synthetic Seminar Room", maxCapacity: 100, coverPhotoId: null, requirements: [INSUFFICIENT, AVAILABLE], unmetCount: 1, allRequirementsMet: false });

const eventView = {
  eventId: 42,
  requestId: "REQ-000042",
  status: "UNDER_REVIEW",
  statusLabel: "Under Review",
  statusNote: null,
  title: "Capacity planning event",
  purpose: "Annual planning forum",
  description: "Talks and workshops.",
  startDatetime: "2026-11-20T02:00:00.000Z",
  endDatetime: "2026-11-20T04:00:00.000Z",
  expectedAttendance: 150,
  preferredLayoutType: null,
  accessibilityNeeds: [],
  venuePreferences: [45, 48, 46],
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
  permissions: { canEdit: false, editableFields: [], canViewDraftHistory: false, canViewStaffHistory: true, canSuggestVenue: true },
  coordinatorId: 11,
  coordinatorName: "Synthetic Coordinator",
  organiser: { userId: 5, name: "Synthetic Organiser" },
  venueSuggestion: null,
};

// The search returns only venues of at least minCapacity, as the backend does.
const optionsFor = (params) => {
  const min = Number(params.minCapacity || 0);
  return {
    event: { eventId: 42, requestId: "REQ-000042", startDatetime: eventView.startDatetime, endDatetime: eventView.endDatetime, expectedAttendance: 150, preferredLayoutType: null, accessibilityNeeds: [] },
    venues: [grandHall, studio, seminar].filter((option) => option.maxCapacity >= min),
    preferredVenues: [
      { rank: 1, venueId: 45, name: grandHall.name, option: grandHall },
      { rank: 2, venueId: 48, name: studio.name, option: studio },
      { rank: 3, venueId: 46, name: seminar.name, option: seminar },
    ],
    detailsAvailable: true,
    availabilityChecked: true,
    filtersNotChecked: [],
    canSuggestVenue: true,
  };
};

async function routeEvent(page) {
  const sent = { options: [] };
  await page.route(/\/api\/events\/42(\/.*)?(\?.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fallback();
    if (url.pathname === "/api/events/42") return route.fulfill({ json: { event: eventView } });
    if (url.pathname === "/api/events/42/history") return route.fulfill({ json: { history: [], nextCursor: null } });
    if (url.pathname === "/api/events/42/venue-bookings") {
      return route.fulfill({ json: { eventId: 42, requestId: "REQ-000042", eventType: null, eventTypeLabel: null, canRequestVenueBookings: false, bookings: [] } });
    }
    if (url.pathname === "/api/events/42/venue-options") {
      const params = Object.fromEntries(url.searchParams);
      sent.options.push(params);
      return route.fulfill({ json: optionsFor(params) });
    }
    return route.fulfill({ status: 501, json: { error: `Unmocked ${url.pathname}` } });
  });
  await routeVenuePhotos(page);
  return sent;
}

const choice = (page, name) => page.getByRole("region", { name: "Organiser's venue choices" }).getByRole("article", { name, exact: true });
const openDetails = async (page, name) => {
  const card = choice(page, name);
  await card.getByRole("button", { name: "View details" }).click();
  return card;
};
const popup = (page) => page.getByRole("dialog", { name: "Find another venue" });

test.beforeEach(async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
});

test("[SPM-198-TC-01][AC1] a venue larger than the attendance shows Capacity Sufficient", async ({ page }, testInfo) => {
  await routeEvent(page);
  await page.goto("/events/42");
  const card = await openDetails(page, "Synthetic Grand Hall");

  await expect(card.getByText("✓ Capacity Sufficient")).toBeVisible();
  await expect(card.getByText("Venue capacity is adequate (300 seats for 150 guests). Comfortable spacing available.", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Find Alternative Venues" })).toHaveCount(0);
  await attachScreenshot(testInfo, page, "capacity-sufficient");
});

test("[SPM-198-TC-02][AC2] a venue exactly as large as the attendance shows Capacity Adequate in amber", async ({ page }, testInfo) => {
  await routeEvent(page);
  await page.goto("/events/42");
  const card = choice(page, "Synthetic Studio");

  // The closed card's chip is amber too, not green.
  const chip = card.getByRole("list", { name: "Requirements" }).getByRole("listitem").first();
  await expect(chip).toHaveAttribute("title", "Capacity Adequate: Venue exactly meets expected attendance (150 seats for 150 guests). No buffer space. May feel crowded.");
  await expect(chip).toHaveCSS("background-color", "rgb(254, 243, 199)");

  await openDetails(page, "Synthetic Studio");
  await expect(card.getByText("~ Capacity Adequate")).toBeVisible();
  await expect(card.getByText("Venue exactly meets expected attendance (150 seats for 150 guests). No buffer space. May feel crowded.", { exact: true })).toBeVisible();
  // Still met: a full venue can be used.
  await expect(card.getByText("Met", { exact: true }).first()).toBeVisible();
  await expect(card.getByRole("button", { name: "Find Alternative Venues" })).toHaveCount(0);
  await attachScreenshot(testInfo, page, "capacity-adequate");
});

test("[SPM-198-TC-03][TC-04][AC3][AC4] a too-small venue shows Capacity Insufficient and finds larger venues", async ({ page }, testInfo) => {
  const sent = await routeEvent(page);
  await page.goto("/events/42");
  const card = await openDetails(page, "Synthetic Seminar Room");

  await expect(card.getByText("✗ Capacity Insufficient")).toBeVisible();
  await expect(card.getByText("Venue is too small (100 seats for 150 expected guests). Cannot accommodate. Recommend alternative venue.", { exact: true })).toBeVisible();
  await attachScreenshot(testInfo, page, "capacity-insufficient");

  await card.getByRole("button", { name: "Find Alternative Venues" }).click();
  await expect(popup(page)).toBeVisible();
  await expect(popup(page).getByLabel("Minimum capacity")).toHaveValue("150");
  await expect.poll(() => sent.options.at(-1)?.minCapacity).toBe("150");
  const names = popup(page).getByRole("region", { name: "Venue list" }).getByRole("article");
  await expect(names).toHaveCount(2);
  await expect(popup(page).getByRole("article", { name: "Synthetic Seminar Room", exact: true })).toHaveCount(0);
  await attachScreenshot(testInfo, page, "capacity-alternatives");
});

test("[SPM-198-TC-05][AC4] inside the search, a too-small venue's details filter the list to larger venues", async ({ page }) => {
  const sent = await routeEvent(page);
  await page.goto("/events/42");
  await page.getByRole("button", { name: "Find another venue" }).click();
  const search = popup(page);
  await expect(search.getByLabel("Minimum capacity")).toHaveValue("");

  await search.getByRole("article", { name: "Synthetic Seminar Room", exact: true }).getByRole("button", { name: /View/ }).click();
  const details = search.getByRole("region", { name: "Venue details" });
  await expect(details.getByText("✗ Capacity Insufficient")).toBeVisible();
  await details.getByRole("button", { name: "Find Alternative Venues" }).click();

  await expect(search.getByLabel("Minimum capacity")).toHaveValue("150");
  await expect.poll(() => sent.options.at(-1)?.minCapacity).toBe("150");
  await expect(search.getByRole("region", { name: "Venue details" })).toHaveCount(0);
  await expect(search.getByRole("article", { name: "Synthetic Seminar Room", exact: true })).toHaveCount(0);
  // Clear filters brings every venue back.
  await search.getByRole("button", { name: "Clear filters" }).click();
  await expect(search.getByRole("article", { name: "Synthetic Seminar Room", exact: true })).toBeVisible();
});
