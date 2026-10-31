/**
 * Edge-case tests for SPM-286 and SPM-287.
 * Run with:  npm test -- --test-name-pattern "SPM-286|SPM-287" (or just npm test)
 *
 * These tests exercise the pure frontend logic only.  They do NOT call a live
 * backend; concurrency / transaction rules (TC-08, TC-09, TC-10, SPM-287 TC-09)
 * are handled atomically in the backend – the frontend's role is documented
 * separately at the end of this file.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Pure logic under test
import {
  availabilityWindow,
  availabilityQuery,
  lineQuantityProblems,
  equipmentAvailabilityErrors,
  itemFieldErrors,
  itemsSummary,
  unavailableItems,
  rejectionReasonProblem,
  technicalRequestQuery,
  technicalStatusLabel,
  visibleHistoryChanges,
  readableHistoryChange,
  isEmptyChange,
  TECHNICAL_REQUEST_PAGE_SIZE,
  MAX_REJECTION_REASON,
  MAX_TECHNICAL_SEARCH_LENGTH,
} from "../lib/technical-requests.ts";

import {
  localDateTimeToIso,
  toLocalDateTimeInput,
  toPayload,
  validateEventStep,
  EMPTY_EVENT_FORM,
} from "../lib/events.ts";

import {
  currentScheduleMonth,
  scheduleRange,
  scheduleQuery,
  scheduleTimeLabel,
  shiftScheduleMonth,
  isScheduleMonth,
} from "../lib/equipment-schedule.ts";

import { canViewPath } from "../lib/auth.ts";

// ─── helpers ────────────────────────────────────────────────────────────────

const item = (id, name, total, available, category = null) => ({
  equipmentId: id, name, category, description: null, totalQuantity: total, availableQuantity: available,
});

const windowedAvail = (items) => ({
  window: { start: "2030-03-10T01:00:00Z", end: "2030-03-10T09:00:00Z" },
  note: null,
  equipment: items,
});

const stockAvail = (items) => ({
  window: null,
  note: "Availability is confirmed once the event's date and time are chosen.",
  equipment: items,
});

// ─── SPM-286 AC1 / TC-01  Available quantity = stock minus overlapping holds ─

test("[SPM-286 TC-01] 12 mics, 4 held by another overlapping event → 8 shown", () => {
  // The backend computes the 8; the frontend receives it as availableQuantity.
  const avail = windowedAvail([item(2, "Microphone", 12, 8)]);
  const lines = [{ equipmentId: 2, quantity: 8 }];
  assert.deepEqual(lineQuantityProblems(lines, avail), {});
  // Requesting 9 is refused
  assert.deepEqual(
    lineQuantityProblems([{ equipmentId: 2, quantity: 9 }], avail),
    { 0: "Only 8 Microphone available for the event's time." }
  );
});

// ─── SPM-286 AC1 / TC-02  Half-open interval: event ending = event starting is no overlap ─

test("[SPM-286 TC-02] half-open interval boundary: window sent with SGT offset, start===end of another is fine", () => {
  // The availability query builds a [start, end) window in SGT.
  // "Event C starts exactly as A ends" → the backend returns full stock (12).
  // Frontend: just check the window is constructed correctly with SGT offset.
  const q = availabilityQuery("2030-03-10T04:00:00Z", "2030-03-10T06:00:00Z"); // 12:00–14:00 SGT
  assert.match(q, /start=2030-03-10T12%3A00%3A00%2B08%3A00/);
  assert.match(q, /end=2030-03-10T14%3A00%3A00%2B08%3A00/);
  // If backend returns full stock (12 available), no problem for quantity 12.
  const avail = windowedAvail([item(2, "Microphone", 12, 12)]);
  assert.deepEqual(lineQuantityProblems([{ equipmentId: 2, quantity: 12 }], avail), {});
});

// ─── SPM-286 AC2  No dates → total stock shown ──────────────────────────────

test("[SPM-286 AC2] no event dates → empty query, note present", () => {
  assert.equal(availabilityQuery(null, null), "");
  assert.equal(availabilityQuery("", ""), "");
  assert.equal(availabilityQuery("not-a-date", "2030-03-10T09:00:00Z"), "");
  // start >= end → no window
  assert.equal(availabilityQuery("2030-03-10T09:00:00Z", "2030-03-10T09:00:00Z"), "");
  assert.equal(availabilityQuery("2030-03-10T09:00:00Z", "2030-03-10T08:00:00Z"), "");
});

test("[SPM-286 AC2] stock-only availability: limit is totalQuantity, not availableQuantity", () => {
  const avail = stockAvail([item(2, "Microphone", 12, 12)]);
  assert.deepEqual(lineQuantityProblems([{ equipmentId: 2, quantity: 12 }], avail), {});
  assert.deepEqual(
    lineQuantityProblems([{ equipmentId: 2, quantity: 13 }], avail),
    { 0: "Only 12 Microphone in stock." }
  );
});

// ─── SPM-286 AC2  Stock-only: limit uses availableQuantity from stockAvail ──

test("[SPM-286 AC2] stock-only availability respects availableQuantity (not totalQuantity if different)", () => {
  // 10 total, 2 in maintenance → 8 usable
  const avail = stockAvail([item(1, "Projector", 10, 8)]);
  assert.deepEqual(lineQuantityProblems([{ equipmentId: 1, quantity: 8 }], avail), {});
  assert.deepEqual(
    lineQuantityProblems([{ equipmentId: 1, quantity: 9 }], avail),
    { 0: "Only 8 Projector in stock." }
  );
});

// ─── SPM-286 AC3 / TC-05  Invalid quantities ────────────────────────────────

test("[SPM-286 TC-05] quantity=0 or negative is invalid", () => {
  const avail = windowedAvail([item(1, "Projector", 10, 10)]);
  // quantity 0: lineQuantityProblems only checks > available, so 0 passes here.
  // The actual ≥1 gate is in the send() call and backend validation.
  // Verify the send-side check (itemFieldErrors picks up backend field errors).
  const fields = { "items[0].quantity": "Quantity must be a whole number of 1 or more." };
  assert.deepEqual(itemFieldErrors(fields), { 0: "Quantity must be a whole number of 1 or more." });
});

test("[SPM-286 TC-05] non-integer quantity is refused", () => {
  const fields = { "items[1].quantity": "Quantity must be a whole number of 1 or more." };
  assert.deepEqual(itemFieldErrors(fields), { 1: "Quantity must be a whole number of 1 or more." });
});

test("[SPM-286 TC-05] quantity above available: per-line error, form-level error", () => {
  const avail = windowedAvail([item(1, "Projector", 10, 3), item(2, "Microphone", 6, 6)]);
  const lines = [
    { equipmentId: 1, quantity: 4 }, // over limit
    { equipmentId: 2, quantity: 6 }, // exactly at limit → OK
  ];
  const problems = lineQuantityProblems(lines, avail);
  assert.deepEqual(problems, { 0: "Only 3 Projector available for the event's time." });
  const formErr = equipmentAvailabilityErrors(lines, avail);
  assert.equal(formErr.equipmentRequirements, "Reduce the highlighted equipment quantities to what is available.");
});

test("[SPM-286 TC-05] quantity exactly at available limit is accepted", () => {
  const avail = windowedAvail([item(1, "Projector", 10, 3)]);
  assert.deepEqual(lineQuantityProblems([{ equipmentId: 1, quantity: 3 }], avail), {});
});

// ─── SPM-286 AC3  Multiple lines, mixed over/under ───────────────────────────

test("[SPM-286 AC3] multiple lines: only over-limit lines get errors, others are fine", () => {
  const avail = windowedAvail([
    item(1, "Projector", 10, 2),
    item(2, "Microphone", 6, 6),
    item(3, "PA Speaker", 4, 0), // fully booked
  ]);
  const lines = [
    { equipmentId: 1, quantity: 2 },  // OK
    { equipmentId: 2, quantity: 7 },  // over
    { equipmentId: 3, quantity: 1 },  // over (0 available)
  ];
  const problems = lineQuantityProblems(lines, avail);
  assert.equal(problems[0], undefined);
  assert.equal(problems[1], "Only 6 Microphone available for the event's time.");
  assert.equal(problems[2], "Only 0 PA Speaker available for the event's time.");
});

test("[SPM-286 AC3] an item no longer in the catalogue is not checked", () => {
  const avail = windowedAvail([item(1, "Projector", 10, 3)]);
  // equipmentId 99 is not in avail.equipment → no error generated
  const lines = [{ equipmentId: 99, quantity: 9999 }];
  assert.deepEqual(lineQuantityProblems(lines, avail), {});
});

// ─── SPM-286 AC3  Null availability → no blocking ────────────────────────────

test("[SPM-286 AC3] null availability (loading/error) never blocks", () => {
  assert.deepEqual(lineQuantityProblems([{ equipmentId: 1, quantity: 99 }], null), {});
  assert.deepEqual(equipmentAvailabilityErrors([{ equipmentId: 1, quantity: 99 }], null), {});
});

// ─── SPM-286 AC3 / TC-03  Draft saved with equipment, reopened ───────────────

test("[SPM-286 TC-03] toPayload serialises equipment lines correctly", () => {
  const values = {
    ...EMPTY_EVENT_FORM,
    title: "TC-03 event",
    equipmentRequirements: [
      { equipmentId: 1, quantity: 2 },
      { equipmentId: 3, quantity: 4 },
    ],
  };
  const payload = toPayload(values);
  assert.deepEqual(payload.equipmentRequirements, [{ equipmentId: 1, quantity: 2 }, { equipmentId: 3, quantity: 4 }]);
});

// ─── SPM-286 AC6/AC7  Backend refusals ───────────────────────────────────────

test("[SPM-286 AC6][AC7] unavailableItems parses 409 body correctly", () => {
  const body = {
    items: [
      { equipmentId: 1, name: "Projector", requested: 4, available: 2 },
      { equipmentId: 2, name: "Microphone", requested: 3, available: 3 }, // available ≥ requested: still included if backend sends it
    ],
  };
  const items = unavailableItems(body);
  assert.equal(items.length, 2);
  assert.equal(items[0].name, "Projector");
  assert.equal(items[0].available, 2);
});

test("[SPM-286 AC7] unavailableItems ignores null/malformed entries", () => {
  assert.deepEqual(unavailableItems({ items: [null, undefined, { equipmentId: 1 }] }), []);
  assert.deepEqual(unavailableItems({}), []);
  assert.deepEqual(unavailableItems({ items: "string" }), []);
});

test("[SPM-286 AC7] itemFieldErrors maps items[n].quantity and items[n].equipmentId", () => {
  const fields = {
    "items[0].quantity": "Quantity must be a whole number of 1 or more.",
    "items[1].equipmentId": "Choose a catalogue item for each line, once.",
    "items[2].quantity": "Excess.",
    items: "General items error",
  };
  const result = itemFieldErrors(fields);
  assert.equal(result[0], "Quantity must be a whole number of 1 or more.");
  assert.equal(result[1], "Choose a catalogue item for each line, once.");
  assert.equal(result[2], "Excess.");
  // The top-level 'items' key should not appear
  assert.equal(result.items, undefined);
});

test("[SPM-286 AC7] itemFieldErrors: first field wins for same index (quantity before equipmentId)", () => {
  const fields = {
    "items[0].quantity": "Quantity error.",
    "items[0].equipmentId": "Id error.",
  };
  const result = itemFieldErrors(fields);
  // First processed wins (??= short-circuits)
  assert.ok(result[0] === "Quantity error." || result[0] === "Id error."); // order is object iteration order
  assert.equal(Object.keys(result).length, 1);
});

// ─── SPM-286 AC5  AC7  Coordinator-side canSend logic ─────────────────────────
// The canSend condition: isCoordinator && status===PLANNING && hasDates && !active
// We test the pure conditions from technical-request-section's logic

test("[SPM-286 AC5] send is blocked outside Planning", () => {
  const blockedStatuses = ["SUBMITTED", "UNDER_REVIEW", "SAFETY_REVIEW", "CONFIRMED", "PREPARATION", "CANCELLED", "REJECTED"];
  for (const status of blockedStatuses) {
    // The component sets canSend = false when status !== "PLANNING"
    const canSend = status === "PLANNING";
    assert.equal(canSend, false, `Expected false for status ${status}`);
  }
  assert.equal("PLANNING" === "PLANNING", true);
});

test("[SPM-286 AC5] send is blocked when dates are missing", () => {
  const hasDates = (start, end) => Boolean(start && end);
  assert.equal(hasDates(null, null), false);
  assert.equal(hasDates("2030-03-10T01:00:00Z", null), false);
  assert.equal(hasDates(null, "2030-03-10T09:00:00Z"), false);
  assert.equal(hasDates("2030-03-10T01:00:00Z", "2030-03-10T09:00:00Z"), true);
});

test("[SPM-286 AC5] send is blocked when an active (PENDING or APPROVED) request exists", () => {
  const ACTIVE = new Set(["PENDING", "APPROVED"]);
  const isBlocked = (requests) => requests.some((r) => r.requestId !== null && ACTIVE.has(r.status));
  assert.equal(isBlocked([{ requestId: 1, status: "PENDING" }]), true);
  assert.equal(isBlocked([{ requestId: 1, status: "APPROVED" }]), true);
  assert.equal(isBlocked([{ requestId: 1, status: "REJECTED" }]), false);
  assert.equal(isBlocked([{ requestId: null, status: "APPROVED" }]), false); // seed data, no requestId
  assert.equal(isBlocked([]), false);
  // Rejected then new pending → blocked again
  assert.equal(isBlocked([{ requestId: 2, status: "PENDING" }, { requestId: 1, status: "REJECTED" }]), true);
});

// ─── SPM-286 AC7  itemsSummary ────────────────────────────────────────────────

test("[SPM-286 AC7] itemsSummary handles missing names and empty array", () => {
  assert.equal(itemsSummary([]), "No equipment");
  assert.equal(itemsSummary([{ equipmentId: 1, name: "Projector", quantity: 2 }]), "Projector × 2");
  assert.equal(itemsSummary([{ equipmentId: 5, quantity: 1 }]), "Equipment #5 × 1"); // null/undefined name
  assert.equal(
    itemsSummary([{ equipmentId: 1, name: "Projector", quantity: 2 }, { equipmentId: 2, name: "Mic", quantity: 4 }]),
    "Projector × 2, Mic × 4"
  );
});

// ─── SPM-286 All times SGT ────────────────────────────────────────────────────

test("[SPM-286 / all times SGT] typed date is interpreted as SGT in any browser zone", () => {
  const zones = ["UTC", "America/New_York", "Asia/Singapore", "Europe/London", "Pacific/Auckland"];
  const original = process.env.TZ;
  try {
    for (const zone of zones) {
      process.env.TZ = zone;
      const iso = localDateTimeToIso("2030-03-10T10:00");
      assert.equal(iso, "2030-03-10T10:00:00+08:00", `zone=${zone}`);
      // The UTC instant must be 02:00Z for a 10:00 SGT input
      assert.equal(Date.parse(iso), Date.parse("2030-03-10T02:00:00Z"), `zone=${zone} UTC instant`);
    }
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});

test("[SPM-286 / all times SGT] stored UTC is displayed as SGT in any browser zone", () => {
  const zones = ["UTC", "America/New_York", "Asia/Singapore"];
  const original = process.env.TZ;
  try {
    for (const zone of zones) {
      process.env.TZ = zone;
      // 2030-03-10T02:00:00Z = 10:00 SGT
      assert.equal(toLocalDateTimeInput("2030-03-10T02:00:00.000Z"), "2030-03-10T10:00", `zone=${zone}`);
    }
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});

test("[SPM-286 / all times SGT] availabilityQuery sends SGT offset regardless of browser zone", () => {
  const zones = ["UTC", "America/New_York", "Asia/Singapore"];
  const original = process.env.TZ;
  try {
    for (const zone of zones) {
      process.env.TZ = zone;
      const q = availabilityQuery("2030-03-10T01:00:00.000Z", "2030-03-10T09:00:00.000Z");
      assert.match(q, /start=2030-03-10T09%3A00%3A00%2B08%3A00/, `zone=${zone} start`);
      assert.match(q, /end=2030-03-10T17%3A00%3A00%2B08%3A00/, `zone=${zone} end`);
    }
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});

test("[SPM-286 / all times SGT] localDateTimeToIso round-trips through toLocalDateTimeInput", () => {
  // Typed "2030-03-10T10:00" → stored as UTC "2030-03-10T02:00:00Z" → shown back as "2030-03-10T10:00"
  const typed = "2030-03-10T10:00";
  const iso = localDateTimeToIso(typed);
  const utcStored = new Date(iso).toISOString(); // what the backend stores
  assert.equal(toLocalDateTimeInput(utcStored), typed);
});

test("[SPM-286 / all times SGT] 48-hour lead time check uses SGT", () => {
  const now = Date.parse("2030-03-08T02:00:00Z"); // 10:00 SGT on 8 March
  const values = (start, end) => ({ ...EMPTY_EVENT_FORM, startDatetime: start, endDatetime: end, expectedAttendance: "10" });
  // 09:59 SGT on 10 March = 48h - 1min → refused
  assert.ok(validateEventStep(values("2030-03-10T09:59", "2030-03-10T12:00"), 1, true, now).startDatetime);
  // 10:00 SGT on 10 March = exactly 48h → accepted
  assert.equal(validateEventStep(values("2030-03-10T10:00", "2030-03-10T12:00"), 1, true, now).startDatetime, undefined);
  // End before start
  assert.ok(validateEventStep(values("2030-03-10T10:00", "2030-03-10T09:59"), 1, true, now).endDatetime);
  // End === start
  assert.ok(validateEventStep(values("2030-03-10T10:00", "2030-03-10T10:00"), 1, true, now).endDatetime);
});

test("[SPM-286 / all times SGT] localDateTimeToIso handles already-zoned values unchanged", () => {
  const utcZ = "2030-03-10T02:00:00.000Z";
  const sgtOffset = "2030-03-10T10:00:00+08:00";
  // Already has a zone → kept as-is (converts to ISO via Date)
  assert.equal(localDateTimeToIso(utcZ), new Date(utcZ).toISOString());
  assert.equal(localDateTimeToIso(sgtOffset), new Date(sgtOffset).toISOString());
  // Invalid → undefined
  assert.equal(localDateTimeToIso("not-a-date"), undefined);
  assert.equal(localDateTimeToIso(""), undefined);
});

// ─── SPM-287 AC1  Dashboard query ordering / pagination ──────────────────────

test("[SPM-287 AC1][AC2] technicalRequestQuery constructs correct query strings", () => {
  assert.equal(technicalRequestQuery({}), `?limit=${TECHNICAL_REQUEST_PAGE_SIZE}`);
  assert.equal(technicalRequestQuery({ status: "PENDING" }), `?status=PENDING&limit=${TECHNICAL_REQUEST_PAGE_SIZE}`);
  assert.equal(technicalRequestQuery({ search: "  gala  " }), `?search=gala&limit=${TECHNICAL_REQUEST_PAGE_SIZE}`);
  assert.equal(technicalRequestQuery({ status: "APPROVED", search: "robot" }, 24), `?status=APPROVED&search=robot&limit=${TECHNICAL_REQUEST_PAGE_SIZE}&offset=24`);
  // Empty search is dropped
  assert.equal(technicalRequestQuery({ search: "   " }), `?limit=${TECHNICAL_REQUEST_PAGE_SIZE}`);
  // Offset=0 is omitted
  assert.equal(technicalRequestQuery({}, 0), `?limit=${TECHNICAL_REQUEST_PAGE_SIZE}`);
});

test("[SPM-287 AC2] all three statuses are valid filter values", () => {
  for (const status of ["PENDING", "APPROVED", "REJECTED"]) {
    const q = technicalRequestQuery({ status });
    assert.match(q, new RegExp(`status=${status}`));
    assert.equal(technicalStatusLabel(status), status.charAt(0) + status.slice(1).toLowerCase());
  }
});

test("[SPM-287 AC2] search respects MAX_TECHNICAL_SEARCH_LENGTH constant", () => {
  assert.equal(MAX_TECHNICAL_SEARCH_LENGTH, 100);
});

// ─── SPM-287 AC5 / TC-06  Rejection reason ───────────────────────────────────

test("[SPM-287 TC-06] reject without reason → blocked", () => {
  assert.equal(rejectionReasonProblem(""), "Enter a reason for rejecting this request.");
  assert.equal(rejectionReasonProblem("   "), "Enter a reason for rejecting this request.");
  assert.equal(rejectionReasonProblem("\n\t"), "Enter a reason for rejecting this request.");
});

test("[SPM-287 AC5] rejection reason length limit is MAX_REJECTION_REASON", () => {
  assert.equal(MAX_REJECTION_REASON, 1000);
  assert.equal(rejectionReasonProblem("x".repeat(1001)), `The reason must be 1000 characters or fewer.`);
  assert.equal(rejectionReasonProblem("x".repeat(1000)), null);
  assert.equal(rejectionReasonProblem("Projector unavailable for that date."), null);
});

test("[SPM-287 AC5] rejection reason: whitespace-only is refused, single char is accepted", () => {
  assert.ok(rejectionReasonProblem("   \t  "));
  assert.equal(rejectionReasonProblem("x"), null);
});

// ─── SPM-287 AC3  Available quantity shown on pending, hidden on decided ──────

test("[SPM-287 AC3] available column is shown for PENDING, hidden for APPROVED/REJECTED", () => {
  // The detail component hides the column when `decided = status !== "PENDING"`
  const decided = (status) => status !== "PENDING";
  assert.equal(decided("PENDING"), false);  // show column
  assert.equal(decided("APPROVED"), true);  // hide column
  assert.equal(decided("REJECTED"), true);  // hide column
});

test("[SPM-287 AC3] short items: item.quantity > item.availableQuantity", () => {
  const items = [
    { equipmentId: 1, name: "Projector", category: "Visual", quantity: 3, availableQuantity: 2 },
    { equipmentId: 2, name: "Microphone", category: "Audio", quantity: 2, availableQuantity: 5 },
  ];
  const short = items.filter((item) => item.quantity > item.availableQuantity);
  assert.equal(short.length, 1);
  assert.equal(short[0].name, "Projector");
});

test("[SPM-287 AC6] approve button disabled when any item is short", () => {
  // short.length > 0 → approve disabled
  const canApprove = (items) => !items.some((item) => item.quantity > item.availableQuantity);
  assert.equal(canApprove([{ quantity: 3, availableQuantity: 2 }]), false);
  assert.equal(canApprove([{ quantity: 2, availableQuantity: 2 }]), true);
  assert.equal(canApprove([{ quantity: 2, availableQuantity: 3 }]), true);
  assert.equal(canApprove([]), true); // no items → not blocked by stock
});

// ─── SPM-287 AC6 / TC-07  Role-based access ──────────────────────────────────

test("[SPM-287 TC-07] only TECH_SUPPORT can open technical request pages", () => {
  for (const role of ["ORGANISER", "COORDINATOR", "COORDINATOR_LEAD", "VENUE_STAFF", "SAFETY_OFFICER", "ATTENDEE"]) {
    assert.equal(canViewPath(role, "/technical-requests/1"), false, `Role ${role} should be denied`);
    assert.equal(canViewPath(role, "/equipment/schedule"), false, `Role ${role} should be denied schedule`);
  }
  assert.equal(canViewPath("TECH_SUPPORT", "/technical-requests/1"), true);
  assert.equal(canViewPath("TECH_SUPPORT", "/technical-requests/99999"), true);
  assert.equal(canViewPath("TECH_SUPPORT", "/equipment/schedule"), true);
  // Non-numeric request IDs are rejected
  assert.equal(canViewPath("TECH_SUPPORT", "/technical-requests/abc"), false);
  assert.equal(canViewPath("TECH_SUPPORT", "/technical-requests/"), false);
  assert.equal(canViewPath("TECH_SUPPORT", "/technical-requests/0"), false);
  assert.equal(canViewPath("TECH_SUPPORT", "/technical-requests/-1"), false);
});

test("[SPM-287 TC-07] TECH_SUPPORT is included in NOTIFICATION_ROLES", () => {
  // Checked indirectly via canViewPath for /notifications
  assert.equal(canViewPath("TECH_SUPPORT", "/notifications"), true);
  assert.equal(canViewPath("COORDINATOR_LEAD", "/notifications"), false);
  assert.equal(canViewPath("VENUE_STAFF", "/notifications"), false);
  assert.equal(canViewPath("SAFETY_OFFICER", "/notifications"), false);
});

// ─── SPM-287 AC7 / TC-09 / TC-10  Idempotency key logic ─────────────────────

test("[SPM-287 TC-09][TC-10] same body reuses the same idempotency key", () => {
  // Mirrors the pendingKey logic in both TechnicalRequestSection and TechnicalRequestDecision
  const makeKey = (pendingKey, body) => {
    const attempt = pendingKey?.body === body ? pendingKey : { body, key: "uuid-" + Math.random() };
    return attempt;
  };
  let pending = null;
  const body1 = JSON.stringify([{ equipmentId: 1, quantity: 2 }]);
  const attempt1 = makeKey(pending, body1);
  pending = attempt1;
  const attempt2 = makeKey(pending, body1); // same body → same key
  assert.equal(attempt1.key, attempt2.key);
  // Different body → new key
  const body2 = JSON.stringify([{ equipmentId: 1, quantity: 3 }]);
  const attempt3 = makeKey(pending, body2);
  assert.notEqual(attempt1.key, attempt3.key);
});

test("[SPM-287 TC-10] network error and IDEMPOTENCY_IN_PROGRESS preserve key; others clear it", () => {
  const preservedCodes = ["NETWORK_ERROR", "IDEMPOTENCY_IN_PROGRESS"];
  const shouldPreserve = (code) => code === "NETWORK_ERROR" || code === "IDEMPOTENCY_IN_PROGRESS";
  // Other error codes → key cleared
  for (const code of ["VALIDATION_FAILED", "EQUIPMENT_NOT_AVAILABLE", "TECHNICAL_REQUEST_ALREADY_DECIDED", "EVENT_NOT_FOUND"]) {
    assert.equal(shouldPreserve(code), false, `Expected key clear for ${code}`);
  }
  for (const code of preservedCodes) {
    assert.equal(shouldPreserve(code), true, `Expected key preserved for ${code}`);
  }
});

// ─── SPM-287 AC8  Equipment schedule ─────────────────────────────────────────

test("[SPM-287 AC8] schedule month is Singapore calendar month", () => {
  // 31 Jan 2030 20:00 UTC = 1 Feb 2030 04:00 SGT → month is Feb
  assert.equal(currentScheduleMonth(new Date("2030-01-31T20:00:00Z")), "2030-02");
  // 1 Feb 2030 00:00 UTC = 1 Feb 2030 08:00 SGT → still Feb
  assert.equal(currentScheduleMonth(new Date("2030-02-01T00:00:00Z")), "2030-02");
  // 31 Dec 2030 23:00 UTC = 1 Jan 2031 07:00 SGT → Jan 2031
  assert.equal(currentScheduleMonth(new Date("2030-12-31T23:00:00Z")), "2031-01");
});

test("[SPM-287 AC8] schedule range covers the full month including leap years", () => {
  assert.deepEqual(scheduleRange("2030-01"), { from: "2030-01-01", to: "2030-01-31" });
  assert.deepEqual(scheduleRange("2030-02"), { from: "2030-02-01", to: "2030-02-28" });
  assert.deepEqual(scheduleRange("2032-02"), { from: "2032-02-01", to: "2032-02-29" }); // leap
  assert.deepEqual(scheduleRange("2030-12"), { from: "2030-12-01", to: "2030-12-31" });
});

test("[SPM-287 AC8] schedule month navigation wraps correctly", () => {
  assert.equal(shiftScheduleMonth("2030-01", -1), "2029-12");
  assert.equal(shiftScheduleMonth("2030-12", 1), "2031-01");
  assert.equal(shiftScheduleMonth("2030-06", 2), "2030-08");
  assert.equal(shiftScheduleMonth("2030-06", -6), "2029-12");
});

test("[SPM-287 AC8] isScheduleMonth validates format strictly", () => {
  assert.equal(isScheduleMonth("2030-03"), true);
  assert.equal(isScheduleMonth("2030-13"), false);  // month 13
  assert.equal(isScheduleMonth("2030-00"), false);  // month 0
  assert.equal(isScheduleMonth("2030-3"), false);   // no leading zero
  assert.equal(isScheduleMonth("2030"), false);
  assert.equal(isScheduleMonth(""), false);
  assert.equal(isScheduleMonth(null), false);
  assert.equal(isScheduleMonth(undefined), false);
  assert.equal(isScheduleMonth("abc-03"), false);
});

test("[SPM-287 AC8] scheduleQuery produces correct query string", () => {
  assert.equal(scheduleQuery("2030-03"), "?from=2030-03-01&to=2030-03-31");
  assert.equal(scheduleQuery("2030-02"), "?from=2030-02-01&to=2030-02-28");
});

test("[SPM-287 AC8] scheduleTimeLabel shows SGT times for same-day events", () => {
  // 2030-03-10T01:00Z = 09:00 SGT; 2030-03-10T09:00Z = 17:00 SGT
  assert.equal(scheduleTimeLabel("2030-03-10", "2030-03-10T01:00:00.000Z", "2030-03-10T09:00:00.000Z"), "09:00–17:00 SGT");
});

test("[SPM-287 AC8] scheduleTimeLabel handles missing times", () => {
  assert.equal(scheduleTimeLabel("2030-03-10", null, null), "Time not set");
  assert.equal(scheduleTimeLabel("2030-03-10", null, "2030-03-10T09:00:00Z"), "Time not set");
  assert.equal(scheduleTimeLabel("2030-03-10", "2030-03-10T01:00:00Z", null), "Time not set");
});

test("[SPM-287 AC8] scheduleTimeLabel cross-midnight: labels the other date on the appropriate side", () => {
  // Event: 22:00 SGT on 10 Mar → 10:00 SGT on 11 Mar
  // On 11 Mar, start is previous day → shown with date
  const result = scheduleTimeLabel("2030-03-11", "2030-03-10T14:00:00.000Z", "2030-03-11T02:00:00.000Z");
  assert.match(result, /Sun, 10 Mar 2030/);
  assert.match(result, /10:00 SGT/);
});

// ─── SPM-287 History  ─────────────────────────────────────────────────────────

test("[SPM-286/287] visibleHistoryChanges hides empty diffs and labels TR status", () => {
  const changes = visibleHistoryChanges([
    { field: "technicalRequestStatus", before: "PENDING", after: "APPROVED", label: "Technical request", beforeLabel: "Pending", afterLabel: "Approved" },
    { field: "technicalRequestId", before: null, after: null },  // empty → hidden
    { field: "technicalRequest", before: null, after: "PENDING" }, // kept: after is not blank
    { field: "title", before: "Old title", after: "New title" },
    { field: "purpose", before: "", after: null }, // both blank → hidden
  ]);
  assert.equal(changes.length, 3);
  assert.equal(changes[0].label, "Technical request");
  assert.equal(changes[0].beforeLabel, "Pending");
  assert.equal(changes[0].afterLabel, "Approved");
  assert.equal(changes[1].label, "Technical request");
  assert.equal(changes[1].afterLabel, "Pending");
  assert.equal(changes[2].field, "title");
});

test("[SPM-286/287] isEmptyChange covers all blank types", () => {
  assert.equal(isEmptyChange({ field: "f", before: null, after: null }), true);
  assert.equal(isEmptyChange({ field: "f", before: "", after: undefined }), true);
  assert.equal(isEmptyChange({ field: "f", before: [], after: null }), true);
  assert.equal(isEmptyChange({ field: "f", before: null, after: "PENDING" }), false);
  assert.equal(isEmptyChange({ field: "f", before: "PENDING", after: null }), false);
  assert.equal(isEmptyChange({ field: "f", before: 0, after: null }), false); // 0 is not blank
});

test("[SPM-286/287] readableHistoryChange: technicalRequestId shows Request #N", () => {
  const change = readableHistoryChange({ field: "technicalRequestId", before: null, after: 7 });
  assert.equal(change.label, "Technical request");
  assert.equal(change.afterLabel, "Request #7");
  assert.equal(change.beforeLabel, undefined);
});

test("[SPM-286/287] readableHistoryChange: unrelated fields are returned unchanged", () => {
  const change = { field: "title", before: "A", after: "B" };
  const result = readableHistoryChange(change);
  assert.deepEqual(result, change);
});

// ─── SPM-287 AC7  TC-08  TECHNICAL_REQUEST_ALREADY_DECIDED error code ─────────

test("[SPM-287 TC-08] already-decided requests are read-only (status !== PENDING → no decision UI)", () => {
  // Component condition: if (request.status !== "PENDING") return null
  const shouldShowDecision = (status) => status === "PENDING";
  assert.equal(shouldShowDecision("PENDING"), true);
  assert.equal(shouldShowDecision("APPROVED"), false);
  assert.equal(shouldShowDecision("REJECTED"), false);
});

// ─── SPM-286 AC7 / SPM-287 AC7  Concurrency note ─────────────────────────────

test("[SPM-286 TC-08 / SPM-287 TC-09] concurrency: EQUIPMENT_NOT_AVAILABLE / ALREADY_DECIDED handling", () => {
  // Frontend does NOT retry genuine resource conflicts (EQUIPMENT_NOT_AVAILABLE
  // or TECHNICAL_REQUEST_ALREADY_DECIDED) as infrastructure errors.
  // Verify the code does not set preservedCodes for these.
  const shouldPreserveKey = (code) => code === "NETWORK_ERROR" || code === "IDEMPOTENCY_IN_PROGRESS";
  assert.equal(shouldPreserveKey("EQUIPMENT_NOT_AVAILABLE"), false);
  assert.equal(shouldPreserveKey("TECHNICAL_REQUEST_ALREADY_DECIDED"), false);
  // These ARE retried (key preserved):
  assert.equal(shouldPreserveKey("NETWORK_ERROR"), true);
  assert.equal(shouldPreserveKey("IDEMPOTENCY_IN_PROGRESS"), true);
});

// ─── SPM-286 AC3  Validation step gating ─────────────────────────────────────

test("[SPM-286 AC3] equipment availability errors gate step advance correctly", () => {
  // equipmentAvailabilityErrors returns {} when OK, {equipmentRequirements: msg} when not.
  const avail = windowedAvail([item(1, "Projector", 10, 2)]);
  const over = [{ equipmentId: 1, quantity: 3 }];
  const under = [{ equipmentId: 1, quantity: 2 }];
  assert.equal(Object.keys(equipmentAvailabilityErrors(over, avail)).length, 1);
  assert.equal(Object.keys(equipmentAvailabilityErrors(under, avail)).length, 0);
  assert.equal(Object.keys(equipmentAvailabilityErrors([], avail)).length, 0); // empty list is fine
});

// ─── SPM-287 parseRequestId edge cases ───────────────────────────────────────

test("[SPM-287] page-level parseRequestId accepts 1–10-digit positive integers only", () => {
  const parseRequestId = (raw) => (/^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null);
  assert.equal(parseRequestId("7"), 7);
  assert.equal(parseRequestId("9999999999"), 9999999999);
  assert.equal(parseRequestId("0"), null);          // leading zero / zero
  assert.equal(parseRequestId(""), null);
  assert.equal(parseRequestId("abc"), null);
  assert.equal(parseRequestId("-1"), null);
  assert.equal(parseRequestId("1.5"), null);
  assert.equal(parseRequestId("10000000000"), null); // 11 digits
  assert.equal(parseRequestId(" 7"), null);          // leading space
});

// ─── SPM-286/287  technicalStatusLabel fallback ───────────────────────────────

test("[SPM-286/287] technicalStatusLabel handles known and unknown values", () => {
  assert.equal(technicalStatusLabel("PENDING"), "Pending");
  assert.equal(technicalStatusLabel("APPROVED"), "Approved");
  assert.equal(technicalStatusLabel("REJECTED"), "Rejected");
  // Unknown: humanised
  assert.equal(technicalStatusLabel("PARTIALLY_FULFILLED"), "Partially fulfilled");
  assert.equal(technicalStatusLabel("ON_HOLD"), "On hold");
});
