import { test, expect } from '@playwright/test';
import { attachScreenshot, installConnectSphereMocks, installLoginMock } from './support.mjs';
import { routeAttendeeEvents } from './spm-155-mocks.mjs';

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
// `details` maps an event ID to the attendee detail body, or to a status number.
async function installInbox(page, { notifications = [], role = 'ATTENDEE', gone = [], listFailures = 0, registrations = [], details = {} } = {}) {
  const state = await installConnectSphereMocks(page, { role });
  const inbox = {
    items: notifications.map((item) => ({ ...item })),
    gone: new Set(gone),
    listFailures,
    listRequests: [],
    readRequests: [],
    readAllRequests: 0,
    countRequests: 0,
  };
  const unread = () => inbox.items.filter((item) => !item.is_read && !inbox.gone.has(item.notification_id)).length;
  await page.route('**/api/notifications**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'OPTIONS') return route.fallback();
    if (url.pathname === '/api/notifications/unread-count') {
      inbox.countRequests += 1;
      return json({ unreadCount: unread() });
    }
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
  const detailRequests = await routeAttendeeEvents(page, { details, registrations });
  return { state, inbox, detailRequests };
}

// The attendee's view of an event they hold a place on, served by
// routeAttendeeEvents (GET /api/registrations/mine/:eventId).
const eventDetail = (eventId, title, overrides = {}) => ({
  eventId,
  title,
  description: `${title} description`,
  startDatetime: '2026-10-28T01:00:00.000Z',
  endDatetime: '2026-10-28T09:00:00.000Z',
  organisationName: 'SMU Computing Club',
  location: 'SMU Hall A',
  registrationAvailability: 'OPEN',
  registrationOpenAt: null,
  registrationCloseAt: null,
  attendeeStatus: 'CONFIRMED',
  detailsWithheld: false,
  myRegistration: { status: 'REGISTERED', registeredAt: '2026-10-01T00:00:00.000Z' },
  ...overrides,
});

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
  const { inbox } = await installInbox(page, {
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

  // Told that notifications changed without a count (e.g. after a registration
  // wrote one), the badge fetches the count again; with a count it shows it.
  inbox.items.push(makeNotification(4));
  const asked = inbox.countRequests;
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('connectsphere:notifications-changed', { detail: {} })));
  await expect(updatesButton(page)).toHaveAccessibleName('Updates, 1 unread');
  expect(inbox.countRequests).toBe(asked + 1);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('connectsphere:notifications-changed', { detail: { unreadCount: 5 } })));
  await expect(updatesButton(page)).toHaveAccessibleName('Updates, 5 unread');
  expect(inbox.countRequests).toBe(asked + 1);
});

test('[SPM-155 AC4/AC5 / TC-05, TC-06] Go to Event marks the notification read and opens the event details in My Events', async ({ page }, testInfo) => {
  const { inbox, detailRequests } = await installInbox(page, {
    notifications: [
      makeNotification(1),
      makeNotification(2, { type: 'EVENT_CHANGED', title: 'Event details changed', message: 'The date and time for "Event 2" changed.' }),
    ],
    registrations: [registration(51, 'Event 1'), registration(52, 'Event 2'), registration(53, 'Another event')],
    details: { 52: eventDetail(52, 'Event 2') },
  });
  await page.goto('/notifications');
  const changed = cards(page).filter({ hasText: 'Event details changed' });
  await changed.getByRole('button', { name: 'Go to Event: Event 2', exact: true }).click();
  await expect(page).toHaveURL(/\/my-registrations\?eventId=52&from=notification$/);
  expect(inbox.readRequests).toEqual([2]);

  // The latest attendee-visible details, in SGT, with the attendee's own place.
  const dialog = page.getByRole('dialog', { name: 'Event 2', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Event 2 description');
  await expect(dialog).toContainText('Wed, 28 Oct 2026');
  await expect(dialog).toContainText('09:00 – 17:00 SGT');
  await expect(dialog).toContainText('SMU Hall A');
  await expect(dialog).toContainText('Your place');
  await expect(dialog.getByText('Registered', { exact: true }).first()).toBeVisible();
  // Someone already registered is not offered sign-up.
  await expect(dialog.getByRole('button', { name: /register|waitlist|notify/i })).toHaveCount(0);
  // Read from the attendee's registration, not from Event Discovery.
  expect(detailRequests.myEvents).toEqual([52]);
  expect(detailRequests.discovery).toEqual([]);
  // The dialog is the whole view: no link to a separate event page.
  await expect(dialog.getByRole('link', { name: /View Event Details/i })).toHaveCount(0);
  await attachScreenshot(testInfo, page, 'my-events-details');

  // Behind the dialog, the event's card is outlined and says where it came from.
  const highlighted = page.locator('[data-highlighted="true"]');
  await expect(highlighted).toHaveCount(1);
  await expect(highlighted).toContainText('Event 2');
  await expect(highlighted.getByText('Opened from your notification', { exact: true })).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/my-registrations$/);
  await expect(page.locator('#registration-event-52')).toBeFocused();
  await expect(updatesButton(page)).toHaveAccessibleName('Updates, 1 unread');
});

test('[SPM-155 AC5] a cancelled event shows its title and status but holds back date and venue', async ({ page }, testInfo) => {
  await installInbox(page, {
    registrations: [registration(54, 'Cancelled gala', 'WAITLISTED')],
    details: {
      54: eventDetail(54, 'Cancelled gala', {
        description: null, startDatetime: null, endDatetime: null, location: null, organisationName: null,
        registrationAvailability: 'CLOSED', attendeeStatus: 'CANCELLED', detailsWithheld: true,
        myRegistration: { status: 'WAITLISTED', registeredAt: '2026-10-01T00:00:00.000Z' },
      }),
    },
  });
  await page.goto('/my-registrations?eventId=54');
  const dialog = page.getByRole('dialog', { name: 'Cancelled gala', exact: true });
  await expect(dialog.getByText('Cancelled', { exact: true })).toBeVisible();
  await expect(dialog.getByText('This event has been cancelled', { exact: true })).toBeVisible();
  // Only what is true: no promised notification or organiser message.
  await expect(dialog.getByRole('alert').filter({ hasText: 'This event has been cancelled' })).toContainText('Its date, time and venue are no longer shown.');
  await expect(dialog).not.toContainText(/notification|organiser/i);
  // The attendee's own place says "On the waitlist", never "Waitlisted" (SPM-44's word for a full event).
  await expect(dialog.getByText('On the waitlist', { exact: true })).toBeVisible();
  await expect(dialog.getByText('On the waitlist · a place is not yet confirmed', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Waitlisted', { exact: true })).toHaveCount(0);
  // No schedule, venue or description; only the attendee's own place has a time.
  await expect(dialog).not.toContainText('Schedule');
  await expect(dialog).not.toContainText('Location');
  await expect(dialog).not.toContainText('About this event');
  await expect(dialog.getByRole('button', { name: /register|waitlist|notify/i })).toHaveCount(0);
  await attachScreenshot(testInfo, page, 'cancelled-details');
});

test('[SPM-155 AC5 / Master 5.7] a cancelled event that had been confirmed shows its last confirmed details', async ({ page }, testInfo) => {
  const { detailRequests } = await installInbox(page, {
    registrations: [registration(57, 'Called-off summit', 'WAITLISTED')],
    details: {
      57: eventDetail(57, 'Called-off summit', {
        registrationAvailability: 'CLOSED', attendeeStatus: 'CANCELLED', lastConfirmedAt: '2026-10-05T02:00:00.000Z',
        myRegistration: { status: 'WAITLISTED', registeredAt: '2026-10-01T00:00:00.000Z' },
      }),
    },
  });
  await page.goto('/my-registrations?eventId=57');
  const dialog = page.getByRole('dialog', { name: 'Called-off summit', exact: true });
  await expect(dialog.getByText('Cancelled', { exact: true })).toBeVisible();
  const notice = dialog.getByRole('alert').filter({ hasText: 'This event has been cancelled' });
  await expect(notice).toContainText('These are its details as last confirmed on 5 Oct 2026, 10:00 SGT.');
  // The last confirmed details are shown, not withheld.
  for (const text of ['Called-off summit description', 'Wed, 28 Oct 2026', '09:00 – 17:00 SGT', 'SMU Hall A', 'Your place']) await expect(dialog).toContainText(text);
  await expect(dialog).not.toContainText('Its date, time and venue are no longer shown.');
  // The notice states only what is known: no promised notification or organiser message.
  await expect(notice).not.toContainText(/notification|organiser/i);
  await expect(dialog.getByRole('button', { name: /register|waitlist|notify/i })).toHaveCount(0);
  expect(detailRequests).toEqual({ myEvents: [57], discovery: [] });
  await attachScreenshot(testInfo, page, 'cancelled-last-confirmed');
});

// Being reconfirmed: the last confirmed details when there was a confirmation
// (Master 5.7), otherwise only that the details are being confirmed.
for (const [label, overrides, shown] of [
  ['with a last confirmation', { lastConfirmedAt: '2026-10-05T02:00:00.000Z' }, true],
  ['without a confirmation', { description: null, startDatetime: null, endDatetime: null, location: null, organisationName: null, registrationOpenAt: null, registrationCloseAt: null, detailsWithheld: true }, false],
]) {
  test(`[SPM-155 AC5] an event being reconfirmed ${label} says so in the dialog`, async ({ page }) => {
    await installInbox(page, {
      registrations: [registration(58, 'Moved summit')],
      details: { 58: eventDetail(58, 'Moved summit', { registrationAvailability: 'CLOSED', attendeeStatus: 'PENDING_CONFIRMATION', ...overrides }) },
    });
    await page.goto('/my-registrations?eventId=58');
    const dialog = page.getByRole('dialog', { name: 'Moved summit', exact: true });
    await expect(dialog.getByText('Event confirmation pending', { exact: true })).toBeVisible();
    const notice = dialog.getByRole('status').filter({ hasText: "This event's details are being confirmed" });
    await expect(notice).toContainText(shown
      ? 'These are the details last confirmed on 5 Oct 2026, 10:00 SGT. Check back here for the latest information.'
      : 'Check back here for the latest information.');
    await expect(notice).not.toContainText(/notification|organiser/i);
    if (shown) {
      for (const text of ['Moved summit description', 'Wed, 28 Oct 2026', 'SMU Hall A']) await expect(dialog).toContainText(text);
    } else {
      await expect(dialog).not.toContainText('About this event');
      await expect(dialog).not.toContainText('Location');
    }
    await expect(dialog.getByRole('button', { name: /register|waitlist|notify/i })).toHaveCount(0);
  });
}

test('[SPM-155] View Event Details on a My Events card opens the same details and returns focus', async ({ page }) => {
  await installInbox(page, { registrations: [registration(51, 'Event 1')], details: { 51: eventDetail(51, 'Event 1') } });
  await page.goto('/my-registrations');
  const view = page.getByRole('button', { name: 'View Event Details: Event 1', exact: true });
  await view.click();
  await expect(page).toHaveURL(/\/my-registrations\?eventId=51$/);
  const dialog = page.getByRole('dialog', { name: 'Event 1', exact: true });
  await expect(dialog).toContainText('Event 1 description');
  // The card is outlined, but it was not opened from a notification.
  await expect(page.locator('[data-highlighted="true"]')).toHaveCount(1);
  await expect(page.getByText('Opened from your notification', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close event details', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(view).toBeFocused();
});

test('[SPM-155 AC6] an event the attendee can no longer see is explained, not highlighted', async ({ page }) => {
  await installInbox(page, { registrations: [registration(51, 'Event 1')], details: { 99: 404 } });
  await page.goto('/my-registrations?eventId=99');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('This event is no longer available', { exact: true })).toBeVisible();
  await expect(dialog).toContainText('You may have withdrawn, or this event is no longer available to you.');
  await expect(page.locator('[data-highlighted="true"]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close event details', exact: true }).click();
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
