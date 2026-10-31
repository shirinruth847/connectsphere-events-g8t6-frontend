import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdCountdown } from '../lib/hold-countdown.ts';
import { holdDraft, newDraft, toRequestItems } from '../components/venues/event-venue-options/venue-booking-form-model.ts';

// SPM-188 AC8: the countdown on a hold that expires within 24 hours.
const EXPIRES = '2030-03-08T06:00:00.000Z';
const before = (ms) => Date.parse(EXPIRES) - ms;
const HOUR = 60 * 60 * 1000;

test('[SPM-188-AC8] a hold within 24 hours shows whole hours left, rounded down', () => {
  assert.equal(holdCountdown(EXPIRES, before(6 * HOUR)), 'Hold expires in 6 hours');
  assert.equal(holdCountdown(EXPIRES, before(6 * HOUR + 59 * 60 * 1000)), 'Hold expires in 6 hours');
  assert.equal(holdCountdown(EXPIRES, before(24 * HOUR)), 'Hold expires in 24 hours');
  assert.equal(holdCountdown(EXPIRES, before(HOUR)), 'Hold expires in 1 hour');
});

test('[SPM-188-AC8] under an hour shows minutes, never zero', () => {
  assert.equal(holdCountdown(EXPIRES, before(45 * 60 * 1000)), 'Hold expires in 45 minutes');
  assert.equal(holdCountdown(EXPIRES, before(1000)), 'Hold expires in 1 minute');
});

test('[SPM-188-AC8] no countdown beyond 24 hours, at or after expiry, or without an expiry', () => {
  assert.equal(holdCountdown(EXPIRES, before(24 * HOUR + 1)), null);
  assert.equal(holdCountdown(EXPIRES, Date.parse(EXPIRES)), null);
  assert.equal(holdCountdown(EXPIRES, Date.parse(EXPIRES) + 1), null);
  assert.equal(holdCountdown(null, 0), null);
  assert.equal(holdCountdown('not a date', 0), null);
});

// SPM-188 AC9: confirming a hold starts the booking form from the hold.
const EVENT = {
  startDatetime: '2030-03-10T01:00:00.000Z',
  endDatetime: '2030-03-10T09:00:00.000Z',
  expectedAttendance: 150,
  preferredLayoutType: 'THEATRE',
  accessibilityNeeds: [],
};
const HOLD = {
  venueId: 7,
  venueName: 'Synthetic Hall',
  label: 'Keynote hall',
  start: '2030-03-10T02:00:00.000Z',
  end: '2030-03-10T04:00:00.000Z',
  expectedAttendance: 120,
  hold: { holdId: '6720a1b2c3d4e5f60718293a' },
};

test("[SPM-188-AC9] a hold's section takes the hold's venue, times, label and attendance", () => {
  const draft = holdDraft('h1', EVENT, HOLD, { venueId: 7, name: 'Synthetic Hall' });
  assert.equal(draft.venueId, 7);
  assert.equal(draft.label, 'Keynote hall');
  assert.equal(draft.labelEdited, true);
  assert.equal(draft.start, '2030-03-10T10:00');
  assert.equal(draft.end, '2030-03-10T12:00');
  assert.equal(draft.expectedAttendance, '120');
  assert.equal(draft.holdId, '6720a1b2c3d4e5f60718293a');
});

test("[SPM-188-AC9] a hold without attendance uses the event's, and the request names the hold", () => {
  const draft = holdDraft('h2', EVENT, { ...HOLD, expectedAttendance: null }, null);
  assert.equal(draft.expectedAttendance, '150');
  const [item] = toRequestItems([draft], false);
  assert.equal(item.holdId, '6720a1b2c3d4e5f60718293a');
  assert.equal(item.start, '2030-03-10T02:00:00.000Z');
  assert.equal(item.end, '2030-03-10T04:00:00.000Z');
});

test('[SPM-188-AC9] an ordinary booking sends no holdId', () => {
  const [item] = toRequestItems([newDraft('n1', EVENT, { venueId: 7, name: 'Synthetic Hall' })], false);
  assert.equal('holdId' in item, false);
});

test('[SPM-188-AC9] confirmation preserves second and millisecond precision through display and submission', () => {
  const precise = { ...HOLD, start: '2030-03-10T02:00:30.125Z', end: '2030-03-10T04:00:45.789Z' };
  const draft = holdDraft('precise', EVENT, precise, null);
  assert.equal(draft.start, '2030-03-10T10:00:30.125');
  assert.equal(draft.end, '2030-03-10T12:00:45.789');
  const [item] = toRequestItems([draft], false);
  assert.equal(item.start, precise.start);
  assert.equal(item.end, precise.end);
});
