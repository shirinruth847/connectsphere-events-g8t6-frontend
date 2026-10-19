import { test, expect } from "@playwright/test";
import { attachScreenshot, enterCompleteRequestThroughSubmit, installConnectSphereMocks, makeDraft } from "./support.mjs";

test("[SPM-37 manual save] saves a title-only draft and lists it with a Draft badge", async ({ page }, testInfo) => {
  const state = await installConnectSphereMocks(page);
  await page.goto("/events/new");
  await page.getByLabel("Event Title").fill("SMU Alumni Gala 2026");
  await page.getByRole("button", { name: "Save as Draft", exact: false }).click();

  await expect(page).toHaveURL(/\/dashboard\?status=DRAFT#my-drafts/);
  await expect(page.getByText("Draft saved successfully.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "SMU Alumni Gala 2026" })).toBeVisible();
  const savedDraftCard = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "SMU Alumni Gala 2026" }),
  });
  await expect(savedDraftCard.getByText("Draft", { exact: true })).toBeVisible();
  expect(state.draftCreateRequests).toHaveLength(1);
  expect(state.draftCreateRequests[0].title).toBe("SMU Alumni Gala 2026");
  await attachScreenshot(testInfo, page, "SPM-37-manual-save-pass");
});

test("[SPM-37 resume and submit] prefills a saved draft and submits it", async ({ page }, testInfo) => {
  const draft = makeDraft();
  const state = await installConnectSphereMocks(page, { draft });
  await page.goto("/events/new?draft=43");

  await expect(page.getByLabel("Event Title")).toHaveValue("SMU Alumni Gala 2026");
  await expect(page.getByLabel("Event Purpose")).toHaveValue("Reconnect alumni");
  await enterCompleteRequestThroughSubmit(page, { startHours: 168, attendance: "200" });
  await page.getByRole("button", { name: /Submit request/i }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator("article").getByText("Submitted", { exact: true })).toBeVisible();
  expect(state.draftUpdateRequests).toHaveLength(0);
  expect(state.submitDraftRequests).toHaveLength(1);
  expect(state.submitDraftRequests[0].title).toBe("Tech Conference 2026");
  expect(state.submitDraftRequests[0].expectedAttendance).toBe(200);
  expect(state.events[0].status).toBe("SUBMITTED");
  await attachScreenshot(testInfo, page, "SPM-37-resume-submit-pass");
});

test("[SPM-37 incomplete submission] keeps an incomplete draft in Draft and blocks submission", async ({ page }, testInfo) => {
  const draft = makeDraft({ expectedAttendance: null });
  const state = await installConnectSphereMocks(page, { draft });
  await page.goto("/events/new?draft=43");

  await expect(page.getByLabel("Event Title")).toHaveValue(draft.title);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Expected Attendance is required for submission", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Targeted In-Person Headcount")).toBeVisible();
  expect(state.submitDraftRequests).toHaveLength(0);
  expect(state.draft.status).toBe("DRAFT");
  await attachScreenshot(testInfo, page, "SPM-37-incomplete-submit-pass");
});

test("[SPM-37 unsaved changes] warns before leaving and lets the organiser cancel or confirm", async ({ page }, testInfo) => {
  await installConnectSphereMocks(page);
  await page.goto("/events/new");
  await page.getByLabel("Event Title").fill("Unsaved event");

  const closeRequest = page.getByRole("link", { name: "Close request and return to dashboard" });
  await closeRequest.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("You have unsaved event changes. Are you sure you want to leave?")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page).toHaveURL(/\/events\/new$/);
  await expect(page.getByLabel("Event Title")).toHaveValue("Unsaved event");

  await closeRequest.click();
  await page.getByRole("button", { name: "Leave page" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await attachScreenshot(testInfo, page, "SPM-37-unsaved-warning-pass");
});

test("[SPM-37 autosave timing] sends no request at 29 seconds and autosaves at 30 seconds idle", async ({ page }, testInfo) => {
  const state = await installConnectSphereMocks(page);
  await page.clock.install({ time: new Date("2026-10-13T12:00:00") });
  await page.goto("/events/new");
  await page.getByLabel("Event Title").fill("Autosave gala");

  await page.clock.fastForward(29_000);
  expect(state.draftCreateRequests).toHaveLength(0);
  await page.clock.fastForward(1_000);
  await expect.poll(() => state.draftCreateRequests.length).toBe(1);
  await expect(page.getByText(/^Last auto-saved at /)).toBeVisible();
  await attachScreenshot(testInfo, page, "SPM-37-autosave-30-seconds-pass");
});
