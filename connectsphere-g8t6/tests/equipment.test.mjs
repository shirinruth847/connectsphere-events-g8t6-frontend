import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_EQUIPMENT_FORM,
  EMPTY_UNAVAILABILITY_FORM,
  EQUIPMENT_MESSAGES,
  equipmentQuery,
  toSingaporeInput,
  toSingaporeInstant,
  unavailableShare,
  validateEquipmentForm,
  validateUnavailabilityForm,
} from '../lib/equipment.ts';
import { canViewPath } from '../lib/auth.ts';

const projector = { ...EMPTY_EQUIPMENT_FORM, name: 'Laser Projector', category: 'Visual', storageLocation: 'Store Room B', totalQuantity: '4' };

test('[SPM-52 TC-16] list filters are trimmed and empty ones dropped', () => {
  assert.equal(equipmentQuery({}), '');
  assert.equal(equipmentQuery({ search: ' MIC ', category: 'Audio', status: 'INACTIVE' }), '?search=MIC&category=Audio&status=INACTIVE');
  assert.equal(equipmentQuery({ search: '', category: '', status: '' }, 50), '?offset=50');
});

test('[SPM-52 TC-01] a complete item is valid; details are optional', () => {
  assert.deepEqual(validateEquipmentForm(projector), {});
});

test('[SPM-52 TC-02] missing name and quantity use the backend wording', () => {
  const errors = validateEquipmentForm({ ...projector, name: ' ', totalQuantity: '' });
  assert.equal(errors.name, 'Name is required');
  assert.equal(errors.totalQuantity, 'Total quantity is required');
});

test('[SPM-52 TC-03] total quantity must be a whole number of 0 or more', () => {
  for (const value of ['-1', '1.5', 'ten']) {
    assert.equal(validateEquipmentForm({ ...projector, totalQuantity: value }).totalQuantity, EQUIPMENT_MESSAGES.totalQuantityInvalid, value);
  }
  for (const value of ['0', '1']) assert.deepEqual(validateEquipmentForm({ ...projector, totalQuantity: value }), {}, value);
});

test('[SPM-52 AC6] an edit checks only the fields being saved', () => {
  const legacy = { ...projector, storageLocation: '' };
  assert.deepEqual(validateEquipmentForm(legacy, ['totalQuantity']), {});
  assert.equal(validateEquipmentForm(legacy, ['storageLocation']).storageLocation, 'Storage location is required');
});

test('[SPM-52 AC8] Singapore datetime-local values become instants with an offset and back', () => {
  assert.equal(toSingaporeInstant('2026-11-02T09:00'), '2026-11-02T09:00:00+08:00');
  assert.equal(toSingaporeInstant('2026-11-02'), '');
  assert.equal(toSingaporeInput('2026-11-02T01:00:00+00:00'), '2026-11-02T09:00');
  assert.equal(toSingaporeInput('not a date'), '');
});

const NOW = new Date('2026-11-01T00:00:00Z');
const period = { quantity: '3', reason: 'DAMAGED', startsAt: '2026-11-02T09:00', endsAt: '2026-11-02T10:00', note: 'Cracked lens' };

test('[SPM-52 AC8] a complete future period is valid', () => {
  assert.deepEqual(validateUnavailabilityForm(period, NOW), {});
});

test('[SPM-52 TC-10] an end before the start, or already passed, is refused', () => {
  assert.equal(validateUnavailabilityForm({ ...period, endsAt: '2026-11-02T08:00' }, NOW).endsAt, 'End must be after the start');
  assert.equal(validateUnavailabilityForm({ ...period, startsAt: '2026-10-01T09:00', endsAt: '2026-10-01T10:00' }, NOW).endsAt, 'End must be in the future');
});

test('[SPM-52 AC8] quantity, reason and note are required', () => {
  const errors = validateUnavailabilityForm({ ...EMPTY_UNAVAILABILITY_FORM, startsAt: period.startsAt, endsAt: period.endsAt }, NOW);
  assert.deepEqual(Object.keys(errors).sort(), ['note', 'quantity', 'reason']);
  assert.equal(validateUnavailabilityForm({ ...period, quantity: '0' }, NOW).quantity, 'Quantity must be a whole number greater than 0');
});

test('[SPM-52 AC5] the unavailable share is bounded and safe for zero stock', () => {
  assert.equal(unavailableShare(3, 5), 60);
  assert.equal(unavailableShare(7, 5), 100);
  assert.equal(unavailableShare(0, 0), 0);
});

test('[SPM-52 AC1] only Technical Support may open the equipment pages', () => {
  for (const path of ['/equipment', '/equipment/12']) {
    assert.equal(canViewPath('TECH_SUPPORT', path), true, path);
    for (const role of ['ORGANISER', 'COORDINATOR', 'COORDINATOR_LEAD', 'VENUE_STAFF', 'ATTENDEE']) assert.equal(canViewPath(role, path), false, `${role} ${path}`);
  }
  assert.equal(canViewPath('TECH_SUPPORT', '/equipment/abc'), false);
});
