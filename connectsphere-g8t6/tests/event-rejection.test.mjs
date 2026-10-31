import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rejectionReasonError } from '../lib/event-rejection.ts';

test('[SPM-40] blank and nine characters fail; ten characters pass', () => {
  assert.equal(rejectionReasonError('  '), 'Rejection notes are required');
  assert.match(rejectionReasonError('123456789'), /at least 10/);
  assert.equal(rejectionReasonError(' 1234567890 '), null);
});
test('[SPM-40] character limits match PostgreSQL Unicode character counting', () => {
  assert.equal(rejectionReasonError('😀'.repeat(10)), null);
  assert.equal(rejectionReasonError('a'.repeat(2000)), null);
  assert.ok(rejectionReasonError('a'.repeat(2001)));
  assert.ok(rejectionReasonError('1234567890\0'));
});
