import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_EVENT_FORM, submitEventRequest, validateEventStep } from "../lib/events.ts";

test("[SPM-37 Manual save] a title-only event is valid to save as a draft", () => {
  const withTitle = { ...EMPTY_EVENT_FORM, title: "SMU Alumni Gala 2026" };

  assert.deepEqual(validateEventStep(withTitle, 0, false), {});
  assert.deepEqual(Object.keys(validateEventStep(EMPTY_EVENT_FORM, 0, false)), ["title"]);
});

test("[SPM-37 Resume & submit] submitting an existing draft saves its latest fields before submitting", async () => {
  const calls = [];
  const request = async (...args) => calls.push(args);
  await submitEventRequest(request, 42, { title: "Updated forum" }, "unused-key");

  assert.deepEqual(calls.map(([path, init]) => [path, init.method]), [
    ["/events/42/draft", "PUT"],
    ["/events/42/submit", "PUT"],
  ]);
  assert.equal(JSON.parse(calls[0][1].body).isAutoSave, false);
  assert.equal(JSON.parse(calls[1][1].body).title, "Updated forum");
});
