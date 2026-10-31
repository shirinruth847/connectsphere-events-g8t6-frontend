import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentScheduleMonth,
  isScheduleMonth,
  scheduleDayLabel,
  scheduleMonthLabel,
  scheduleQuery,
  scheduleRange,
  scheduleTimeLabel,
  shiftScheduleMonth,
} from '../lib/equipment-schedule.ts';

test('[SPM-287 schedule] the month is the Singapore month and moves by one', () => {
  // 31 Jan 2030 20:00 UTC is already 1 Feb in Singapore.
  assert.equal(currentScheduleMonth(new Date('2030-01-31T20:00:00Z')), '2030-02');
  assert.equal(shiftScheduleMonth('2030-01', -1), '2029-12');
  assert.equal(shiftScheduleMonth('2030-12', 1), '2031-01');
  assert.equal(isScheduleMonth('2030-13'), false);
  assert.equal(isScheduleMonth('2030-03'), true);
});

test('[SPM-287 schedule] a month is requested as its first and last date', () => {
  assert.deepEqual(scheduleRange('2030-02'), { from: '2030-02-01', to: '2030-02-28' });
  assert.deepEqual(scheduleRange('2032-02'), { from: '2032-02-01', to: '2032-02-29' });
  assert.equal(scheduleQuery('2030-03'), '?from=2030-03-01&to=2030-03-31');
});

test('[SPM-287 schedule] dates and times read in Singapore time', () => {
  assert.equal(scheduleMonthLabel('2030-03'), 'March 2030');
  assert.equal(scheduleDayLabel('2030-03-10'), 'Sun, 10 Mar 2030');
  assert.equal(scheduleTimeLabel('2030-03-10', '2030-03-10T01:00:00.000Z', '2030-03-10T09:00:00.000Z'), '09:00–17:00 SGT');
  // An overnight event names the other date on the side that is not this one.
  assert.equal(scheduleTimeLabel('2030-03-11', '2030-03-10T14:00:00.000Z', '2030-03-11T02:00:00.000Z'), 'Sun, 10 Mar 2030 22:00–10:00 SGT');
  assert.equal(scheduleTimeLabel('2030-03-10', null, null), 'Time not set');
});
