import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarDate, calendarDayBounds, overlapsCalendarDay, shiftCalendarMonth } from '../lib/coordinator-calendar.ts';

test('[SPM-177] month navigation clamps January 31 and leap-year February', () => {
  assert.equal(shiftCalendarMonth(new Date(2030,0,31),1).getMonth(),1);
  assert.equal(shiftCalendarMonth(new Date(2030,0,31),1).getDate(),28);
  assert.equal(shiftCalendarMonth(new Date(2032,0,31),1).getDate(),29);
  assert.equal(shiftCalendarMonth(new Date(2030,2,31),-1).getDate(),28);
});
test('[SPM-177] overnight events occupy both Singapore days, excluding the exact end boundary', () => {
  const day=new Date(2030,0,31);
  assert.equal(overlapsCalendarDay('2030-01-30T23:00+08:00','2030-01-31T01:00+08:00',day),true);
  assert.equal(overlapsCalendarDay('2030-01-30T23:00+08:00','2030-01-31T00:00+08:00',day),false);
  assert.equal(overlapsCalendarDay('2030-01-31T00:00+08:00','2030-01-31T01:00+08:00',day),true);
  assert.equal(overlapsCalendarDay('invalid','2030-01-31T01:00+08:00',day),false);
  assert.equal(calendarDayBounds(day).start,Date.parse('2030-01-31T00:00+08:00'));
});
test('[SPM-177] Singapore civil dates follow the event instant across UTC midnight', () => {
  const day=calendarDate(new Date('2030-01-30T17:00:00Z'));
  assert.deepEqual([day.getFullYear(),day.getMonth(),day.getDate()],[2030,0,31]);
});
