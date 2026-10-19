import assert from "node:assert/strict";
import { test } from "node:test";
import { AMENDABLE_FIELDS, amendedFields, formValuesFromEvent, resubmissionProblem } from "../lib/events.ts";

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

test("[SPM-41 decision 2] a resubmission needs a response or an amendment", () => {
  assert.match(resubmissionProblem("", {}), /response or change at least one detail/);
  assert.match(resubmissionProblem("   ", {}), /response or change at least one detail/);
  assert.equal(resubmissionProblem("A 6m stage is enough.", {}), null);
  assert.equal(resubmissionProblem("", { expectedAttendance: 250 }), null);
});

test("[SPM-41 decision 1] the response is capped at 2,000 characters", () => {
  assert.equal(resubmissionProblem("a".repeat(2000), {}), null);
  assert.match(resubmissionProblem("a".repeat(2001), {}), /2,000 characters or fewer/);
});
