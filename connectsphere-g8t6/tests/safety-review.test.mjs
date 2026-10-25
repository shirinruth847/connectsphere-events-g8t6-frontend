import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECISION_STEP,
  EMPTY_DECISION_FORM,
  REVIEW_STEPS,
  SAFETY_FACTORS,
  completedFactorCount,
  describeSafetyError,
  factorStep,
  firstErrorStep,
  formFromRound,
  officerRoundState,
  roundStatusPresentation,
  toDecisionPayload,
  toProgressPayload,
  validateChecklist,
  validateDecision,
} from '../lib/safety-review.ts';
import { isSignupAccountType, validateSignup } from '../lib/signup.ts';

const satisfactory = Object.fromEntries(SAFETY_FACTORS.map((factor) => [factor, { result: 'SATISFACTORY', comment: null }]));
const form = (patch = {}) => ({ ...EMPTY_DECISION_FORM, ...patch });

test('[SPM-243 AC7] six factors, each assessed on exactly one step', () => {
  assert.deepEqual([...SAFETY_FACTORS], ['attendanceCapacity', 'layout', 'emergencyAccess', 'accessibility', 'equipmentPlacement', 'venueRestrictions']);
  assert.equal(REVIEW_STEPS.length, 5);
  assert.deepEqual(REVIEW_STEPS.flatMap((step) => step.factors).sort(), [...SAFETY_FACTORS].sort());
  assert.equal(factorStep('attendanceCapacity'), 0);
  assert.equal(factorStep('emergencyAccess'), 1);
  assert.equal(factorStep('equipmentPlacement'), 2);
  assert.equal(DECISION_STEP, 4);
});

test('[SPM-243 AC7 / TC-10] a comment is required unless the result is satisfactory', () => {
  const checklist = { ...satisfactory, layout: { result: 'NOT_SATISFACTORY', comment: '  ' }, accessibility: { result: 'NOT_APPLICABLE', comment: 'No needs requested' } };
  assert.deepEqual(validateChecklist(checklist, { complete: true }), { 'checklist.layout': 'Explain the result in a comment.' });
  const { layout, ...missingLayout } = satisfactory;
  void layout;
  assert.deepEqual(validateChecklist(missingLayout, { complete: true }), { 'checklist.layout': 'Record a result for this factor.' });
  // Saving progress accepts a partial checklist.
  assert.deepEqual(validateChecklist({ layout: { result: 'NOT_SATISFACTORY', comment: '' } }, { complete: false }), {});
  assert.equal(completedFactorCount(checklist), 5);
  assert.equal(completedFactorCount(checklist, ['layout', 'emergencyAccess']), 1);
});

test('[SPM-243 AC8 / TC-13] approval is refused while a factor is not satisfactory', () => {
  const checklist = { ...satisfactory, emergencyAccess: { result: 'NOT_SATISFACTORY', comment: 'Fire exit blocked' } };
  assert.equal(validateDecision(form({ outcome: 'APPROVED' }), checklist).outcome, 'A factor is not satisfactory, so the round cannot be approved.');
  assert.deepEqual(validateDecision(form({ outcome: 'APPROVED' }), satisfactory), {});
  assert.equal(validateDecision(form(), satisfactory).outcome, 'Choose an outcome.');
});

test('[SPM-243 AC9 / AC10 / TC-16] changes and rejections need their details', () => {
  assert.equal(validateDecision(form({ outcome: 'CHANGES_REQUESTED', requestedChanges: ['  '] }), satisfactory).requestedChanges, 'List at least one change.');
  assert.deepEqual(validateDecision(form({ outcome: 'CHANGES_REQUESTED', requestedChanges: ['Add stewards', ''] }), satisfactory), {});
  assert.equal(validateDecision(form({ outcome: 'REJECTED' }), satisfactory).rejectedBookings, 'Name at least one venue booking and why it is unsuitable.');
  assert.deepEqual(validateDecision(form({ outcome: 'REJECTED', rejectedBookings: { 7: ' ' } }), satisfactory), { 'rejectedBookings.7': 'Explain why this booking is unsuitable.' });
});

test('[SPM-243 AC8-AC10] decision payloads carry only what the outcome allows', () => {
  const drafted = form({ requestedChanges: ['Add stewards'], rejectedBookings: { 9: 'Too small', 3: ' Blocked exit ' }, organiserComment: ' Looks good ', internalNotes: '' });
  const approved = toDecisionPayload({ ...drafted, outcome: 'APPROVED' }, satisfactory, 4);
  assert.deepEqual(Object.keys(approved).sort(), ['arrangementVersion', 'checklist', 'organiserComment', 'outcome']);
  assert.equal(approved.organiserComment, 'Looks good');
  assert.deepEqual(toDecisionPayload({ ...drafted, outcome: 'CHANGES_REQUESTED' }, satisfactory, 4).requestedChanges, ['Add stewards']);
  const rejected = toDecisionPayload({ ...drafted, outcome: 'REJECTED' }, satisfactory, 4);
  assert.deepEqual(rejected.rejectedBookings, [{ bookingId: 3, reason: 'Blocked exit' }, { bookingId: 9, reason: 'Too small' }]);
  assert.equal(rejected.requestedChanges, undefined);
  assert.deepEqual(rejected.checklist.layout, { result: 'SATISFACTORY', comment: null });
});

test('[SPM-243 TC-11] saved progress round-trips into the form', () => {
  const progress = toProgressPayload({ layout: { result: 'NOT_APPLICABLE', comment: ' Standing only ' }, accessibility: { result: null, comment: '' } }, form({ requestedChanges: ['', ' Move stage '], internalNotes: 'Check again' }));
  assert.deepEqual(progress, {
    checklist: { layout: { result: 'NOT_APPLICABLE', comment: 'Standing only' } },
    organiserComment: null,
    internalNotes: 'Check again',
    requestedChanges: ['Move stage'],
  });
  const restored = formFromRound({ checklist: progress.checklist, organiserComment: null, internalNotes: 'Check again', requestedChanges: ['Move stage'] });
  assert.deepEqual(restored.checklist, progress.checklist);
  assert.deepEqual(restored.form.requestedChanges, ['Move stage']);
  assert.deepEqual(formFromRound({ checklist: null, organiserComment: null, internalNotes: null, requestedChanges: null }).form.requestedChanges, ['']);
});

test('[SPM-243 AC2 / TC-07] the controls follow how the officer stands to the round', () => {
  const rounds = [
    { status: 'CHANGES_REQUESTED', claimedBy: 5 },
    { status: 'OPEN', claimedBy: 8 },
  ];
  assert.equal(officerRoundState(rounds[1], 8), 'claimed-by-me');
  assert.equal(officerRoundState(rounds[1], 5), 'claimed-by-other');
  assert.equal(officerRoundState({ ...rounds[1], claimedBy: null }, 5), 'awaiting-claim');
  assert.equal(officerRoundState(rounds[0], 5), 'decided');
  assert.equal(officerRoundState({ ...rounds[1], status: 'SUPERSEDED' }, 8), 'closed');
});

test('[SPM-243 AC11 / TC-18 / TC-20] refusals explain themselves and say when to reload', () => {
  const superseded = describeSafetyError({ status: 409, code: 'ARRANGEMENTS_CHANGED' });
  assert.equal(superseded.reload, true);
  assert.match(superseded.message, /returned to planning/);
  const mongo = describeSafetyError({ status: 503, code: 'VENUE_DETAILS_UNAVAILABLE' });
  assert.equal(mongo.reload, false);
  assert.match(mongo.message, /try again/i);
  assert.equal(describeSafetyError({ status: 403, code: 'NOT_CLAIMANT' }).reload, true);
  const factors = describeSafetyError({ status: 409, code: 'SAFETY_FACTOR_NOT_SATISFACTORY', details: { factors: ['layout'] } });
  assert.ok(factors.fields['checklist.layout']);
  assert.equal(firstErrorStep(factors.fields), 1);
  assert.equal(firstErrorStep({ requestedChanges: 'List at least one change.' }), DECISION_STEP);
  assert.equal(firstErrorStep({}), null);
  assert.equal(describeSafetyError({ status: 500, message: 'Boom' }).message, 'Boom');
});

test('[SPM-243 TC-02] sign-up never offers the Safety Officer role', () => {
  assert.equal(isSignupAccountType('SAFETY_OFFICER'), false);
  assert.ok(validateSignup({ accountType: 'SAFETY_OFFICER', name: 'Sam', email: 'sam@example.com', password: 'Analytical1' }).accountType);
});

test('[SPM-251] round statuses map to design-system categories', () => {
  assert.equal(roundStatusPresentation('APPROVED').tone, 'success');
  assert.match(roundStatusPresentation('APPROVED').description, /not confirmed until/);
  assert.equal(roundStatusPresentation('REJECTED').tone, 'error');
  assert.match(roundStatusPresentation('REJECTED').description, /not rejected/);
  assert.equal(roundStatusPresentation('SUPERSEDED').tone, 'neutral');
  assert.equal(roundStatusPresentation('SOMETHING_NEW').label, 'SOMETHING NEW');
});
