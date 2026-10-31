import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_EVENT_FORM, toPayload, formValuesFromEvent, validateEventStep, amendedFields } from '../lib/events.ts';
import { requestCalendar, resizeWithin } from '../components/venues/availability-calendar-model.ts';

const at = (time, day = '2026-12-01') => new Date(`${day}T${time}:00+08:00`).toISOString();
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
  assert.equal(payload.venuePreferences[1].requestedStart, new Date('2026-12-01T13:00').toISOString());
  assert.equal(payload.venuePreferences[1].requestedEnd, new Date('2026-12-01T15:00').toISOString());
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
  assert.equal(new Date(values.venueTimes[2].start).toISOString(), '2026-12-01T05:00:00.000Z');
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

test('[SPM-76 AC4] a dragged edge stays inside the event and at least 15 minutes from the other edge', () => {
  const bounds = { start: at('09:00'), end: at('18:00') };
  const current = { start: at('13:00'), end: at('15:00') };
  assert.deepEqual(resizeWithin(current, bounds, 'end', Date.parse(at('19:30'))), { start: current.start, end: at('18:00') });
  assert.deepEqual(resizeWithin(current, bounds, 'start', Date.parse(at('07:00'))), { start: at('09:00'), end: current.end });
  assert.deepEqual(resizeWithin(current, bounds, 'start', Date.parse(at('16:00'))), { start: at('14:45'), end: current.end });
  assert.deepEqual(resizeWithin(current, bounds, 'end', Date.parse(at('14:00'))), { start: current.start, end: at('14:00') });
});

test('[SPM-76 AC3][TC3] the organiser calendar shows busy periods by kind and the requested time, red only where checked overlaps', () => {
  const data = {
    from: at('00:00'), to: at('00:00', '2026-12-02'),
    venue: {
      venueId: 7, name: 'Hall', operatingHours: '08:00-22:00', setupMinutes: 30, turnaroundMinutes: 30, buffersRecorded: true,
      busyPeriods: [{ type: 'BOOKING', label: 'Unavailable – booking', occupiedStart: at('09:30'), occupiedEnd: at('12:30') }],
      check: {
        start: at('11:00'), end: at('13:00'), occupiedStart: at('10:30'), occupiedEnd: at('13:30'),
        availability: 'UNAVAILABLE_BOOKING', availabilityLabel: 'Unavailable – booking',
        conflicts: [{ type: 'BOOKING', label: 'Unavailable – booking', occupiedStart: at('09:30'), occupiedEnd: at('12:30') }],
        operatingHoursWarning: null,
      },
    },
  };
  const window = (start, end) => `${start}–${end}`;
  const range = { date: '2026-12-01', days: 1 };
  const checked = requestCalendar(data, range, { label: 'Your requested time', requested: { start: at('11:00'), end: at('13:00') }, formatWindow: window });
  assert.equal(checked.lanes[0].events.length, 1);
  assert.match(checked.lanes[0].events[0].title, /^Unavailable – booking/);
  const conflict = checked.overlays.find((overlay) => overlay.tone === 'conflict');
  assert.deepEqual([conflict.start, conflict.end], [at('10:30'), at('12:30')]);

  const dragged = requestCalendar(data, range, { label: 'Your requested time', requested: { start: at('14:00'), end: at('16:00') }, formatWindow: window });
  const request = dragged.overlays.find((overlay) => overlay.tone === 'request');
  assert.deepEqual([request.start, request.end], [at('14:00'), at('16:00')]);
  assert.equal(dragged.overlays.some((overlay) => overlay.tone === 'conflict'), false);
});

test("[SPM-76] the organiser's other venues show in their own lane, without busy-period details", () => {
  const data = {
    from: at('00:00'), to: at('00:00', '2026-12-02'),
    venue: { venueId: 7, name: 'Hall', operatingHours: null, setupMinutes: 0, turnaroundMinutes: 0, buffersRecorded: true, busyPeriods: [], check: null },
  };
  const { lanes } = requestCalendar(data, { date: '2026-12-01', days: 1 }, {
    label: 'Your requested time',
    requested: { start: at('09:00'), end: at('18:00') },
    otherChoices: [{ label: 'Your choice 2: Breakout', start: at('13:00'), end: at('15:00') }],
    formatWindow: (start, end) => `${start}–${end}`,
  });
  assert.equal(lanes.length, 2);
  assert.equal(lanes[1].name, 'Your other venues');
  assert.match(lanes[1].events[0].title, /^Your choice 2: Breakout/);
});
