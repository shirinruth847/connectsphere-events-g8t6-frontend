import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availabilityQuery, catalogueQuery, managedVenueQuery, venueOptionsQuery } from '../components/venues/venue-queries.ts';
import { eventCalendarCheck, suggestionBlocker } from '../components/venues/event-venue-options/venue-option-model.ts';
import { EMPTY_VENUE_FORM, parseList, validateVenueForm } from '../components/venue-staff/venue-management/venue-form-rules.ts';
import { canViewPath } from '../lib/auth.ts';

test('[SPM-72 search] catalogue filters are trimmed and empty ones dropped', () => {
  assert.equal(catalogueQuery({}), '');
  assert.equal(catalogueQuery({ search: ' Hall ', minCapacity: '', layout: 'Theater' }), '?search=Hall&layout=Theater');
});

test('[SPM-73 TC11] venue management filters and paging', () => {
  assert.equal(managedVenueQuery({ search: 'marina', location: '', status: 'INACTIVE' }), '?search=marina&status=INACTIVE');
  assert.equal(managedVenueQuery({}, 50), '?offset=50');
});

test('[SPM-74] availability covers whole Singapore days and joins venue IDs', () => {
  const params = new URLSearchParams(availabilityQuery({ date: '2026-11-30', days: 2, venueIds: [45, 46] }));
  assert.equal(params.get('from'), '2026-11-30T00:00:00+08:00');
  assert.equal(params.get('to'), '2026-12-02T00:00:00+08:00');
  assert.equal(params.get('venueId'), '45,46');
  assert.equal(params.get('checkStart'), null);
});

test('[SPM-74 TC3] a checked period is sent as Singapore instants; an earlier end time means the next day', () => {
  const same = new URLSearchParams(availabilityQuery({ date: '2026-11-04', days: 1, venueIds: [45], check: { date: '2026-11-04', startTime: '12:45', endTime: '14:00' } }));
  assert.equal(same.get('checkStart'), '2026-11-04T12:45:00+08:00');
  assert.equal(same.get('checkEnd'), '2026-11-04T14:00:00+08:00');
  const overnight = new URLSearchParams(availabilityQuery({ date: '2026-11-04', days: 1, venueIds: [45], check: { date: '2026-11-04', startTime: '22:00', endTime: '02:00' } }));
  assert.equal(overnight.get('checkEnd'), '2026-11-05T02:00:00+08:00');
});

test('[SPM-74] incomplete inputs request nothing', () => {
  assert.equal(availabilityQuery({ date: '', days: 7, venueIds: [1] }), '');
  assert.equal(availabilityQuery({ date: '2026-11-04', days: 0, venueIds: [1] }), '');
});

const valid = { ...EMPTY_VENUE_FORM, name: 'Marina Conference Hall', address: '10 Bayfront Avenue', maxCapacity: '500', contactPerson: 'Alex Tan', contactEmail: 'alex.tan@example.com', contactNumber: '+65 6123 4567' };

test('[SPM-73 TC1] the happy-path venue is valid', () => {
  assert.deepEqual(validateVenueForm(valid), {});
});

test('[SPM-73 TC2] missing name and capacity show the required messages', () => {
  const errors = validateVenueForm({ ...valid, name: ' ', maxCapacity: '' });
  assert.equal(errors.name, 'Venue name is required');
  assert.equal(errors.maxCapacity, 'Capacity is required');
});

test('[SPM-73 TC3/TC4] capacity must be a positive whole number within the maximum', () => {
  for (const value of ['0', '-10', '10.5', 'abc']) assert.equal(validateVenueForm({ ...valid, maxCapacity: value }).maxCapacity, 'Capacity must be a positive whole number', value);
  assert.equal(validateVenueForm({ ...valid, maxCapacity: '1' }).maxCapacity, undefined);
  assert.equal(validateVenueForm({ ...valid, maxCapacity: '100000' }).maxCapacity, undefined);
  assert.equal(validateVenueForm({ ...valid, maxCapacity: '100001' }).maxCapacity, 'Capacity must be 100,000 or fewer');
});

test('[SPM-73 AC] contact details must follow the format, and one is required', () => {
  assert.match(validateVenueForm({ ...valid, contactEmail: 'alex@' }).contactEmail, /valid email/);
  assert.match(validateVenueForm({ ...valid, contactNumber: '12' }).contactNumber, /valid contact number/);
  assert.equal(validateVenueForm({ ...valid, contactEmail: '', contactNumber: '' }).contactNumber, 'Enter a contact number or email');
});

test('[SPM-73 TC7] under maintenance needs a reason; buffers are whole minutes', () => {
  assert.match(validateVenueForm({ ...valid, status: 'UNDER_MAINTENANCE' }).statusReason, /reason/);
  assert.equal(validateVenueForm({ ...valid, setupMinutes: '0', turnaroundMinutes: '45' }).setupMinutes, undefined);
  assert.match(validateVenueForm({ ...valid, setupMinutes: '1441' }).setupMinutes, /whole minutes/);
});

test('detail lists split on commas and new lines', () => {
  assert.deepEqual(parseList('Projector, Stage\nPA , ,'), ['Projector', 'Stage', 'PA']);
});

test('[SPM-73 TC9] only Venue Staff may open venue management pages', () => {
  assert.equal(canViewPath('VENUE_STAFF', '/venues/12'), true);
  for (const role of ['COORDINATOR', 'COORDINATOR_LEAD', 'ORGANISER', 'TECH_SUPPORT', 'ATTENDEE']) assert.equal(canViewPath(role, '/venues/12'), false, role);
});

test('[SPM-72 AC1] /venues is Venue Staff only; coordinators and Leads use the event venue section', () => {
  assert.equal(canViewPath('VENUE_STAFF', '/venues'), true);
  for (const role of ['COORDINATOR', 'COORDINATOR_LEAD', 'ORGANISER', 'TECH_SUPPORT', 'ATTENDEE']) assert.equal(canViewPath(role, '/venues'), false, role);
});

test('[SPM-72 AC3][AC5] venue option queries trim filters, de-duplicate required facilities and omit defaults', () => {
  assert.equal(venueOptionsQuery({}), '');
  assert.equal(venueOptionsQuery({ sort: 'match', order: 'asc' }), '');
  assert.equal(
    venueOptionsQuery({ search: ' Hall ', minCapacity: '200', requiredFacilities: 'Projector, Stage ,, Projector', sort: 'capacity', order: 'desc' }),
    '?search=Hall&minCapacity=200&requiredFacilities=Projector%2CStage&sort=capacity&order=desc',
  );
});

test('[SPM-74 TC3] the calendar opens on the event window in Singapore time', () => {
  assert.deepEqual(eventCalendarCheck('2027-03-10T02:00:00Z', '2027-03-10T04:00:00Z'), { date: '2027-03-10', startTime: '10:00', endTime: '12:00' });
  // 23:30 SGT on 9 March is still the 9th in Singapore.
  assert.deepEqual(eventCalendarCheck('2027-03-09T15:30:00Z', '2027-03-09T17:00:00Z'), { date: '2027-03-09', startTime: '23:30', endTime: '01:00' });
  assert.equal(eventCalendarCheck(null, '2027-03-10T04:00:00Z'), null);
});

test('[SPM-72 AC8] a venue too small for the attendance cannot be selected', () => {
  const venue = (status) => ({ requirements: [{ key: 'capacity', label: 'Capacity', status, detail: '' }] });
  assert.match(suggestionBlocker(venue('UNMET')), /cannot hold/);
  assert.equal(suggestionBlocker(venue('MET')), null);
  assert.equal(suggestionBlocker({ requirements: [] }), null);
});
