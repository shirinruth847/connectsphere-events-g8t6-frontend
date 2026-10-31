import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionErrorPresentation, actionSuccessMessage, openOffer, orderMyEvents, placeActions, placeLabel } from '../components/attendee/registration-actions/registration-action-rules.ts';

const place = (registration, overrides = {}) => ({ registration, attendeeStatus: 'CONFIRMED', ...overrides });
const offer = (expiresAt) => ({ offerId: 7, expiresAt });

// Runs fn with Date.now() and new Date() reading `iso`, as a skewed browser clock would.
function withBrowserClock(iso, fn) {
  const RealDate = Date;
  const fixed = new RealDate(iso).getTime();
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed; }
  };
  try { return fn(); } finally { globalThis.Date = RealDate; }
}

test('[SPM-163 AC3] a waitlist place shows its backend position, never "Waitlisted"', () => {
  assert.equal(placeLabel({ status: 'WAITLISTED', waitlistPosition: 3 }), 'On the waitlist · Position 3');
  assert.equal(placeLabel({ status: 'WAITLISTED' }), 'On the waitlist');
  assert.equal(placeLabel({ status: 'WAITLISTED', waitlistPosition: null }), 'On the waitlist');
  assert.equal(placeLabel({ status: 'REGISTERED', waitlistPosition: null }), 'Registered');
});

test('[SPM-163 AC4] a waitlisted attendee without an offer can leave the waitlist', () => {
  assert.deepEqual(placeActions(place({ status: 'WAITLISTED', waitlistPosition: 2, offer: null })), ['leave']);
});

test('[SPM-163 AC5-AC7] an open offer from the backend shows Accept Slot and Decline', () => {
  const open = { status: 'WAITLISTED', waitlistPosition: 1, offer: offer('2026-10-30T12:00:00.000Z') };
  assert.deepEqual(placeActions(place(open)), ['accept', 'decline']);
  assert.deepEqual(openOffer(open), open.offer);
  // Only a waitlist place can hold an offer.
  assert.equal(openOffer({ status: 'REGISTERED', offer: open.offer }), null);
  // Once the backend omits it (answered, cancelled or expired), Leave Waitlist is back.
  assert.deepEqual(placeActions(place({ ...open, offer: null })), ['leave']);
});

test('[SPM-163] a browser clock past the offer deadline does not hide an offer the backend still returns', () => {
  const open = { status: 'WAITLISTED', waitlistPosition: 1, offer: offer('2026-10-30T12:00:00.000Z') };
  withBrowserClock('2026-11-02T00:00:00.000Z', () => {
    assert.deepEqual(openOffer(open), open.offer);
    assert.deepEqual(placeActions(place(open)), ['accept', 'decline']);
  });
});

test('[SPM-147 AC1, AC5] Withdraw Registration is offered on a registered place whatever the browser clock says', () => {
  const registered = { status: 'REGISTERED', offer: null };
  assert.deepEqual(placeActions(place(registered)), ['withdraw']);
  // A browser clock years ahead: the backend decides (EVENT_STARTED), not the clock.
  withBrowserClock('2099-01-01T00:00:00.000Z', () => assert.deepEqual(placeActions(place(registered)), ['withdraw']));
});

test('cancelled, completed and withdrawn places have no actions', () => {
  for (const attendeeStatus of ['CANCELLED', 'COMPLETED']) {
    assert.deepEqual(placeActions(place({ status: 'REGISTERED' }, { attendeeStatus })), []);
    assert.deepEqual(placeActions(place({ status: 'WAITLISTED', offer: offer('2026-10-30T12:00:00.000Z') }, { attendeeStatus })), []);
  }
  assert.deepEqual(placeActions(place({ status: 'WITHDRAWN' })), []);
});

test('each 409 has a clear message and asks the attendee to look again', () => {
  const conflict = (code) => actionErrorPresentation({ status: 409, code, message: 'backend text' });
  assert.deepEqual(conflict('OFFER_EXPIRED'), { message: 'This offer has expired.', retryable: false });
  assert.deepEqual(conflict('OFFER_NOT_OPEN'), { message: 'This offer has already been answered.', retryable: false });
  assert.equal(conflict('EVENT_STARTED').message, 'Cannot withdraw registration for past events');
  assert.equal(conflict('EVENT_NOT_ACTIVE').message, 'This event is no longer going ahead.');
  for (const code of ['ALREADY_REGISTERED', 'ALREADY_WAITLISTED', 'PLACES_AVAILABLE', 'REGISTRATION_CLOSED', 'NOT_WAITLISTED', 'OFFER_NOT_OPEN', 'REGISTRATION_FULL', 'NOT_REGISTERED', 'EVENT_NOT_ACTIVE']) {
    assert.notEqual(conflict(code).message, 'backend text', code);
    assert.equal(conflict(code).retryable, false, code);
  }
  assert.equal(conflict('IDEMPOTENCY_IN_PROGRESS').retryable, true);
  assert.equal(conflict('SOMETHING_NEW').retryable, false);
  assert.equal(conflict('SOMETHING_NEW').message, 'Your place has changed since this page loaded. Close this and check its latest status.');
});

test('[SPM-163] the newer backend codes have their own message, not the generic one', () => {
  const conflict = (code) => actionErrorPresentation({ status: 409, code, message: 'backend text' });
  assert.deepEqual(conflict('REGISTRATION_NOT_YET_OPEN'), { message: "Registration for this event hasn't opened yet.", retryable: false });
  assert.deepEqual(conflict('REGISTRATION_UNAVAILABLE'), { message: 'Registration for this event is currently unavailable.', retryable: false });
  // Not retryable with the same key: closing and starting again sends a new one.
  assert.deepEqual(conflict('IDEMPOTENCY_KEY_REUSED'), { message: "This request couldn't be matched to your earlier attempt. Close this and try again.", retryable: false });
  // Availability states are not error codes.
  for (const state of ['NOT_YET_OPEN', 'CLOSED', 'UNAVAILABLE']) {
    assert.equal(conflict(state).message, 'Your place has changed since this page loaded. Close this and check its latest status.', state);
  }
});

test('network and server failures can be retried; access and missing offers cannot', () => {
  assert.deepEqual(actionErrorPresentation({ status: 0, code: 'NETWORK_ERROR', message: 'Could not reach the backend.' }), { message: 'Could not reach the backend.', retryable: true });
  assert.equal(actionErrorPresentation({ status: 500, code: 'INTERNAL_ERROR', message: 'x' }).retryable, true);
  assert.equal(actionErrorPresentation({ status: 500, code: 'INTERNAL_ERROR', message: 'raw detail' }).message, 'Something went wrong on our side. Nothing was changed. Try again.');
  assert.equal(actionErrorPresentation({ status: 403, code: 'FORBIDDEN', message: 'x' }).retryable, false);
  assert.equal(actionErrorPresentation({ status: 404, code: 'OFFER_NOT_FOUND', message: 'x' }).message, 'This offer is no longer available.');
});

test('success messages name the event', () => {
  assert.equal(actionSuccessMessage('accept', 'Tech Fair'), "You're registered for Tech Fair.");
  assert.equal(actionSuccessMessage('leave', 'Tech Fair'), 'You left the waitlist for Tech Fair.');
  assert.equal(actionSuccessMessage('decline', 'Tech Fair'), 'You declined the place for Tech Fair and left its waitlist.');
  assert.equal(actionSuccessMessage('withdraw', 'Tech Fair'), 'Your registration for Tech Fair has been withdrawn.');
});

test('My Events lists events going ahead soonest first, then held-back dates, then cancelled and completed', () => {
  const row = (id, start_datetime, attendee_status = 'CONFIRMED') => ({ id, event: { start_datetime, attendee_status } });
  const rows = [
    row('completed', '2026-09-01T01:00:00Z', 'COMPLETED'),
    row('later', '2026-12-01T01:00:00Z'),
    row('withheld', null, 'PENDING_CONFIRMATION'),
    row('soon', '2026-11-05T01:00:00Z'),
    row('cancelled', '2026-11-01T01:00:00Z', 'CANCELLED'),
    row('bad date', 'not a date'),
  ];
  // Cancelled and completed events are also soonest first among themselves.
  assert.deepEqual(orderMyEvents(rows).map((item) => item.id), ['soon', 'later', 'withheld', 'bad date', 'completed', 'cancelled']);
  // The input is left as the backend returned it.
  assert.equal(rows[0].id, 'completed');
});
