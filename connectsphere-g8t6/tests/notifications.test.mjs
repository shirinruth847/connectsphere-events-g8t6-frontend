import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendNotifications,
  applyReadState,
  emptyInboxText,
  formatNotificationTime,
  formatNotificationTimestamp,
  mergeFirstPage,
  notificationGoneText,
  notificationTargetHref,
  offerExpiry,
  unreadBadgeText,
} from '../lib/notifications.ts';
import { canViewPath, postLoginPath, ROUTES } from '../lib/auth.ts';

// 21 Oct 2026, 12:00 SGT
const NOW = new Date('2026-10-21T04:00:00Z');
const item = (notification_id, created_at, overrides = {}) => ({
  notification_id, type: 'EVENT_CHANGED', title: `Notification ${notification_id}`, message: 'Message', created_at,
  is_read: false, read_at: null, event: null, target: null, action_expires_at: null, ...overrides,
});

test('[SPM-155 AC4/AC5] MY_EVENTS opens the event in My Events, marked as from a notification', () => {
  assert.equal(notificationTargetHref({ page: 'MY_EVENTS', event_id: 42 }), '/my-registrations?eventId=42&from=notification');
});
test('[SPM-155] EVENT_WORKSPACE opens the event workspace', () => {
  assert.equal(notificationTargetHref({ page: 'EVENT_WORKSPACE', event_id: 7 }), '/events/7');
});
test('[SPM-155] no target, an unknown page or a bad event ID gets no link', () => {
  assert.equal(notificationTargetHref(null), null);
  assert.equal(notificationTargetHref({ page: 'SOMEWHERE_NEW', event_id: 7 }), null);
  assert.equal(notificationTargetHref({ page: 'MY_EVENTS', event_id: 0 }), null);
  assert.equal(notificationTargetHref({ page: 'MY_EVENTS', event_id: 1.5 }), null);
});

test('[SPM-192 AC7] a notification that is no longer available is explained in the reader\'s terms', () => {
  assert.equal(notificationGoneText('ATTENDEE'), 'That notification is no longer available. It may be about an event you are no longer registered or waitlisted for.');
  assert.equal(notificationGoneText('ORGANISER'), 'That notification is no longer available. It may be because you no longer have access to this event.');
  assert.equal(notificationGoneText(null), 'That notification is no longer available.');
});
test('[SPM-192] the empty inbox names what each role is told about', () => {
  assert.match(emptyInboxText('ATTENDEE'), /registration confirmations/);
  assert.match(emptyInboxText('ORGANISER'), /^Updates about your event requests/);
  assert.equal(emptyInboxText(undefined), 'Updates about your events will appear here.');
});

test('[SPM-155 AC8] recent times are relative', () => {
  assert.equal(formatNotificationTime('2026-10-21T03:59:30Z', NOW), 'Just now');
  assert.equal(formatNotificationTime('2026-10-21T03:59:00Z', NOW), '1 min ago');
  assert.equal(formatNotificationTime('2026-10-21T03:48:00Z', NOW), '12 mins ago');
  assert.equal(formatNotificationTime('2026-10-21T03:00:00Z', NOW), '1 hr ago');
  assert.equal(formatNotificationTime('2026-10-21T02:00:00Z', NOW), '2 hrs ago');
});
test('[SPM-155 AC8] older times use Singapore calendar days and SGT', () => {
  // 20 Oct 21:57 SGT is yesterday in Singapore.
  assert.equal(formatNotificationTime('2026-10-20T13:57:00Z', NOW), 'Yesterday, 21:57 SGT');
  // 20 Oct 23:30 SGT is yesterday even though it is under 24 hours ago.
  assert.equal(formatNotificationTime('2026-10-20T15:30:00Z', NOW), 'Yesterday, 23:30 SGT');
  assert.equal(formatNotificationTime('2026-10-14T01:05:00Z', NOW), '14 Oct 2026, 09:05 SGT');
  assert.equal(formatNotificationTime('not a date', NOW), 'Unknown time');
});
test('[SPM-155 AC8] the exact timestamp is shown in SGT', () => {
  assert.equal(formatNotificationTimestamp('2026-10-21T02:20:00Z'), 'Wed, 21 Oct 2026, 10:20 SGT');
  assert.equal(formatNotificationTimestamp(null), 'Unknown time');
});

test('[SPM-155 AC3] an offer shows its expiry, and says when it has expired', () => {
  assert.deepEqual(offerExpiry('2026-10-24T10:00:00Z', NOW), { expired: false, text: 'Offer expires Sat, 24 Oct 2026, 18:00 SGT' });
  assert.deepEqual(offerExpiry('2026-10-20T10:00:00Z', NOW), { expired: true, text: 'Offer expired Tue, 20 Oct 2026, 18:00 SGT' });
  assert.equal(offerExpiry(null, NOW), null);
});

test('[SPM-155 TC-08] the badge shows the count, hidden at zero and capped at 99+', () => {
  assert.equal(unreadBadgeText(0), '');
  assert.equal(unreadBadgeText(null), '');
  assert.equal(unreadBadgeText(3), '3');
  assert.equal(unreadBadgeText(120), '99+');
});

test('[SPM-155 AC8] Load more keeps shown notifications in place', () => {
  const merged = appendNotifications([item(3, '2026-10-21T03:00:00Z'), item(2, '2026-10-21T02:00:00Z')], [item(2, '2026-10-21T02:00:00Z', { title: 'dup' }), item(1, '2026-10-21T01:00:00Z')]);
  assert.deepEqual(merged.map((n) => n.notification_id), [3, 2, 1]);
  assert.equal(merged[1].title, 'Notification 2');
});
test('[SPM-155 AC8] a refreshed first page adds new ones and keeps older loaded pages, newest first', () => {
  const current = [item(3, '2026-10-21T03:00:00Z'), item(2, '2026-10-21T02:00:00Z'), item(1, '2026-10-21T01:00:00Z')];
  const merged = mergeFirstPage(current, [item(4, '2026-10-21T03:30:00Z'), item(3, '2026-10-21T03:00:00Z', { is_read: true })], false);
  assert.deepEqual(merged.map((n) => n.notification_id), [4, 3, 2, 1]);
  assert.equal(merged[1].is_read, true);
});
test('[SPM-155 AC8] equal timestamps order by ID, newest first', () => {
  const merged = mergeFirstPage([item(5, '2026-10-21T03:00:00Z')], [item(6, '2026-10-21T03:00:00Z'), item(4, '2026-10-21T03:00:00Z')], false);
  assert.deepEqual(merged.map((n) => n.notification_id), [6, 4]);
});
test('[SPM-155 AC6] a refresh drops loaded rows inside its range that the backend no longer returns', () => {
  const current = [item(4, '2026-10-21T03:30:00Z'), item(3, '2026-10-21T03:00:00Z'), item(2, '2026-10-21T02:00:00Z'), item(1, '2026-10-21T01:00:00Z')];
  // 3 is now hidden; the refreshed page reaches back to 2, so 1 is an older page and stays.
  const merged = mergeFirstPage(current, [item(4, '2026-10-21T03:30:00Z'), item(2, '2026-10-21T02:00:00Z')], false);
  assert.deepEqual(merged.map((n) => n.notification_id), [4, 2, 1]);
  // A refresh that returned everything keeps only what it returned.
  assert.deepEqual(mergeFirstPage(current, [item(4, '2026-10-21T03:30:00Z')], true).map((n) => n.notification_id), [4]);
  assert.deepEqual(mergeFirstPage(current, [], true), []);
});
test('[SPM-155 TC-08] the confirmed read state replaces only that notification', () => {
  const updated = applyReadState([item(1, '2026-10-21T01:00:00Z'), item(2, '2026-10-21T02:00:00Z')], { notification_id: 2, is_read: true, read_at: '2026-10-21T04:00:00Z' });
  assert.equal(updated[0].is_read, false);
  assert.deepEqual([updated[1].is_read, updated[1].read_at], [true, '2026-10-21T04:00:00Z']);
});

test('[SPM-155 TC-12 / SPM-192] attendees and organisers return to /notifications after login; other roles do not yet', () => {
  assert.equal(ROUTES.notifications, '/notifications');
  for (const role of ['ATTENDEE', 'ORGANISER']) {
    assert.equal(canViewPath(role, '/notifications'), true, role);
    assert.equal(postLoginPath({ user_id: 1, name: 'A', email: 'a@example.com', role }, '/notifications'), '/notifications', role);
  }
  for (const role of ['COORDINATOR', 'COORDINATOR_LEAD', 'VENUE_STAFF', 'TECH_SUPPORT', 'SAFETY_OFFICER']) {
    assert.equal(canViewPath(role, '/notifications'), false, role);
  }
});
