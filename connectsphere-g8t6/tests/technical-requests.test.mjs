import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  availabilityQuery,
  availabilityWindow,
  equipmentAvailabilityErrors,
  itemFieldErrors,
  itemsSummary,
  equipmentLabel,
  withEquipmentNames,
  lineQuantityProblems,
  rejectionReasonProblem,
  technicalRequestQuery,
  technicalStatusLabel,
  unavailableItems,
  visibleHistoryChanges,
} from '../lib/technical-requests.ts';
import { canViewPath } from '../lib/auth.ts';

const projector = { equipmentId: 1, name: 'Projector', category: 'Visual', description: null, totalQuantity: 10, availableQuantity: 3 };
const microphone = { equipmentId: 2, name: 'Microphone', category: 'Audio', description: null, totalQuantity: 6, availableQuantity: 6 };
const windowed = { window: { start: '2026-11-20T01:00:00.000Z', end: '2026-11-20T03:00:00.000Z' }, note: null, equipment: [projector, microphone] };
const stockOnly = { window: null, note: "Availability is confirmed once the event's date and time are chosen.", equipment: [{ ...projector, availableQuantity: 10 }, microphone] };

test('[SPM-286 AC1][AC2] the window is sent only when both ends are valid and in order', () => {
  // Sent in Singapore time with its offset, whatever form the instant arrives in (all times SGT).
  assert.equal(availabilityQuery('2026-11-20T01:00:00.000Z', '2026-11-20T03:00:00.000Z'), '?start=2026-11-20T09%3A00%3A00%2B08%3A00&end=2026-11-20T11%3A00%3A00%2B08%3A00');
  assert.equal(availabilityQuery('2026-11-20T09:00:00+08:00', '2026-11-20T11:00:00+08:00'), '?start=2026-11-20T09%3A00%3A00%2B08%3A00&end=2026-11-20T11%3A00%3A00%2B08%3A00');
  assert.equal(availabilityQuery('2026-11-20T09:00:00+08:00', null), '');
  assert.equal(availabilityQuery(null, null), '');
  assert.equal(availabilityQuery('not a date', '2026-11-20T11:00:00+08:00'), '');
  assert.equal(availabilityWindow('2026-11-20T11:00:00Z', '2026-11-20T09:00:00Z'), null);
});

test('[SPM-286 AC3] a quantity above what is available is refused per line', () => {
  const lines = [{ equipmentId: 1, quantity: 4 }, { equipmentId: 2, quantity: 6 }, { equipmentId: 99, quantity: 50 }];
  assert.deepEqual(lineQuantityProblems(lines, windowed), { 0: "Only 3 Projector available for the event's time." });
  assert.deepEqual(equipmentAvailabilityErrors(lines, windowed), { equipmentRequirements: 'Reduce the highlighted equipment quantities to what is available.' });
  assert.deepEqual(equipmentAvailabilityErrors([{ equipmentId: 1, quantity: 3 }], windowed), {});
  // Without dates the limit is the stock (AC2).
  assert.deepEqual(lineQuantityProblems([{ equipmentId: 1, quantity: 11 }], stockOnly), { 0: 'Only 10 Projector in stock.' });
  assert.deepEqual(lineQuantityProblems(lines, null), {});
});

test('[SPM-286 AC6][AC7] refusals name the line and the quantity still available', () => {
  assert.deepEqual(itemFieldErrors({ 'items[1].quantity': 'Quantity must be a whole number of 1 or more.', items: 'x', 'items[0].equipmentId': 'Choose a catalogue item for each line, once.' }), {
    1: 'Quantity must be a whole number of 1 or more.',
    0: 'Choose a catalogue item for each line, once.',
  });
  assert.deepEqual(unavailableItems({ items: [{ equipmentId: 1, name: 'Projector', requested: 4, available: 3 }, null] }), [{ equipmentId: 1, name: 'Projector', requested: 4, available: 3 }]);
  assert.deepEqual(unavailableItems({}), []);
  assert.equal(itemsSummary([{ equipmentId: 1, name: 'Projector', quantity: 2 }, { equipmentId: 5, quantity: 1 }]), 'Projector × 2, Equipment #5 × 1');
});

test('[SPM-286] a save response with null equipment names takes the names already known', () => {
  const saved = [{ equipmentId: 1, name: null, category: null, quantity: 2 }, { equipmentId: 2, name: null, quantity: 1 }, { equipmentId: 9, name: null, quantity: 1 }];
  const named = withEquipmentNames(saved, [{ equipmentId: 1, name: 'Old projector' }], [projector, microphone]);
  assert.deepEqual(named.map(equipmentLabel), ['Old projector', 'Microphone', 'Equipment #9']);
  assert.equal(named[0].quantity, 2);
  assert.equal(withEquipmentNames([{ equipmentId: 1, name: 'Kept', quantity: 1 }], [projector])[0].name, 'Kept');
});

test('[SPM-287 AC1][AC2] the dashboard query drops empty filters and pages by offset', () => {
  assert.equal(technicalRequestQuery({}), '?limit=24');
  assert.equal(technicalRequestQuery({ status: 'PENDING', search: '  gala ' }, 24), '?status=PENDING&search=gala&limit=24&offset=24');
  assert.equal(technicalStatusLabel('REJECTED'), 'Rejected');
  assert.equal(technicalStatusLabel('PARTIALLY_FULFILLED'), 'Partially fulfilled');
});

test('[SPM-287 AC5] a rejection needs a reason of at most 1,000 characters', () => {
  assert.equal(rejectionReasonProblem('   '), 'Enter a reason for rejecting this request.');
  assert.equal(rejectionReasonProblem('x'.repeat(1001)), 'The reason must be 1000 characters or fewer.');
  assert.equal(rejectionReasonProblem('Projectors are booked for another event.'), null);
});

test('[SPM-287] only Technical Support open a technical request', () => {
  assert.equal(canViewPath('TECH_SUPPORT', '/technical-requests/7'), true);
  for (const role of ['ORGANISER', 'COORDINATOR', 'VENUE_STAFF', 'ATTENDEE']) assert.equal(canViewPath(role, '/technical-requests/7'), false, role);
  assert.equal(canViewPath('TECH_SUPPORT', '/technical-requests/abc'), false);
  assert.equal(canViewPath('TECH_SUPPORT', '/equipment/schedule'), true);
  for (const role of ['ORGANISER', 'COORDINATOR', 'VENUE_STAFF']) assert.equal(canViewPath(role, '/equipment/schedule'), false, role);
});

test('[SPM-286/287] history shows the technical request status by label and hides empty diffs', () => {
  const changes = visibleHistoryChanges([
    { field: 'technicalRequestStatus', before: 'PENDING', after: 'APPROVED', label: 'Technical request', beforeLabel: 'Pending', afterLabel: 'Approved' },
    // The earlier shape: a bare id key and a status object.
    { field: 'technicalRequestId', before: null, after: null },
    { field: 'technicalRequest', before: null, after: 'PENDING' },
    { field: 'title', before: 'Old', after: 'New' },
    { field: 'purpose', before: '', after: null },
  ]);
  assert.deepEqual(changes.map((change) => [change.label ?? change.field, change.beforeLabel ?? null, change.afterLabel ?? null]), [
    ['Technical request', 'Pending', 'Approved'],
    ['Technical request', null, 'Pending'],
    ['title', null, null],
  ]);
  assert.equal(visibleHistoryChanges([{ field: 'technicalRequestId', before: null, after: 7 }])[0].afterLabel, 'Request #7');
});
