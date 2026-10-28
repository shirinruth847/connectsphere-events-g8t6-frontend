import { test, expect } from '@playwright/test';
import { attachScreenshot, installConnectSphereMocks, installLoginMock, makeDraft } from './support.mjs';
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

test('[SPM-192 AC10] an uncertain reassignment keeps its command across reload and replays after an intervening change', async ({ page }, testInfo) => {
  const state = await installConnectSphereMocks(page, { role: 'COORDINATOR_LEAD' });
  const assigned = { ...makeDraft(), eventId: 81, requestId: 'REQ-000081', title: 'Replay check', status: 'PLANNING',
    coordinatorId: 21, coordinatorName: 'Coordinator A', supervisingLeadId: 11, hasScheduleConflict: false };
  state.assignments = [assigned];
  state.coordinators = [{ coordinatorId: 21, name: 'Coordinator A', events: [assigned] }, { coordinatorId: 22, name: 'Coordinator B', events: [] }];
  const commands = [];
  await page.route('**/api/events/81/coordinator', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    commands.push({ key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
    // The original command committed A -> B but its response was lost; another
    // command has since restored A. The saved command must still replay.
    if (commands.length === 1) return route.abort('failed');
    if (commands.length === 2) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      event: { eventId: 81, coordinatorId: 22 }, coordinator: { coordinatorId: 22, name: 'Coordinator B' }, replayed: true,
    }) });
  });
  await page.goto('/assignments');
  const card = page.getByRole('article', { name: 'Replay check' });
  await card.getByRole('combobox').selectOption('22');
  await card.getByRole('button', { name: 'Reassign coordinator', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm assignment' }).click();
  await expect(card.getByRole('alert')).toContainText('result is unconfirmed');
  await expect(page.getByText('Coordinator updated for REQ-000081.')).toHaveCount(0);
  await attachScreenshot(testInfo, page, 'reassignment-recovery-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(card.getByRole('combobox')).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await attachScreenshot(testInfo, page, 'reassignment-recovery-mobile');
  await card.getByRole('button', { name: 'Retry previous reassignment' }).click();
  // A malformed success body also leaves the outcome uncertain and must not
  // clear its key or announce a fresh successful reassignment.
  await expect(card.getByRole('alert')).toContainText('result is unconfirmed');
  await expect(page.getByText('Coordinator updated for REQ-000081.')).toHaveCount(0);
  await card.getByRole('button', { name: 'Retry previous reassignment' }).click();
  await expect(page.getByText('Previous reassignment confirmed for REQ-000081. Current assignments refreshed.')).toBeVisible();
  await expect(card).toContainText('Current coordinator: Coordinator A');
  await expect(card.getByRole('button', { name: 'Retry previous reassignment' })).toHaveCount(0);
  expect(commands).toHaveLength(3);
  expect(commands[0].key).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
  expect(commands[1]).toEqual(commands[0]);
  expect(commands[2]).toEqual(commands[0]);
  await expect(card.getByRole('combobox')).toBeEnabled();
});

test('[SPM-192 AC10] an expired reassignment session preserves the command for the same account', async ({ page }) => {
  const state = await installConnectSphereMocks(page, { role: 'COORDINATOR_LEAD' });
  const assigned = { ...makeDraft(), eventId: 82, requestId: 'REQ-000082', title: 'Session replay check', status: 'PLANNING',
    coordinatorId: 21, coordinatorName: 'Coordinator A', supervisingLeadId: 11, hasScheduleConflict: false };
  state.assignments = [assigned];
  state.coordinators = [{ coordinatorId: 21, name: 'Coordinator A', events: [assigned] }, { coordinatorId: 22, name: 'Coordinator B', events: [] }];
  const keys = [];
  await page.route('**/api/events/82/coordinator', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    keys.push(route.request().headers()['idempotency-key']);
    return route.fulfill({ status: keys.length === 1 ? 401 : 200, contentType: 'application/json', body: JSON.stringify(
      keys.length === 1 ? { error: 'Please log in.', code: 'UNAUTHENTICATED' }
        : { event: { eventId: 82, coordinatorId: 22 }, coordinator: { coordinatorId: 22, name: 'Coordinator B' }, replayed: true }) });
  });
  await page.goto('/assignments');
  const card = page.getByRole('article', { name: 'Session replay check' });
  await card.getByRole('combobox').selectOption('22');
  await card.getByRole('button', { name: 'Reassign coordinator', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm assignment' }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fassignments/);
  // installConnectSphereMocks restores the synthetic account on navigation;
  // real sign-in/redirect handling has separate shared authentication coverage.
  await page.goto('/assignments');
  await card.getByRole('button', { name: 'Retry previous reassignment' }).click();
  await expect(page.getByText('Previous reassignment confirmed for REQ-000082. Current assignments refreshed.')).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
});

for (const originalOutcome of ['success', 'rejection']) {
  test(`[SPM-192 AC10] a delayed ${originalOutcome} from an earlier view preserves a newer command`, async ({ page }) => {
    const state = await installConnectSphereMocks(page, { role: 'COORDINATOR_LEAD' });
    const event = { ...makeDraft(), eventId: 83, requestId: 'REQ-000083', title: 'Overlapping responses', status: 'PLANNING',
      coordinatorId: 21, coordinatorName: 'Coordinator A', supervisingLeadId: 11, hasScheduleConflict: false };
    state.assignments = [event];
    state.coordinators = [{ coordinatorId: 21, name: 'Coordinator A', events: [event] }, { coordinatorId: 22, name: 'Coordinator B', events: [] }];
    const storageKey = 'connectsphere:recovery:reassignment:11:83';
    const commands = [];
    let releaseOriginal;
    let releaseNew;
    await page.route('**/api/events/83/coordinator', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fallback();
      commands.push({ key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
      const attempt = commands.length;
      if (attempt === 1) {
        await new Promise((resolve) => { releaseOriginal = resolve; });
        if (originalOutcome === 'rejection') {
          return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Coordinator was busy.', code: 'COORDINATOR_CONFLICT' }) });
        }
      }
      if (attempt === 3) {
        await new Promise((resolve) => { releaseNew = resolve; });
        return route.abort('failed').catch(() => {});
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        event: { eventId: 83, coordinatorId: 22 }, coordinator: { coordinatorId: 22, name: 'Coordinator B' }, replayed: attempt !== 1,
      }) });
    });
    const card = page.getByRole('article', { name: event.title });
    const sendNewCommand = async () => {
      await card.getByRole('combobox').selectOption('22');
      await card.getByRole('button', { name: 'Reassign coordinator', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm assignment', exact: true }).click();
    };
    try {
      await page.goto('/dashboard');
      await page.locator('aside').getByRole('link', { name: 'Assignments', exact: true }).click();
      await sendNewCommand();
      await expect.poll(() => commands.length).toBe(1);
      // Browser history can leave a pending modal. The original fetch still
      // exists while a remounted view recovers its stored command.
      await page.goBack();
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.goForward();
      await card.getByRole('button', { name: 'Retry previous reassignment' }).click();
      await expect(page.getByText('Previous reassignment confirmed for REQ-000083. Current assignments refreshed.')).toBeVisible();
      await sendNewCommand();
      await expect.poll(() => commands.length).toBe(3);
      const pendingNew = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), storageKey);
      expect(pendingNew.key).toBe(commands[2].key);
      expect(pendingNew.key).not.toBe(commands[0].key);

      const oldResponse = page.waitForResponse((response) => response.url().endsWith('/api/events/83/coordinator')
        && response.status() === (originalOutcome === 'success' ? 200 : 409));
      releaseOriginal();
      await (await oldResponse).finished();
      // Let the old fetch's body handling and React callbacks settle.
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      expect(await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), storageKey)).toEqual(pendingNew);
      await expect(page.getByText('Coordinator updated for REQ-000083.', { exact: true })).toHaveCount(0);

      releaseNew();
      await expect(card.getByRole('alert')).toContainText('result is unconfirmed');
      await page.reload();
      await expect(card.getByRole('combobox')).toBeDisabled();
      await card.getByRole('button', { name: 'Retry previous reassignment' }).click();
      await expect(page.getByText('Previous reassignment confirmed for REQ-000083. Current assignments refreshed.')).toBeVisible();
      expect(commands).toHaveLength(4);
      expect(commands[1]).toEqual(commands[0]);
      expect(commands[3]).toEqual(commands[2]);
      await expect(card.getByRole('combobox')).toBeEnabled();
    } finally {
      releaseOriginal?.();
      releaseNew?.();
    }
  });
}
