import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingFilterQuery } from '../components/venue-staff/booking-requests/booking-filters.ts';

test('[SPM-181 AC5] no filters send no query', () => {
  assert.equal(bookingFilterQuery({}), '');
  assert.equal(bookingFilterQuery({ status: '', venueId: '', eventId: '', date: '' }), '');
});

// The event filter was removed at the developer's request (21 Oct 2026); events
// are found through the search instead (title or REQ- reference).
test('[SPM-181 AC5] status and venue filters are passed through', () => {
  assert.equal(bookingFilterQuery({ status: 'PENDING', venueId: '45' }), '?status=PENDING&venueId=45');
  assert.equal(bookingFilterQuery({ q: 'REQ-000442' }), '?q=REQ-000442');
});

test('[SPM-181 AC5] a date filter is the whole Singapore day, across month ends', () => {
  const params = new URLSearchParams(bookingFilterQuery({ date: '2026-11-30' }));
  assert.equal(params.get('from'), '2026-11-30T00:00:00+08:00');
  assert.equal(params.get('to'), '2026-12-01T00:00:00+08:00');
  assert.equal(bookingFilterQuery({ date: '30/11/2026' }), '');
});

test('[developer request 1 Nov 2026] My Requests shows one card per event, pending first, with every venue and the earliest respond-by time', async () => {
  const { groupBookingsByEvent } = await import('../components/venue-staff/booking-requests/booking-filters.ts');
  const event = { eventId: 442, startDatetime: '2026-11-04T00:00:00.000Z', endDatetime: '2026-11-04T08:00:00.000Z' };
  const booking = (bookingId, status, venueName, extra = {}) => ({
    bookingId, status, statusLabel: status, venueName, label: null,
    startDatetime: '2026-11-04T01:00:00.000Z', endDatetime: '2026-11-04T03:00:00.000Z', decideBy: null, event, ...extra,
  });
  const groups = groupBookingsByEvent([
    booking(110, 'APPROVED', 'Main Hall'),
    booking(120, 'PENDING', 'Other Event Hall', { event: { eventId: 450, startDatetime: null, endDatetime: null } }),
    booking(111, 'PENDING', 'Room B', { decideBy: '2026-11-03T05:00:00.000Z' }),
    booking(112, 'PENDING', 'Room C', { decideBy: '2026-11-02T05:00:00.000Z' }),
    booking(113, 'PENDING', 'Room B'),
  ]);
  assert.equal(groups.length, 2);
  const [first, second] = groups;
  assert.equal(first.event.eventId, 442);
  assert.equal(first.lead.bookingId, 111);
  assert.deepEqual(first.venues, ['Main Hall', 'Room B', 'Room C']);
  assert.equal(first.decideBy, '2026-11-02T05:00:00.000Z');
  assert.deepEqual([first.start, first.end], [event.startDatetime, event.endDatetime]);
  // Without the event's own times, the card spans its bookings.
  assert.deepEqual([second.start, second.end], ['2026-11-04T01:00:00.000Z', '2026-11-04T03:00:00.000Z']);
});
