import { test, expect } from '@playwright/test';
import { attachScreenshot, installLoginMock, makeDraft } from './support.mjs';
import { cards, installInbox, makeNotification, panel, unreadCards, updatesButton } from './spm-155-mocks.mjs';

// Mocked journeys for organiser notifications (SPM-192). Organisers use the
// attendee inbox and Updates panel from SPM-155; their notifications point at
// the event workspace (target.page EVENT_WORKSPACE). The backend decides whose
// notifications are returned; live checks run separately against the real API.

const organiserNotification = (id, eventId, overrides = {}) =>
  makeNotification(id, {
    type: 'EVENT_SUBMITTED',
    title: `Request update ${id}`,
    message: `Update ${id} for REQ-${String(eventId).padStart(6, '0')}.`,
    event: { event_id: eventId, title: `Organiser event ${eventId}` },
    target: { page: 'EVENT_WORKSPACE', event_id: eventId },
    ...overrides,
  });

const ownEvent = (eventId, overrides = {}) =>
  makeDraft({
    eventId,
    requestId: `REQ-${String(eventId).padStart(6, '0')}`,
    title: `Organiser event ${eventId}`,
    status: 'UNDER_REVIEW',
    statusLabel: 'Under Review',
    submittedAt: '2026-10-13T12:00:00.000Z',
    permissions: { canEdit: false, editableFields: [], canViewDraftHistory: true, canViewStaffHistory: false },
    ...overrides,
  });

const sidebarLink = (page) => page.locator('aside').getByRole('link', { name: 'Notifications', exact: true });

test('[SPM-192 AC9 / TC-12] Updates on My Requests shows the unread count and counts down as notifications are read', async ({ page }, testInfo) => {
  const { state } = await installInbox(page, {
    role: 'ORGANISER',
    notifications: [organiserNotification(1, 81), organiserNotification(2, 82), organiserNotification(3, 83, { event: null, target: null, title: 'General notice' })],
  });
  state.events = [ownEvent(81), ownEvent(82)];
  await page.goto('/dashboard?scope=MINE');
  await expect(page.getByRole('heading', { name: 'My Requests', level: 1 })).toBeVisible();
  await expect(updatesButton(page)).toHaveAccessibleName('Updates, 3 unread');
  // The red unread pill, as for attendees.
  const pill = updatesButton(page).getByText('3', { exact: true });
  await expect(pill).toHaveCSS('background-color', 'rgb(186, 26, 26)');
  await expect(pill).toHaveCSS('color', 'rgb(255, 255, 255)');
  // The organiser sidebar's Notifications tab now links to the inbox.
  await expect(sidebarLink(page)).toHaveAttribute('href', '/notifications');

  await updatesButton(page).click();
  await expect(panel(page).getByText('3 New', { exact: true })).toBeVisible();
  await expect(panel(page).locator('article')).toHaveCount(3);
  await attachScreenshot(testInfo, page, 'organiser-updates-panel');
  await panel(page).getByRole('button', { name: 'Mark as read: General notice' }).click();
  await expect(updatesButton(page)).toHaveAccessibleName('Updates, 2 unread');
  await panel(page).getByRole('button', { name: 'Mark all as read', exact: true }).click();
  await expect(updatesButton(page)).toHaveAccessibleName('Updates');
  await expect(panel(page).getByText(/ New$/)).toHaveCount(0);
});

test('[SPM-192 AC9 / TC-12] the organiser inbox marks one, then all, as read and the count updates each time', async ({ page }, testInfo) => {
  const { inbox } = await installInbox(page, {
    role: 'ORGANISER',
    notifications: [organiserNotification(1, 81), organiserNotification(2, 81), organiserNotification(3, 82)],
  });
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
  await expect(page.locator('aside [aria-current="page"]')).toHaveCount(1);
  await expect(sidebarLink(page)).toHaveAttribute('aria-current', 'page');
  await expect(cards(page).locator('h3')).toHaveText([/Request update 3/, /Request update 2/, /Request update 1/]);
  await expect(cards(page).first()).toContainText('Organiser event 82');
  await expect(page.getByText('3 unread', { exact: true })).toBeVisible();

  await cards(page).nth(1).getByRole('button', { name: /^View/ }).click();
  await expect(page.getByRole('dialog', { name: 'Request update 2' })).toBeVisible();
  await expect(page.getByText('2 unread', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(unreadCards(page)).toHaveCount(2);

  await page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
  await expect(page.getByText('0 unread', { exact: true })).toBeVisible();
  await expect(unreadCards(page)).toHaveCount(0);
  expect(inbox.readRequests).toEqual([2]);
  expect(inbox.readAllRequests).toBe(1);
  await attachScreenshot(testInfo, page, 'organiser-inbox');
});

test('[SPM-192 AC7 / TC-09] Go to Event marks the notification read and opens the event workspace with its current status', async ({ page }, testInfo) => {
  const { state, inbox } = await installInbox(page, {
    role: 'ORGANISER',
    notifications: [organiserNotification(1, 81, { type: 'EVENT_ASSIGNED', title: 'Coordinator assigned' })],
  });
  state.events = [ownEvent(81, { status: 'PLANNING', statusLabel: 'Approved & Planning' })];
  await page.goto('/dashboard');
  await updatesButton(page).click();
  await panel(page).getByRole('button', { name: /^Go to Event/ }).click();
  await expect(page).toHaveURL(/\/events\/81$/);
  await expect(page.getByRole('heading', { name: 'Organiser event 81', exact: true })).toBeVisible();
  await expect(page.getByText('Approved & Planning', { exact: true }).first()).toBeVisible();
  expect(inbox.readRequests).toEqual([1]);
  await attachScreenshot(testInfo, page, 'organiser-workspace-from-notification');
});

test('[SPM-192 AC7] Go to Event on a notification the organiser no longer has access to removes it with an explanation', async ({ page }) => {
  const { inbox } = await installInbox(page, {
    role: 'ORGANISER',
    notifications: [organiserNotification(1, 81), organiserNotification(2, 82)],
  });
  await page.goto('/notifications');
  await expect(cards(page)).toHaveCount(2);
  inbox.gone.add(2);
  await cards(page).first().getByRole('button', { name: /^Go to Event/ }).click();
  await expect(page.getByText('That notification is no longer available. It may be because you no longer have access to this event.', { exact: true })).toBeVisible();
  await expect(cards(page)).toHaveCount(1);
  await expect(page).toHaveURL(/\/notifications$/);
});

test('[SPM-192 AC8 / TC-10, TC-11] an organiser in the same organisation sees the owner\'s event but none of the owner\'s notifications', async ({ page }) => {
  // Notification 1 belongs to organiser A, who owns event 81. Signed in as B,
  // the backend leaves it out of the list and answers 404 for it, as it does
  // for a notification of another user.
  const { state, inbox } = await installInbox(page, {
    role: 'ORGANISER',
    notifications: [organiserNotification(1, 81, { title: 'Owner A update' }), organiserNotification(2, 90, { title: 'Organiser B update' })],
    gone: [1],
  });
  state.events = [ownEvent(81, { isOwner: false, viewerRelationship: 'ORGANISATION_MEMBER', title: 'Colleague event' }), ownEvent(90)];
  const inboxQueries = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/notifications')) inboxQueries.push([...url.searchParams.keys()]);
  });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Organisation Events', level: 1 })).toBeVisible();
  await expect(page.getByText('Colleague event', { exact: true })).toBeVisible();
  await expect(updatesButton(page)).toHaveAccessibleName('Updates, 1 unread');
  await updatesButton(page).click();
  await expect(panel(page).locator('article')).toHaveCount(1);
  await expect(panel(page)).not.toContainText('Owner A update');

  await page.goto('/notifications');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('Organiser B update');
  await expect(page.locator('main')).not.toContainText('Owner A update');
  // The frontend asks only for "my notifications" (no owner, user or event
  // filter); which ones those are is decided by the backend from the token.
  expect(inboxQueries.length).toBeGreaterThan(0);
  for (const keys of inboxQueries) expect(keys.every((key) => key === 'limit' || key === 'cursor')).toBe(true);
  expect(inbox.readRequests).not.toContain(1);
});

test('[SPM-192] signed out, an organiser returns to /notifications after login', async ({ page }) => {
  const state = await installLoginMock(page, { role: 'ORGANISER' });
  await page.route('**/api/notifications**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(new URL(route.request().url()).pathname.endsWith('unread-count') ? { unreadCount: 0 } : { notifications: [], nextCursor: null, unreadCount: 0 }) }));
  await page.goto('/notifications');
  await expect(page).toHaveURL(/\/login\?next=%2Fnotifications/);
  await page.locator('#email').fill('user@example.com');
  await page.locator('#password').fill('Valid-password9');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
  // The empty inbox names what organisers are told about.
  await expect(page.getByText(/Updates about your event requests/)).toBeVisible();
  expect(state.requestLog.some((entry) => entry.pathname === '/api/auth/me')).toBe(true);
});

test('[SPM-192 UI] mobile: the organiser header keeps Updates, and the panel fits the screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { state } = await installInbox(page, { role: 'ORGANISER', notifications: [organiserNotification(1, 81), organiserNotification(2, 82)] });
  state.events = [ownEvent(81)];
  await page.goto('/dashboard?scope=MINE');
  await expect(updatesButton(page)).toBeVisible();
  expect((await updatesButton(page).boundingBox()).height).toBeGreaterThanOrEqual(44);
  await updatesButton(page).click();
  await expect(panel(page).locator('article')).toHaveCount(2);
  const box = await panel(page).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(16);
  expect(box.x + box.width).toBeLessThanOrEqual(390 - 16 + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await attachScreenshot(testInfo, page, 'organiser-mobile-panel');
});
