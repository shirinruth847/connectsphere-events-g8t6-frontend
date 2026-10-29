import { test, expect } from "@playwright/test";
import { attachScreenshot, installConnectSphereMocks, installLoginMock } from "./support.mjs";

// SPM-173 coordinator lifecycle panel. The mocks return the shapes the backend
// sends (backend README, "Event Lifecycle (SPM-173)"); the backend decides.
const eventView = (overrides = {}) => ({
  eventId: 42,
  requestId: "REQ-000042",
  status: "PLANNING",
  statusLabel: "Approved & Planning",
  statusNote: null,
  title: "Lifecycle event",
  purpose: "Annual planning forum",
  description: "Talks and workshops.",
  startDatetime: "2027-11-20T09:00:00.000Z",
  endDatetime: "2027-11-20T11:00:00.000Z",
  expectedAttendance: 120,
  preferredLayoutType: "THEATRE",
  accessibilityNeeds: [],
  venuePreferences: [],
  equipmentRequirements: [],
  isRegistrationEnabled: false,
  registrationCapacity: null,
  createdAt: "2026-10-10T09:00:00.000Z",
  updatedAt: "2026-10-12T09:00:00.000Z",
  version: 3,
  arrangementVersion: 2,
  organisation: { organisationId: 1, name: "Synthetic Org A" },
  isAssignedToCoordinator: true,
  isOwner: false,
  viewerRelationship: "ASSIGNED_COORDINATOR",
  permissions: { canEdit: true, editableFields: ["title", "purpose", "description"], canViewDraftHistory: false, canViewStaffHistory: true },
  coordinatorId: 11,
  organiser: { userId: 5, name: "Synthetic Organiser" },
  ...overrides,
});

const notReady = {
  ready: false,
  failures: [
    { code: "BOOKING_NOT_APPROVED", message: "Every venue booking must be approved; holds and pending requests do not count." },
    { code: "NO_PRIMARY_VENUE", message: "Choose one approved venue booking as the primary venue." },
  ],
};

// One route for the event, its history, readiness and the four actions. A POST
// answers "refusal" ({ status, json }) when given, otherwise succeeds with "next".
// A readiness gate holds the request; readinessError simulates an API failure.
// lostResponses answers that many POSTs with a 500 after applying them, as when
// the backend commits the action and then fails to reload the event.
async function routeLifecycle(page, { event, readiness = { ready: true, failures: [] }, readinessGate = Promise.resolve(), readinessError = null, next = null, refusal = null, lostResponses = 0, requests = [] }) {
  let current = event;
  await page.route(/\/api\/events\/42(\/.*)?(\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fallback();
    const { pathname } = new URL(request.url());
    // The organiser workspace loads its arrangements through the shared mock.
    if (pathname.endsWith("/arrangements")) return route.fallback();
    if (pathname.endsWith("/history")) return route.fulfill({ json: { history: [], nextCursor: null, lastViewedAt: null } });
    // Recording a history view (SPM-41) is not a lifecycle action.
    if (pathname.endsWith("/history/viewed")) return route.fulfill({ json: { lastViewedAt: "2026-10-24T03:00:00.000Z" } });
    if (pathname.endsWith("/safety-reviews")) return route.fulfill({ json: { reviews: [] } });
    if (pathname.endsWith("/history")) return route.fulfill({ json: { history: [], nextCursor: null } });
    // The venue section on the same page (SPM-72/74); not under test here.
    if (pathname.endsWith("/venue-options")) {
      return route.fulfill({ json: { event: { eventId: 42 }, venues: [], preferredVenues: [], detailsAvailable: true, availabilityChecked: true, filtersNotChecked: [], canSuggestVenue: false } });
    }
    if (pathname.endsWith("/readiness")) {
      await readinessGate;
      if (readinessError) return route.fulfill({ status: readinessError.status, json: readinessError.json });
      return route.fulfill({ json: { ...readiness, status: current.status, version: current.version, arrangementVersion: 2 } });
    }
    if (request.method() === "POST") {
      requests.push({ path: pathname, body: request.postDataJSON(), key: request.headers()["idempotency-key"] });
      if (refusal) return route.fulfill({ status: refusal.status, json: refusal.json });
      current = next;
      if (requests.length <= lostResponses) {
        return route.fulfill({ status: 500, json: { error: "Something went wrong.", code: "INTERNAL_ERROR" } });
      }
      return route.fulfill({ json: { message: "Event submitted for safety review.", event: current } });
    }
    return route.fulfill({ json: { event: current } });
  });
}

test("[SPM-173 AC8 / TC-14] the coordinator sees each readiness item and cannot submit yet", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeLifecycle(page, { event: eventView(), readiness: notReady });
  await page.goto("/events/42");
  const panel = page.getByRole("region", { name: "Next step" });
  await expect(panel.getByText("Not ready yet")).toBeVisible();
  await expect(panel.getByText("Choose one approved venue booking as the primary venue.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Submit for safety review" })).toBeDisabled();
});

test("[SPM-173 AC8] lifecycle action stays disabled until readiness is loaded", async ({ page }) => {
  let releaseReadiness;
  const readinessGate = new Promise((resolve) => { releaseReadiness = resolve; });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeLifecycle(page, { event: eventView(), readinessGate });
  await page.goto("/events/42");
  const panel = page.getByRole("region", { name: "Next step" });
  const submit = panel.getByRole("button", { name: "Submit for safety review" });
  await expect(submit).toBeDisabled();
  await expect(panel.getByText("Available once readiness has loaded.")).toBeVisible();
  releaseReadiness();
  await expect(panel.getByText("Ready", { exact: true })).toBeVisible();
  await expect(submit).toBeEnabled();
});

test("[SPM-173 AC8] submit stays disabled when readiness cannot be loaded", async ({ page }) => {
  const requests = [];
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeLifecycle(page, {
    event: eventView(),
    readinessError: { status: 500, json: { error: "Readiness could not be checked.", code: "INTERNAL_ERROR" } },
    requests,
  });
  await page.goto("/events/42");
  const panel = page.getByRole("region", { name: "Next step" });
  await expect(panel.getByText("Readiness unavailable")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Submit for safety review" })).toBeDisabled();
  await expect(panel.getByText("Available once readiness has loaded.")).toBeVisible();
  expect(requests).toEqual([]);
});

test("[SPM-173 AC9 / TC-12] a ready event is submitted for safety review with its version and a key", async ({ page }, testInfo) => {
  const requests = [];
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeLifecycle(page, {
    event: eventView(),
    next: eventView({ status: "SAFETY_REVIEW", version: 4 }),
    requests,
  });
  await page.goto("/events/42");
  const panel = page.getByRole("region", { name: "Next step" });
  await expect(panel.getByText("Ready", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Submit for safety review" }).click();

  await expect(page.getByText("Status updated")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Confirm event" })).toBeVisible();
  await expect(panel.getByText("Confirmation also needs a Safety Officer's approval")).toBeVisible();
  expect(requests).toEqual([
    { path: "/api/events/42/submit-for-safety-review", body: { version: 3 }, key: expect.stringMatching(/^[0-9a-f-]{36}$/) },
  ]);
  await attachScreenshot(testInfo, page, "lifecycle-desktop");
});

test("[SPM-173 AC5] a retry after a lost response reuses the idempotency key", async ({ page }) => {
  const requests = [];
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeLifecycle(page, {
    event: eventView(),
    next: eventView({ status: "SAFETY_REVIEW", version: 4 }),
    lostResponses: 1,
    requests,
  });
  await page.goto("/events/42");
  const panel = page.getByRole("region", { name: "Next step" });
  const submit = panel.getByRole("button", { name: "Submit for safety review" });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(panel.getByText("Action not completed")).toBeVisible();
  await submit.click();

  await expect(panel.getByRole("button", { name: "Confirm event" })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1].key).toBe(requests[0].key);
  expect(requests[1].body).toEqual({ version: 3 });
});

test("[SPM-173 TC-17] a refused confirmation is explained and nothing changes", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeLifecycle(page, {
    event: eventView({ status: "SAFETY_REVIEW" }),
    refusal: { status: 409, json: { error: "x", code: "SAFETY_APPROVAL_REQUIRED" } },
  });
  await page.goto("/events/42");
  const panel = page.getByRole("region", { name: "Next step" });
  await panel.getByRole("button", { name: "Confirm event" }).click();
  await expect(panel.getByText("The event needs a safety approval for its current arrangements before you can confirm it.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Confirm event" })).toBeEnabled();
});

test("[SPM-173 AC5] a stale version shows the latest event instead", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeLifecycle(page, {
    event: eventView({ status: "CONFIRMED" }),
    refusal: {
      status: 409,
      json: { error: "x", code: "EVENT_VERSION_CONFLICT", event: eventView({ status: "PREPARATION", version: 5 }) },
    },
  });
  await page.goto("/events/42");
  const panel = page.getByRole("region", { name: "Next step" });
  await panel.getByRole("button", { name: "Start preparation" }).click();
  await expect(panel.getByText("This event changed after you opened it.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Start preparation" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Mark as completed" })).toBeVisible();
});

test("[SPM-173 TC-24] completion is offered only after the event ends", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeLifecycle(page, { event: eventView({ status: "PREPARATION" }) });
  await page.goto("/events/42");
  const panel = page.getByRole("region", { name: "Next step" });
  await expect(panel.getByRole("button", { name: "Mark as completed" })).toBeDisabled();
  await expect(panel.getByText("Available after the event has ended.")).toBeVisible();
});

test("[SPM-173] lifecycle panel works at mobile width", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeLifecycle(page, { event: eventView(), readiness: notReady });
  await page.goto("/events/42");
  await expect(page.getByRole("region", { name: "Next step" }).getByText("Not ready yet")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await attachScreenshot(testInfo, page, "lifecycle-mobile");
});

for (const mobile of [false, true]) {
  test(`[SPM-39] approval confirmation and planning success ${mobile ? 'mobile' : 'desktop'}`, async ({ page }, testInfo) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const requests = [];
    await installConnectSphereMocks(page, { role: 'COORDINATOR' });
    await routeLifecycle(page, { event: eventView({ status: 'UNDER_REVIEW', statusLabel: 'Under Review' }), next: eventView({ version: 4 }), requests });
    await page.goto('/events/42');
    await page.getByRole('button', { name: 'Approve request', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Approve event request?' });
    await expect(dialog).toBeVisible();
    expect(requests).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Keep reviewing' }).click();
    expect(requests).toHaveLength(0);
    await page.getByRole('button', { name: 'Approve request', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm approval' }).click();
    await expect(page.getByText('Status updated')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit for safety review' })).toBeVisible();
    expect(requests).toEqual([{ path: '/api/events/42/accept-feasibility', body: { version: 3 }, key: expect.stringMatching(/^[0-9a-f-]{36}$/) }]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(mobile ? 390 : 1280);
    await attachScreenshot(testInfo, page, `spm39-${mobile ? 'mobile' : 'desktop'}`);
  });
}

for (const status of ['REJECTED', 'CANCELLED']) {
  test(`[SPM-39] ${status} requests cannot be approved`, async ({ page }) => {
    const requests = [];
    await installConnectSphereMocks(page, { role: 'COORDINATOR' });
    await routeLifecycle(page, { event: eventView({ status }), requests });
    await page.goto('/events/42');
    await expect(page.getByRole('button', { name: 'Approve request', exact: true })).toBeDisabled();
    await expect(page.getByText('Request cannot be approved', { exact: true })).toBeVisible();
    expect(requests).toHaveLength(0);
  });
}

test('[SPM-39] missing mandatory requirements show field errors without success', async ({ page }) => {
  await installConnectSphereMocks(page, { role: 'COORDINATOR' });
  await routeLifecycle(page, { event: eventView({ status: 'UNDER_REVIEW' }), refusal: { status: 409, json: { error: 'Complete the mandatory event fields before approving this request.', code: 'FEASIBILITY_REQUIREMENTS_MISSING', fields: { venuePreferences: 'Venue preference is required.' } } } });
  await page.goto('/events/42');
  await page.getByRole('button', { name: 'Approve request', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm approval' }).click();
  await expect(page.getByText('Venue preference is required.')).toBeVisible();
  await expect(page.getByText('Status updated')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Approve request', exact: true })).toBeEnabled();
});

test('[SPM-39] an uncertain approval retains its command key across reload', async ({ page }) => {
  const requests = [];
  await installConnectSphereMocks(page, { role: 'COORDINATOR' });
  await routeLifecycle(page, { event: eventView({ status: 'UNDER_REVIEW' }), next: eventView({ status: 'UNDER_REVIEW' }), lostResponses: 1, requests });
  await page.goto('/events/42');
  await page.getByRole('button', { name: 'Approve request', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm approval' }).click();
  await expect(page.getByText('Action not completed', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Approve request', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm approval' }).click();
  await expect(page.getByText('Status updated')).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1].key).toBe(requests[0].key);
});

test('[SPM-39] organiser has no approval controls', async ({ page }) => {
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await installConnectSphereMocks(page, { role: 'ORGANISER' });
  await routeLifecycle(page, { event: eventView({ status: undefined, statusLabel: 'Under Review', viewerRelationship: 'OWNER', isOwner: true, isAssignedToCoordinator: false, permissions: { canEdit: false, editableFields: [], canViewDraftHistory: true, canViewStaffHistory: false } }) });
  await page.goto('/events/42');
  await expect(page.getByRole('heading', { name: 'Lifecycle event', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve request', exact: true })).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test('[SPM-39] approval session expiry redirects to sign-in and retains the command', async ({ page }) => {
  await installConnectSphereMocks(page, { role: 'COORDINATOR' });
  await routeLifecycle(page, { event: eventView({ status: 'UNDER_REVIEW' }), refusal: { status: 401, json: { code: 'UNAUTHENTICATED', error: 'Sign in again.' } } });
  await page.goto('/events/42');
  await page.getByRole('button', { name: 'Approve request', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm approval' }).click();
  await expect(page).toHaveURL(/\/login\?/);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('connectsphere:recovery:spm39:')).length)).toBe(1);
});

test('[SPM-39] a blank unsaved title cannot be bypassed by approving the stored request', async ({ page }) => {
  const requests = [];
  await installConnectSphereMocks(page, { role: 'COORDINATOR' });
  await routeLifecycle(page, { event: eventView({ status: 'UNDER_REVIEW' }), requests });
  await page.goto('/events/42');
  const approve = page.getByRole('button', { name: 'Approve request', exact: true });
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await page.getByRole('textbox', { name: 'Title', exact: false }).fill('');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Enter a title.', { exact: true })).toBeVisible();
  await expect(approve).toBeDisabled();
  await expect(page.getByText('Save or cancel your event details before approving.', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Title', exact: false })).toHaveValue('');
  await expect(page.getByText('Status updated', { exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(0);

  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(approve).toBeEnabled();
  await expect(page.getByRole('form', { name: 'Edit event details' })).toHaveCount(0);
  expect(requests).toHaveLength(0);
});

test('[SPM-39] approval waits for an edited title to save and uses the saved version', async ({ page }) => {
  const requests = [];
  const original = eventView({ status: 'UNDER_REVIEW' });
  const saved = eventView({ status: 'UNDER_REVIEW', title: 'Updated lifecycle title', version: 4 });
  let release;
  const pendingSave = new Promise((resolve) => { release = resolve; });
  await installConnectSphereMocks(page, { role: 'COORDINATOR' });
  await routeLifecycle(page, { event: original, next: eventView({ title: saved.title, version: 5 }), requests });
  await page.route('**/api/events/42', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    expect(route.request().postDataJSON()).toMatchObject({ version: 3, title: saved.title });
    await pendingSave;
    return route.fulfill({ json: { message: 'Event details updated.', event: saved } });
  });
  await page.goto('/events/42');
  await page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await page.getByRole('textbox', { name: 'Title', exact: false }).fill(saved.title);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const approve = page.getByRole('button', { name: 'Approve request', exact: true });
  await expect(approve).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Title', exact: false })).toHaveJSProperty('readOnly', true);
  await expect(page.getByRole('textbox', { name: 'Purpose', exact: false })).toHaveJSProperty('readOnly', true);
  expect(requests).toHaveLength(0);
  release();
  await expect(page.getByRole('form', { name: 'Edit event details' })).toHaveCount(0);
  await expect(approve).toBeEnabled();
  await approve.click();
  await page.getByRole('button', { name: 'Confirm approval', exact: true }).click();
  await expect(page.getByText('Status updated', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ path: '/api/events/42/accept-feasibility', body: { version: 4 } });
});


for (const field of ['Purpose', 'Description']) {
  test(`[SPM-39] blank ${field.toLowerCase()} keeps approval blocked and preserves the edit`, async ({ page }) => {
    const requests = [];
    await installConnectSphereMocks(page, { role: 'COORDINATOR' });
    await routeLifecycle(page, { event: eventView({ status: 'UNDER_REVIEW' }), requests });
    await page.goto('/events/42');
    await page.getByRole('button', { name: 'Edit details', exact: true }).click();
    const input = page.getByRole('textbox', { name: field, exact: false });
    await input.fill('  ');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText(`Enter a ${field.toLowerCase()}.`, { exact: true })).toBeVisible();
    await expect(input).toHaveValue('  ');
    await expect(page.getByRole('button', { name: 'Approve request', exact: true })).toBeDisabled();
    await expect(page.getByText('Status updated', { exact: true })).toHaveCount(0);
    expect(requests).toHaveLength(0);
  });
}

for (const failure of ['server', 'network']) {
  test(`[SPM-39] ${failure} save failure preserves edits, blocks approval and retries the same save`, async ({ page }) => {
    const original = eventView({ status: 'UNDER_REVIEW' });
    const saved = eventView({ status: 'UNDER_REVIEW', title: 'Kept after failed save', version: 4 });
    const keys = [];
    await installConnectSphereMocks(page, { role: 'COORDINATOR' });
    await routeLifecycle(page, { event: original });
    await page.route('**/api/events/42', async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      keys.push(route.request().headers()['idempotency-key']);
      if (keys.length === 1) return failure === 'network' ? route.abort() : route.fulfill({ status: 500, json: { code: 'INTERNAL_ERROR', error: 'Save failed.' } });
      return route.fulfill({ json: { message: 'Event details updated.', event: saved } });
    });
    await page.goto('/events/42');
    await page.getByRole('button', { name: 'Edit details', exact: true }).click();
    const title = page.getByRole('textbox', { name: 'Title', exact: false });
    await title.fill(saved.title);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
    await expect(title).toHaveValue(saved.title);
    await expect(title).toHaveJSProperty('readOnly', false);
    await expect(page.getByRole('button', { name: 'Approve request', exact: true })).toBeDisabled();
    await expect(page.getByText('Status updated', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('form', { name: 'Edit event details' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Approve request', exact: true })).toBeEnabled();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });
}

test('[SPM-39] repeated confirmation while approval is pending sends one command', async ({ page }) => {
  const requests = [];
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await installConnectSphereMocks(page, { role: 'COORDINATOR' });
  await routeLifecycle(page, { event: eventView({ status: 'UNDER_REVIEW' }) });
  await page.route('**/api/events/42/accept-feasibility', async (route) => {
    requests.push(route.request().postDataJSON());
    await pending;
    await route.fulfill({ json: { message: 'Approved for planning.', event: eventView({ version: 4 }) } });
  });
  await page.goto('/events/42');
  await page.getByRole('button', { name: 'Approve request', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm approval', exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect(page.getByRole('button', { name: 'Working…', exact: true })).toBeDisabled();
  await expect.poll(() => requests.length).toBe(1);
  release();
  await expect(page.getByText('Status updated', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(1);
});

for (const status of ['CANCELLED', 'REJECTED']) {
  test(`[SPM-39] ${status.toLowerCase()} in another tab while confirmation is open is not approved`, async ({ page }) => {
    const latest = eventView({ status, version: 4 });
    await installConnectSphereMocks(page, { role: 'COORDINATOR' });
    await routeLifecycle(page, { event: eventView({ status: 'UNDER_REVIEW' }), refusal: { status: 409, json: { code: 'EVENT_VERSION_CONFLICT', error: 'This event changed after you opened it.', event: latest } } });
    await page.goto('/events/42');
    await page.getByRole('button', { name: 'Approve request', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm approval', exact: true }).click();
    await expect(page.getByText('Request cannot be approved', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve request', exact: true })).toBeDisabled();
    await expect(page.getByText('Status updated', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Approve event request?' })).toHaveCount(0);
  });
}

test('[SPM-39] reassignment while confirmation is open removes the unavailable event', async ({ page }) => {
  let unavailable = false;
  await installConnectSphereMocks(page, { role: 'COORDINATOR' });
  await routeLifecycle(page, { event: eventView({ status: 'UNDER_REVIEW' }) });
  await page.route('**/api/events/42/accept-feasibility', (route) => {
    unavailable = true;
    return route.fulfill({ status: 404, json: { code: 'EVENT_NOT_FOUND', error: 'Event not found.' } });
  });
  await page.route('**/api/events/42', (route) => unavailable
    ? route.fulfill({ status: 404, json: { code: 'EVENT_NOT_FOUND', error: 'Event not found.' } })
    : route.fallback());
  await page.goto('/events/42');
  await page.getByRole('button', { name: 'Approve request', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm approval', exact: true }).click();
  await expect(page.getByText('Event not available', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve request', exact: true })).toHaveCount(0);
  await expect(page.getByText('Status updated', { exact: true })).toHaveCount(0);
});

test('[SPM-39] reauthentication after approval expiry reuses the retained key and clears recovery on success', async ({ page }) => {
  const requests = [];
  await installLoginMock(page, { role: 'COORDINATOR', authenticated: true });
  await routeLifecycle(page, { event: eventView({ status: 'UNDER_REVIEW' }) });
  await page.route('**/api/events/42/accept-feasibility', (route) => {
    requests.push({ key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
    return requests.length === 1
      ? route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED', error: 'Sign in again.' } })
      : route.fulfill({ json: { message: 'Approved for planning.', event: eventView({ version: 4 }) } });
  });
  await page.goto('/events/42');
  await page.getByRole('button', { name: 'Approve request', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm approval', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?/);
  await page.locator('#email').fill('user@example.com');
  await page.locator('#password').fill('Valid-password9');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/events\/42$/);
  await page.getByRole('button', { name: 'Approve request', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm approval', exact: true }).click();
  await expect(page.getByText('Status updated', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('connectsphere:recovery:spm39:')))).toEqual([]);
});
