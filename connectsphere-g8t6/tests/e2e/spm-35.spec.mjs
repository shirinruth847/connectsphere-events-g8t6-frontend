import { test, expect } from "@playwright/test";
import { attachScreenshot, enterCompleteRequestThroughSubmit, installConnectSphereMocks } from "./support.mjs";

test("[SPM-35 TC-001] submits a valid event and shows its request ID and API status on My Requests", async ({ page }, testInfo) => {
  const state = await installConnectSphereMocks(page);
  await page.goto("/events/create");
  await enterCompleteRequestThroughSubmit(page);
  await page.getByRole("button", { name: /Submit request/i }).click();

  await expect(page).toHaveURL(/\/dashboard\?submitted=1&requestId=REQ-000600/);
  await expect(page.getByRole("heading", { name: "Tech Conference 2026" }).first()).toBeVisible();
  await expect(page.getByText("Pending Approval").first()).toBeVisible();
  expect(state.createEventRequests).toHaveLength(1);
  expect(state.createEventRequests[0].payload.expectedAttendance).toBe(150);
  expect(state.createEventRequests[0].payload.preferredLayoutType).toBe("NO_PREFERENCE");
  expect(state.createEventRequests[0].headers["idempotency-key"]).toBeTruthy();
  await attachScreenshot(testInfo, page, "SPM-35-TC-001-pass");
});

test("[SPM-35 TC-002] blocks creation when Event Title is blank and shows an inline error", async ({ page }, testInfo) => {
  const state = await installConnectSphereMocks(page);
  await page.goto("/events/create");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(page.getByText("Event Title is required.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Event Identity & Core Purpose" })).toBeVisible();
  expect(state.createEventRequests).toHaveLength(0);
  await attachScreenshot(testInfo, page, "SPM-35-TC-002-pass");
});

test("[SPM-35 TC-003] rejects a start date 24 hours away with the 48-hour validation message", async ({ page }, testInfo) => {
  const state = await installConnectSphereMocks(page);
  await page.clock.setFixedTime(new Date("2026-10-13T12:00:00"));
  await page.goto("/events/create");
  await enterCompleteRequestThroughSubmit(page, { startHours: 24 });
  await page.getByRole("button", { name: /Submit request/i }).click();

  await expect(page.getByText("Event date must be at least 48 hours in advance.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Scheduling & Attendance Estimates" })).toBeVisible();
  expect(state.createEventRequests).toHaveLength(0);
  await attachScreenshot(testInfo, page, "SPM-35-TC-003-pass");
});

test("[SPM-35 TC-004] redirects a logged-out visitor from /events/create to login with a notice", async ({ page }, testInfo) => {
  await installConnectSphereMocks(page, { authenticated: false });
  await page.goto("/events/create");

  await expect(page).toHaveURL(/\/login\?next=%2Fevents%2Fcreate&reason=login-required/);
  await expect(page.getByText("Please log in to access this page.")).toBeVisible();
  await attachScreenshot(testInfo, page, "SPM-35-TC-004-pass");
});

test("[SPM-35 boundary] permits an event starting exactly 48 hours from now", async ({ page }, testInfo) => {
  const state = await installConnectSphereMocks(page);
  await page.clock.setFixedTime(new Date("2026-10-13T12:00:00"));
  await page.goto("/events/create");
  await enterCompleteRequestThroughSubmit(page, { startHours: 48 });
  await page.getByRole("button", { name: /Submit request/i }).click();

  await expect(page).toHaveURL(/\/dashboard\?submitted=1/);
  expect(state.createEventRequests).toHaveLength(1);
  await attachScreenshot(testInfo, page, "SPM-35-48-hour-boundary-pass");
});
