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
