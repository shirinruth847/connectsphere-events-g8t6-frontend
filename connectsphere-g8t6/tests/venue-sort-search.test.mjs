import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingFilterQuery,
  formatBookingId,
  openedStorageKey,
  parseOpenedRecord,
  recordOpened,
  lastAccessedAt,
  sortByLastAccessed,
} from '../components/venue-staff/booking-requests/booking-filters.ts';
import { managedVenueQuery } from '../components/venues/venue-queries.ts';
import { availabilityOverlays, calendarRange, civilDate, toCalendarLanes } from '../components/venues/availability-calendar-model.ts';

// ---------- My Requests (SPM-181 follow-up) ----------

test('[TC-VENUE-181-30] the default sort (request status, pending first) sends no sort parameters', () => {
  assert.equal(bookingFilterQuery({ sort: 'default', order: 'asc' }), '');
});

test('[SPM-186] the request status sort sends only the descending order', () => {
  assert.equal(bookingFilterQuery({ sort: 'default', order: 'desc' }), '?order=desc');
});

test('[TC-VENUE-181-31] search, sort and order are sent; a blank search is not', () => {
  assert.equal(bookingFilterQuery({ q: '  grand hall ', sort: 'attendance', order: 'desc' }), '?q=grand+hall&sort=attendance&order=desc');
  assert.equal(bookingFilterQuery({ q: '   ', sort: 'date', order: 'asc' }), '?sort=date');
});

test('[TC-VENUE-181-32] should_send_the_default_order_when_sorting_by_last_accessed_in_the_browser', () => {
  assert.equal(bookingFilterQuery({ sort: 'lastAccessed', order: 'desc', status: 'PENDING' }), '?status=PENDING');
});

test('[TC-VENUE-181-42] should_never_send_an_event_filter_when_one_is_given', () => {
  assert.equal(bookingFilterQuery({ eventId: '442', venueId: '45' }), '?venueId=45');
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

test('[TC-VENUE-181-36] should_take_the_later_of_opened_and_edited_as_last_accessed', () => {
  const edited = '2026-10-20T00:00:00.000Z';
  assert.equal(lastAccessedAt({ bookingId: 1, updatedAt: edited }, { 1: Date.parse('2026-10-25T00:00:00Z') }), Date.parse('2026-10-25T00:00:00Z'));
  assert.equal(lastAccessedAt({ bookingId: 1, updatedAt: edited }, { 1: Date.parse('2026-10-01T00:00:00Z') }), Date.parse(edited));
  assert.equal(lastAccessedAt({ bookingId: 1, updatedAt: edited }, {}), Date.parse(edited));
  assert.equal(lastAccessedAt({ bookingId: 1, updatedAt: null }, {}), null);
  assert.equal(lastAccessedAt({ bookingId: 1, updatedAt: 'not a date' }, { 1: 5 }), 5);
});

test('[TC-VENUE-181-43] should_sort_most_recently_accessed_first_and_unknown_last_when_sorting_by_last_accessed', () => {
  const items = [
    { bookingId: 1, updatedAt: null },
    { bookingId: 2, updatedAt: '2026-10-10T00:00:00.000Z' },
    { bookingId: 3, updatedAt: null },
    { bookingId: 4, updatedAt: '2026-10-01T00:00:00.000Z' },
  ];
  const record = { 4: Date.parse('2026-10-30T00:00:00Z') };
  assert.deepEqual(sortByLastAccessed(items, record, 'desc').map((item) => item.bookingId), [4, 2, 1, 3]);
  assert.deepEqual(sortByLastAccessed(items, record, 'asc').map((item) => item.bookingId), [2, 4, 1, 3]);
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
    title: 'Confirmed booking · REQ-000442',
    purpose: undefined,
    startDatetime: '2026-11-04T01:30:00.000Z',
    endDatetime: '2026-11-04T04:45:00.000Z',
    coordinatorId: 45,
    status: 'Confirmed booking',
    requestId: 'REQ-000442',
  });
  // SPM-186: the event's name replaces the label when the viewer may see it.
  assert.equal(lanes[0].events[1].title, 'Masterclass');
  assert.equal(lanes[0].events[1].purpose, 'Masterclass');
  assert.equal(lanes[1].events[0].title, 'Operational block · Maintenance');
  assert.equal(refs.get(3).venueName, 'Seminar Centre');
  assert.equal(refs.size, 3);
});

test('[SPM-186] each entry is labelled with its event and its start and end', () => {
  const entry = {
    entryId: 'x', type: 'BOOKING', status: 'APPROVED', label: 'Confirmed booking', blocking: true,
    start: '2026-11-04T02:00:00.000Z', end: '2026-11-04T04:00:00.000Z',
    occupiedStart: '2026-11-04T01:30:00.000Z', occupiedEnd: '2026-11-04T04:45:00.000Z',
    bookingId: 110, eventId: 442, requestId: 'REQ-000442', eventTitle: 'Planning forum',
    holdExpiresAt: null, reason: null, reasonLabel: null, note: null, operatingHoursWarning: null,
  };
  const { lanes } = toCalendarLanes({ from: 'a', to: 'b', venues: [{ venueId: 45, name: 'Grand Hall', entries: [entry] }] }, (start, end) => `${start}/${end}`);
  assert.equal(lanes[0].events[0].title, 'Planning forum · 2026-11-04T02:00:00.000Z/2026-11-04T04:00:00.000Z');
});

test('[SPM-74][SPM-72 AC6] the calendar shades the request, its overlaps and the hours every venue is closed', () => {
  const venue = (overrides) => ({ venueId: 1, name: 'Hall', operatingHours: '08:00-22:00', entries: [{ entryId: 'booking-9', label: 'Confirmed booking' }], check: null, ...overrides });
  const check = {
    start: '2026-11-20T02:00:00.000Z', end: '2026-11-20T04:00:00.000Z',
    occupiedStart: '2026-11-20T01:30:00.000Z', occupiedEnd: '2026-11-20T04:45:00.000Z',
    availabilityLabel: 'Unavailable – booking', operatingHoursWarning: null,
    conflicts: [{ entryId: 'booking-9', occupiedStart: '2026-11-20T00:30:00.000Z', occupiedEnd: '2026-11-20T02:30:00.000Z' }],
  };
  const format = { label: 'REQ-000042', formatWindow: (start, end) => `${start}/${end}`, formatTimes: () => '10:00–12:00' };
  const overlays = availabilityOverlays({ venues: [venue({ check }), venue({ venueId: 2, operatingHours: '09:00-23:00', check: null })] }, { date: '2026-11-20', days: 1 }, format);

  // Closed only while both venues are: before 08:00 and from 23:00, Singapore time.
  assert.deepEqual(overlays.filter((item) => item.tone === 'closed').map(({ start, end }) => [start, end]), [
    ['2026-11-19T16:00:00.000Z', '2026-11-20T00:00:00.000Z'],
    ['2026-11-20T15:00:00.000Z', '2026-11-20T16:00:00.000Z'],
  ]);
  const request = overlays.find((item) => item.tone === 'request');
  assert.equal(request.label, 'REQ-000042 · 10:00–12:00');
  assert.match(request.detail, /Hall: Unavailable – booking/);
  assert.match(request.detail, /Overlaps Confirmed booking/);
  // Red where the occupied time (09:30–12:45) meets the booking (08:30–10:30).
  assert.deepEqual(overlays.filter((item) => item.tone === 'conflict').map(({ start, end }) => [start, end]), [['2026-11-20T01:30:00.000Z', '2026-11-20T02:30:00.000Z']]);

  // Hours not recorded for one venue: nothing is greyed out.
  assert.equal(availabilityOverlays({ venues: [venue({ operatingHours: null })] }, { date: '2026-11-20', days: 7 }, format).length, 0);
});
