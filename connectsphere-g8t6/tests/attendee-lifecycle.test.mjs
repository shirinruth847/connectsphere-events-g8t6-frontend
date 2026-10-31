import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// SPM-289 (Master 5.3, 5.6): the backend decides which lifecycles attendees
// see (published CONFIRMED and PREPARATION) and reports registration as an
// availability state. The attendee code must never gate discovery,
// registration, the waitlist or offers on the event's lifecycle, so lifecycle
// names may not appear in it as code. CONFIRMED appears only as the backend's
// display attendee_status, which is not a lifecycle state.

const root = path.resolve(import.meta.dirname, '..');
const ATTENDEE_SOURCES = [
  'components/attendee',
  'lib/api/discovery.ts',
  'lib/api/my-events.ts',
  'lib/api/registrations.ts',
  'lib/api/registration-actions.ts',
];
// attendee_status display values (CONFIRMED, PENDING_CONFIRMATION, CANCELLED, COMPLETED).
const ATTENDEE_STATUS_FILES = new Set(['components/attendee/registration-actions/registration-action-rules.ts', 'lib/api/my-events.ts']);

const filesUnder = (relative) => {
  const full = path.join(root, relative);
  if (statSync(full).isFile()) return [relative];
  return readdirSync(full).flatMap((name) => filesUnder(path.join(relative, name)));
};
const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const files = ATTENDEE_SOURCES.flatMap(filesUnder).filter((file) => /\.(ts|tsx)$/.test(file)).map((file) => file.replaceAll('\\', '/'));

test('[SPM-289] the attendee code has sources to check', () => {
  assert.ok(files.length > 20, `only ${files.length} files found`);
});

test('[SPM-289] no attendee code names a hidden or internal lifecycle state', () => {
  for (const file of files) {
    const code = withoutComments(readFileSync(path.join(root, file), 'utf8'));
    assert.doesNotMatch(code, /\b(PREPARATION|PLANNING|SAFETY_REVIEW|UNDER_REVIEW|SUBMITTED|DRAFT|AWAITING_CLARIFICATION|REJECTED)\b/, file);
  }
});

test('[SPM-289] CONFIRMED appears only as the backend\'s attendee_status display value', () => {
  for (const file of files) {
    const code = withoutComments(readFileSync(path.join(root, file), 'utf8'));
    if (!ATTENDEE_STATUS_FILES.has(file)) assert.doesNotMatch(code, /\bCONFIRMED\b/, file);
  }
});
