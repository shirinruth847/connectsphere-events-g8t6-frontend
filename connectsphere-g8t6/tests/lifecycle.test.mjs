import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeLifecycleRefusal, lifecycleActionsFor, showsReadiness } from '../lib/lifecycle-actions.ts';

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

test('[SPM-173 AC8] submit and confirm wait for readiness; unknown readiness does not block', () => {
  assert.deepEqual(actions('PLANNING', null, false), [['submitForSafetyReview', false]]);
  assert.deepEqual(actions('SAFETY_REVIEW', null, false), [['confirm', false]]);
  assert.deepEqual(actions('PLANNING', null, null), [['submitForSafetyReview', true]]);
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
