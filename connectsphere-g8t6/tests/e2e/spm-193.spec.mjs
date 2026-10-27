import { test, expect } from '@playwright/test';
import { attachScreenshot, installLoginMock } from './support.mjs';
import { cards, installInbox, makeNotification, panel, unreadCards, updatesButton } from './spm-155-mocks.mjs';

// Mocked journeys for coordinator notifications (SPM-193). Coordinators use the
// SPM-155 inbox and Updates panel; their notifications point at the event
// workspace (target.page EVENT_WORKSPACE). The backend shows a coordinator only
// notifications for events assigned to them now, plus ASSIGNMENT_ENDED notices;
// the mock's `gone` set stands in for that rule.

const coordinatorNotification = (id, eventId, overrides = {}) =>
  makeNotification(id, {
    type: 'EVENT_ASSIGNED',
    title: `Coordinator update ${id}`,
    message: `Update ${id} for REQ-${String(eventId).padStart(6, '0')}.`,
    event: { event_id: eventId, title: `Assigned event ${eventId}` },
    target: { page: 'EVENT_WORKSPACE', event_id: eventId },
    ...overrides,
  });

const assignmentEnded = (id, eventId) =>
  coordinatorNotification(id, eventId, {
    type: 'ASSIGNMENT_ENDED',
    title: 'Event assignment ended',
    message: `Assigned event ${eventId} has been reassigned to another coordinator.`,
  });

// The coordinator's workspace view of an assigned event, as GET /api/events/:id returns it.
const coordinatorView = (eventId) => ({
  eventId,
  requestId: `REQ-${String(eventId).padStart(6, '0')}`,
  status: 'UNDER_REVIEW',
  statusLabel: 'Under Review',
  statusNote: null,
  title: `Assigned event ${eventId}`,
  purpose: 'Annual planning forum',
  description: 'Talks and workshops.',
  startDatetime: '2026-11-20T09:00:00.000Z',
  endDatetime: '2026-11-20T11:00:00.000Z',
  expectedAttendance: 120,
  preferredLayoutType: 'THEATRE',
  accessibilityNeeds: [],
  venuePreferences: [],
  equipmentRequirements: [],
  isRegistrationEnabled: false,
  registrationCapacity: null,
  createdAt: '2026-10-10T09:00:00.000Z',
  updatedAt: '2026-10-12T09:00:00.000Z',
  version: 3,
  organisation: { organisationId: 1, name: 'Synthetic Org A' },
  isAssignedToCoordinator: true,
  isOwner: false,
  viewerRelationship: 'ASSIGNED_COORDINATOR',
  permissions: { canEdit: true, editableFields: ['title', 'purpose', 'description'], canViewDraftHistory: false, canViewStaffHistory: true },
  coordinatorId: 11,
  organiser: { userId: 5, name: 'Synthetic Organiser' },
});

// Registered after the shared mocks, so these answer first. `assigned` events
// load; any other ID is 404, as the backend answers after a reassignment.
async function routeWorkspace(page, assigned) {
  await page.route(/\/api\/events\/\d+$/, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const eventId = Number(new URL(route.request().url()).pathname.split('/').pop());
    return assigned.includes(eventId)
      ? route.fulfill({ json: { event: coordinatorView(eventId) } })
      : route.fulfill({ status: 404, json: { error: 'Event request not found.', code: 'EVENT_NOT_FOUND' } });
  });
}

const sidebarLink = (page) => page.locator('aside').getByRole('link', { name: 'Notifications', exact: true });

test('[SPM-193 AC11 / TC-14] Updates on Assigned Events shows the unread count and counts down as notifications are read', async ({ page }, testInfo) => {
  await installInbox(page, {
    role: 'COORDINATOR',
    notifications: [coordinatorNotification(1, 81), coordinatorNotification(2, 82), coordinatorNotification(3, 83)],
  });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Event Coordinator dashboard', level: 1 })).toBeVisible();
  await expect(updatesButton(page)).toHaveAccessibleName('Updates, 3 unread');
  // The red unread pill, as for attendees and organisers.
  const pill = updatesButton(page).getByText('3', { exact: true });
  await expect(pill).toHaveCSS('background-color', 'rgb(186, 26, 26)');
  await expect(pill).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(sidebarLink(page)).toHaveAttribute('href', '/notifications');

  await updatesButton(page).click();
  await expect(panel(page).getByText('3 New', { exact: true })).toBeVisible();
  await expect(panel(page).locator('article')).toHaveCount(3);
  await attachScreenshot(testInfo, page, 'coordinator-updates-panel');
  // Every coordinator notice has an event, so the panel row's action is Go to
  // Event; marking a single one read is covered on the inbox page below.
  await expect(panel(page).getByRole('button', { name: /^Mark as read/ })).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Mark all as read', exact: true }).click();
  await expect(updatesButton(page)).toHaveAccessibleName('Updates');
  await expect(panel(page).getByText(/ New$/)).toHaveCount(0);
});

test('[SPM-193 AC11 / TC-14] the coordinator inbox lists newest first and marks one, then all, as read', async ({ page }, testInfo) => {
  const { inbox } = await installInbox(page, {
    role: 'COORDINATOR',
    notifications: [coordinatorNotification(1, 81), coordinatorNotification(2, 81), coordinatorNotification(3, 82)],
  });
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
  await expect(page.locator('aside [aria-current="page"]')).toHaveCount(1);
  await expect(sidebarLink(page)).toHaveAttribute('aria-current', 'page');
  await expect(cards(page).locator('h3')).toHaveText([/Coordinator update 3/, /Coordinator update 2/, /Coordinator update 1/]);
  await expect(cards(page).first()).toContainText('Assigned event 82');
  await expect(page.getByText('3 unread', { exact: true })).toBeVisible();

  await cards(page).nth(1).getByRole('button', { name: /^View/ }).click();
  await expect(page.getByRole('dialog', { name: 'Coordinator update 2' })).toBeVisible();
  await expect(page.getByText('2 unread', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(unreadCards(page)).toHaveCount(2);

  await page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
  await expect(page.getByText('0 unread', { exact: true })).toBeVisible();
  await expect(unreadCards(page)).toHaveCount(0);
  expect(inbox.readRequests).toEqual([2]);
  expect(inbox.readAllRequests).toBe(1);
  await attachScreenshot(testInfo, page, 'coordinator-inbox');
});

test('[SPM-193 AC9 / TC-11] Go to Event marks the notification read and opens the coordinator\'s event workspace', async ({ page }, testInfo) => {
  const { inbox } = await installInbox(page, {
    role: 'COORDINATOR',
    notifications: [coordinatorNotification(1, 81, { title: 'New event assigned' })],
  });
  await routeWorkspace(page, [81]);
  await page.goto('/dashboard');
  await updatesButton(page).click();
  await panel(page).getByRole('button', { name: /^Go to Event/ }).click();
  await expect(page).toHaveURL(/\/events\/81$/);
  await expect(page.getByRole('heading', { name: 'Assigned event 81', exact: true })).toBeVisible();
  await expect(page.getByText('Assigned coordinator • Title, purpose & description editable')).toBeVisible();
  expect(inbox.readRequests).toEqual([1]);
  await attachScreenshot(testInfo, page, 'coordinator-workspace-from-notification');
});

test('[SPM-193 AC9, AC10 / TC-03, TC-12] after reassignment the "assignment ended" notice stays listed and its event is not available', async ({ page }, testInfo) => {
  // Event 82 was reassigned: the backend hides the earlier assignment notice
  // (2) and keeps the ASSIGNMENT_ENDED notice (3); event 82 is now 404.
  const { inbox } = await installInbox(page, {
    role: 'COORDINATOR',
    notifications: [coordinatorNotification(1, 81), coordinatorNotification(2, 82, { title: 'Earlier notice for 82' }), assignmentEnded(3, 82)],
    gone: [2],
  });
  await routeWorkspace(page, [81]);
  await page.goto('/notifications');
  await expect(cards(page)).toHaveCount(2);
  await expect(page.locator('main')).not.toContainText('Earlier notice for 82');

  await cards(page).first().getByRole('button', { name: /^Go to Event/ }).click();
  await expect(page).toHaveURL(/\/events\/82$/);
  await expect(page.getByText('Event not available')).toBeVisible();
  await expect(page.getByText(/reassigned to another coordinator/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Assigned event 82' })).toHaveCount(0);
  expect(inbox.readRequests).toEqual([3]);
  await attachScreenshot(testInfo, page, 'coordinator-event-not-available');

  // The notice itself is still in the inbox, now read.
  await page.goto('/notifications');
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).first()).toContainText('Event assignment ended');
  await expect(cards(page).first()).toHaveAttribute('data-unread', 'false');
});

test('[SPM-193 AC9 / TC-12] Go to Event on a notice hidden since the list loaded removes it: "This event is no longer assigned to you."', async ({ page }) => {
  const { inbox } = await installInbox(page, {
    role: 'COORDINATOR',
    notifications: [coordinatorNotification(1, 81), coordinatorNotification(2, 82)],
  });
  await page.goto('/notifications');
  await expect(cards(page)).toHaveCount(2);
  // Event 82 is reassigned while the inbox is open.
  inbox.gone.add(2);
  await cards(page).first().getByRole('button', { name: /^Go to Event/ }).click();
  await expect(page.getByText('This event is no longer assigned to you.', { exact: true })).toBeVisible();
  await expect(cards(page)).toHaveCount(1);
  await expect(page).toHaveURL(/\/notifications$/);
});

test('[SPM-193] signed out, a coordinator returns to /notifications after login and sees the coordinator\'s empty inbox', async ({ page }) => {
  const state = await installLoginMock(page, { role: 'COORDINATOR' });
  await page.route('**/api/notifications**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(new URL(route.request().url()).pathname.endsWith('unread-count') ? { unreadCount: 0 } : { notifications: [], nextCursor: null, unreadCount: 0 }) }));
  await page.goto('/notifications');
  await expect(page).toHaveURL(/\/login\?next=%2Fnotifications/);
  await page.locator('#email').fill('user@example.com');
  await page.locator('#password').fill('Valid-password9');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
  await expect(page.getByText(/Updates about events assigned to you/)).toBeVisible();
  expect(state.requestLog.some((entry) => entry.pathname === '/api/auth/me')).toBe(true);
});

test('[SPM-193 UI] mobile: the coordinator header keeps Updates, and the panel fits the screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installInbox(page, { role: 'COORDINATOR', notifications: [coordinatorNotification(1, 81), coordinatorNotification(2, 82)] });
  await page.goto('/dashboard');
  await expect(updatesButton(page)).toBeVisible();
  expect((await updatesButton(page).boundingBox()).height).toBeGreaterThanOrEqual(44);
  await updatesButton(page).click();
  await expect(panel(page).locator('article')).toHaveCount(2);
  const box = await panel(page).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(16);
  expect(box.x + box.width).toBeLessThanOrEqual(390 - 16 + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await attachScreenshot(testInfo, page, 'coordinator-mobile-panel');
});
