import { test, expect } from "@playwright/test";
import { attachScreenshot, installConnectSphereMocks, installLoginMock } from "./support.mjs";

// SPM-243 Safety Officer dashboard and review (SPM-245, SPM-251, SPM-252). The
// mocks return the shapes the backend sends (backend README, "Safety Reviews
// (SPM-243)"); the backend decides. The signed-in officer is user 11.
const OFFICER = 11;
const OTHER_OFFICER = 30;
const SUBMITTED = "2026-10-20T08:00:00.000Z";

const round = (overrides = {}) => ({
  reviewId: 17,
  eventId: 42,
  roundNumber: 2,
  status: "OPEN",
  arrangementVersion: 5,
  submittedAt: SUBMITTED,
  claimedBy: null,
  claimedAt: null,
  checklist: null,
  organiserComment: null,
  internalNotes: null,
  requestedChanges: null,
  rejectedBookings: [],
  decidedBy: null,
  decidedAt: null,
  supersededAt: null,
  ...overrides,
});

const previousRound = round({
  reviewId: 9,
  roundNumber: 1,
  status: "CHANGES_REQUESTED",
  arrangementVersion: 3,
  submittedAt: "2026-10-01T08:00:00.000Z",
  claimedBy: OTHER_OFFICER,
  decidedBy: OTHER_OFFICER,
  decidedAt: "2026-10-02T10:00:00.000Z",
  requestedChanges: ["Add two stewards at the north exit"],
  organiserComment: "Please add stewards before resubmitting.",
  internalNotes: "Crowd flow concerns at the north exit.",
});

const eventView = (status = "SAFETY_REVIEW", overrides = {}) => ({
  eventId: 42,
  requestId: "REQ-000042",
  status,
  statusLabel: status,
  statusNote: null,
  title: "Harbour Lights Festival",
  purpose: "Community festival",
  description: "Evening festival with stalls and a stage.",
  startDatetime: "2027-11-20T09:00:00.000Z",
  endDatetime: "2027-11-20T15:00:00.000Z",
  expectedAttendance: 240,
  preferredLayoutType: "THEATRE",
  accessibilityNeeds: ["Step-free access"],
  venuePreferences: [1, 2],
  equipmentRequirements: [],
  isRegistrationEnabled: true,
  registrationCapacity: 250,
  createdAt: "2026-10-10T09:00:00.000Z",
  updatedAt: "2026-10-12T09:00:00.000Z",
  version: 7,
  arrangementVersion: 5,
  registeredCount: 3,
  organisation: { organisationId: 1, name: "Synthetic Org A" },
  isAssignedToCoordinator: true,
  isOwner: false,
  viewerRelationship: "SAFETY_OFFICER",
  permissions: { canEdit: false, editableFields: [], canViewDraftHistory: false, canViewStaffHistory: true },
  ...overrides,
});

const bookings = [
  {
    bookingId: 101,
    label: "Main stage",
    status: "APPROVED",
    startDatetime: "2027-11-20T08:00:00.000Z",
    endDatetime: "2027-11-20T16:00:00.000Z",
    expectedAttendance: 240,
    layoutType: "THEATRE",
    venue: { venueId: 1, name: "Main Hall", address: "1 Harbour Road", capacity: 300 },
  },
  {
    bookingId: 102,
    label: null,
    status: "APPROVED",
    startDatetime: "2027-11-20T08:00:00.000Z",
    endDatetime: "2027-11-20T16:00:00.000Z",
    expectedAttendance: 60,
    layoutType: "CLASSROOM",
    venue: { venueId: 2, name: "Annex Room", address: "3 Harbour Road", capacity: 80 },
  },
];

const queueRow = (reviewId, eventId, title, submittedAt) => ({
  reviewId,
  eventId,
  requestId: `REQ-0000${eventId}`,
  title,
  startDatetime: "2027-12-01T09:00:00.000Z",
  endDatetime: "2027-12-01T12:00:00.000Z",
  expectedAttendance: 90,
  venues: ["Riverside Hall"],
  roundNumber: 1,
  submittedAt,
  claimedAt: null,
});

// A stateful backend for event 42 and the queue. Options change single answers.
async function installSafetyBackend(page, options = {}) {
  const state = {
    round: round(options.round),
    previous: previousRound,
    eventStatus: "SAFETY_REVIEW",
    venueDetailsAvailable: options.venueDetailsAvailable ?? true,
    others: options.others ?? [],
    decisions: [],
    progress: [],
    handBacks: [],
    claims: [],
    // { status, json } answered once by the next decision / claim / progress.
    decisionRefusals: [...(options.decisionRefusals ?? [])],
    claimRefusals: [...(options.claimRefusals ?? [])],
    progressRefusals: [...(options.progressRefusals ?? [])],
    queueFailures: options.queueFailures ?? 0,
  };
  const summary = (item) => ({
    ...queueRow(item.reviewId, item.eventId, "Harbour Lights Festival", item.submittedAt),
    requestId: "REQ-000042",
    startDatetime: "2027-11-20T09:00:00.000Z",
    endDatetime: "2027-11-20T15:00:00.000Z",
    expectedAttendance: 240,
    venues: ["Main Hall", "Annex Room"],
    roundNumber: item.roundNumber,
    claimedAt: item.claimedAt,
  });
  const panel = () => ({
    review: state.round,
    event: {
      eventId: 42,
      requestId: "REQ-000042",
      title: "Harbour Lights Festival",
      status: state.eventStatus,
      startDatetime: "2027-11-20T09:00:00.000Z",
      endDatetime: "2027-11-20T15:00:00.000Z",
      expectedAttendance: 240,
      registeredCount: 3,
      preferredLayoutType: "THEATRE",
      // The API passes accessibility_needs through: a list, plain text or null.
      accessibilityNeeds: options.accessibilityNeeds === undefined ? ["Step-free access"] : options.accessibilityNeeds,
      arrangementVersion: 5,
    },
    bookings,
    equipment: [
      { requestId: 55, name: "Line array speakers", category: "Audio", quantity: 2, startDatetime: "2027-11-20T08:00:00.000Z", endDatetime: "2027-11-20T16:00:00.000Z", status: "APPROVED", placement: "Either side of the stage, 2m from exits" },
    ],
    history: [],
    rounds: [state.previous, state.round],
    venueDetailsAvailable: state.venueDetailsAvailable,
    venueDetails: state.venueDetailsAvailable
      ? [
          { venueId: 1, found: true, emergencyAccess: "Two fire exits to Harbour Road; vehicle access from the east gate.", knownRestrictions: ["No open flames", "Stage load limit 500kg"] },
          { venueId: 2, found: false, emergencyAccess: null, knownRestrictions: [] },
        ]
      : [],
  });

  await page.route(/\/api\/(safety-reviews|events\/42)(\/[^?]*)?(\?.*)?$/, async (route) => {
    const request = route.request();
    const method = request.method();
    if (method === "OPTIONS") return route.fallback();
    const { pathname } = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, json: body });

    if (pathname === "/api/safety-reviews/queue") {
      if (state.queueFailures > 0) {
        state.queueFailures -= 1;
        return json({ error: "The queue could not be loaded.", code: "INTERNAL_ERROR" }, 500);
      }
      const open = [state.round, ...state.others].filter((item) => item.status === "OPEN" && item.claimedBy === null);
      const rows = open.map((item) => (item.eventId === 42 ? summary(item) : queueRow(item.reviewId, item.eventId, item.title, item.submittedAt)));
      return json({ reviews: rows.sort((left, right) => left.submittedAt.localeCompare(right.submittedAt)) });
    }
    if (pathname === "/api/safety-reviews/mine") {
      const mine = [state.round, ...state.others].filter((item) => item.status === "OPEN" && item.claimedBy === OFFICER);
      return json({ reviews: mine.map((item) => (item.eventId === 42 ? summary(item) : { ...queueRow(item.reviewId, item.eventId, item.title, item.submittedAt), claimedAt: item.claimedAt })) });
    }
    const action = pathname.match(/^\/api\/safety-reviews\/(\d+)\/([a-z-]+)$/);
    if (action) {
      const reviewId = Number(action[1]);
      const target = reviewId === state.round.reviewId ? state.round : state.others.find((item) => item.reviewId === reviewId);
      if (!target) return json({ error: "Safety review not found.", code: "REVIEW_NOT_FOUND" }, 404);
      const verb = action[2];
      if (verb === "panel") return inOfficerScope(target) ? json(panel()) : json({ error: "Safety review not found.", code: "REVIEW_NOT_FOUND" }, 404);
      if (verb === "claim") {
        state.claims.push(reviewId);
        const refusal = state.claimRefusals.shift();
        if (refusal) {
          if (refusal.apply) refusal.apply(state);
          return json(refusal.json, refusal.status);
        }
        if (target.claimedBy !== null) return json({ error: "Already claimed.", code: "ROUND_NOT_CLAIMABLE" }, 409);
        Object.assign(target, { claimedBy: OFFICER, claimedAt: "2026-10-21T09:00:00.000Z" });
        return json({ message: "Review claimed.", review: target });
      }
      if (verb === "hand-back") {
        state.handBacks.push(request.postDataJSON());
        Object.assign(target, { claimedBy: null, claimedAt: null, checklist: null, organiserComment: null, internalNotes: null, requestedChanges: null });
        return json({ message: "Review handed back to the queue.", review: target });
      }
      if (verb === "progress") {
        const body = request.postDataJSON();
        state.progress.push(body);
        const refusal = state.progressRefusals.shift();
        if (refusal) {
          if (refusal.apply) refusal.apply(state);
          return json(refusal.json, refusal.status);
        }
        Object.assign(target, body);
        return json({ message: "Progress saved.", review: target });
      }
      if (verb === "decision") {
        const body = request.postDataJSON();
        state.decisions.push({ body, key: request.headers()["idempotency-key"] });
        const refusal = state.decisionRefusals.shift();
        if (refusal) {
          if (refusal.apply) refusal.apply(state);
          return json(refusal.json, refusal.status);
        }
        Object.assign(target, {
          status: body.outcome,
          checklist: body.checklist,
          organiserComment: body.organiserComment ?? null,
          internalNotes: body.internalNotes ?? null,
          requestedChanges: body.requestedChanges ?? null,
          rejectedBookings: body.rejectedBookings ?? [],
          decidedBy: OFFICER,
          decidedAt: "2026-10-21T10:00:00.000Z",
        });
        state.eventStatus = body.outcome === "APPROVED" ? "SAFETY_REVIEW" : "PLANNING";
        return json({ message: "Safety decision recorded.", review: target, event: { eventId: 42, status: state.eventStatus } });
      }
    }
    if (pathname === "/api/events/42/safety-reviews") return json({ reviews: [state.previous, state.round] });
    if (pathname === "/api/events/42/history") return json({ history: [], nextCursor: null });
    if (pathname === "/api/events/42") return json({ event: eventView(state.eventStatus, { safetyReviewId: officerReviewId([state.previous, state.round]) }) });
    return route.fallback();
  });
  return state;
}

// The backend's Safety Officer scope (eventModel.isRoundInOfficerScope) and the
// round the event view names for the officer (safetyReviewId).
const inOfficerScope = (round) => (round.status === "OPEN" && (round.claimedBy === null || round.claimedBy === OFFICER)) || round.decidedBy === OFFICER;
const officerReviewId = (rounds) => {
  const scoped = rounds.filter((round) => round && inOfficerScope(round));
  const open = scoped.find((round) => round.status === "OPEN");
  return (open ?? [...scoped].sort((left, right) => right.reviewId - left.reviewId)[0])?.reviewId ?? null;
};

const steps = (page) => page.getByRole("navigation", { name: "Review steps" });
const statusRegion = (page) => page.getByRole("status").filter({ hasText: /./ }).first();

async function openReview(page, options = {}) {
  await installConnectSphereMocks(page, { role: "SAFETY_OFFICER" });
  const state = await installSafetyBackend(page, options);
  await page.goto("/events/42");
  await expect(page.getByRole("heading", { name: "Harbour Lights Festival", level: 1 })).toBeVisible();
  return state;
}

async function goToStep(page, title) {
  await steps(page).getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();
}

async function assess(page, factorLabel, result, comment) {
  const group = page.getByRole("group", { name: factorLabel, exact: true });
  await group.getByRole("radio", { name: result, exact: true }).check();
  if (comment !== undefined) await group.getByRole("textbox").fill(comment);
}

// Every factor satisfactory or not applicable, walking steps 1-3 in order.
async function assessAll(page, overrides = {}) {
  const results = {
    "Attendance and capacity": ["Satisfactory"],
    Layout: ["Satisfactory"],
    "Emergency access": ["Satisfactory"],
    "Known venue restrictions": ["Not applicable", "Nothing restricts this event."],
    Accessibility: ["Satisfactory"],
    "Equipment placement": ["Satisfactory"],
    ...overrides,
  };
  await goToStep(page, "Attendance & schedule");
  await assess(page, "Attendance and capacity", ...results["Attendance and capacity"]);
  await goToStep(page, "Venues & layout");
  for (const factor of ["Layout", "Emergency access", "Known venue restrictions"]) await assess(page, factor, ...results[factor]);
  await goToStep(page, "Accessibility & equipment");
  for (const factor of ["Accessibility", "Equipment placement"]) await assess(page, factor, ...results[factor]);
}

async function recordDecision(page) {
  await goToStep(page, "Decision");
  await page.getByRole("region", { name: "Review actions" }).getByRole("button", { name: "Record decision" }).click();
  const dialog = page.getByRole("dialog", { name: "Record this decision?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Record decision" }).click();
  return dialog;
}

// ---------- SPM-245: role, login and navigation ----------

test("[SPM-243 AC1 / TC-01] a Safety Officer signs in to /dashboard with one Dashboard tab", async ({ page }) => {
  await installLoginMock(page, { role: "SAFETY_OFFICER" });
  await installSafetyBackend(page);
  await page.goto("/login");
  await page.getByLabel("Email", { exact: false }).fill("user@example.com");
  await page.getByLabel("Password", { exact: false }).fill("Valid-password9");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Safety Officer dashboard", exact: true })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main Navigation", exact: true });
  await expect(nav.getByRole("link")).toHaveCount(1);
  await expect(nav.getByRole("link", { name: "Dashboard", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("[data-dashboard-shell]")).toHaveAttribute("data-dashboard-shell", "SAFETY_OFFICER");
});

// ---------- SPM-252: dashboard ----------

test("[SPM-243 AC3 / AC4 / TC-05] the queue lists oldest first; a claim moves the review to My reviews", async ({ page }, testInfo) => {
  await installConnectSphereMocks(page, { role: "SAFETY_OFFICER" });
  const state = await installSafetyBackend(page, {
    round: { submittedAt: "2026-10-20T08:00:00.000Z" },
    others: [
      round({ reviewId: 21, eventId: 43, roundNumber: 1, submittedAt: "2026-10-19T08:00:00.000Z", title: "Oldest Lantern Walk" }),
      round({ reviewId: 22, eventId: 44, roundNumber: 1, submittedAt: "2026-10-21T08:00:00.000Z", title: "Newest Night Market" }),
    ],
  });
  await page.goto("/dashboard");
  const queue = page.getByRole("region", { name: "Awaiting review" });
  const titles = queue.getByRole("heading", { level: 3 });
  await expect(titles).toHaveText(["Oldest Lantern Walk", "Harbour Lights Festival", "Newest Night Market"]);
  const middle = queue.getByRole("article", { name: "Harbour Lights Festival" });
  await expect(middle.getByText("Round 2 · submitted")).toBeVisible();
  await expect(middle.getByText("Main Hall, Annex Room")).toBeVisible();
  await expect(middle.getByText("240 people")).toBeVisible();
  await expect(page.getByRole("region", { name: "My reviews" }).getByText("No reviews claimed")).toBeVisible();
  await attachScreenshot(testInfo, page, "safety-dashboard-desktop");

  await middle.getByRole("button", { name: "Claim" }).click();
  await expect(statusRegion(page)).toContainText("Review claimed");
  expect(state.claims).toEqual([17]);
  const mine = page.getByRole("region", { name: "My reviews" });
  await expect(mine.getByRole("article", { name: "Harbour Lights Festival" })).toBeVisible();
  await expect(queue.getByRole("article", { name: "Harbour Lights Festival" })).toHaveCount(0);

  await mine.getByRole("link", { name: "Continue review" }).click();
  await expect(page).toHaveURL(/\/events\/42$/);
  await expect(page.getByText("Claimed by you")).toBeVisible();
});

test("[SPM-243 TC-06] a claim lost to another officer is explained and the lists refresh", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "SAFETY_OFFICER" });
  await installSafetyBackend(page, {
    claimRefusals: [{ status: 409, json: { error: "x", code: "ROUND_NOT_CLAIMABLE" }, apply: (state) => Object.assign(state.round, { claimedBy: OTHER_OFFICER }) }],
  });
  await page.goto("/dashboard");
  await page.getByRole("region", { name: "Awaiting review" }).getByRole("button", { name: "Claim" }).click();
  await expect(statusRegion(page)).toContainText("Another Safety Officer claimed this review first.");
  await expect(page.getByRole("region", { name: "Awaiting review" }).getByText("Nothing awaiting review")).toBeVisible();
});

test("[SPM-243 AC3] a failed list load can be retried", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "SAFETY_OFFICER" });
  await installSafetyBackend(page, { queueFailures: 1 });
  await page.goto("/dashboard");
  const queue = page.getByRole("region", { name: "Awaiting review" });
  await expect(queue.getByText("Could not load awaiting review")).toBeVisible();
  await queue.getByRole("button", { name: "Try again" }).click();
  await expect(queue.getByRole("article", { name: "Harbour Lights Festival" })).toBeVisible();
});

// ---------- SPM-252: review view ----------

test("[SPM-243 AC6 / TC-03 / TC-09] the five steps show the review data, counts only", async ({ page }) => {
  await openReview(page, { round: { claimedBy: OFFICER, claimedAt: "2026-10-21T09:00:00.000Z" } });
  const nav = steps(page);
  await expect(nav.getByRole("button")).toHaveCount(5);
  await expect(nav.getByRole("button", { name: /Attendance & schedule/ })).toHaveAttribute("aria-current", "step");
  await expect(page.getByText("3 people", { exact: true })).toBeVisible();
  await expect(page.getByText("participant details are not shown")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Expected attendance against the largest booked venue" })).toBeVisible();

  await goToStep(page, "Venues & layout");
  await expect(nav.getByRole("button", { name: /Venues & layout/ })).toHaveAttribute("aria-current", "step");
  await expect(page.getByText("Two fire exits to Harbour Road; vehicle access from the east gate.")).toBeVisible();
  await expect(page.getByText("Stage load limit 500kg")).toBeVisible();
  await expect(page.getByText("No venue safety record exists for this venue.")).toBeVisible();

  await goToStep(page, "Accessibility & equipment");
  await expect(page.getByText("Step-free access")).toBeVisible();
  await expect(page.getByText("Either side of the stage, 2m from exits")).toBeVisible();

  await goToStep(page, "History & previous rounds");
  await expect(page.getByRole("article", { name: "Safety review round 1" }).getByText("Add two stewards at the north exit")).toBeVisible();

  // The checklist list in the side panel jumps to a factor's step.
  await page.getByRole("region", { name: "Checklist" }).getByRole("button", { name: /Emergency access/ }).click();
  await expect(page.getByRole("heading", { name: "Venues & layout", level: 2 })).toBeVisible();
});

test("[SPM-243 AC6] accessibility needs sent as null or plain text still render (live integration regression)", async ({ page }) => {
  await openReview(page, { round: { claimedBy: OFFICER }, accessibilityNeeds: null });
  await goToStep(page, "Accessibility & equipment");
  await expect(page.getByText("No accessibility needs were requested.")).toBeVisible();
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await openReview(page, { round: { claimedBy: OFFICER }, accessibilityNeeds: "Hearing loop in the main hall" });
  await goToStep(page, "Accessibility & equipment");
  await expect(page.getByText("Hearing loop in the main hall")).toBeVisible();
});

test("[SPM-243 AC4] an unclaimed review is read-only until the officer claims it on the page", async ({ page }) => {
  const state = await openReview(page);
  await expect(page.getByText("Awaiting claim · read-only")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page.getByRole("button", { name: "Claim this review" }).click();
  await expect(page.getByText("Claimed by you")).toBeVisible();
  await expect(page.getByRole("group", { name: "Attendance and capacity", exact: true }).getByRole("radio")).toHaveCount(3);
  expect(state.claims).toEqual([17]);
});

test("[SPM-243 AC7 / TC-10] a decision with missing or unexplained factors is stopped at the right step", async ({ page }) => {
  const state = await openReview(page, { round: { claimedBy: OFFICER } });
  await goToStep(page, "Venues & layout");
  await assess(page, "Layout", "Not satisfactory");
  const stepStatus = steps(page).getByRole("button", { name: /Venues & layout/ });
  await expect(stepStatus).toContainText("0 of 3 assessed");
  await goToStep(page, "Decision");
  await page.getByRole("radio", { name: /Request changes/ }).check();
  await page.getByRole("region", { name: "Review actions" }).getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByRole("heading", { name: "Attendance & schedule", level: 2 })).toBeVisible();
  await expect(page.getByText("Record a result for this factor.")).toBeVisible();
  await goToStep(page, "Venues & layout");
  await expect(page.getByRole("group", { name: "Layout", exact: true }).getByText("Explain the result in a comment.")).toBeVisible();
  expect(state.decisions).toEqual([]);
});

test("[SPM-243 TC-11] saved progress survives a reload", async ({ page }) => {
  const state = await openReview(page, { round: { claimedBy: OFFICER } });
  await assess(page, "Attendance and capacity", "Satisfactory");
  await goToStep(page, "Venues & layout");
  await assess(page, "Layout", "Not satisfactory", "Aisles too narrow for 240 people.");
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Save progress" }).click();
  await expect(statusRegion(page)).toContainText("Progress saved");
  expect(state.progress.at(-1).checklist).toEqual({
    attendanceCapacity: { result: "SATISFACTORY", comment: null },
    layout: { result: "NOT_SATISFACTORY", comment: "Aisles too narrow for 240 people." },
  });

  await page.reload();
  await goToStep(page, "Venues & layout");
  const layout = page.getByRole("group", { name: "Layout", exact: true });
  await expect(layout.getByRole("radio", { name: "Not satisfactory", exact: true })).toBeChecked();
  await expect(layout.getByRole("textbox")).toHaveValue("Aisles too narrow for 240 people.");
});

test("[SPM-243 AC8 / TC-12 / TC-22] approval records the checklist with a reusable key", async ({ page }, testInfo) => {
  const state = await openReview(page, {
    round: { claimedBy: OFFICER },
    decisionRefusals: [{ status: 409, json: { error: "x", code: "IDEMPOTENCY_IN_PROGRESS" } }],
  });
  await assessAll(page);
  await goToStep(page, "Decision");
  await expect(steps(page).getByRole("button", { name: /Decision/ })).toContainText("Ready to decide");
  await page.getByRole("radio", { name: /Approve/ }).check();
  await page.getByLabel("Comment for the organiser").fill("Arrangements look safe.");
  await page.getByLabel(/Internal notes/).fill("Checked the north exit.");
  await attachScreenshot(testInfo, page, "safety-review-decision-desktop");

  await recordDecision(page);
  await expect(statusRegion(page)).toContainText("Still processing");
  await page.getByRole("region", { name: "Review actions" }).getByRole("button", { name: "Record decision" }).click();
  await page.getByRole("dialog", { name: "Record this decision?" }).getByRole("button", { name: "Record decision" }).click();
  await expect(statusRegion(page)).toContainText("Safety decision recorded");
  await expect(statusRegion(page)).toContainText("it is not confirmed until they do");

  expect(state.decisions).toHaveLength(2);
  expect(state.decisions[0].key).toMatch(/^[0-9a-f-]{36}$/);
  expect(state.decisions[1].key).toBe(state.decisions[0].key);
  expect(state.decisions[1].body).toEqual({
    outcome: "APPROVED",
    arrangementVersion: 5,
    organiserComment: "Arrangements look safe.",
    internalNotes: "Checked the north exit.",
    checklist: {
      attendanceCapacity: { result: "SATISFACTORY", comment: null },
      layout: { result: "SATISFACTORY", comment: null },
      emergencyAccess: { result: "SATISFACTORY", comment: null },
      accessibility: { result: "SATISFACTORY", comment: null },
      equipmentPlacement: { result: "SATISFACTORY", comment: null },
      venueRestrictions: { result: "NOT_APPLICABLE", comment: "Nothing restricts this event." },
    },
  });
  await expect(page.getByText("Decided · read-only")).toBeVisible();
  await expect(page.getByRole("region", { name: "Review actions" }).getByRole("button", { name: "Record decision" })).toHaveCount(0);
});

test("[SPM-243 TC-13] approval is unavailable while a factor is not satisfactory", async ({ page }) => {
  await openReview(page, { round: { claimedBy: OFFICER } });
  await assessAll(page, { "Emergency access": ["Not satisfactory", "East gate is locked overnight."] });
  await goToStep(page, "Decision");
  await expect(page.getByRole("radio", { name: /Approve/ })).toBeDisabled();
  await expect(page.getByText("Not possible while emergency access is not satisfactory.")).toBeVisible();
});

test("[SPM-243 AC9 / TC-14] requesting changes sends every listed change", async ({ page }) => {
  const state = await openReview(page, { round: { claimedBy: OFFICER } });
  await assessAll(page, { Layout: ["Not satisfactory", "Aisles too narrow."] });
  await goToStep(page, "Decision");
  await page.getByRole("radio", { name: /Request changes/ }).check();
  await page.getByRole("textbox", { name: "Change 1", exact: true }).fill("Widen the centre aisle to 1.5m");
  await page.getByRole("button", { name: "Add a change" }).click();
  await page.getByRole("textbox", { name: "Change 2", exact: true }).fill("Add two stewards at the north exit");
  await recordDecision(page);
  await expect(statusRegion(page)).toContainText("Changes requested. The event returned to planning");
  expect(state.decisions[0].body.outcome).toBe("CHANGES_REQUESTED");
  expect(state.decisions[0].body.requestedChanges).toEqual(["Widen the centre aisle to 1.5m", "Add two stewards at the north exit"]);
  expect(state.decisions[0].body.rejectedBookings).toBeUndefined();
});

test("[SPM-243 AC10 / TC-15 / TC-16] rejecting names one booking with its reason", async ({ page }) => {
  const state = await openReview(page, { round: { claimedBy: OFFICER } });
  await assessAll(page, { "Attendance and capacity": ["Not satisfactory", "The annex is too small."] });
  await goToStep(page, "Decision");
  await page.getByRole("radio", { name: /Reject venue bookings/ }).check();
  await page.getByRole("region", { name: "Review actions" }).getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByText("Name at least one venue booking and why it is unsuitable.")).toBeVisible();

  await page.getByRole("checkbox", { name: /Annex Room/ }).check();
  await page.getByLabel("Why is it unsuitable?").fill("Capacity 80 is below the 240 expected.");
  const dialog = await recordDecision(page);
  await expect(dialog).toBeHidden();
  await expect(statusRegion(page)).toContainText("Venue bookings rejected");
  expect(state.decisions).toHaveLength(1);
  expect(state.decisions[0].body.rejectedBookings).toEqual([{ bookingId: 102, reason: "Capacity 80 is below the 240 expected." }]);
});

test("[SPM-243 AC5 / TC-07] handing back with a note returns the review to the queue", async ({ page }) => {
  const state = await openReview(page, {
    round: { claimedBy: OFFICER, checklist: { attendanceCapacity: { result: "SATISFACTORY", comment: null } } },
  });
  await page.getByRole("button", { name: "Hand back to the queue" }).click();
  const dialog = page.getByRole("dialog", { name: "Hand this review back?" });
  await dialog.getByLabel(/Note/).fill("Conflict of interest: I advised the organiser.");
  await dialog.getByRole("button", { name: "Hand back" }).click();
  await expect(statusRegion(page)).toContainText("Review handed back");
  await expect(page.getByText("Awaiting claim · read-only")).toBeVisible();
  expect(state.handBacks).toEqual([{ note: "Conflict of interest: I advised the organiser." }]);
  await expect(page.getByRole("region", { name: "Checklist" })).toContainText("0 of 6 factors assessed");
});

test("[SPM-243 AC11 / TC-18] a decision on changed arrangements closes the round instead", async ({ page }) => {
  const state = await openReview(page, {
    round: { claimedBy: OFFICER },
    decisionRefusals: [{
      status: 409,
      json: { error: "x", code: "ARRANGEMENTS_CHANGED" },
      apply: (current) => {
        Object.assign(current.round, { status: "SUPERSEDED", supersededAt: "2026-10-21T10:00:00.000Z" });
        current.eventStatus = "PLANNING";
      },
    }],
  });
  await assessAll(page);
  await goToStep(page, "Decision");
  await page.getByRole("radio", { name: /Approve/ }).check();
  await recordDecision(page);
  // A superseded round leaves the officer's scope (backend isRoundInOfficerScope),
  // so the explanation stays and the review is no longer offered.
  await expect(statusRegion(page)).toContainText("the round was closed and the event returned to planning");
  await expect(page.getByText("Safety review not available")).toBeVisible();
  expect(state.decisions).toHaveLength(1);
});

test("[SPM-243 AC11 / TC-20] decisions wait for venue safety details", async ({ page }) => {
  await openReview(page, { round: { claimedBy: OFFICER }, venueDetailsAvailable: false });
  await goToStep(page, "Venues & layout");
  await expect(page.getByText("Emergency access and known restrictions could not be loaded")).toBeVisible();
  await goToStep(page, "Decision");
  await expect(page.getByRole("region", { name: "Review actions" }).getByRole("button", { name: "Record decision" })).toBeDisabled();
  await expect(page.getByText("Venue safety details could not be loaded. Retry on the Venues & layout step before deciding.")).toBeVisible();
});

test("[SPM-243 TC-17] losing the claim explains why and keeps nothing editable", async ({ page }) => {
  await openReview(page, {
    round: { claimedBy: OFFICER },
    progressRefusals: [{ status: 403, json: { error: "x", code: "NOT_CLAIMANT" }, apply: (current) => Object.assign(current.round, { claimedBy: OTHER_OFFICER }) }],
  });
  await assess(page, "Attendance and capacity", "Satisfactory");
  await page.getByRole("button", { name: "Save progress" }).click();
  await expect(page.getByText("You no longer hold this review")).toBeVisible();
  await expect(page.getByText("Safety review not available")).toBeVisible();
});

test("[SPM-243] the review works at mobile width", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReview(page, { round: { claimedBy: OFFICER } });
  await goToStep(page, "Venues & layout");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await attachScreenshot(testInfo, page, "safety-review-mobile");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Safety Officer dashboard" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await attachScreenshot(testInfo, page, "safety-dashboard-mobile");
});

// ---------- SPM-251: outcome visibility on other roles' event pages ----------

const decidedRounds = [
  previousRound,
  round({
    status: "REJECTED",
    claimedBy: OFFICER,
    decidedBy: OFFICER,
    decidedAt: "2026-10-21T10:00:00.000Z",
    rejectedBookings: [{ bookingId: 102, reason: "Capacity 80 is below the 240 expected." }],
    organiserComment: "The annex room is too small for this event.",
    internalNotes: "Recommend the west hall instead.",
    checklist: { attendanceCapacity: { result: "NOT_SATISFACTORY", comment: "Annex too small." } },
  }),
];

test("[SPM-243 AC15 / TC-23 / TC-24] the coordinator sees every round with full detail", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await page.route(/\/api\/events\/42(\/[^?]*)?(\?.*)?$/, (route) => {
    const { pathname } = new URL(route.request().url());
    if (route.request().method() === "OPTIONS") return route.fallback();
    if (pathname.endsWith("/safety-reviews")) return route.fulfill({ json: { reviews: decidedRounds } });
    if (pathname.endsWith("/history")) return route.fulfill({ json: { history: [], nextCursor: null } });
    if (pathname.endsWith("/readiness")) return route.fulfill({ json: { ready: true, failures: [], status: "PLANNING", version: 7, arrangementVersion: 5 } });
    return route.fulfill({ json: { event: eventView("PLANNING", { viewerRelationship: "ASSIGNED_COORDINATOR", coordinatorId: 11, permissions: { canEdit: true, editableFields: ["title", "purpose", "description"], canViewDraftHistory: false, canViewStaffHistory: true } }) } });
  });
  await page.goto("/events/42");
  const section = page.getByRole("region", { name: "Safety review" });
  await expect(section.getByRole("article")).toHaveCount(2);
  await expect(section.getByRole("article").first()).toHaveAccessibleName("Safety review round 1");
  await expect(section.getByText("Add two stewards at the north exit")).toBeVisible();
  await expect(section.getByText("Capacity 80 is below the 240 expected.")).toBeVisible();
  await expect(section.getByText("Recommend the west hall instead.")).toBeVisible();
  await expect(section.getByText("The event returned to planning; it is not rejected.").first()).toBeVisible();
});

test("[SPM-243 AC15 / TC-23] the organiser sees outcomes and their comments only", async ({ page }) => {
  const state = await installConnectSphereMocks(page, { role: "ORGANISER" });
  const organiserRounds = decidedRounds.map(({ roundNumber, status, decidedAt, organiserComment }) => ({ roundNumber, status, decidedAt, organiserComment }));
  state.arrangements.safety.reviews = organiserRounds.map((review, index) => ({
    reviewId: index + 1, round: review.roundNumber, status: review.status,
    decidedAt: review.decidedAt, organiserComment: review.organiserComment,
    submittedAt: "2026-10-20T01:00:00Z", isCurrent: index === organiserRounds.length - 1,
  }));
  await page.route(/\/api\/events\/42(\/[^?]*)?(\?.*)?$/, (route) => {
    const { pathname } = new URL(route.request().url());
    if (route.request().method() === "OPTIONS") return route.fallback();
    if (pathname.endsWith("/arrangements")) return route.fulfill({ json: { arrangements: state.arrangements } });
    if (pathname.endsWith("/safety-reviews")) return route.fulfill({ json: { reviews: organiserRounds } });
    if (pathname.endsWith("/history")) return route.fulfill({ json: { history: [], nextCursor: null } });
    return route.fulfill({ json: { event: eventView("PLANNING", { statusLabel: "Approved & Planning", viewerRelationship: "OWNER", isOwner: true, permissions: { canEdit: false, editableFields: [], canViewDraftHistory: false, canViewStaffHistory: false } }) } });
  });
  await page.goto("/events/42");
  const section = page.getByRole("region", { name: "Safety review" });
  await expect(section.getByText("The annex room is too small for this event.")).toBeVisible();
  await expect(section.getByText("Please add stewards before resubmitting.")).toBeVisible();
  await expect(section.getByText("Internal notes")).toHaveCount(0);
  await expect(section.getByText("Requested changes")).toHaveCount(0);
  await expect(section.getByText("Checklist")).toHaveCount(0);
});
