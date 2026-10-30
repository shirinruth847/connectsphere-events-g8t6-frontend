import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCK_NOTE_LIMIT,
  LENGTHEN_MESSAGE,
  validateBlockForm,
  validateShortenForm,
} from '../components/venue-staff/venue-management/venue-block-rules.ts';

// SPM-195 block form checks (AC2, AC9, TC-02, TC-13). The backend stays authoritative.
const NOW = new Date('2030-03-01T00:00:00.000Z');
const valid = {
  reason: 'MAINTENANCE',
  start: '2030-03-10T05:00:00.000Z',
  end: '2030-03-10T07:00:00.000Z',
  note: 'Air conditioning repair',
};

test('[SPM-195-AC2] a complete block in the future has no errors', () => {
  assert.deepEqual(validateBlockForm(valid, NOW), {});
});

test('[SPM-195-TC-02] reason, times and note are required', () => {
  assert.deepEqual(Object.keys(validateBlockForm({ reason: '', start: null, end: null, note: '  ' }, NOW)).sort(), ['end', 'note', 'reason', 'start']);
});

test('[SPM-195-TC-02] the end must be after the start and in the future', () => {
  assert.equal(validateBlockForm({ ...valid, end: valid.start }, NOW).end, 'The end must be after the start');
  assert.equal(
    validateBlockForm({ ...valid, start: '2030-02-01T00:00:00.000Z', end: '2030-02-01T01:00:00.000Z' }, NOW).end,
    'The end must be in the future',
  );
  // A block may already have started, as long as it ends later.
  assert.deepEqual(validateBlockForm({ ...valid, start: '2030-02-28T00:00:00.000Z' }, NOW), {});
});

test('the note is limited to the backend limit', () => {
  assert.ok(validateBlockForm({ ...valid, note: 'x'.repeat(BLOCK_NOTE_LIMIT + 1) }, NOW).note);
  assert.deepEqual(validateBlockForm({ ...valid, note: 'x'.repeat(BLOCK_NOTE_LIMIT) }, NOW), {});
});

test('[SPM-195-AC9] shortening moves the start later or the end earlier', () => {
  const block = { start: valid.start, end: valid.end };
  assert.deepEqual(validateShortenForm(block, { start: valid.start, end: '2030-03-10T06:00:00.000Z' }), {});
  assert.deepEqual(validateShortenForm(block, { start: '2030-03-10T06:00:00.000Z', end: valid.end }), {});
  assert.match(validateShortenForm(block, { start: valid.start, end: valid.end }).end, /shorten/);
});

test('[SPM-195-TC-13] a longer block is refused with the new-block message', () => {
  const block = { start: valid.start, end: valid.end };
  assert.equal(validateShortenForm(block, { start: valid.start, end: '2030-03-10T08:00:00.000Z' }).end, LENGTHEN_MESSAGE);
  assert.equal(validateShortenForm(block, { start: '2030-03-10T04:00:00.000Z', end: valid.end }).end, LENGTHEN_MESSAGE);
  assert.equal(validateShortenForm(block, { start: '2030-03-10T06:00:00.000Z', end: '2030-03-10T06:00:00.000Z' }).end, 'The end must be after the start');
});
