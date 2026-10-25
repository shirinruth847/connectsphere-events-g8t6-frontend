import assert from "node:assert/strict";
import { test } from "node:test";
import { AMENDABLE_FIELDS, amendedFields, clarificationMessageProblem, formValuesFromEvent, validateEventStep } from "../lib/events.ts";
import { isNewHistoryEntry } from "../lib/event-history.ts";

const returned = {
  title: "SMU Alumni Gala 2026",
  status: "AWAITING_CLARIFICATION",
  purpose: "Reconnect alumni",
  description: "An evening for SMU alumni.",
  startDatetime: "2026-12-01T10:00:00.000Z",
  endDatetime: "2026-12-01T12:00:00.000Z",
  expectedAttendance: 200,
  preferredLayoutType: "THEATRE",
  accessibilityNeeds: ["Wheelchair / barrier-free access", "Quiet room"],
  venuePreferences: [4, 2],
  equipmentRequirements: [{ equipmentId: 8, quantity: 3 }],
  isRegistrationEnabled: true,
  registrationCapacity: 150,
};

test("[SPM-41 AC3] nothing counts as amended until a field changes", () => {
  const values = formValuesFromEvent(returned);
  assert.deepEqual(amendedFields(values, { ...values }), {});
});

test("[SPM-41 AC3] unchanged starts inside 48 hours still allow attendance/end amendments", () => {
  const now = Date.parse("2026-10-25T10:00:00Z");
  const values = formValuesFromEvent({ ...returned, startDatetime: "2026-10-26T10:00:00Z", endDatetime: "2026-10-26T12:00:00Z" });
  values.expectedAttendance = "250";
  assert.deepEqual(validateEventStep(values, 1, true, now, false), {});
  values.endDatetime = "2026-10-26T13:00:00Z";
  assert.deepEqual(validateEventStep(values, 1, true, now, false), {});
  values.expectedAttendance = "";
  assert.ok(validateEventStep(values, 1, true, now, false).expectedAttendance);
  values.endDatetime = values.startDatetime;
  assert.ok(validateEventStep(values, 1, true, now, false).endDatetime);
});

test("[SPM-41 AC3] amended starts retain the exact 48-hour boundary", () => {
  const now = Date.parse("2026-10-25T10:00:00Z");
  const values = formValuesFromEvent(returned);
  values.startDatetime = "2026-10-27T10:00:00Z";
  values.endDatetime = "2026-10-27T12:00:00Z";
  assert.deepEqual(validateEventStep(values, 1, true, now, true), {});
  values.startDatetime = "2026-10-27T09:59:59.999Z";
  assert.ok(validateEventStep(values, 1, true, now, true).startDatetime);
});

test("[SPM-41 AC3] equipment amendments retain quantities and reject invalid quantities", () => {
  const original = formValuesFromEvent(returned);
  const values = { ...original, equipmentRequirements: [{ equipmentId: 8, quantity: 5 }] };
  assert.deepEqual(amendedFields(original, values), { equipmentRequirements: [{ equipmentId: 8, quantity: 5 }] });
  assert.deepEqual(validateEventStep(values, 4, true), {});
  for (const quantity of [0, -1, 1.5, 2147483648]) {
    values.equipmentRequirements[0].quantity = quantity;
    assert.ok(validateEventStep(values, 4, true).equipmentRequirements);
  }
});

test("[SPM-41 AC3] only the changed submission fields are sent, with their submitted values", () => {
  const original = formValuesFromEvent(returned);
  const changes = amendedFields(original, {
    ...original,
    expectedAttendance: "250",
    venuePreferences: [2, 4],
    accessibilityNotes: "Quiet room\nStep-free stage",
  });
  assert.deepEqual(changes, {
    expectedAttendance: 250,
    venuePreferences: [2, 4],
    accessibilityNeeds: ["Wheelchair / barrier-free access", "Quiet room", "Step-free stage"],
  });
});

test("[SPM-41 decision 3] registration settings are never sent as amendments", () => {
  const original = formValuesFromEvent(returned);
  const changes = amendedFields(original, { ...original, isRegistrationEnabled: false, registrationCapacity: "10" });
  assert.deepEqual(changes, {});
  assert.ok(!AMENDABLE_FIELDS.includes("isRegistrationEnabled"));
  assert.ok(!AMENDABLE_FIELDS.includes("registrationCapacity"));
});

test("[SPM-41 v2] a thread message is required", () => {
  assert.equal(clarificationMessageProblem(""), "Write a message before sending.");
  assert.equal(clarificationMessageProblem("   \n"), "Write a message before sending.");
  assert.equal(clarificationMessageProblem("A 6m stage is enough."), null);
});

test("[SPM-41 decision 1] a thread message is capped at 2,000 characters", () => {
  assert.equal(clarificationMessageProblem("a".repeat(2000)), null);
  assert.match(clarificationMessageProblem("a".repeat(2001)), /2,000 characters or fewer/);
});

const baseline = { lastViewedAt: "2026-10-23T03:00:00.000Z", newestSeenId: 40 };

test("[SPM-41 v2] history entries after the viewer's last visit are new", () => {
  assert.equal(isNewHistoryEntry({ historyId: 40, occurredAt: "2026-10-23T05:00:00.000Z" }, baseline), true);
  assert.equal(isNewHistoryEntry({ historyId: 39, occurredAt: "2026-10-23T02:59:59.000Z" }, baseline), false);
});

test("[SPM-41 v2] changes made during this visit are not new", () => {
  assert.equal(isNewHistoryEntry({ historyId: 41, occurredAt: "2026-10-24T05:00:00.000Z" }, baseline), false);
});

test("[SPM-41 v2] nothing is new on a first visit or before the history loads", () => {
  const entry = { historyId: 40, occurredAt: "2026-10-23T05:00:00.000Z" };
  assert.equal(isNewHistoryEntry(entry, null), false);
  assert.equal(isNewHistoryEntry(entry, { lastViewedAt: null, newestSeenId: 40 }), false);
  assert.equal(isNewHistoryEntry(entry, { lastViewedAt: "not a date", newestSeenId: 40 }), false);
});
