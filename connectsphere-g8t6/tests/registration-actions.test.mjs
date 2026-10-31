import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionErrorPresentation, actionSuccessMessage, openOffer, placeActions, placeLabel } from '../components/attendee/registration-actions/registration-action-rules.ts';

const NOW = new Date('2026-10-30T00:00:00Z');
const FUTURE = '2026-11-05T01:00:00.000Z';
const place = (registration, overrides = {}) => ({ registration, startDatetime: FUTURE, attendeeStatus: 'CONFIRMED', ...overrides });
const offer = (expiresAt) => ({ offerId: 7, expiresAt });

test('[SPM-163 AC3] a waitlist place shows its position, never "Waitlisted"', () => {
  assert.equal(placeLabel({ status: 'WAITLISTED', waitlistPosition: 3 }), 'On the waitlist · Position 3');
  assert.equal(placeLabel({ status: 'WAITLISTED' }), 'On the waitlist');
  assert.equal(placeLabel({ status: 'REGISTERED', waitlistPosition: null }), 'Registered');
});

test('[SPM-163 AC4] a waitlisted attendee without an offer can leave the waitlist', () => {
  assert.deepEqual(placeActions(place({ status: 'WAITLISTED', waitlistPosition: 2, offer: null }), NOW), ['leave']);
});

test('[SPM-163 AC5-AC7] an open offer shows Accept Slot and Decline until its deadline', () => {
  const open = { status: 'WAITLISTED', waitlistPosition: 1, offer: offer('2026-10-30T12:00:00.000Z') };
  assert.deepEqual(placeActions(place(open), NOW), ['accept', 'decline']);
  assert.deepEqual(openOffer(open, NOW), open.offer);
  // Past its deadline by the browser clock: not offered; the backend refuses a late answer anyway.
  const late = { ...open, offer: offer('2026-10-29T23:59:59.000Z') };
  assert.equal(openOffer(late, NOW), null);
  assert.deepEqual(placeActions(place(late), NOW), ['leave']);
  // Only a waitlist place can hold an offer.
  assert.equal(openOffer({ status: 'REGISTERED', offer: open.offer }, NOW), null);
});

test('cancelled, completed and withdrawn places, and registrations, have no waitlist actions', () => {
  for (const attendeeStatus of ['CANCELLED', 'COMPLETED']) {
    assert.deepEqual(placeActions(place({ status: 'REGISTERED' }, { attendeeStatus }), NOW), []);
    assert.deepEqual(placeActions(place({ status: 'WAITLISTED' }, { attendeeStatus }), NOW), []);
  }
  assert.deepEqual(placeActions(place({ status: 'WITHDRAWN' }), NOW), []);
  assert.deepEqual(placeActions(place({ status: 'REGISTERED' }), NOW), []);
});

test('each 409 has a clear message and asks the attendee to look again', () => {
  const conflict = (code) => actionErrorPresentation({ status: 409, code, message: 'backend text' });
  assert.deepEqual(conflict('OFFER_EXPIRED'), { message: 'This offer has expired.', retryable: false });
  for (const code of ['ALREADY_REGISTERED', 'ALREADY_WAITLISTED', 'PLACES_AVAILABLE', 'REGISTRATION_CLOSED', 'NOT_WAITLISTED', 'OFFER_NOT_OPEN', 'REGISTRATION_FULL', 'EVENT_NOT_ACTIVE']) {
    assert.notEqual(conflict(code).message, 'backend text', code);
    assert.equal(conflict(code).retryable, false, code);
  }
  assert.equal(conflict('IDEMPOTENCY_IN_PROGRESS').retryable, true);
  assert.equal(conflict('SOMETHING_NEW').retryable, false);
});

test('network and server failures can be retried; access and missing offers cannot', () => {
  assert.deepEqual(actionErrorPresentation({ status: 0, code: 'NETWORK_ERROR', message: 'Could not reach the backend.' }), { message: 'Could not reach the backend.', retryable: true });
  assert.equal(actionErrorPresentation({ status: 500, code: 'INTERNAL_ERROR', message: 'x' }).retryable, true);
  assert.equal(actionErrorPresentation({ status: 403, code: 'FORBIDDEN', message: 'x' }).retryable, false);
  assert.equal(actionErrorPresentation({ status: 404, code: 'OFFER_NOT_FOUND', message: 'x' }).message, 'This offer is no longer available.');
});

test('success messages name the event', () => {
  assert.equal(actionSuccessMessage('accept', 'Tech Fair'), "You're registered for Tech Fair.");
  assert.equal(actionSuccessMessage('leave', 'Tech Fair'), 'You left the waitlist for Tech Fair.');
  assert.equal(actionSuccessMessage('decline', 'Tech Fair'), 'You declined the place for Tech Fair and left its waitlist.');
});
