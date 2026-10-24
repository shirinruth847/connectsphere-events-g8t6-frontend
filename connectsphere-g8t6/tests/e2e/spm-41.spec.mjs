import { test, expect } from "@playwright/test";
import { installConnectSphereMocks } from "./support.mjs";

// SPM-41 clarification UI against the backend contract (backend README and
// tests/integration/clarifications.integration.test.js), with mocked responses
// shaped like the real ones: organiser views carry statusLabel but no stored
// status, and every view carries both SPM-41 permission flags.

const noClarificationActions = { canRequestClarification: false, canResubmit: false };
const coordinatorPermissions = { canEdit: true, editableFields: ["title", "purpose", "description"], canViewDraftHistory: false, canViewStaffHistory: true, ...noClarificationActions };
const ownerPermissions = { canEdit: false, editableFields: [], canViewDraftHistory: true, canViewStaffHistory: false, ...noClarificationActions };

const eventView = (overrides = {}) => ({
  eventId: 42,
  requestId: "REQ-000042",
  status: "UNDER_REVIEW",
  statusLabel: "Under Review",
  statusNote: null,
  title: "Clarification review event",
  purpose: "Annual planning forum",
  description: "Talks and workshops.",
  startDatetime: "2026-12-20T09:00:00.000Z",
  endDatetime: "2026-12-20T11:00:00.000Z",
  expectedAttendance: 120,
  preferredLayoutType: "THEATRE",
  accessibilityNeeds: [],
  venuePreferences: [1],
  equipmentRequirements: [],
  isRegistrationEnabled: true,
  registrationCapacity: 100,
  createdAt: "2026-10-10T09:00:00.000Z",
  updatedAt: "2026-10-12T09:00:00.000Z",
  version: 3,
  organisation: { organisationId: 1, name: "Synthetic Org A" },
  isAssignedToCoordinator: true,
  isOwner: false,
  viewerRelationship: "ASSIGNED_COORDINATOR",
  permissions: coordinatorPermissions,
  coordinatorId: 11,
  organiser: { userId: 5, name: "Synthetic Organiser" },
  ...overrides,
});

const answeredRound = {
  clarificationId: 7,
  round: 1,
  status: "RESPONDED",
  message: "What is the expected attendance?",
  requestedAt: "2026-10-13T02:00:00.000Z",
  requestedBy: { userId: 11, name: "Casey Coordinator" },
  response: null,
  respondedAt: "2026-10-14T02:00:00.000Z",
  respondedBy: { userId: 5, name: "Synthetic Organiser" },
};
const openRound = {
  clarificationId: 9,
  round: 2,
  status: "OPEN",
  message: "Please confirm whether you need a stage.",
  requestedAt: "2026-10-15T02:00:00.000Z",
  requestedBy: { userId: 11, name: "Casey Coordinator" },
  response: null,
  respondedAt: null,
  respondedBy: null,
};

// One mutable fake backend for event 42; the shared support mocks handle the rest.
async function routeClarifications(page, { event, rounds = [], roundsStatus = 200, onRequest, onResubmit }) {
  const state = { event, rounds, requests: [], resubmissions: [], roundsStatus };
  await page.route(/\/api\/events\/42(\/(history|clarifications|resubmit))?(\?.*)?$/, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();
    if (method === "OPTIONS") return route.fallback();
    if (pathname.endsWith("/history")) return route.fulfill({ json: { history: [], nextCursor: null } });
    if (pathname.endsWith("/clarifications") && method === "GET") {
      if (state.roundsStatus !== 200) return route.fulfill({ status: state.roundsStatus, json: { error: "Internal Server Error" } });
      return route.fulfill({ json: { clarifications: state.rounds } });
    }
    if (pathname.endsWith("/clarifications") && method === "POST") {
      const call = { body: request.postDataJSON(), key: request.headers()["idempotency-key"] };
      state.requests.push(call);
      return onRequest(route, call, state);
    }
    if (pathname.endsWith("/resubmit") && method === "POST") {
      const call = { body: request.postDataJSON(), key: request.headers()["idempotency-key"] };
      state.resubmissions.push(call);
      return onResubmit(route, call, state);
    }
    return route.fulfill({ json: { event: state.event } });
  });
  return state;
}

test.describe("clarification panel", () => {
  test("[SPM-41 AC3] the coordinator sees every round with question, response and timestamps", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "COORDINATOR" });
    await routeClarifications(page, { event: eventView({ status: "AWAITING_CLARIFICATION", statusLabel: "Under Review" }), rounds: [openRound, answeredRound] });
    await page.goto("/events/42");

    const panel = page.getByRole("region", { name: "Clarification requests" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText("2 requests")).toBeVisible();
    const latest = panel.getByRole("listitem", { name: "Clarification request 2" });
    await expect(latest.getByText("Awaiting organiser")).toBeVisible();
    await expect(latest.getByText("“Please confirm whether you need a stage.”")).toBeVisible();
    const earlier = panel.getByRole("listitem", { name: "Clarification request 1" });
    await expect(earlier.getByText("Answered")).toBeVisible();
    await expect(earlier.getByText("Resubmitted with changes to the event details, without a written response.")).toBeVisible();
    await expect(earlier.locator("time").first()).toHaveAttribute("datetime", "2026-10-13T02:00:00.000Z");
    // Card 3 without the internal notes box (Master 4.2: organiser-visible content only).
    await expect(panel.getByRole("textbox")).toHaveCount(0);
  });

  test("[SPM-41 decision 5] a same-organisation organiser sees the rounds read-only", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "ORGANISER" });
    await routeClarifications(page, {
      event: eventView({ status: undefined, statusLabel: "Under Review", statusNote: "Returned – action required", viewerRelationship: "ORGANISATION_MEMBER", isOwner: false, permissions: { canEdit: false, editableFields: [], canViewDraftHistory: false, canViewStaffHistory: false, ...noClarificationActions } }),
      rounds: [openRound],
    });
    await page.goto("/events/42");

    await expect(page.getByRole("region", { name: "Clarification requests" }).getByText("“Please confirm whether you need a stage.”")).toBeVisible();
    await expect(page.getByRole("button", { name: "Respond and resubmit" })).toHaveCount(0);
    await expect(page.getByText("Viewing as a member of your organisation")).toBeVisible();
  });

  test("[SPM-41] the panel shows an empty state, and an error with a working retry", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "COORDINATOR" });
    const state = await routeClarifications(page, { event: eventView(), rounds: [], roundsStatus: 500 });
    await page.goto("/events/42");

    const panel = page.getByRole("region", { name: "Clarification requests" });
    await expect(panel.getByText("Clarification requests unavailable")).toBeVisible();
    state.roundsStatus = 200;
    await panel.getByRole("button", { name: "Try again" }).click();
    await expect(panel.getByText("No clarification has been requested for this event.")).toBeVisible();
  });
});

test.describe("coordinator: Request Clarification", () => {
  test("[SPM-41] the action is hidden unless the backend grants it, and no other action-bar buttons are added", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "COORDINATOR" });
    await routeClarifications(page, { event: eventView() });
    await page.goto("/events/42");

    await expect(page.getByRole("heading", { name: "Clarification review event", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Request Clarification" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Reschedule Window|Commit Final Decision/ })).toHaveCount(0);
  });

  test("[SPM-41 TC-02] an empty or over-long message is blocked and nothing is sent", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "COORDINATOR" });
    const state = await routeClarifications(page, {
      event: eventView({ permissions: { ...coordinatorPermissions, canRequestClarification: true } }),
      onRequest: (route) => route.fulfill({ status: 500, json: {} }),
    });
    await page.goto("/events/42");

    await page.getByRole("button", { name: "Request Clarification" }).click();
    const dialog = page.getByRole("dialog", { name: "Request clarification" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Send request" }).click();
    await expect(dialog.getByText("Enter a message for the organiser.")).toBeVisible();
    await expect(dialog.getByText("Nothing was sent and the event status has not changed.")).toBeVisible();

    await dialog.getByLabel("Message to the organiser").fill("a".repeat(2001));
    await expect(dialog.getByText("2,001 / 2,000")).toBeVisible();
    await dialog.getByRole("button", { name: "Send request" }).click();
    await expect(dialog.getByText("Use 2,000 characters or fewer.")).toBeVisible();
    expect(state.requests).toHaveLength(0);
    await expect(page.getByText("Under Review", { exact: true }).first()).toBeVisible();
  });

  test("[SPM-41 TC-01] sending a message returns the event and shows the new round", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "COORDINATOR" });
    const state = await routeClarifications(page, {
      event: eventView({ permissions: { ...coordinatorPermissions, canRequestClarification: true } }),
      onRequest: (route, call, current) => {
        const round = { ...openRound, clarificationId: 20, round: 1, message: call.body.message };
        current.rounds = [round];
        current.event = eventView({ status: "AWAITING_CLARIFICATION", version: 4, permissions: { ...coordinatorPermissions, canEdit: false, editableFields: [] } });
        return route.fulfill({ json: { message: "Clarification requested. The organiser has been notified.", event: current.event, clarification: round } });
      },
    });
    await page.goto("/events/42");

    await page.getByRole("button", { name: "Request Clarification" }).click();
    const dialog = page.getByRole("dialog", { name: "Request clarification" });
    await dialog.getByLabel("Message to the organiser").fill("Please confirm whether you need a stage.");
    await dialog.getByRole("button", { name: "Send request" }).click();

    await expect(dialog).toBeHidden();
    expect(state.requests).toHaveLength(1);
    expect(state.requests[0].body).toEqual({ message: "Please confirm whether you need a stage.", version: 3 });
    expect(state.requests[0].key).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
    await expect(page.getByText("Clarification requested", { exact: true })).toBeVisible();
    await expect(page.getByText("Awaiting Clarification", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Clarification requests" }).getByText("“Please confirm whether you need a stage.”")).toBeVisible();
    await expect(page.getByRole("button", { name: "Request Clarification" })).toHaveCount(0);
  });

  test("[SPM-41] a version conflict keeps the message and resends against the latest version", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "COORDINATOR" });
    const granted = { ...coordinatorPermissions, canRequestClarification: true };
    const state = await routeClarifications(page, {
      event: eventView({ permissions: granted }),
      onRequest: (route, call, current) => {
        if (current.requests.length === 1) {
          return route.fulfill({ status: 409, json: { error: "This event changed.", code: "EVENT_VERSION_CONFLICT", event: eventView({ version: 4, title: "Renamed meanwhile", permissions: granted }) } });
        }
        current.event = eventView({ status: "AWAITING_CLARIFICATION", version: 5, permissions: coordinatorPermissions });
        return route.fulfill({ json: { message: "Clarification requested. The organiser has been notified.", event: current.event, clarification: { ...openRound, message: call.body.message } } });
      },
    });
    await page.goto("/events/42");

    await page.getByRole("button", { name: "Request Clarification" }).click();
    const dialog = page.getByRole("dialog", { name: "Request clarification" });
    await dialog.getByLabel("Message to the organiser").fill("Is a stage needed?");
    await dialog.getByRole("button", { name: "Send request" }).click();
    await expect(dialog.getByText("This event changed while you were writing")).toBeVisible();
    await expect(dialog.getByLabel("Message to the organiser")).toHaveValue("Is a stage needed?");
    await expect(page.getByRole("heading", { name: "Renamed meanwhile", exact: true })).toBeVisible();

    await dialog.getByRole("button", { name: "Send request" }).click();
    await expect(dialog).toBeHidden();
    expect(state.requests.map((call) => call.body.version)).toEqual([3, 4]);
    expect(state.requests[1].key).not.toBe(state.requests[0].key);
  });
});

test.describe("organiser: respond and resubmit", () => {
  const returnedForOwner = (permissions = { ...ownerPermissions, canResubmit: true }) =>
    eventView({ status: undefined, statusLabel: "Under Review", statusNote: "Returned – action required", viewerRelationship: "OWNER", isOwner: true, permissions });

  test("[SPM-41] without the backend's resubmit permission the form is not offered", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "ORGANISER" });
    await routeClarifications(page, { event: returnedForOwner(ownerPermissions), rounds: [openRound] });
    await page.goto("/events/42");

    await expect(page.getByText("Returned – action required")).toBeVisible();
    await expect(page.getByRole("button", { name: "Respond and resubmit" })).toHaveCount(0);
  });

  test("[SPM-41 decision 2] resubmitting with no response and no change is blocked", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "ORGANISER" });
    const state = await routeClarifications(page, { event: returnedForOwner(), rounds: [openRound], onResubmit: (route) => route.fulfill({ status: 500, json: {} }) });
    await page.goto("/events/42");

    const form = page.getByRole("region", { name: "Your coordinator needs more information" });
    await expect(form.getByText("“Please confirm whether you need a stage.”")).toBeVisible();
    await form.getByRole("button", { name: "Respond and resubmit" }).click();
    await form.getByRole("button", { name: "Resubmit", exact: true }).click();
    await expect(form.getByText("Write a response or change at least one detail before resubmitting.")).toBeVisible();
    expect(state.resubmissions).toHaveLength(0);
  });

  test("[SPM-41 TC-04] the owner amends, responds and resubmits; the request stays visible", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "ORGANISER" });
    const state = await routeClarifications(page, {
      event: returnedForOwner(),
      rounds: [openRound],
      onResubmit: (route, call, current) => {
        const answered = { ...openRound, status: "RESPONDED", response: call.body.response, respondedAt: "2026-10-16T02:00:00.000Z", respondedBy: { userId: 5, name: "Synthetic Organiser" } };
        current.rounds = [answered];
        current.event = eventView({ status: undefined, statusLabel: "Under Review", version: 5, expectedAttendance: 250, viewerRelationship: "OWNER", isOwner: true, permissions: ownerPermissions });
        return route.fulfill({ json: { message: "Your event request has been resubmitted for review.", event: current.event, clarification: answered } });
      },
    });
    await page.goto("/events/42");

    const form = page.getByRole("region", { name: "Your coordinator needs more information" });
    await form.getByRole("button", { name: "Respond and resubmit" }).click();
    await expect(form.getByText("Registration settings cannot be changed while responding to a clarification request.")).toBeVisible();
    await form.getByLabel("Your response").fill("Yes, a 6m stage.");
    await form.getByLabel("Expected attendance").fill("250");
    await expect(form.getByText("1 detail changed")).toBeVisible();
    await form.getByRole("button", { name: "Resubmit", exact: true }).click();

    await expect(page.getByText("Request resubmitted", { exact: true })).toBeVisible();
    expect(state.resubmissions).toHaveLength(1);
    expect(state.resubmissions[0].body).toEqual({ response: "Yes, a 6m stage.", changes: { expectedAttendance: 250 }, version: 3 });
    expect(state.resubmissions[0].key).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
    await expect(page.getByRole("region", { name: "Your coordinator needs more information" })).toHaveCount(0);
    const panel = page.getByRole("region", { name: "Clarification requests" });
    await expect(panel.getByText("“Please confirm whether you need a stage.”")).toBeVisible();
    await expect(panel.getByText("“Yes, a 6m stage.”")).toBeVisible();
  });

  test("[SPM-41] a coordinator schedule clash is explained and the owner's changes are kept", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "ORGANISER" });
    const clash = "The new dates clash with your coordinator's schedule. Choose different dates or contact your coordinator.";
    const state = await routeClarifications(page, {
      event: returnedForOwner(),
      rounds: [openRound],
      onResubmit: (route) => route.fulfill({ status: 409, json: { error: clash, code: "COORDINATOR_CONFLICT" } }),
    });
    await page.goto("/events/42");

    const form = page.getByRole("region", { name: "Your coordinator needs more information" });
    await form.getByRole("button", { name: "Respond and resubmit" }).click();
    await form.getByLabel("Your response").fill("Moved by a day.");
    await form.getByRole("button", { name: "Resubmit", exact: true }).click();

    await expect(form.getByText(clash)).toBeVisible();
    await expect(form.getByLabel("Your response")).toHaveValue("Moved by a day.");
    expect(state.resubmissions).toHaveLength(1);
  });

  test("[SPM-41] a round answered elsewhere is reported as no longer waiting", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "ORGANISER" });
    await routeClarifications(page, {
      event: returnedForOwner(),
      rounds: [openRound],
      onResubmit: (route) => route.fulfill({ status: 409, json: { error: "This request has no open clarification to respond to. Refresh to see its current status.", code: "CLARIFICATION_NOT_OPEN" } }),
    });
    await page.goto("/events/42");

    const form = page.getByRole("region", { name: "Your coordinator needs more information" });
    await form.getByRole("button", { name: "Respond and resubmit" }).click();
    await form.getByLabel("Your response").fill("Answer.");
    await form.getByRole("button", { name: "Resubmit", exact: true }).click();

    await expect(page.getByText("This request is no longer waiting for your response")).toBeVisible();
  });
});

test("[SPM-41] the dialog and the response form fit a mobile screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installConnectSphereMocks(page, { role: "ORGANISER" });
  await routeClarifications(page, {
    event: eventView({ status: undefined, statusLabel: "Under Review", statusNote: "Returned – action required", viewerRelationship: "OWNER", isOwner: true, permissions: { ...ownerPermissions, canResubmit: true } }),
    rounds: [openRound],
  });
  await page.goto("/events/42");
  await page.getByRole("button", { name: "Respond and resubmit" }).click();
  await expect(page.getByLabel("Your response")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("[SPM-41] the coordinator dialog fits a mobile screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeClarifications(page, { event: eventView({ permissions: { ...coordinatorPermissions, canRequestClarification: true } }) });
  await page.goto("/events/42");
  await page.getByRole("button", { name: "Request Clarification" }).click();
  const dialog = page.getByRole("dialog", { name: "Request clarification" });
  await expect(dialog.getByLabel("Message to the organiser")).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
});
