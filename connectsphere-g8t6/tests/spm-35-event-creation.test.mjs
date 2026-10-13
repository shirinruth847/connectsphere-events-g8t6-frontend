import assert from "node:assert/strict";
import { test } from "node:test";
import { displayEventStatus, EMPTY_EVENT_FORM, eventStatusLabel, submitEventRequest, validateEventStep } from "../lib/events.ts";

test("[SPM-35 TC-002] creation blocks advancing when required event identity fields are missing", () => {
  const errors = validateEventStep(EMPTY_EVENT_FORM, 0, true);

  assert.deepEqual(Object.keys(errors), ["title", "purpose", "description"]);
});

test("[SPM-35 AC2] creation requires scheduling fields and rejects an end time before the start", () => {
  const missing = validateEventStep({ ...EMPTY_EVENT_FORM, title: "Forum" }, 1, true);
  assert.deepEqual(Object.keys(missing), ["startDatetime", "endDatetime", "expectedAttendance"]);

  const invalidRange = validateEventStep({
    ...EMPTY_EVENT_FORM,
    startDatetime: "2026-11-01T12:00",
    endDatetime: "2026-11-01T11:00",
    expectedAttendance: "25",
  }, 1, true);
  assert.equal(invalidRange.endDatetime, "End time must be after the start time.");
});

test("[SPM-35 AC Dashboard] dashboard displays the statusLabel supplied by the API", () => {
  assert.equal(displayEventStatus("SUBMITTED"), "SUBMITTED");
  assert.equal(eventStatusLabel({ status: "SUBMITTED", statusLabel: "Pending Approval" }), "Pending Approval");
});

test("[SPM-35 TC-001] new event submission posts once with an idempotency key", async () => {
  const calls = [];
  const request = async (...args) => calls.push(args);
  await submitEventRequest(request, null, { title: "Tech Conference 2026" }, "request-key");

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/events");
  assert.equal(calls[0][1].method, "POST");
  assert.equal(calls[0][1].headers["Idempotency-Key"], "request-key");
});
