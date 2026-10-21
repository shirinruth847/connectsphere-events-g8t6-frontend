import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingFilterQuery,
  formatBookingId,
  openedStorageKey,
  parseOpenedRecord,
  recordOpened,
  sortByLastOpened,
} from '../components/venue-staff/booking-requests/booking-filters.ts';
import { managedVenueQuery } from '../components/venues/venue-queries.ts';
import { calendarRange, civilDate, toCalendarLanes } from '../components/venues/availability-calendar-model.ts';

// ---------- My Requests (SPM-181 follow-up) ----------

test('[TC-VENUE-181-30] the default sort (pending first) sends no sort parameters', () => {
  assert.equal(bookingFilterQuery({ sort: 'default', order: 'asc' }), '');
});

test('[TC-VENUE-181-31] search, sort and order are sent; a blank search is not', () => {
  assert.equal(bookingFilterQuery({ q: '  grand hall ', sort: 'attendance', order: 'desc' }), '?q=grand+hall&sort=attendance&order=desc');
  assert.equal(bookingFilterQuery({ q: '   ', sort: 'date', order: 'asc' }), '?sort=date');
});

test('[TC-VENUE-181-32] "Last opened" is sorted in the browser, so the server gets the default order', () => {
  assert.equal(bookingFilterQuery({ sort: 'lastOpened', order: 'desc', status: 'PENDING' }), '?status=PENDING');
});

test('[TC-VENUE-181-33] the booking reference is the booking ID', () => {
  assert.equal(formatBookingId(110), 'Booking #110');
});

test('[TC-VENUE-181-34] last-opened records are per user and unreadable storage reads as empty', () => {
  assert.equal(openedStorageKey(7), 'connectsphere:venue-bookings-opened:7');
  assert.deepEqual(parseOpenedRecord(null), {});
  assert.deepEqual(parseOpenedRecord('not json'), {});
  assert.deepEqual(parseOpenedRecord('[1,2]'), {});
  assert.deepEqual(parseOpenedRecord('{"110":5,"abc":6,"111":"x","112":7}'), { 110: 5, 112: 7 });
});

test('[TC-VENUE-181-35] recording an opening keeps the newest 500 entries', () => {
  const record = Object.fromEntries(Array.from({ length: 500 }, (_, index) => [String(index + 1), index + 1]));
  const next = recordOpened(record, 999, 10_000);
  assert.equal(Object.keys(next).length, 500);
  assert.equal(next['999'], 10_000);
  assert.equal(next['1'], undefined);
});

test('[TC-VENUE-181-36] last-opened sort puts the most recent first and never-opened bookings last, in arrival order', () => {
  const items = [{ bookingId: 1 }, { bookingId: 2 }, { bookingId: 3 }, { bookingId: 4 }];
  const record = { 2: 100, 4: 300 };
  assert.deepEqual(sortByLastOpened(items, record, 'desc').map((item) => item.bookingId), [4, 2, 1, 3]);
  assert.deepEqual(sortByLastOpened(items, record, 'asc').map((item) => item.bookingId), [2, 4, 1, 3]);
  assert.deepEqual(items.map((item) => item.bookingId), [1, 2, 3, 4], 'the input is not reordered');
});

// ---------- My Venues ----------

test('[TC-VENUE-181-37] My Venues sends the sort and order, omitting the defaults', () => {
  assert.equal(managedVenueQuery({ search: 'hall', sort: 'setupMinutes', order: 'desc' }), '?search=hall&sort=setupMinutes&order=desc');
  assert.equal(managedVenueQuery({ sort: 'name', order: 'asc' }), '');
});

// ---------- Availability calendar ----------

test('[TC-VENUE-181-38] a month view loads the month with a week either side', () => {
  const range = calendarRange('month', new Date(2026, 10, 15));
  assert.deepEqual(range, { date: '2026-10-25', days: 44 });
  assert.deepEqual(calendarRange('week', new Date(2026, 1, 3)), { date: '2026-01-25', days: 42 });
});

test('[TC-VENUE-181-39] a year view loads the whole year, within the 366-day API limit', () => {
  assert.deepEqual(calendarRange('year', new Date(2028, 5, 1)), { date: '2028-01-01', days: 366 });
  assert.deepEqual(calendarRange('year', new Date(2026, 5, 1)), { date: '2026-01-01', days: 365 });
});

test('[TC-VENUE-181-40] civil dates are formatted from the local fields', () => {
  assert.equal(civilDate(new Date(2026, 0, 5)), '2026-01-05');
});

test('[TC-VENUE-181-41] each venue is a lane and each entry spans its occupied range with the backend label', () => {
  const entry = (overrides) => ({
    entryId: 'x', type: 'BOOKING', status: 'APPROVED', label: 'Confirmed booking', blocking: true,
    start: '2026-11-04T02:00:00.000Z', end: '2026-11-04T04:00:00.000Z',
    occupiedStart: '2026-11-04T01:30:00.000Z', occupiedEnd: '2026-11-04T04:45:00.000Z',
    bookingId: 110, eventId: 442, requestId: 'REQ-000442', eventTitle: null,
    holdExpiresAt: null, reason: null, reasonLabel: null, note: null, operatingHoursWarning: null,
    ...overrides,
  });
  const data = {
    from: 'a', to: 'b',
    venues: [
      { venueId: 45, name: 'Grand Hall', entries: [entry({}), entry({ type: 'HOLD', label: 'Active hold', bookingId: null, requestId: 'REQ-000002', eventTitle: 'Masterclass' })] },
      { venueId: 46, name: 'Seminar Centre', entries: [entry({ type: 'BLOCK', label: 'Operational block', bookingId: null, requestId: null, reasonLabel: 'Maintenance' })] },
    ],
  };

  const { lanes, refs } = toCalendarLanes(data);

  assert.deepEqual(lanes.map((lane) => [lane.coordinatorId, lane.name, lane.events.length]), [[45, 'Grand Hall', 2], [46, 'Seminar Centre', 1]]);
  assert.deepEqual(lanes[0].events[0], {
    eventId: 1,
    title: 'Confirmed booking · Booking #110',
    purpose: undefined,
    startDatetime: '2026-11-04T01:30:00.000Z',
    endDatetime: '2026-11-04T04:45:00.000Z',
    coordinatorId: 45,
    status: 'Confirmed booking',
    requestId: 'REQ-000442',
  });
  assert.equal(lanes[0].events[1].title, 'Active hold · REQ-000002');
  assert.equal(lanes[0].events[1].purpose, 'Masterclass');
  assert.equal(lanes[1].events[0].title, 'Operational block · Maintenance');
  assert.equal(refs.get(3).venueName, 'Seminar Centre');
  assert.equal(refs.size, 3);
});
