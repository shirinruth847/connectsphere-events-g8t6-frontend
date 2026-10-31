import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_EVENT_FORM, toPayload, formValuesFromEvent, validateEventStep, amendedFields } from '../lib/events.ts';
import { ORGANISER_VENUE_PAGE_SIZES, showMoreCount } from '../components/venues/event-venue-options/venue-option-model.ts';

const form = (overrides = {}) => ({
  ...EMPTY_EVENT_FORM,
  title: 'Forum',
  startDatetime: '2026-12-01T09:00',
  endDatetime: '2026-12-01T18:00',
  venuePreferences: [1, 2],
  ...overrides,
});

test('[SPM-76 TC1] a narrowed choice is sent with its time; a whole-event choice as its ID', () => {
  const payload = toPayload(form({ venueTimes: { 2: { start: '2026-12-01T13:00', end: '2026-12-01T15:00' } } }));
  assert.equal(payload.venuePreferences[0], 1);
  assert.equal(payload.venuePreferences[1].venueId, 2);
  // Typed times are Singapore times, whatever the browser's time zone.
  assert.equal(payload.venuePreferences[1].requestedStart, '2026-12-01T13:00:00+08:00');
  assert.equal(payload.venuePreferences[1].requestedEnd, '2026-12-01T15:00:00+08:00');
});

test("[SPM-76 TC1] a saved draft restores each choice's time", () => {
  const values = formValuesFromEvent({
    eventId: 9, requestId: 'REQ-000009', statusLabel: 'Draft', title: 'Forum',
    venuePreferences: [1, 2],
    venuePreferenceTimes: [
      { venueId: 1, requestedStart: null, requestedEnd: null },
      { venueId: 2, requestedStart: '2026-12-01T05:00:00.000Z', requestedEnd: '2026-12-01T07:00:00.000Z' },
    ],
  });
  assert.deepEqual(Object.keys(values.venueTimes), ['2']);
  assert.deepEqual(values.venueTimes[2], { start: '2026-12-01T13:00', end: '2026-12-01T15:00' });
});

test('[SPM-76 TC2][TC4] a time outside the event or ending before it starts is an error on the venue step', () => {
  assert.equal(validateEventStep(form({ venueTimes: { 2: { start: '2026-12-01T13:00', end: '2026-12-01T15:00' } } }), 2).venuePreferences, undefined);
  assert.match(validateEventStep(form({ venueTimes: { 2: { start: '2026-12-01T17:00', end: '2026-12-01T19:00' } } }), 2).venuePreferences, /within the event/);
  assert.match(validateEventStep(form({ endDatetime: '2026-12-01T14:00', venueTimes: { 2: { start: '2026-12-01T13:00', end: '2026-12-01T15:00' } } }), 2).venuePreferences, /within the event/);
  assert.match(validateEventStep(form({ venueTimes: { 2: { start: '2026-12-01T15:00', end: '2026-12-01T13:00' } } }), 2).venuePreferences, /end after the start/);
});

test("[SPM-76] changing only a choice's time is an amendment", () => {
  const before = form();
  const after = form({ venueTimes: { 1: { start: '2026-12-01T10:00', end: '2026-12-01T12:00' } } });
  assert.ok('venuePreferences' in amendedFields(before, after));
});

test('[SPM-76 AC2][TC2] the organiser list shows 10 at first, or 20, 50 or 100, and Show more adds a page', () => {
  assert.deepEqual([...ORGANISER_VENUE_PAGE_SIZES], [10, 20, 50, 100]);
  assert.equal(showMoreCount(10, 21, 10), 10);
  assert.equal(showMoreCount(20, 21, 20), 1);
  assert.equal(showMoreCount(21, 21, 20), 0);
});
