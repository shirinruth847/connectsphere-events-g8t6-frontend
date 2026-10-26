import { test, expect } from "@playwright/test";
import { attachScreenshot, installConnectSphereMocks, makeDraft, organiserView } from "./support.mjs";

const organisation = { organisationId: 7, name: "Test Organisation" };
const ownDraft = makeDraft({ title: "My private draft", organisation });
const ownEvent = makeDraft({ eventId: 44, requestId: "REQ-000044", title: "My submitted event", status: "SUBMITTED", statusLabel: "Submitted", organisation, permissions: { canEdit: false, editableFields: [], canViewDraftHistory: true, canViewStaffHistory: false } });
const colleagueEvent = makeDraft({ eventId: 45, requestId: "REQ-000045", title: "Colleague completed event", status: "COMPLETED", statusLabel: "Completed", organisation, isOwner: false, viewerRelationship: "ORGANISATION_MEMBER", permissions: { canEdit: false, editableFields: [], canViewDraftHistory: false, canViewStaffHistory: false } });

async function setup(page) {
  const state = await installConnectSphereMocks(page);
  state.events = [ownDraft, ownEvent, colleagueEvent];
  return state;
}

test("organiser dashboard includes colleagues' events and opens them read-only", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Organisation Events", exact: true })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main Navigation", exact: true });
  await expect(nav.getByRole("link", { name: "Dashboard", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(nav.getByRole("link", { name: "My Drafts", exact: true })).toHaveCount(0);
  await expect(page.locator("article")).toHaveCount(3);
  const shared = page.locator("article").filter({ hasText: colleagueEvent.title });
  await expect(shared.getByText("Test Organisation", { exact: true })).toBeVisible();
  await expect(shared.getByText("Organisation event · Read-only", { exact: true })).toBeVisible();
  await expect(page.locator("article").filter({ hasText: ownDraft.title }).getByText("Private draft", { exact: true })).toBeVisible();
  await attachScreenshot(testInfo, page, "organisation-events-desktop");
  await shared.getByRole("link", { name: "View event" }).click();
  await expect(page).toHaveURL(/\/events\/45$/);
  await expect(page.getByText("Viewing as a member of your organisation")).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit Draft" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Save changes|Submit request/ })).toHaveCount(0);
});

test("personal requests and drafts stay separate from organisation events", async ({ page }) => {
  await setup(page);
  await page.goto("/dashboard");
  const nav = page.getByRole("navigation", { name: "Main Navigation", exact: true });
  await nav.getByRole("link", { name: "My Requests", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\?scope=MINE$/);
  await expect(page.getByRole("heading", { name: "My Requests", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "My Requests", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("article")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: colleagueEvent.title })).toHaveCount(0);
  await page.reload();
  await expect(page.locator("article")).toHaveCount(2);
  await expect(nav.getByRole("link", { name: "My Drafts", exact: true })).toHaveCount(0);
  await page.goto("/dashboard?status=DRAFT#my-drafts");
  await expect(page.getByRole("heading", { name: "My Drafts", exact: true, level: 1 })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(1);
  await expect(nav.getByRole("link", { name: "My Requests", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Edit Draft" })).toHaveAttribute("href", "/events/new?draft=43");
  await nav.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(3);
});

test("organisation search and status filters work on mobile", async ({ page }, testInfo) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(page.locator("article")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await attachScreenshot(testInfo, page, "organisation-events-mobile");
  await page.getByRole("combobox", { name: "Filter events by status" }).selectOption("Completed");
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: colleagueEvent.title })).toBeVisible();
  await page.getByRole("combobox", { name: "Filter events by status" }).selectOption("ALL");
  await page.getByRole("textbox", { name: "Search events" }).fill("Test Organisation");
  await expect(page.locator("article")).toHaveCount(3);
  await page.getByRole("textbox", { name: "Search events" }).fill("REQ-000045");
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Search events" }).fill("No matching event");
  await expect(page.getByRole("heading", { name: "No matching events" })).toBeVisible();
});

test("organisation dashboard loads colleagues' events across cursor pages", async ({ page }) => {
  await setup(page);
  const cursors = [];
  await page.route("**/api/events/mine?**", async (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    cursors.push(cursor);
    await route.fulfill({ json: cursor ? { events: [organiserView(colleagueEvent)], nextCursor: null } : { events: [organiserView(ownEvent)], nextCursor: "next-page" } });
  });
  await page.goto("/dashboard");
  await expect(page.locator("article")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: colleagueEvent.title })).toBeVisible();
  expect(cursors).toEqual([null, "next-page"]);
});
