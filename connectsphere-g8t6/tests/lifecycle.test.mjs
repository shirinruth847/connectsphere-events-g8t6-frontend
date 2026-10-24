import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeLifecycleRefusal, keepsIdempotencyKey, lifecycleActionsFor, showsReadiness } from '../lib/lifecycle-actions.ts';

const NOW = Date.parse('2027-05-01T12:00:00Z');
const actions = (status, end = '2027-05-02T00:00:00Z', ready = true) =>
  lifecycleActionsFor(status, end, ready, NOW).map(({ action, disabledReason }) => [action, disabledReason === null]);

test('[SPM-173 AC9-AC12] each status offers only its next coordinator actions', () => {
  assert.deepEqual(actions('PLANNING'), [['submitForSafetyReview', true]]);
  assert.deepEqual(actions('SAFETY_REVIEW'), [['confirm', true]]);
  assert.deepEqual(actions('CONFIRMED'), [['startPreparation', true], ['complete', false]]);
  assert.deepEqual(actions('PREPARATION'), [['complete', false]]);
  for (const status of ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'AWAITING_CLARIFICATION', 'COMPLETED', 'REJECTED', 'CANCELLED', 'APPROVED']) {
    assert.deepEqual(actions(status), [], status);
  }
});

test('[SPM-173 AC8] submit and confirm wait for a loaded, passing readiness check', () => {
  assert.deepEqual(actions('PLANNING', null, false), [['submitForSafetyReview', false]]);
  assert.deepEqual(actions('SAFETY_REVIEW', null, false), [['confirm', false]]);
  assert.deepEqual(actions('PLANNING', null, null), [['submitForSafetyReview', false]]);
  assert.deepEqual(actions('SAFETY_REVIEW', null, null), [['confirm', false]]);
  assert.equal(lifecycleActionsFor('PLANNING', null, null, NOW)[0].disabledReason, 'Available once readiness has loaded.');
  // Readiness does not gate the later steps.
  assert.deepEqual(actions('CONFIRMED', '2027-05-01T00:00:00Z', null), [['startPreparation', true], ['complete', true]]);
  assert.equal(showsReadiness('PLANNING'), true);
  assert.equal(showsReadiness('CONFIRMED'), false);
});

test('[SPM-173 TC-21 / TC-24] completion is offered only after the end', () => {
  assert.deepEqual(actions('PREPARATION', '2027-05-01T12:00:00Z'), [['complete', true]]);
  assert.deepEqual(actions('PREPARATION', '2027-05-01T12:00:01Z'), [['complete', false]]);
});

test('[SPM-173 AC3 / AC9] refusals are explained, with readiness items when given', () => {
  const failures = [{ code: 'NO_PRIMARY_VENUE', message: 'Choose one approved venue booking as the primary venue.' }];
  assert.deepEqual(describeLifecycleRefusal({ code: 'READINESS_BLOCKED', message: 'x', details: { failures } }).failures, failures);
  assert.match(describeLifecycleRefusal({ code: 'SAFETY_APPROVAL_REQUIRED' }).message, /safety approval/);
  assert.equal(
    describeLifecycleRefusal({ code: 'TRANSITION_NOT_ALLOWED', message: 'This action is not allowed while the event is in COMPLETED.' }).message,
    'This action is not allowed while the event is in COMPLETED.',
  );
  assert.match(describeLifecycleRefusal({ code: 'EVENT_VERSION_CONFLICT' }).message, /changed/);
});

test('[SPM-173] each refusal keeps its exact wording', () => {
  const message = (error) => describeLifecycleRefusal(error).message;
  const backend = { message: 'Backend wording.' };
  assert.equal(message({ code: 'READINESS_BLOCKED', ...backend }), 'The event is not ready yet. Resolve these items, then try again.');
  assert.equal(message({ code: 'SAFETY_APPROVAL_REQUIRED', ...backend }), 'The event needs a safety approval for its current arrangements before you can confirm it.');
  assert.equal(message({ code: 'EVENT_NOT_ENDED', ...backend }), 'The event can be completed only after it has ended.');
  assert.equal(message({ code: 'EVENT_VERSION_CONFLICT', ...backend }), 'This event changed after you opened it. Review the latest details, then try again.');
  assert.equal(message({ code: 'TRANSITION_NOT_ALLOWED' }), "This action is not allowed in the event's current status.");
  assert.equal(message({ code: 'TRANSITION_NOT_ALLOWED', message: '' }), "This action is not allowed in the event's current status.");
  assert.equal(message({ code: 'FORBIDDEN', ...backend }), 'Backend wording.');
  assert.equal(message({ code: 'constructor' }), 'The action could not be completed. Try again.');
  assert.equal(message({}), 'The action could not be completed. Try again.');
  assert.deepEqual(describeLifecycleRefusal({ code: 'EVENT_NOT_ENDED', details: { failures: 'x' } }).failures, []);
});

test('[SPM-173 AC5] a retry after an ambiguous failure reuses the key; a refusal does not', () => {
  // The action may have committed before the response failed.
  assert.equal(keepsIdempotencyKey(null), true);
  assert.equal(keepsIdempotencyKey({ status: 0, code: 'NETWORK_ERROR' }), true);
  assert.equal(keepsIdempotencyKey({ status: 500, code: 'INTERNAL_ERROR' }), true);
  assert.equal(keepsIdempotencyKey({ status: 503 }), true);
  assert.equal(keepsIdempotencyKey({ status: 408 }), true);
  assert.equal(keepsIdempotencyKey({ status: 429 }), true);
  assert.equal(keepsIdempotencyKey({ status: 409, code: 'IDEMPOTENCY_IN_PROGRESS' }), true);
  // The backend refused, so nothing was applied.
  for (const [status, code] of [[400, 'VALIDATION_FAILED'], [403, 'TRANSITION_NOT_ALLOWED'], [404, 'EVENT_NOT_FOUND'],
    [409, 'EVENT_VERSION_CONFLICT'], [409, 'READINESS_BLOCKED'], [409, 'SAFETY_APPROVAL_REQUIRED'], [409, 'IDEMPOTENCY_KEY_REUSED']]) {
    assert.equal(keepsIdempotencyKey({ status, code }), false, code);
  }
});
