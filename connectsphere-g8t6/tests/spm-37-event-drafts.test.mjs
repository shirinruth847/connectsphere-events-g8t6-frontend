import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_EVENT_FORM, validateEventStep } from "../lib/events.ts";

test("[SPM-37 Manual save] a title-only event is valid to save as a draft", () => {
  const withTitle = { ...EMPTY_EVENT_FORM, title: "SMU Alumni Gala 2026" };

  assert.deepEqual(validateEventStep(withTitle, 0, false), {});
  assert.deepEqual(Object.keys(validateEventStep(EMPTY_EVENT_FORM, 0, false)), ["title"]);
});
