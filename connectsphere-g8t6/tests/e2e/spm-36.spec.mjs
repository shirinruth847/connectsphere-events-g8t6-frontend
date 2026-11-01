import { test, expect } from "@playwright/test";
import { attachScreenshot, enterCompleteRequestThroughSubmit, installConnectSphereMocks, installLoginMock, makeDraft } from "./support.mjs";

async function openCompletedDraft(page) {
  await page.goto("/events/new?draft=43");
  await expect(page.getByLabel("Event Title")).toHaveValue("SMU Alumni Gala 2026");
  await enterCompleteRequestThroughSubmit(page);
}

function submitted(state, overrides = {}) {
  state.draft = makeDraft({ ...state.draft, status: "SUBMITTED", statusLabel: "Submitted", submittedAt: "2026-10-19T10:00:00Z", permissions: { ...state.draft.permissions, canEdit: false }, ...overrides });
  state.events = [state.draft];
}

for (const width of [1440, 390]) {
  test(`[SPM-36 FE-02/03/04/14/20] submits the same draft and displays read-only details at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await installConnectSphereMocks(page, { draft: makeDraft() });
    await openCompletedDraft(page);
    await page.getByRole("button", { name: "Submit Request", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("status")).toContainText("REQ-000043 · Submitted");
    await expect(page.getByRole("status")).toContainText("Coordinator Lead");
    expect(state.submitDraftRequests).toHaveLength(1);
    expect(state.createEventRequests).toHaveLength(0);
    expect(state.draft.eventId).toBe(43);
    expect(state.submitDraftRequests[0].title).toBe("Tech Conference 2026");
    await page.getByRole("link", { name: /Track submission/ }).click();
    await expect(page.getByText("Unassigned", { exact: true })).toBeVisible();
    await expect(page.getByText("Owner • Read-only", { exact: true })).toBeVisible();
    await expect(page.locator("dl > div").filter({ has: page.locator("dt").getByText("Submitted", { exact: true }) })).toContainText("13 Oct 2026, 20:00 SGT");
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("Unassigned", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await attachScreenshot(testInfo, page, `SPM-36-submitted-${width}`);
  });
}

test("[SPM-36 FE-09] maps backend field errors to accessible inputs and retains entered values", async ({ page }) => {
  const state = await installConnectSphereMocks(page, { draft: makeDraft() });
  await openCompletedDraft(page);
  state.failure = { path: "/api/events/43/submit", status: 400, body: { code: "VALIDATION_FAILED", error: "Please correct the highlighted fields.", fields: { purpose: "Please clarify the event purpose.", description: "Please add the event scope." } } };
  await page.getByRole("button", { name: "Submit Request", exact: true }).click();
  await expect(page.getByLabel("Event Title")).toHaveValue("Tech Conference 2026");
  await expect(page.getByLabel("Event Purpose")).toHaveAttribute("aria-describedby", "purpose-error");
  await expect(page.getByLabel("Event Purpose")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#purpose-error")).toHaveText("Please clarify the event purpose.");
  await expect(page.locator("#description-error")).toHaveText("Please add the event scope.");
  await expect(page.getByLabel("Executive Abstract & Event Scope")).toHaveValue("Talks and networking for tech professionals.");
  expect(state.draft.status).toBe("DRAFT");
});

test("[SPM-36 FE-10] guards rapid mouse and keyboard submits while the response is pending", async ({ page }) => {
  const state = await installConnectSphereMocks(page, { draft: makeDraft() });
  await openCompletedDraft(page);
  state.delay = 500;
  await page.locator("#submit-request").evaluate(button => {
    button.form.requestSubmit(button);
    button.form.requestSubmit(button);
    button.form.requestSubmit(button);
  });
  await expect(page.getByRole("button", { name: "Submitting…" })).toBeDisabled();
  await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(state.submitDraftRequests).toHaveLength(1);
});

test("[SPM-36 FE-11/19] retains a failed draft and allows a successful retry", async ({ page }) => {
  const state = await installConnectSphereMocks(page, { draft: makeDraft() });
  await openCompletedDraft(page);
  state.failure = { path: "/api/events/43/submit", status: 500, body: { error: "The request could not be saved.", code: "INTERNAL_ERROR" } };
  await page.getByRole("button", { name: "Submit Request", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The request could not be saved." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit Request", exact: true })).toBeEnabled();
  expect(state.draft.status).toBe("DRAFT");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Event Title")).toHaveValue("Tech Conference 2026");
  await expect(page.getByLabel("Event Purpose")).toHaveValue("Annual industry conference");
  state.failure = null;
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Submit Request", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(state.draft.eventId).toBe(43);
  expect(state.createEventRequests).toHaveLength(0);
});

test("[SPM-36 FE-12] recovers a committed submission whose response was lost", async ({ page }) => {
  const state = await installConnectSphereMocks(page, { draft: makeDraft() });
  await openCompletedDraft(page);
  await page.route("**/api/events/43/submit", async route => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    state.submitDraftRequests.push(route.request().postDataJSON());
    submitted(state);
    return route.abort("connectionreset");
  });
  await page.getByRole("button", { name: "Submit Request", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("status")).toContainText("REQ-000043 is already Submitted");
  expect(state.submitDraftRequests).toHaveLength(1);
  expect(state.createEventRequests).toHaveLength(0);
});

test("[SPM-36 FE-13] an old draft tab recovers the current Coordinator and Under Review state", async ({ page }) => {
  const state = await installConnectSphereMocks(page, { draft: makeDraft() });
  await openCompletedDraft(page);
  submitted(state, { status: "UNDER_REVIEW", statusLabel: "Under Review", coordinatorName: "Coordinator One", isAssignedToCoordinator: true });
  await page.getByRole("button", { name: "Submit Request", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("status")).toContainText("REQ-000043 is already Under Review");
  expect(state.draft.status).toBe("UNDER_REVIEW");
  await page.getByRole("link", { name: /View review status/ }).click();
  await expect(page.getByText("Coordinator One", { exact: true })).toBeVisible();
});

test("[SPM-36 FE-14] a submitted request cannot be reopened as an editable draft", async ({ page }) => {
  await installConnectSphereMocks(page, { draft: makeDraft({ status: "SUBMITTED", statusLabel: "Submitted" }) });
  await page.goto("/events/new?draft=43");
  await expect(page.getByText("Draft unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View event details" })).toHaveAttribute("href", "/events/43");
});

test("[SPM-36 FE-17] another organiser cannot see or submit a private draft", async ({ page }) => {
  const state = await installConnectSphereMocks(page);
  await page.goto("/events/new?draft=43");
  await expect(page.getByText("Draft unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  expect(state.submitDraftRequests).toHaveLength(0);
});

test("[SPM-36 FE-16] expiry during submission preserves final edits through reauthentication", async ({ page }) => {
  const state = await installLoginMock(page, { authenticated: true });
  state.draft = makeDraft(); state.events = [state.draft];
  await openCompletedDraft(page);
  state.failure = { path: "/api/events/43/submit", status: 401, body: { error: "Please log in to continue.", code: "UNAUTHENTICATED" } };
  await page.getByRole("button", { name: "Submit Request", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  state.failure = null;
  await page.locator("#email").fill("user@example.com");
  await page.locator("#password").fill("Valid-password9");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Event Title")).toHaveValue("Tech Conference 2026");
  await expect(page.getByLabel("Event Purpose")).toHaveValue("Annual industry conference");
  expect(state.draft.status).toBe("DRAFT");
  expect(state.submitDraftRequests).toHaveLength(0);
});

test("[SPM-36 FE-10 regression] uncertain new-event creation retries the same key and payload across reload", async ({ page }) => {
  await page.clock.install();
  const state = await installConnectSphereMocks(page);
  const attempts = [];
  await page.route(/\/api\/events$/, async route => {
    if (route.request().method() !== "POST") return route.fallback();
    attempts.push({ key: route.request().headers()["idempotency-key"], body: route.request().postDataJSON() });
    const event = makeDraft({ ...attempts[0].body, eventId: 600, requestId: "REQ-000600", status: "SUBMITTED", statusLabel: "Submitted" });
    state.events = [event];
    if (attempts.length === 1) return route.abort("connectionreset");
    return route.fulfill({ status: 201, json: { event } });
  });
  await page.goto("/events/new");
  await enterCompleteRequestThroughSubmit(page);
  await page.getByRole("button", { name: "Submit Request", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry submission", exact: true })).toBeEnabled();
  await page.clock.fastForward("31:00");
  await page.reload();
  await expect(page.getByRole("button", { name: "Retry submission", exact: true })).toBeEnabled();
  await expect(page.getByRole("status")).toContainText("Your previous submission needs confirmation");
  await page.getByRole("button", { name: "Retry submission", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("status")).toContainText("REQ-000600 is already Submitted");
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(state.events).toHaveLength(1);
});

for (const expiryPoint of ["replay", "event read"]) {
  test(`[SPM-36 FE-10/16 regression] lost creation response survives session expiry during ${expiryPoint}`, async ({ page }) => {
    const state = await installLoginMock(page, { authenticated: true });
    const attempts = [];
    const committed = new Map();
    let receiptCount = 0;
    let expireRead = expiryPoint === "event read";
    await page.route(/\/api\/events$/, async route => {
      if (route.request().method() !== "POST") return route.fallback();
      const attempt = { key: route.request().headers()["idempotency-key"], body: route.request().postDataJSON() };
      attempts.push(attempt);
      if (attempts.length === 2 && expiryPoint === "replay") {
        return route.fulfill({ status: 401, json: { code: "UNAUTHENTICATED", error: "Please log in to continue." } });
      }
      if (!committed.has(attempt.key)) {
        const eventId = 600 + committed.size;
        committed.set(attempt.key, makeDraft({ ...attempt.body, eventId, requestId: `REQ-${String(eventId).padStart(6, "0")}`, status: "SUBMITTED", statusLabel: "Submitted" }));
        receiptCount += 1;
        state.events = [...committed.values()];
      }
      if (attempts.length === 1) return route.abort("connectionreset");
      return route.fulfill({ status: 201, json: { event: committed.get(attempt.key) } });
    });
    await page.route(/\/api\/events\/600$/, async route => {
      if (route.request().method() !== "GET" || !expireRead) return route.fallback();
      expireRead = false;
      return route.fulfill({ status: 401, json: { code: "UNAUTHENTICATED", error: "Please log in to continue." } });
    });

    await page.goto("/events/new");
    await enterCompleteRequestThroughSubmit(page);
    await page.getByRole("button", { name: "Submit Request", exact: true }).click();
    await page.getByRole("button", { name: "Retry submission", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    const recovery = await page.evaluate(() => JSON.parse(sessionStorage.getItem("connectsphere:recovery:e2e-organiser-id:new")));
    expect(recovery.submitAttempt.key).toBe(attempts[0].key);
    expect(recovery.submitAttempt.payload).toEqual(attempts[0].body);
    if (expiryPoint === "event read") expect(recovery.eventId).toBe(600);

    await page.locator("#email").fill("user@example.com");
    await page.locator("#password").fill("Valid-password9");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry submission", exact: true })).toBeEnabled();
    // Recovery must remain safe through another reload after reauthentication.
    await page.reload();
    await page.getByRole("button", { name: "Retry submission", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("status")).toContainText("REQ-000600 is already Submitted");
    expect(attempts).toHaveLength(expiryPoint === "replay" ? 3 : 2);
    for (const attempt of attempts) expect(attempt).toEqual(attempts[0]);
    expect(committed.size).toBe(1);
    expect(receiptCount).toBe(1);
    expect(state.draftCreateRequests).toHaveLength(0);
    expect(state.draftUpdateRequests).toHaveLength(0);
    expect(state.submitDraftRequests).toHaveLength(0);
  });
}
