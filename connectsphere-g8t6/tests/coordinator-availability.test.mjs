import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftCalendarMonth, coordinatorConflicts } from '../lib/coordinator-availability.ts';

test('[SPM-174] month navigation clamps dates without skipping short months',()=>{
 for(const [input,delta,expected] of [
  [[2026,9,31],1,[2026,10,30]], [[2026,2,31],-1,[2026,1,28]],
  [[2028,2,31],-1,[2028,1,29]], [[2026,11,31],1,[2027,0,31]],
 ]) {
  const original=new Date(...input);const result=shiftCalendarMonth(original,delta);
  assert.deepEqual([result.getFullYear(),result.getMonth(),result.getDate()],expected);
  assert.equal(original.getDate(),input[2]);
 }
});
test('[SPM-174] availability compares instants, permits adjacency and excludes the current event',()=>{
 const event={eventId:1,startDatetime:'2027-01-01T10:00:00+08:00',endDatetime:'2027-01-01T12:00:00+08:00'};
 const coordinator={events:[
  {...event,status:'PLANNING'},
  {eventId:2,status:'PLANNING',startDatetime:'2027-01-01T04:00:00Z',endDatetime:'2027-01-01T05:00:00Z'},
  {eventId:3,status:'PLANNING',startDatetime:'2027-01-01T03:59:59Z',endDatetime:'2027-01-01T05:00:00Z'},
  {eventId:4,status:'CANCELLED',startDatetime:'2027-01-01T02:00:00Z',endDatetime:'2027-01-01T04:00:00Z'},
 ]};
 assert.deepEqual(coordinatorConflicts(event,coordinator).map(e=>e.eventId),[3]);
});
