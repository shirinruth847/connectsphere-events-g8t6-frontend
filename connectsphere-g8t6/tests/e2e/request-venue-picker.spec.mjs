import { test, expect } from "@playwright/test";
import { attachScreenshot, enterCompleteRequestThroughSubmit, installConnectSphereMocks, requirement, routeVenuePhotos, venueOption } from "./support.mjs";

// SPM-76: the organiser browses, compares and ranks venues in the request
// form's venue step. GET /api/venues/options checks each venue against the
// form's values; organisers never see other events' bookings behind it.
const hall = venueOption({ venueId: 1, name: "Main Hall" });
const studio = venueOption({
  venueId: 2,
  name: "Synthetic Studio",
  maxCapacity: 60,
  coverPhotoId: null,
  availability: { status: "UNAVAILABLE_BOOKING", label: "Unavailable – booking", occupiedStart: null, occupiedEnd: null, conflicts: [], operatingHoursWarning: null },
  requirements: [
    requirement("capacity", "Capacity", "UNMET", "Holds 60; 150 expected"),
    requirement("availability", "Availability", "UNMET", "Unavailable – booking"),
  ],
  unmetCount: 2,
  allRequirementsMet: false,
});
const terrace = venueOption({ venueId: 3, name: "Synthetic Terrace", coverPhotoId: null, unmetCount: 0 });
const result = (venues = [hall, terrace, studio], overrides = {}) => ({ venues, detailsAvailable: true, availabilityChecked: true, filtersNotChecked: [], ...overrides });

async function routeRequestOptions(page, { body = result(), status = 200 } = {}) {
  const sent = [];
  await page.route(/\/api\/venues\/options(\?.*)?$/, (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    const url = new URL(route.request().url());
    sent.push({ params: Object.fromEntries(url.searchParams), accessibilityNeeds: url.searchParams.getAll("accessibilityNeeds") });
    return route.fulfill({ status, json: status === 200 ? body : { error: "Internal Server Error" } });
  });
  await routeVenuePhotos(page);
  return sent;
}

async function goToVenueStep(page) {
  await page.goto("/events/create");
  await page.getByLabel("Event Title").fill("Synthetic venue picking");
  await page.getByLabel("Event Purpose").fill("Choose a venue");
  await page.getByLabel("Executive Abstract & Event Scope").fill("A request used to test venue choices.");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Primary Proposed Date").fill("2026-12-01T10:00");
  await page.getByLabel("Event End Date & Time").fill("2026-12-01T12:00");
  await page.getByLabel("Targeted In-Person Headcount").fill("150");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Venue & Layout Requirements" })).toBeVisible();
}

const search = (page) => page.getByRole("region", { name: "Venue search" });
const card = (page, name) => search(page).getByRole("article", { name, exact: true });
const yourChoices = (page) => page.getByRole("region", { name: "Your venue choices" });

test("[SPM-76 TC-VS-001][TC-VS-003][AC1][AC3] the organiser sees venues checked against the form, three to a row", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installConnectSphereMocks(page);
  const sent = await routeRequestOptions(page);
  await goToVenueStep(page);
  await page.getByLabel("Preferred Seating & Room Geometry").selectOption("THEATRE");

  await expect.poll(() => sent.at(-1)?.params).toEqual({
    startDatetime: new Date("2026-12-01T10:00").toISOString(),
    endDatetime: new Date("2026-12-01T12:00").toISOString(),
    expectedAttendance: "150",
    preferredLayoutType: "THEATRE",
  });
  await expect(search(page).getByText("3 venues available · 2 meet every requirement")).toBeVisible();
  const tops = await search(page).getByRole("article").evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  await expect(card(page, "Synthetic Studio").getByText("Availability: Unavailable – booking")).toBeVisible();
  await expect(card(page, "Synthetic Studio").getByRole("listitem").filter({ hasText: "Capacity: Holds 60" })).toHaveClass(/bg-surface-container-low/);
  await expect(card(page, "Main Hall").getByRole("listitem").filter({ hasText: "Capacity: Holds 300" })).toHaveClass(/bg-\[#DCFCE7\]/);
  await expect(page.getByRole("button", { name: "Show availability calendar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Select" })).toHaveCount(0);
  await attachScreenshot(testInfo, page, "organiser-venue-step");
});

test("[SPM-76 TC-VS-004][TC-VS-005][AC4][AC5] the organiser views details and compares two venues", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installConnectSphereMocks(page);
  await routeRequestOptions(page);
  await goToVenueStep(page);

  await card(page, "Main Hall").getByRole("button", { name: "View details" }).click();
  const details = page.getByRole("region", { name: "Venue details" });
  await expect(details.getByRole("img", { name: "Front entrance" })).toBeVisible();
  await expect(details.getByText("Two exits on the north side")).toBeVisible();
  await expect(details.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Compare with" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show comparison view" }).click();
  await card(page, "Synthetic Terrace").getByRole("button", { name: "Compare" }).click();
  await expect(page.getByRole("region", { name: "Compare with" }).getByRole("heading", { name: "Synthetic Terrace" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Conflicts" })).toHaveCount(0);
});

test("[SPM-76 TC-VS-006][AC6] the organiser ranks an ideal venue and alternatives, and the order is submitted", async ({ page }, testInfo) => {
  const state = await installConnectSphereMocks(page);
  await routeRequestOptions(page);
  await page.goto("/events/create");
  await enterCompleteRequestThroughSubmit(page);
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Venue & Layout Requirements" })).toBeVisible();

  await expect(yourChoices(page)).toContainText("No venue chosen yet");
  await card(page, "Synthetic Terrace").getByRole("button", { name: "Choose as ideal venue" }).click();
  await card(page, "Main Hall").getByRole("button", { name: "Add as a choice" }).click();
  await expect(card(page, "Synthetic Terrace").getByText("Your choice 1")).toBeVisible();
  await expect(yourChoices(page).getByRole("listitem")).toHaveText([/Ideal venue\s*Synthetic Terrace/, /Choice 2\s*Main Hall/]);

  await yourChoices(page).getByRole("button", { name: "Move Main Hall up" }).click();
  await expect(yourChoices(page).getByRole("listitem")).toHaveText([/Ideal venue\s*Main Hall/, /Choice 2\s*Synthetic Terrace/]);
  await card(page, "Synthetic Studio").getByRole("button", { name: "Add as a choice" }).click();
  await yourChoices(page).getByRole("button", { name: "Remove Synthetic Studio" }).click();
  await expect(yourChoices(page)).toContainText("2 / 20");
  await attachScreenshot(testInfo, page, "organiser-venue-choices");

  for (let step = 0; step < 3; step++) await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: /Submit request/i }).click();
  await expect.poll(() => state.createEventRequests.length).toBe(1);
  expect(state.createEventRequests[0].payload.venuePreferences).toEqual([1, 3]);
});

test("[SPM-76 TC-VS-002][AC2] filters, sort and page size apply; Enter in a filter does not submit the request", async ({ page }) => {
  const state = await installConnectSphereMocks(page);
  const many = Array.from({ length: 21 }, (_, index) => venueOption({ venueId: 100 + index, name: `Synthetic Venue ${String(index + 1).padStart(2, "0")}`, coverPhotoId: null }));
  const sent = await routeRequestOptions(page, { body: result(many) });
  await goToVenueStep(page);

  await expect(search(page).getByRole("article")).toHaveCount(10);
  await expect(page.getByRole("button", { name: "Show more venues (10 more)" })).toBeVisible();
  await page.getByLabel("Show", { exact: true }).selectOption("20");
  await expect(search(page).getByRole("article")).toHaveCount(20);
  await expect(page.getByRole("button", { name: "Show more venues (1 more)" })).toBeVisible();

  await page.getByLabel("Search", { exact: true }).fill("Hall");
  await page.getByLabel("Search", { exact: true }).press("Enter");
  await expect.poll(() => sent.at(-1)?.params.search).toBe("Hall");
  await page.getByLabel("Sort by").selectOption("capacity");
  await expect.poll(() => sent.at(-1)?.params.sort).toBe("capacity");
  await expect(page.getByRole("heading", { name: "Venue & Layout Requirements" })).toBeVisible();
  expect(state.createEventRequests).toHaveLength(0);
  expect(state.draftCreateRequests).toHaveLength(0);
});

test("[SPM-76 TC-VS-006][AC6] at most 20 venues can be chosen", async ({ page }) => {
  await installConnectSphereMocks(page);
  const many = Array.from({ length: 21 }, (_, index) => venueOption({ venueId: 100 + index, name: `Synthetic Venue ${String(index + 1).padStart(2, "0")}`, coverPhotoId: null }));
  await routeRequestOptions(page, { body: result(many) });
  await goToVenueStep(page);
  await page.getByLabel("Show", { exact: true }).selectOption("50");

  for (let index = 0; index < 20; index++) {
    await card(page, `Synthetic Venue ${String(index + 1).padStart(2, "0")}`).getByRole("button", { name: /Choose as ideal venue|Add as a choice/ }).click();
  }
  await expect(yourChoices(page)).toContainText("20 / 20");
  await expect(card(page, "Synthetic Venue 21").getByRole("button", { name: "Add as a choice" })).toBeDisabled();
});

test("[SPM-76 TC-VS-008][AC7] a failed load offers a retry and the request can still be completed", async ({ page }) => {
  await installConnectSphereMocks(page);
  await routeRequestOptions(page, { status: 500 });
  await goToVenueStep(page);

  const failure = page.getByRole("alert").filter({ hasText: "Unable to load venues" });
  await expect(failure.getByRole("button", { name: "Retry" })).toBeVisible();
  await page.unroute(/\/api\/venues\/options(\?.*)?$/);
  await routeRequestOptions(page);
  await failure.getByRole("button", { name: "Retry" }).click();
  await expect(card(page, "Main Hall")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Accessibility & Special Needs" })).toBeVisible();
});

test("[SPM-76] the venue step works at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installConnectSphereMocks(page);
  await routeRequestOptions(page);
  await goToVenueStep(page);
  await card(page, "Main Hall").getByRole("button", { name: "View details" }).click();
  await page.getByRole("button", { name: "Show comparison view" }).click();
  await expect(page.getByRole("region", { name: "Compare with" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
