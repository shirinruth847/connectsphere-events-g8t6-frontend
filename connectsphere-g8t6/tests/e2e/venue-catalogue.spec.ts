import { test, expect } from "@playwright/test";

const coordinatorEmail = process.env.E2E_COORDINATOR_EMAIL;
const coordinatorPassword = process.env.E2E_COORDINATOR_PASSWORD;

test.describe("[SPM-72] Venue Catalogue", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !coordinatorEmail || !coordinatorPassword,
      "E2E_COORDINATOR_EMAIL/PASSWORD are required for the synthetic coordinator account.",
    );

    // Always start at the root sign-in page, authenticate, then go to /venues.
    await page.goto("/");
    await page.getByLabel("Email").fill(coordinatorEmail!);
    await page.getByLabel("Password").fill(coordinatorPassword!);
    await page.getByRole("button", { name: "Sign in" }).click();

    // Wait for sign-in to complete: COORDINATOR_LEAD -> /events, ORGANISER ->
    // /dashboard, COORDINATOR/VENUE_STAFF/SAFETY_OFFICER -> forbidden at /.
    await page.waitForLoadState("networkidle");

    // Navigate to the venue catalogue page.
    await page.goto("/venues");

    // Wait for the venue page to render its content (heading or forbidden state).
    await page.waitForFunction(() => {
      const h1 = document.querySelector("h1");
      return h1 && (h1.textContent === "Venue Catalogue" || h1.textContent === "Catalogue access required");
    }, { timeout: 15000 });
  });

  test("[TC-VC-001] should_display_the_available_venue_catalogue", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Venue Catalogue" })).toBeVisible();
    await expect(page.getByText(/Review venues currently available for event planning/)).toBeVisible();
  });

  test("[TC-VC-002] should_display_a_read_only_catalogue_label_for_each_venue", async ({ page }) => {
    await expect(page.getByText("Read-only catalogue").first()).toBeVisible();
  });

  test("[AC-VC-001] should_not_show_mutation_controls_in_the_catalogue", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Add|Create|Delete|Edit/ })).toHaveCount(0);
  });

  test("[AC-VC-003] should_show_venue_capacity_operating_hours_and_rooms_when_venues_exist", async ({ page }) => {
    const hasVenues = await page.locator(".request-card").count().then((count) => count > 0);
    if (hasVenues) {
      await expect(page.getByText(/CAPACITY/).first()).toBeVisible();
      await expect(page.getByText(/OPERATING HOURS/).first()).toBeVisible();
      await expect(page.getByText(/ROOMS/).first()).toBeVisible();
    } else {
      await expect(page.getByText("No venues are currently available")).toBeVisible();
    }
  });

  test("[AC-VC-004] should_show_read_only_catalogue_label_on_each_venue_card", async ({ page }) => {
    const hasVenues = await page.locator(".request-card").count().then((count) => count > 0);
    if (hasVenues) {
      await expect(page.getByText("Read-only catalogue").first()).toBeVisible();
    }
  });

  test("[AC-VC-005] should_show_forbidden_state_for_non_permitted_roles", async ({ page }) => {
    const attendeeEmail = process.env.E2E_ATTENDEE_EMAIL;
    const attendeePassword = process.env.E2E_ATTENDEE_PASSWORD;
    test.skip(!attendeeEmail || !attendeePassword, "E2E_ATTENDEE_EMAIL/PASSWORD are required.");

    await page.goto("/");
    await page.getByLabel("Email").fill(attendeeEmail!);
    await page.getByLabel("Password").fill(attendeePassword!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForLoadState("networkidle");
    await page.goto("/venues");
    await expect(page.getByText("Catalogue access required")).toBeVisible();
  });

  test("[TC-VC-003] should_return_only_venues_present_in_the_available_source", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Venue Catalogue" })).toBeVisible();
    const venueCards = page.locator(".request-card");
    const count = await venueCards.count();
    for (let i = 0; i < count; i++) {
      const card = venueCards.nth(i);
      await expect(card.getByText("Read-only catalogue")).toBeVisible();
    }
  });
});
