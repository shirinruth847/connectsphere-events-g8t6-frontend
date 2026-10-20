import { test, expect, type Page } from "@playwright/test";
import type { Venue, VenueCatalogue } from "../../lib/api/venues";

const venue = (overrides: Partial<Venue>): Venue => ({
  venueId: 101,
  name: "Venue A",
  address: "1 Campus Drive",
  maxCapacity: 500,
  operatingHours: "08:00 - 22:00",
  accessibilityFeatures: ["Lift access"],
  setupTurnaroundMinutes: 30,
  rooms: [{ roomId: 1, layoutType: "THEATRE", capacity: 500 }],
  detailStatus: "CURRENT",
  description: "Main hall",
  facilities: ["Wi-Fi", "Stage"],
  supportedLayouts: ["THEATRE"],
  emergencyAccess: "North exits",
  knownRestrictions: [],
  ...overrides,
});

const venueA = venue({});
const venueB = venue({
  venueId: 102,
  name: "Venue B",
  address: "2 Campus Drive",
  maxCapacity: 80,
  operatingHours: "09:00 - 18:00",
  accessibilityFeatures: null,
  rooms: [{ roomId: 2, layoutType: "CLASSROOM", capacity: 80 }],
  detailStatus: "NOT_AVAILABLE",
  description: null,
  facilities: null,
  supportedLayouts: null,
  emergencyAccess: null,
  knownRestrictions: null,
});

// Each venue is one SectionCard (<section>).
const venueCard = (page: Page, name: string) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name, exact: true }) });

type VenueMock ={ status?: number; body?: VenueCatalogue | { error: string; code: string } };

// Mocks Auth and the catalogue API; returns how often /api/venues was called.
async function installVenueMock(page: Page, role: string, { status = 200, body }: VenueMock) {
  const calls = { venues: 0 };
  await page.addInitScript(() => {
    localStorage.setItem("sb-test-project-auth-token", JSON.stringify({
      access_token: "e2e-access-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: "e2e-refresh-token",
      user: { id: "e2e-user-id", aud: "authenticated", role: "authenticated", email: "e2e@example.com" },
    }));
  });

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: { user_id: 11, name: "E2E User", email: "e2e@example.com", role } }),
      });
    }
    if (pathname === "/api/venues") {
      calls.venues += 1;
      return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    }
    return route.continue();
  });
  return calls;
}

test.describe("[SPM-72] Venue Catalogue", () => {
  test("[TC-VC-001][SPM-72-AC2][SPM-72-AC3] should_display_venue_a_and_venue_b_with_their_details", async ({ page }) => {
    await installVenueMock(page, "COORDINATOR", { body: { venues: [venueA, venueB], detailsAvailable: true } });
    await page.goto("/venues");

    await expect(page.getByRole("heading", { name: "Venue Catalogue" })).toBeVisible();
    const cardA = venueCard(page, "Venue A");
    await expect(cardA.getByText("500 people")).toBeVisible();
    await expect(cardA.getByText("08:00 - 22:00")).toBeVisible();
    await expect(cardA.getByText("Lift access")).toBeVisible();
    await expect(cardA.getByText("THEATRE (500)")).toBeVisible();
    await expect(cardA.getByText("Facilities: Wi-Fi, Stage")).toBeVisible();

    const cardB = venueCard(page, "Venue B");
    await expect(cardB.getByText("80 people")).toBeVisible();
    await expect(cardB.getByText("CLASSROOM (80)")).toBeVisible();
    await expect(cardB.getByText("Facilities: Not listed")).toBeVisible();
    await expect(cardB.getByText("Details: Not available")).toBeVisible();
  });

  test("[TC-VC-002][SPM-72-AC5] should_tell_the_coordinator_that_no_venues_are_available", async ({ page }) => {
    await installVenueMock(page, "COORDINATOR", { body: { venues: [], detailsAvailable: true } });
    await page.goto("/venues");

    await expect(page.getByText("No venues are currently available")).toBeVisible();
    await expect(page.getByText("There are no available venues to consider at this time.")).toBeVisible();
  });

  // The backend leaves deleted venues out (tests/integration/venue.integration.test.js);
  // the page must show exactly what it returns and add nothing.
  test("[TC-VC-003][SPM-72-AC4] should_display_venue_b_and_not_venue_a_when_venue_a_was_deleted", async ({ page }) => {
    await installVenueMock(page, "COORDINATOR", { body: { venues: [venueB], detailsAvailable: true } });
    await page.goto("/venues");

    await expect(page.getByRole("heading", { name: "Venue B" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Venue A" })).toHaveCount(0);
  });

  test("[SPM-72-AC1] should_show_the_catalogue_read_only", async ({ page }) => {
    await installVenueMock(page, "COORDINATOR", { body: { venues: [venueA], detailsAvailable: true } });
    await page.goto("/venues");

    await expect(page.getByRole("heading", { name: "Venue A" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add|Create|Delete|Edit|Save|Book/ })).toHaveCount(0);
    await expect(page.getByText("Read-only catalogue")).toHaveCount(1);
  });

  // Venue Staff get the editable venue list at /venues instead (SPM-73,
  // tests/e2e/venue-management.spec.mjs).
  for (const role of ["COORDINATOR_LEAD"]) {
    test(`[SPM-72-AC1] should_show_the_catalogue_to_${role}`, async ({ page }) => {
      await installVenueMock(page, role, { body: { venues: [venueA], detailsAvailable: true } });
      await page.goto("/venues");

      await expect(page.getByRole("heading", { name: "Venue A" })).toBeVisible();
    });
  }

  for (const role of ["ORGANISER", "TECH_SUPPORT", "ATTENDEE"]) {
    test(`[SPM-72-AC1] should_show_access_required_to_${role}_without_loading_venues`, async ({ page }) => {
      const calls = await installVenueMock(page, role, { body: { venues: [venueA], detailsAvailable: true } });
      await page.goto("/venues");

      await expect(page.getByText("Catalogue access required")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Venue A" })).toHaveCount(0);
      expect(calls.venues).toBe(0);
    });
  }

  test("[M4] should_mark_details_not_checked_and_keep_catalogue_data_when_details_are_unavailable", async ({ page }) => {
    const notChecked = venue({
      accessibilityFeatures: ["Ramp at main entrance"],
      detailStatus: "NOT_CHECKED",
      description: null,
      facilities: null,
      supportedLayouts: null,
      emergencyAccess: null,
      knownRestrictions: null,
    });
    await installVenueMock(page, "COORDINATOR", { body: { venues: [notChecked], detailsAvailable: false } });
    await page.goto("/venues");

    await expect(page.getByText("Venue details are temporarily unavailable")).toBeVisible();
    await expect(page.getByText("500 people")).toBeVisible();
    await expect(page.getByText("THEATRE (500)")).toBeVisible();
    await expect(page.getByText("Ramp at main entrance")).toBeVisible();
    await expect(page.getByText("Facilities: Not checked")).toBeVisible();
    await expect(page.getByText("Details: Not checked")).toBeVisible();
  });

  test("should_offer_a_retry_when_the_catalogue_fails_to_load", async ({ page }) => {
    await installVenueMock(page, "COORDINATOR", {
      status: 500,
      body: { error: "Internal Server Error", code: "INTERNAL_ERROR" },
    });
    await page.goto("/venues");

    await expect(page.getByText("Unable to load venues")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });
});
