import { test, expect } from "@playwright/test";
import { installConnectSphereMocks } from "./support.mjs";

// SPM-41 clarification threads against the backend contract (backend README,
// "Clarification Threads (SPM-41)", and tests/integration/clarifications.integration.test.js),
// with mocked responses shaped like the real ones: organiser views carry
// statusLabel but no stored status, and every view carries all four SPM-41
// permission flags.

const noClarificationActions = {
  canRequestClarification: false,
  canPostClarificationMessage: false,
  canSaveAmendments: false,
  canCompleteClarification: false,
};
const coordinatorPermissions = { canEdit: true, editableFields: ["title", "purpose", "description"], canViewDraftHistory: false, canViewStaffHistory: true, ...noClarificationActions };
const ownerPermissions = { canEdit: false, editableFields: [], canViewDraftHistory: true, canViewStaffHistory: false, ...noClarificationActions };
const returnedCoordinatorPermissions = { ...coordinatorPermissions, canEdit: false, editableFields: [], canPostClarificationMessage: true, canCompleteClarification: true };
const returnedOwnerPermissions = { ...ownerPermissions, canPostClarificationMessage: true, canSaveAmendments: true };

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

const coordinator = { userId: 11, name: "Casey Coordinator", role: "COORDINATOR" };
const organiser = { userId: 5, name: "Synthetic Organiser", role: "ORGANISER" };
const message = (messageId, author, body, createdAt) => ({ messageId, body, createdAt, author });

const completedRound = {
  clarificationId: 7,
  round: 1,
  status: "COMPLETED",
  message: "What is the expected attendance?",
  requestedAt: "2026-10-13T02:00:00.000Z",
  requestedBy: { userId: 11, name: "Casey Coordinator" },
  completedAt: "2026-10-14T02:00:00.000Z",
  completedBy: { userId: 11, name: "Casey Coordinator" },
  messages: [
    message(1, coordinator, "What is the expected attendance?", "2026-10-13T02:00:00.000Z"),
    message(2, organiser, "About 120.", "2026-10-13T05:00:00.000Z"),
  ],
  unreadCount: 0,
};
const openRound = {
  clarificationId: 9,
  round: 2,
  status: "OPEN",
  message: "Please confirm whether you need a stage.",
  requestedAt: "2026-10-15T02:00:00.000Z",
  requestedBy: { userId: 11, name: "Casey Coordinator" },
  completedAt: null,
  completedBy: null,
  messages: [message(3, coordinator, "Please confirm whether you need a stage.", "2026-10-15T02:00:00.000Z")],
  unreadCount: 1,
};

const returnedForOwner = (permissions = returnedOwnerPermissions, overrides = {}) =>
  eventView({ status: undefined, statusLabel: "Under Review", statusNote: "Returned – action required", viewerRelationship: "OWNER", isOwner: true, permissions, ...overrides });

const PATH = /\/api\/events\/42(\/(history(\/viewed)?|clarifications(\/\d+\/(messages|read|complete))?|amendments))?(\?.*)?$/;

// One mutable fake backend for event 42; the shared support mocks handle the rest.
async function routeClarifications(page, { event, rounds = [], roundsStatus = 200, history = [], lastViewedAt = null, onRequest, onMessage, onAmend, onComplete, onGet }) {
  const state = { event, rounds, roundsStatus, requests: [], messages: [], amendments: [], completions: [], reads: [], readBodies: [], roundsGets: 0, historyViews: 0 };
  await page.route(PATH, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();
    if (method === "OPTIONS") return route.fallback();
    const call = () => ({ path: pathname, body: request.postDataJSON(), key: request.headers()["idempotency-key"] });
    if (pathname.endsWith("/history")) return route.fulfill({ json: { history, nextCursor: null, lastViewedAt } });
    if (pathname.endsWith("/history/viewed")) {
      state.historyViews += 1;
      return route.fulfill({ json: { lastViewedAt: "2026-10-24T03:00:00.000Z" } });
    }
    if (pathname.endsWith("/clarifications") && method === "GET") {
      state.roundsGets += 1;
      if (onGet) return onGet(route, state);
      if (state.roundsStatus !== 200) return route.fulfill({ status: state.roundsStatus, json: { error: "Internal Server Error" } });
      return route.fulfill({ json: { clarifications: state.rounds } });
    }
    if (pathname.endsWith("/clarifications") && method === "POST") {
      const sent = call();
      state.requests.push(sent);
      return onRequest(route, sent, state);
    }
    if (pathname.endsWith("/read")) {
      state.reads.push(pathname);
      state.readBodies.push(request.postDataJSON());
      return route.fulfill({ json: { read: true } });
    }
    if (pathname.endsWith("/messages")) {
      const sent = call();
      state.messages.push(sent);
      return onMessage(route, sent, state);
    }
    if (pathname.endsWith("/complete")) {
      const sent = call();
      state.completions.push(sent);
      return onComplete(route, sent, state);
    }
    if (pathname.endsWith("/amendments")) {
      const sent = call();
      state.amendments.push(sent);
      return onAmend(route, sent, state);
    }
    return route.fulfill({ json: { event: state.event } });
  });
  return state;
}

// Appends the posted message to the open thread, as the backend returns it.
const acceptMessage = (author) => (route, sent, current) => {
  const updated = { ...openRound, messages: [...openRound.messages, message(50 + current.messages.length, author, sent.body.body, "2026-10-16T02:00:00.000Z")], unreadCount: 0 };
  current.rounds = [updated, completedRound];
  return route.fulfill({ status: 201, json: { message: "Message sent.", clarification: updated } });
};

const clarificationList = (page) => page.getByRole("region", { name: "Clarification requests" });

// Opens one request's pop-up from its row in the right-hand list.
async function openThread(page, round) {
  await clarificationList(page).getByRole("button", { name: `Request ${round}` }).click();
  const dialog = page.getByRole("dialog", { name: `Request ${round}` });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("clarification threads", () => {
  test("[SPM-41 AC3] the coordinator sees each request as a row and reads its messages in a pop-up", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "COORDINATOR" });
    const state = await routeClarifications(page, { event: eventView({ status: "AWAITING_CLARIFICATION", permissions: returnedCoordinatorPermissions }), rounds: [completedRound, openRound] });
    await page.goto("/events/42");

    const panel = clarificationList(page);
    await expect(panel.getByText("2 requests")).toBeVisible();
    // Newest first; rows show only the number and status.
    await expect(panel.getByRole("list", { name: "Clarification requests, newest first" }).getByRole("button")).toHaveText([/^Request 2\s*Open$/, /^Request 1\s*Complete$/]);
    await expect(panel.getByText("Please confirm whether you need a stage.")).toHaveCount(0);
    expect(state.reads).toEqual([]);

    const latest = await openThread(page, 2);
    await expect(latest.getByText("Open", { exact: true })).toBeVisible();
    await expect(latest.getByText("Please confirm whether you need a stage.")).toBeVisible();
    await expect(latest.getByText(/Casey Coordinator \(Coordinator\)/)).toBeVisible();
    // Opening a request marks it read.
    await expect.poll(() => state.reads).toEqual(["/api/events/42/clarifications/2/read"]);
    await page.keyboard.press("Escape");
    await expect(latest).toBeHidden();
    await expect(panel.getByRole("button", { name: "Request 2" })).toBeFocused();

    const earlier = await openThread(page, 1);
    await expect(earlier.getByText("Complete", { exact: true })).toBeVisible();
    await expect(earlier.getByRole("listitem")).toHaveText([/What is the expected attendance\?/, /About 120\./]);
    await expect(earlier.getByText(/Marked complete by Casey Coordinator/)).toBeVisible();
    await expect(earlier.locator("time").first()).toHaveAttribute("datetime", "2026-10-13T02:00:00.000Z");
    await expect(earlier.getByRole("textbox")).toHaveCount(0);
    await expect(earlier.getByRole("button", { name: "Mark complete" })).toHaveCount(0);
  });

  test("[SPM-41 decision 5] a same-organisation organiser reads the threads but cannot write", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "ORGANISER" });
    const state = await routeClarifications(page, {
      event: eventView({ status: undefined, statusLabel: "Under Review", statusNote: "Returned – action required", viewerRelationship: "ORGANISATION_MEMBER", isOwner: false, permissions: { ...ownerPermissions, canViewDraftHistory: false } }),
      rounds: [{ ...openRound, unreadCount: null }],
    });
    await page.goto("/events/42");

    const thread = await openThread(page, 2);
    await expect(thread.getByText("Please confirm whether you need a stage.")).toBeVisible();
    await expect(thread.getByRole("textbox")).toHaveCount(0);
    await expect(thread.getByText("Only the organiser who made the request and the assigned coordinator can reply.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Amend request" })).toHaveCount(0);
    await expect(page.getByText("Viewing as a member of your organisation")).toBeVisible();
    expect(state.reads).toEqual([]);
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

  test("[SPM-41 TC-01] sending a question returns the event and opens a thread", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "COORDINATOR" });
    const state = await routeClarifications(page, {
      event: eventView({ permissions: { ...coordinatorPermissions, canRequestClarification: true } }),
      onRequest: (route, sent, current) => {
        const round = { ...openRound, clarificationId: 20, round: 1, message: sent.body.message, messages: [message(3, coordinator, sent.body.message, "2026-10-15T02:00:00.000Z")], unreadCount: 0 };
        current.rounds = [round];
        current.event = eventView({ status: "AWAITING_CLARIFICATION", version: 4, permissions: returnedCoordinatorPermissions });
        return route.fulfill({ json: { message: "Clarification requested. The organiser has been notified.", event: current.event, clarification: round } });
      },
    });
    await page.goto("/events/42");

    // The action sits at the top of the clarification list.
    await clarificationList(page).getByRole("button", { name: "Request Clarification" }).click();
    const dialog = page.getByRole("dialog", { name: "Request clarification" });
    await dialog.getByLabel("Message to the organiser").fill("Please confirm whether you need a stage.");
    await dialog.getByRole("button", { name: "Send request" }).click();

    await expect(dialog).toBeHidden();
    expect(state.requests).toHaveLength(1);
    expect(state.requests[0].body).toEqual({ message: "Please confirm whether you need a stage.", version: 3 });
    expect(state.requests[0].key).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
    await expect(page.getByText("Clarification requested", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Awaiting Clarification", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Request Clarification" })).toHaveCount(0);
    // Focus lands on the new request's row.
    await expect(clarificationList(page).getByRole("button", { name: "Request 1" })).toBeFocused();
    const thread = await openThread(page, 1);
    await expect(thread.getByText("Please confirm whether you need a stage.")).toBeVisible();
    await expect(thread.getByRole("button", { name: "Mark complete" })).toBeVisible();
  });

  test("[SPM-41] a version conflict keeps the message and resends against the latest version", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "COORDINATOR" });
    const granted = { ...coordinatorPermissions, canRequestClarification: true };
    const state = await routeClarifications(page, {
      event: eventView({ permissions: granted }),
      onRequest: (route, sent, current) => {
        if (current.requests.length === 1) {
          return route.fulfill({ status: 409, json: { error: "This event changed.", code: "EVENT_VERSION_CONFLICT", event: eventView({ version: 4, title: "Renamed meanwhile", permissions: granted }) } });
        }
        current.event = eventView({ status: "AWAITING_CLARIFICATION", version: 5, permissions: returnedCoordinatorPermissions });
        return route.fulfill({ json: { message: "Clarification requested. The organiser has been notified.", event: current.event, clarification: { ...openRound, message: sent.body.message } } });
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
    expect(state.requests.map((sent) => sent.body.version)).toEqual([3, 4]);
    expect(state.requests[1].key).not.toBe(state.requests[0].key);
  });
});

test.describe("coordinator: the open thread", () => {
  const returned = () => eventView({ status: "AWAITING_CLARIFICATION", version: 5, permissions: returnedCoordinatorPermissions });

  test("[SPM-41 v2] the coordinator replies in the open thread", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "COORDINATOR" });
    const state = await routeClarifications(page, { event: returned(), rounds: [openRound, completedRound], onMessage: acceptMessage(coordinator) });
    await page.goto("/events/42");

    const thread = await openThread(page, 2);
    await thread.getByLabel("Your message").fill("  Also, do you need a lectern?  ");
    await thread.getByRole("button", { name: "Send" }).click();

    await expect(thread.getByText("Also, do you need a lectern?")).toBeVisible();
    await expect(thread.getByLabel("Your message")).toHaveValue("");
    await expect(thread.getByLabel("Your message")).toBeFocused();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].path).toBe("/api/events/42/clarifications/2/messages");
    expect(state.messages[0].body).toEqual({ body: "  Also, do you need a lectern?  " });
    expect(state.messages[0].key).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
    // Completed threads take no replies.
    await page.keyboard.press("Escape");
    await expect((await openThread(page, 1)).getByRole("textbox")).toHaveCount(0);
  });

  test("[SPM-41 v2] an empty reply is blocked and nothing is sent", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "COORDINATOR" });
    const state = await routeClarifications(page, { event: returned(), rounds: [openRound], onMessage: acceptMessage(coordinator) });
    await page.goto("/events/42");

    const thread = await openThread(page, 2);
    await thread.getByRole("button", { name: "Send" }).click();
    await expect(thread.getByText("Write a message before sending.")).toBeVisible();
    expect(state.messages).toHaveLength(0);
  });

  test("[SPM-41 v2] marking the thread complete returns the event to review", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "COORDINATOR" });
    const state = await routeClarifications(page, {
      event: returned(),
      rounds: [openRound],
      onComplete: (route, _sent, current) => {
        const done = { ...openRound, status: "COMPLETED", completedAt: "2026-10-17T02:00:00.000Z", completedBy: { userId: 11, name: "Casey Coordinator" }, unreadCount: 0 };
        current.rounds = [done];
        current.event = eventView({ version: 6, permissions: { ...coordinatorPermissions, canRequestClarification: true } });
        return route.fulfill({ json: { message: "Clarification marked complete. The request is back under review.", event: current.event, clarification: done } });
      },
    });
    await page.goto("/events/42");

    const thread = await openThread(page, 2);
    const tick = thread.getByRole("button", { name: "Mark complete" });
    await expect(tick).toHaveAttribute("aria-expanded", "false");
    await tick.click();
    await expect(tick).toHaveAttribute("aria-expanded", "true");
    await thread.getByRole("group", { name: "Mark request 2 complete" }).getByRole("button", { name: "Confirm" }).click();

    await expect(page.getByText("Clarification complete", { exact: true })).toBeVisible();
    expect(state.completions).toHaveLength(1);
    expect(state.completions[0].path).toBe("/api/events/42/clarifications/2/complete");
    expect(state.completions[0].body).toEqual({ version: 5 });
    // The pop-up turns read-only and focus moves to the outcome.
    await expect(thread.getByText("Complete", { exact: true })).toBeVisible();
    await expect(thread.getByText(/Marked complete by Casey Coordinator/)).toBeFocused();
    await expect(thread.getByRole("button", { name: "Mark complete" })).toHaveCount(0);
    await expect(thread.getByRole("textbox")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(clarificationList(page).getByRole("button", { name: "Request 2" })).toContainText("Complete");
    await expect(page.getByRole("button", { name: "Request Clarification" })).toBeVisible();
  });

  test("[SPM-41 v2] completing against amendments the coordinator has not seen shows the latest details", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "COORDINATOR" });
    const state = await routeClarifications(page, {
      event: returned(),
      rounds: [openRound],
      onComplete: (route) =>
        route.fulfill({ status: 409, json: { error: "This event changed.", code: "EVENT_VERSION_CONFLICT", event: eventView({ status: "AWAITING_CLARIFICATION", version: 6, title: "Amended by the organiser", permissions: returnedCoordinatorPermissions }) } }),
    });
    await page.goto("/events/42");

    const thread = await openThread(page, 2);
    await thread.getByRole("button", { name: "Mark complete" }).click();
    await thread.getByRole("button", { name: "Confirm" }).click();

    await expect(thread.getByText("The request changed after you loaded it")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Amended by the organiser", exact: true })).toBeVisible();
    expect(state.completions).toHaveLength(1);
  });
});

test.describe("organiser: reply and amend", () => {
  test("[SPM-41] without the backend's permissions neither the reply box nor the amendment form is offered", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "ORGANISER" });
    await routeClarifications(page, { event: returnedForOwner(ownerPermissions), rounds: [openRound] });
    await page.goto("/events/42");

    await expect(page.getByText("Returned – action required")).toBeVisible();
    await expect(page.getByRole("button", { name: "Amend request" })).toHaveCount(0);
    await expect((await openThread(page, 2)).getByRole("textbox")).toHaveCount(0);
  });

  test("[SPM-41 v2] the owner replies in the thread", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "ORGANISER" });
    const state = await routeClarifications(page, { event: returnedForOwner(), rounds: [openRound], onMessage: acceptMessage(organiser) });
    await page.goto("/events/42");

    await expect(page.getByText("Your coordinator needs more information")).toBeVisible();
    const thread = await openThread(page, 2);
    await thread.getByLabel("Your message").fill("Yes, a 6m stage.");
    await thread.getByRole("button", { name: "Send" }).click();

    await expect(thread.getByText("Yes, a 6m stage.")).toBeVisible();
    expect(state.messages.map((sent) => sent.body)).toEqual([{ body: "Yes, a 6m stage." }]);
  });

  test("[SPM-41 v2] a reply to a thread completed meanwhile keeps the text", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "ORGANISER" });
    await routeClarifications(page, {
      event: returnedForOwner(),
      rounds: [openRound],
      onMessage: (route) => route.fulfill({ status: 409, json: { error: "This clarification request is already complete.", code: "CLARIFICATION_CLOSED" } }),
    });
    await page.goto("/events/42");

    const thread = await openThread(page, 2);
    await thread.getByLabel("Your message").fill("Late answer.");
    await thread.getByRole("button", { name: "Send" }).click();

    await expect(thread.getByText("This clarification is no longer open")).toBeVisible();
    await expect(thread.getByLabel("Your message")).toHaveValue("Late answer.");
  });

  test("[SPM-41 v2] saving with no change is blocked", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "ORGANISER" });
    const state = await routeClarifications(page, { event: returnedForOwner(), rounds: [openRound], onAmend: (route) => route.fulfill({ status: 500, json: {} }) });
    await page.goto("/events/42");

    const form = page.getByRole("region", { name: "Amend your request" });
    await form.getByRole("button", { name: "Amend request" }).click();
    await form.getByRole("button", { name: "Save amendments" }).click();
    await expect(form.getByText("Change at least one detail before saving.")).toBeVisible();
    expect(state.amendments).toHaveLength(0);
  });

  test("[SPM-41 TC-04] the owner saves amendments and the request stays returned", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "ORGANISER" });
    const state = await routeClarifications(page, {
      event: returnedForOwner(),
      rounds: [openRound],
      onAmend: (route, _sent, current) => {
        current.event = returnedForOwner(returnedOwnerPermissions, { version: 4, expectedAttendance: 250 });
        return route.fulfill({ json: { message: "Amendments saved. Your coordinator can see what changed.", event: current.event } });
      },
    });
    await page.goto("/events/42");

    const form = page.getByRole("region", { name: "Amend your request" });
    await form.getByRole("button", { name: "Amend request" }).click();
    await expect(form.getByText("Registration settings cannot be changed while responding to a clarification request.")).toBeVisible();
    await form.getByLabel("Expected attendance").fill("250");
    await expect(form.getByText("1 detail changed")).toBeVisible();
    await form.getByRole("button", { name: "Save amendments" }).click();

    await expect(page.getByText("Amendments saved", { exact: true })).toBeVisible();
    expect(state.amendments).toHaveLength(1);
    expect(state.amendments[0].body).toEqual({ changes: { expectedAttendance: 250 }, version: 3 });
    expect(state.amendments[0].key).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
    // Still returned: the thread and the amendment form stay available.
    await expect(page.getByRole("region", { name: "Amend your request" })).toBeVisible();
    await expect((await openThread(page, 2)).getByLabel("Your message")).toBeVisible();
  });

  test("[SPM-41] Venue & layout starts collapsed with a summary and opens from its header", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "ORGANISER" });
    await routeClarifications(page, { event: returnedForOwner(), rounds: [openRound] });
    await page.goto("/events/42");

    const form = page.getByRole("region", { name: "Amend your request" });
    await form.getByRole("button", { name: "Amend request" }).click();
    const toggle = form.getByRole("button", { name: /^Venue & layout/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toContainText("1. Main Hall · Layout: Theatre");
    await expect(form.getByLabel("Preferred layout")).toBeHidden();

    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(form.getByLabel("Preferred layout")).toBeVisible();
    await expect(form.getByText("Preference 1")).toBeVisible();
    await toggle.click();
    await expect(form.getByLabel("Preferred layout")).toBeHidden();
  });

  test("[SPM-41] a coordinator schedule clash is explained and the owner's changes are kept", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "ORGANISER" });
    const clash = "The new dates clash with your coordinator's schedule. Choose different dates or contact your coordinator.";
    const state = await routeClarifications(page, {
      event: returnedForOwner(),
      rounds: [openRound],
      onAmend: (route) => route.fulfill({ status: 409, json: { error: clash, code: "COORDINATOR_CONFLICT" } }),
    });
    await page.goto("/events/42");

    const form = page.getByRole("region", { name: "Amend your request" });
    await form.getByRole("button", { name: "Amend request" }).click();
    await form.getByLabel("Expected attendance").fill("90");
    await form.getByRole("button", { name: "Save amendments" }).click();

    await expect(form.getByText(clash)).toBeVisible();
    await expect(form.getByLabel("Expected attendance")).toHaveValue("90");
    expect(state.amendments).toHaveLength(1);
  });

  test("[SPM-41] amendments after the thread was completed are reported as no longer open", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "ORGANISER" });
    await routeClarifications(page, {
      event: returnedForOwner(),
      rounds: [openRound],
      onAmend: (route) => route.fulfill({ status: 409, json: { error: "This request has no open clarification. Refresh to see its current status.", code: "CLARIFICATION_NOT_OPEN" } }),
    });
    await page.goto("/events/42");

    const form = page.getByRole("region", { name: "Amend your request" });
    await form.getByRole("button", { name: "Amend request" }).click();
    await form.getByLabel("Expected attendance").fill("90");
    await form.getByRole("button", { name: "Save amendments" }).click();

    await expect(page.getByText("This request is no longer open for amendments")).toBeVisible();
  });
});

test.describe("history since the last visit", () => {
  const entry = (historyId, action, occurredAt) => ({
    historyId,
    action,
    actor: { userId: 11, name: "Casey Coordinator", role: "COORDINATOR" },
    occurredAt,
    summary: null,
    changes: [],
    audience: "ORGANISER_SAFE",
  });

  test("[SPM-41 v2] entries after the viewer's last visit are marked new, and the visit is recorded", async ({ page }) => {
    await installConnectSphereMocks(page, { role: "ORGANISER" });
    const state = await routeClarifications(page, {
      event: returnedForOwner(),
      rounds: [openRound],
      lastViewedAt: "2026-10-14T00:00:00.000Z",
      history: [
        entry(12, "CLARIFICATION_REQUESTED", "2026-10-15T02:00:00.000Z"),
        entry(11, "COORDINATOR_ASSIGNED", "2026-10-12T02:00:00.000Z"),
      ],
    });
    await page.goto("/events/42");

    const history = page.getByRole("region", { name: "Change history" });
    await expect(history.getByText("1 new since your last visit.", { exact: false })).toBeVisible();
    const requested = history.getByRole("listitem").filter({ hasText: "Clarification requested" });
    await expect(requested.getByText("New", { exact: true })).toBeVisible();
    await expect(history.getByRole("listitem").filter({ hasText: "Coordinator assigned" }).getByText("New", { exact: true })).toHaveCount(0);
    // The unseen entry's connecting line uses the shared warning token (yellow).
    const lineColour = (item) => item.evaluate((element) => getComputedStyle(element, "::before").backgroundColor);
    expect(await lineColour(requested)).toBe("rgb(242, 183, 5)");
    expect(await lineColour(history.getByRole("listitem").filter({ hasText: "Coordinator assigned" }))).not.toBe("rgb(242, 183, 5)");
    await expect.poll(() => state.historyViews).toBeGreaterThan(0);
  });
});

test("[SPM-41] the thread and the amendment form fit a mobile screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installConnectSphereMocks(page, { role: "ORGANISER" });
  await routeClarifications(page, { event: returnedForOwner(), rounds: [openRound, completedRound] });
  await page.goto("/events/42");
  await page.getByRole("button", { name: "Amend request" }).click();
  await expect(page.getByRole("region", { name: "Amend your request" }).getByLabel("Expected attendance")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const thread = await openThread(page, 2);
  await expect(thread.getByLabel("Your message")).toBeVisible();
  await expect(thread.getByRole("button", { name: "Send" })).toBeInViewport();
  const box = await thread.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
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

test("[SPM-41 regression] opening a cached request fetches and acknowledges the latest displayed reply", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "ORGANISER" });
  const state = await routeClarifications(page, { event: returnedForOwner(), rounds: [openRound] });
  await page.goto("/events/42");
  await expect(clarificationList(page).getByRole("button", { name: "Request 2" })).toBeVisible();
  state.rounds = [{ ...openRound, messages: [...openRound.messages, message(44, coordinator, "Reply posted after the page loaded", "2026-10-25T10:00:00Z")] }];
  const thread = await openThread(page, 2);
  await expect(thread.getByText("Reply posted after the page loaded", { exact: true })).toBeVisible();
  await expect.poll(() => state.readBodies).toEqual([{ lastMessageId: 44 }]);
  expect(state.roundsGets).toBe(2);
});

test("[SPM-41 regression] failed thread refresh shows a retry without acknowledging stale messages", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "ORGANISER" });
  const state = await routeClarifications(page, { event: returnedForOwner(), rounds: [openRound] });
  await page.goto("/events/42");
  await expect(clarificationList(page).getByRole("button", { name: "Request 2" })).toBeVisible();
  state.roundsStatus = 500;
  const thread = await openThread(page, 2);
  await expect(thread.getByText("Messages unavailable", { exact: true })).toBeVisible();
  await expect(thread.getByLabel("Your message")).toHaveCount(0);
  expect(state.reads).toEqual([]);
  state.roundsStatus = 200;
  await thread.getByRole("button", { name: "Try again" }).click();
  await expect(thread.getByText(openRound.message, { exact: true })).toBeVisible();
  await expect.poll(() => state.readBodies).toEqual([{ lastMessageId: 3 }]);
});

test("[SPM-41 regression] attendance and end changes preserve an unchanged start inside 48 hours", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-25T10:00:00Z") });
  await installConnectSphereMocks(page, { role: "ORGANISER" });
  const state = await routeClarifications(page, {
    event: returnedForOwner(returnedOwnerPermissions, { startDatetime: "2026-10-26T10:00:00Z", endDatetime: "2026-10-26T12:00:00Z" }),
    rounds: [openRound],
    onAmend: (route, sent, current) => {
      current.event = { ...current.event, ...sent.body.changes, version: current.event.version + 1 };
      return route.fulfill({ json: { message: "Amendments saved.", event: current.event } });
    },
  });
  await page.goto("/events/42");
  const region = page.getByRole("region", { name: "Amend your request" });
  await region.getByRole("button", { name: "Amend request", exact: true }).click();
  await region.getByLabel("Expected attendance").fill("121");
  await region.getByRole("button", { name: "Save amendments", exact: true }).click();
  await expect.poll(() => state.amendments.length).toBe(1);
  expect(state.amendments[0].body.changes).toEqual({ expectedAttendance: 121 });
  await region.getByRole("button", { name: "Amend request", exact: true }).click();
  await region.getByLabel(/^End\b/).fill("2026-10-26T23:00");
  await region.getByRole("button", { name: "Save amendments", exact: true }).click();
  await expect.poll(() => state.amendments.length).toBe(2);
  expect(Object.keys(state.amendments[1].body.changes)).toEqual(["endDatetime"]);
});

for (const width of [1280, 390]) {
  test(`[SPM-41 regression] equipment can be amended at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await installConnectSphereMocks(page, { role: "ORGANISER" });
    const state = await routeClarifications(page, {
      event: returnedForOwner(returnedOwnerPermissions, { equipmentRequirements: [{ equipmentId: 1, quantity: 2 }] }),
      rounds: [openRound],
      onAmend: (route, sent, current) => {
        current.event = { ...current.event, ...sent.body.changes, version: current.event.version + 1 };
        return route.fulfill({ json: { message: "Amendments saved.", event: current.event } });
      },
    });
    await page.goto("/events/42");
    const region = page.getByRole("region", { name: "Amend your request" });
    await region.getByRole("button", { name: "Amend request", exact: true }).click();
    await region.getByLabel("Quantity 1", { exact: true }).fill("0");
    await region.getByRole("button", { name: "Save amendments", exact: true }).click();
    await expect(region.getByText("Choose up to 20 equipment items with positive whole quantities.")).toBeVisible();
    expect(state.amendments).toHaveLength(0);
    await region.getByLabel("Quantity 1", { exact: true }).fill("4");
    await region.getByRole("button", { name: "Add equipment", exact: true }).click();
    await expect(region.getByLabel("Equipment 2", { exact: true })).toHaveValue("2");
    await region.getByLabel("Quantity 2", { exact: true }).fill("3");
    await region.getByRole("button", { name: "Remove equipment 1", exact: true }).click();
    await expect(region.getByLabel("Equipment 1", { exact: true })).toHaveValue("2");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await region.getByRole("group", { name: "Equipment", exact: true }).screenshot({ path: testInfo.outputPath(`equipment-${width}.png`) });
    await region.getByRole("button", { name: "Save amendments", exact: true }).click();
    await expect.poll(() => state.amendments.length).toBe(1);
    expect(state.amendments[0].body.changes).toEqual({ equipmentRequirements: [{ equipmentId: 2, quantity: 3 }] });
    await expect(page.getByRole("region", { name: "Requirements", exact: true }).getByText("Equipment #2 × 3")).toBeVisible();
  });
}

test("[SPM-41 regression] an older opening response cannot replace a newly reopened thread", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "ORGANISER" });
  let releaseOld;
  const oldGate = new Promise((resolve) => { releaseOld = resolve; });
  let oldFinished = false;
  const latest = { ...openRound, messages: [...openRound.messages, message(45, coordinator, "Latest reply survives an older response", "2026-10-25T10:00:00Z")] };
  const state = await routeClarifications(page, {
    event: returnedForOwner(), rounds: [openRound],
    onGet: async (route, current) => {
      if (current.roundsGets === 2) {
        await oldGate;
        await route.fulfill({ json: { clarifications: [openRound] } });
        oldFinished = true;
        return;
      }
      return route.fulfill({ json: { clarifications: [current.roundsGets >= 3 ? latest : openRound] } });
    },
  });
  await page.goto("/events/42");
  await expect(clarificationList(page).getByRole("button", { name: "Request 2" })).toBeVisible();
  const first = await openThread(page, 2);
  await expect.poll(() => state.roundsGets).toBe(2);
  await first.getByRole("button", { name: "Close dialog", exact: true }).click();
  const reopened = await openThread(page, 2);
  await expect(reopened.getByText("Latest reply survives an older response", { exact: true })).toBeVisible();
  await expect.poll(() => state.readBodies).toEqual([{ lastMessageId: 45 }]);
  releaseOld();
  await expect.poll(() => oldFinished).toBe(true);
  await reopened.getByLabel("Your message").fill("Reply draft");
  await expect(reopened.getByText("Latest reply survives an older response", { exact: true })).toBeVisible();
  expect(state.readBodies.every((entry) => entry.lastMessageId === 45)).toBe(true);
});
