import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeNewestPage } from '../lib/event-history.ts';

const entry = (historyId) => ({ historyId });
const loaded = { status: 'ready', entries: [3, 2, 1].map(entry), nextCursor: null };

test('[SPM-40] a background refresh adds newer entries and keeps older loaded pages', () => {
  const merged = mergeNewestPage(loaded, { history: [5, 4, 3].map(entry), nextCursor: 'older' });
  assert.deepEqual(merged.entries.map((item) => item.historyId), [5, 4, 3, 2, 1]);
  assert.equal(merged.nextCursor, null);
  assert.equal(merged.status, 'ready');
});

test('[SPM-40] an unchanged or empty first page keeps the same list', () => {
  assert.equal(mergeNewestPage(loaded, { history: [3, 2].map(entry), nextCursor: 'older' }), loaded);
  assert.equal(mergeNewestPage(loaded, { history: [], nextCursor: null }), loaded);
});

test('[SPM-40] a first page with no overlap replaces the list to avoid a gap', () => {
  const merged = mergeNewestPage(loaded, { history: [30, 29].map(entry), nextCursor: 'cursor-29' });
  assert.deepEqual(merged.entries.map((item) => item.historyId), [30, 29]);
  assert.equal(merged.nextCursor, 'cursor-29');
});

test('[SPM-40] an empty list takes the first page and its cursor', () => {
  const merged = mergeNewestPage({ status: 'ready', entries: [], nextCursor: null }, { history: [1].map(entry), nextCursor: 'next' });
  assert.deepEqual(merged.entries.map((item) => item.historyId), [1]);
  assert.equal(merged.nextCursor, 'next');
});
