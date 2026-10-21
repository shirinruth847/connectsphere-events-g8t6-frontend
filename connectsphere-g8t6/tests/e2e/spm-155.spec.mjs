import { test, expect } from '@playwright/test';
import { attachScreenshot, installConnectSphereMocks, installLoginMock } from './support.mjs';

// Mocked journeys for the notifications inbox and Updates panel (SPM-155).
// The mock follows the backend contract in docs/test-plans/spm-155.md of the
// backend repository; live checks run separately against the real API.

const makeNotification = (id, overrides = {}) => ({
  notification_id: id,
  type: 'REGISTRATION_CONFIRMED',
  title: `Notification ${id}`,
  message: `Message for notification ${id}.`,
  // Newest first by ID: a higher ID is a later minute.
  created_at: new Date(Date.UTC(2026, 9, 1, 0, id)).toISOString(),
  is_read: false,
  read_at: null,
  event: { event_id: 50 + id, title: `Event ${id}` },
  target: { page: 'MY_EVENTS', event_id: 50 + id },
  action_expires_at: null,
  ...overrides,
});

// A stateful inbox: read actions change what later requests return. `gone`
// holds IDs the backend now hides (404 NOTIFICATION_NOT_FOUND).
async function installInbox(page, { notifications = [], role = 'ATTENDEE', gone = [], listFailures = 0, registrations = [] } = {}) {
  const state = await installConnectSphereMocks(page, { role });
  const inbox = {
    items: notifications.map((item) => ({ ...item })),
    gone: new Set(gone),
    listFailures,
    listRequests: [],
    readRequests: [],
    readAllRequests: 0,
  };
  const unread = () => inbox.items.filter((item) => !item.is_read && !inbox.gone.has(item.notification_id)).length;
  await page.route('**/api/notifications**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'OPTIONS') return route.fallback();
    if (url.pathname === '/api/notifications/unread-count') return json({ unreadCount: unread() });
    if (url.pathname === '/api/notifications/read-all' && request.method() === 'POST') {
      inbox.readAllRequests += 1;
      const updated = unread();
      inbox.items = inbox.items.map((item) => ({ ...item, is_read: true, read_at: item.read_at ?? '2026-10-21T04:00:00.000Z' }));
      return json({ updated, unreadCount: 0 });
    }
    const read = url.pathname.match(/^\/api\/notifications\/(\d+)\/read$/);
    if (read && request.method() === 'POST') {
      const id = Number(read[1]);
      inbox.readRequests.push(id);
      const item = inbox.items.find((candidate) => candidate.notification_id === id);
      if (!item || inbox.gone.has(id)) return json({ error: 'Notification not found.', code: 'NOTIFICATION_NOT_FOUND' }, 404);
      item.is_read = true;
      item.read_at = item.read_at ?? '2026-10-21T04:00:00.000Z';
      return json({ notification: { notification_id: id, is_read: true, read_at: item.read_at }, unreadCount: unread() });
    }
    if (url.pathname === '/api/notifications' && request.method() === 'GET') {
      const limit = Number(url.searchParams.get('limit'));
      const cursor = url.searchParams.get('cursor');
      inbox.listRequests.push({ limit, cursor });
      if (inbox.listFailures > 0) {
        inbox.listFailures -= 1;
        return json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }, 500);
      }
      const visible = inbox.items.filter((item) => !inbox.gone.has(item.notification_id)).sort((a, b) => b.notification_id - a.notification_id);
      const start = cursor ? Number(cursor.replace('after-', '')) : 0;
      const pageItems = visible.slice(start, start + limit);
      const nextCursor = start + limit < visible.length ? `after-${start + limit}` : null;
      return json({ notifications: pageItems, nextCursor, unreadCount: unread() });
    }
    return route.fallback();
  });
  await page.route('**/api/registrations/mine**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ registrations, page: { next_offset: null } }),
  }));
  return { state, inbox };
}

const cards = (page) => page.locator('main li article');
const unreadCards = (page) => page.locator('main li article[data-unread="true"]');
const updatesButton = (page) => page.getByRole('button', { name: /^Updates/ });
const panel = (page) => page.getByRole('dialog', { name: 'Notifications' });

const registration = (eventId, title, status = 'REGISTERED') => ({
  registration_id: eventId * 10,
  registration_status: status,
  event: { event_id: eventId, title, attendee_status: 'CONFIRMED', description: `${title} description`, venue: null },
});

test('[SPM-155 AC8 / TC-08] inbox lists newest first; opening one and Mark all as read update the unread count', async ({ page }, testInfo) => {
  const { inbox } = await installInbox(page, {
    notifications: [makeNotification(1), makeNotification(2), makeNotification(3), makeNotification(4, { is_read: true, read_at: '2026-10-01T00:10:00.000Z' })],
  });
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
  await expect(cards(page)).toHaveCount(4);
  await expect(cards(page).locator('h3')).toHaveText(['Notification 4', /Notification 3/, /Notification 2/, /Notification 1/]);
  await expect(unreadCards(page)).toHaveCount(3);
  await expect(page.getByText('3 unread', { exact: true })).toBeVisible();
  // Each card shows the event, the message and the time in SGT.
  const first = cards(page).nth(1);
  await expect(first).toContainText('Event 3');
  await expect(first).toContainText('Message for notification 3.');
  await expect(first.locator('time')).toHaveAttribute('title', 'Thu, 1 Oct 2026, 08:03 SGT');
  // The attendee sidebar's Notifications tab is the one current tab.
  await expect(page.locator('aside [aria-current="page"]')).toHaveCount(1);
  await expect(page.locator('aside').getByRole('link', { name: 'Notifications', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('aside').getByRole('link', { name: 'Notifications', exact: true })).toHaveAttribute('href', '/notifications');

  await first.getByRole('button', { name: /^View/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Notification 3' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Message for notification 3.');
  await expect(page.getByText('2 unread', { exact: true })).toBeVisible();
  expect(inbox.readRequests).toEqual([3]);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(first.getByRole('button', { name: /^View/ })).toBeFocused();
  await expect(unreadCards(page)).toHaveCount(2);

  await page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
  await expect(page.getByText('0 unread', { exact: true })).toBeVisible();
  await expect(unreadCards(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark all as read', exact: true })).toHaveCount(0);
  expect(inbox.readAllRequests).toBe(1);
  await attachScreenshot(testInfo, page, 'inbox-after-mark-all');
});

test('[SPM-155 TC-08] the Updates badge on My Events counts down as notifications are read', async ({ page }) => {
  await installInbox(page, {
    notifications: [makeNotification(1), makeNotification(2), makeNotification(3, { target: null, event: null, title: 'General notice' })],
    registrations: [registration(52, 'Event 2')],
  });
  await page.goto('/my-registrations');
  await expect(updatesButton(page)).toHaveAccessibleName('Updates, 3 unread');
  // The unread pill is red (error token) with white text.
  const pill = updatesButton(page).getByText('3', { exact: true });
  await expect(pill).toHaveCSS('background-color', 'rgb(186, 26, 26)');
  await expect(pill).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(page.locator('aside').getByRole('link', { name: 'My Events', exact: true })).toHaveAttribute('aria-current', 'page');
  await updatesButton(page).click();
  await expect(updatesButton(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByText('3 New', { exact: true })).toBeVisible();
  await expect(panel(page).locator('article')).toHaveCount(3);

  // A notification without an event is read from the panel itself.
  await panel(page).getByRole('button', { name: 'Mark as read: General notice' }).click();
  await expect(updatesButton(page)).toHaveAccessibleName('Updates, 2 unread');
  await expect(panel(page).getByText('2 New', { exact: true })).toBeVisible();

  await panel(page).getByRole('button', { name: 'Mark all as read', exact: true }).click();
  await expect(updatesButton(page)).toHaveAccessibleName('Updates');
  await expect(panel(page).getByText(/ New$/)).toHaveCount(0);

  // Escape closes the panel and returns focus to Updates.
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(updatesButton(page)).toBeFocused();
});

test('[SPM-155 AC4/AC5 / TC-05, TC-06] Go to Event marks the notification read and highlights the event in My Events', async ({ page }, testInfo) => {
  const { inbox } = await installInbox(page, {
    notifications: [
      makeNotification(1),
      makeNotification(2, { type: 'EVENT_CHANGED', title: 'Event details changed', message: 'The date and time for "Event 2" changed.' }),
    ],
    registrations: [registration(51, 'Event 1'), registration(52, 'Event 2'), registration(53, 'Another event')],
  });
  await page.goto('/notifications');
  const changed = cards(page).filter({ hasText: 'Event details changed' });
  await changed.getByRole('button', { name: 'Go to Event: Event 2', exact: true }).click();
  await expect(page).toHaveURL(/\/my-registrations\?eventId=52$/);
  expect(inbox.readRequests).toEqual([2]);
  const highlighted = page.locator('[data-highlighted="true"]');
  await expect(highlighted).toHaveCount(1);
  await expect(highlighted).toContainText('Event 2');
  await expect(highlighted).toContainText('From your notification');
  await expect(highlighted).toBeFocused();
  await expect(highlighted).toHaveAttribute('aria-current', 'true');
  await expect(updatesButton(page)).toHaveAccessibleName('Updates, 1 unread');
  await attachScreenshot(testInfo, page, 'my-events-highlight');
});

test('[SPM-155 AC4] an event no longer in My Events is explained, not highlighted', async ({ page }) => {
  await installInbox(page, { registrations: [registration(51, 'Event 1')] });
  await page.goto('/my-registrations?eventId=99');
  await expect(page.getByText('This event is no longer in My Registrations')).toBeVisible();
  await expect(page.locator('[data-highlighted="true"]')).toHaveCount(0);
  await expect(page.getByText('Event 1', { exact: true })).toBeVisible();
});

test('[SPM-155 AC6] Go to Event on a notification the backend no longer shows removes it and stays put', async ({ page }) => {
  const { inbox } = await installInbox(page, { notifications: [makeNotification(1), makeNotification(2)], gone: [] });
  await page.goto('/notifications');
  await expect(cards(page)).toHaveCount(2);
  inbox.gone.add(2);
  await cards(page).first().getByRole('button', { name: /^Go to Event/ }).click();
  await expect(page.getByText(/That notification is no longer available/)).toBeVisible();
  await expect(cards(page)).toHaveCount(1);
  await expect(page).toHaveURL(/\/notifications$/);
});

test('[SPM-155 AC3] an offer shows its expiry; an expired offer says so', async ({ page }) => {
  await installInbox(page, {
    notifications: [
      makeNotification(1, { type: 'WAITLIST_OFFER', title: 'Action required: a place is available', action_expires_at: '2020-03-01T10:00:00.000Z' }),
      makeNotification(2, { type: 'WAITLIST_OFFER', title: 'Action required: a place is available', action_expires_at: '2030-03-01T10:00:00.000Z' }),
    ],
    registrations: [],
  });
  await page.goto('/notifications');
  await expect(cards(page).first()).toContainText('Offer expires Fri, 1 Mar 2030, 18:00 SGT');
  await expect(cards(page).nth(1)).toContainText('Offer expired Sun, 1 Mar 2020, 18:00 SGT');
  // The panel shows the same expiry.
  await page.goto('/my-registrations');
  await updatesButton(page).click();
  await expect(panel(page).getByText('Offer expires Fri, 1 Mar 2030, 18:00 SGT')).toBeVisible();
});

test('[SPM-155 AC8] Load more fetches the next page with nextCursor', async ({ page }) => {
  const { inbox } = await installInbox(page, { notifications: Array.from({ length: 25 }, (_, index) => makeNotification(index + 1, { is_read: true })) });
  await page.goto('/notifications');
  await expect(cards(page)).toHaveCount(20);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(cards(page)).toHaveCount(25);
  await expect(page.getByText('You have reached the end of your notifications.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0);
  expect(inbox.listRequests.map((request) => request.cursor)).toEqual([null, 'after-20']);
});

test('[SPM-155] empty inbox and empty panel', async ({ page }) => {
  await installInbox(page, { notifications: [] });
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'No notifications yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark all as read' })).toHaveCount(0);
  await page.goto('/my-registrations');
  await expect(updatesButton(page)).toHaveAccessibleName('Updates');
  await updatesButton(page).click();
  await expect(panel(page).getByText('No notifications yet')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Mark all as read' })).toBeDisabled();
});

test('[SPM-155] a failed load shows an error and Try again recovers', async ({ page }) => {
  await installInbox(page, { notifications: [makeNotification(1)], listFailures: 1 });
  await page.goto('/notifications');
  await expect(page.getByText('Could not load notifications')).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(cards(page)).toHaveCount(1);
});

test('[SPM-155] See more opens the full inbox from the panel on Event Discovery', async ({ page }) => {
  await installInbox(page, { notifications: [makeNotification(1)] });
  await page.route('**/api/events/discovery**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [], nextCursor: null }) }));
  await page.goto('/events');
  await expect(updatesButton(page)).toHaveAccessibleName('Updates, 1 unread');
  await updatesButton(page).click();
  await panel(page).getByRole('link', { name: 'See more' }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(cards(page)).toHaveCount(1);
});

test('[SPM-155 TC-12] signed out, /notifications returns after login', async ({ page }) => {
  const state = await installLoginMock(page, { role: 'ATTENDEE' });
  await page.route('**/api/notifications**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(new URL(route.request().url()).pathname.endsWith('unread-count') ? { unreadCount: 0 } : { notifications: [], nextCursor: null, unreadCount: 0 }) }));
  await page.goto('/notifications');
  await expect(page).toHaveURL(/\/login\?next=%2Fnotifications/);
  await page.locator('#email').fill('user@example.com');
  await page.locator('#password').fill('Valid-password9');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
  expect(state.requestLog.some((entry) => entry.pathname === '/api/auth/me')).toBe(true);
});

test('[SPM-155] other roles are refused /notifications for now', async ({ page }) => {
  await installInbox(page, { role: 'ORGANISER' });
  await page.goto('/notifications');
  await expect(page.getByText('This page is not available for your role.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toHaveCount(0);
});

test('[SPM-155 UI] mobile: Updates and the panel fit the screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installInbox(page, { notifications: [makeNotification(1), makeNotification(2)], registrations: [registration(51, 'Event 1')] });
  await page.goto('/my-registrations');
  await expect(updatesButton(page)).toBeVisible();
  const button = await updatesButton(page).boundingBox();
  expect(button.height).toBeGreaterThanOrEqual(44);
  await updatesButton(page).click();
  await expect(panel(page).locator('article')).toHaveCount(2);
  const box = await panel(page).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(16);
  expect(box.x + box.width).toBeLessThanOrEqual(390 - 16 + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await attachScreenshot(testInfo, page, 'mobile-panel');
  await page.goto('/notifications');
  await expect(cards(page)).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await attachScreenshot(testInfo, page, 'mobile-inbox');
});
