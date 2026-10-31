import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_EVENT_FORM, formValuesFromEvent, localDateTimeToIso, toLocalDateTimeInput, toPayload, validateEventStep } from '../lib/events.ts';

// Node applies a TZ change at once, so each zone stands in for a browser in it.
const zones = ['UTC', 'America/New_York', 'Asia/Singapore'];

test('[SPM-35 / all times SGT] a typed 10:00 is sent as 10:00 SGT in any browser time zone', () => {
  const original = process.env.TZ;
  try {
    for (const zone of zones) {
      process.env.TZ = zone;
      assert.equal(localDateTimeToIso('2030-03-10T10:00'), '2030-03-10T10:00:00+08:00', zone);
      assert.equal(Date.parse(localDateTimeToIso('2030-03-10T10:00')), Date.parse('2030-03-10T02:00:00Z'), zone);
      const payload = toPayload({ ...EMPTY_EVENT_FORM, title: 'SGT check', startDatetime: '2030-03-10T10:00', endDatetime: '2030-03-10T12:00' });
      assert.deepEqual([payload.startDatetime, payload.endDatetime], ['2030-03-10T10:00:00+08:00', '2030-03-10T12:00:00+08:00'], zone);
      // Stored 02:00Z shows back as 10:00 for drafts and amendments.
      assert.equal(toLocalDateTimeInput('2030-03-10T02:00:00.000Z'), '2030-03-10T10:00', zone);
      assert.equal(formValuesFromEvent({ title: 'x', startDatetime: '2030-03-10T02:00:00.000Z', endDatetime: '2030-03-10T04:00:00Z' }).endDatetime, '2030-03-10T12:00', zone);
    }
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});

test('[SPM-35] the 48-hour lead time and end-after-start checks use Singapore time', () => {
  const now = Date.parse('2030-03-08T02:00:00Z'); // 10:00 SGT on 8 March
  const values = (start, end) => ({ ...EMPTY_EVENT_FORM, startDatetime: start, endDatetime: end, expectedAttendance: '10' });
  assert.equal(validateEventStep(values('2030-03-10T09:59', '2030-03-10T12:00'), 1, true, now).startDatetime, 'Event date must be at least 48 hours in advance.');
  assert.equal(validateEventStep(values('2030-03-10T10:00', '2030-03-10T12:00'), 1, true, now).startDatetime, undefined);
  assert.equal(validateEventStep(values('2030-03-10T10:00', '2030-03-10T10:00'), 1, true, now).endDatetime, 'End time must be after start time.');
  assert.equal(localDateTimeToIso('not a date'), undefined);
});
