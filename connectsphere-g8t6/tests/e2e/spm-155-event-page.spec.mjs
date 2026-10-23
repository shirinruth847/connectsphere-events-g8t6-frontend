import { test, expect } from '@playwright/test';
import { attachScreenshot, installConnectSphereMocks, installLoginMock } from './support.mjs';
import { routeAttendeeEvents } from './spm-155-mocks.mjs';

// The full attendee event page at /events/<id> (SPM-155), opened with View
// Event Details from the shared dialog. Mocks follow GET /api/events/discovery/:id.

const detail = (eventId, title, overrides = {}) => ({
  eventId,
  title,
  description: `${title} description`,
  startDatetime: '2026-10-28T01:00:00.000Z',
  endDatetime: '2026-10-28T09:00:00.000Z',
  organisationName: 'SMU Computing Club',
  location: 'SMU Hall A',
  registrationAvailability: 'OPEN',
  registrationOpenAt: '2026-10-10T00:00:00.000Z',
  registrationCloseAt: '2026-10-27T15:59:00.000Z',
  attendeeStatus: 'CONFIRMED',
  detailsWithheld: false,
  myRegistration: null,
  ...overrides,
});

const registered = { status: 'REGISTERED', registeredAt: '2026-10-01T00:00:00.000Z' };

// `details` maps an event ID to the attendee's view of it, or to a status
// number (see routeAttendeeEvents). detailRequests records which endpoint was
// asked: myEvents (GET /api/registrations/mine/:eventId) or discovery.
async function installAttendee(page, { details = {}, discovery = [], registrations = [], notifications = [], role = 'ATTENDEE' } = {}) {
  const state = await installConnectSphereMocks(page, { role });
  await page.route('**/api/events/discovery?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: discovery, nextCursor: null }) }));
  const detailRequests = await routeAttendeeEvents(page, { details, registrations });
  await page.route('**/api/notifications**', (route) => {
    const url = new URL(route.request().url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/unread-count')) return json({ unreadCount: notifications.filter((n) => !n.is_read).length });
    const read = url.pathname.match(/\/notifications\/(\d+)\/read$/);
    if (read) return json({ notification: { notification_id: Number(read[1]), is_read: true, read_at: '2026-10-21T04:00:00.000Z' }, unreadCount: 0 });
    return json({ notifications, nextCursor: null, unreadCount: notifications.filter((n) => !n.is_read).length });
  });
  return { state, detailRequests };
}

const PENDING = ['photo', 'track', 'capacity', 'speakers', 'agenda', 'amenities'];
const sidebar = (page) => page.locator('aside');

test('[SPM-155] View Event Details in the Event Discovery dialog opens the full page and leads back', async ({ page }, testInfo) => {
  const summary = { eventId: 101, title: 'SMU Tech Summit', description: 'Talks', startDatetime: '2026-10-28T01:00:00.000Z', endDatetime: '2026-10-28T09:00:00.000Z', organisationName: 'SMU Computing Club', location: 'SMU Hall A', registrationAvailability: 'OPEN' };
  const { detailRequests } = await installAttendee(page, { discovery: [summary], details: { 101: detail(101, 'SMU Tech Summit') } });
  await page.goto('/events');
  await page.getByRole('button', { name: 'View event details for SMU Tech Summit' }).click();
  const dialog = page.getByRole('dialog', { name: 'SMU Tech Summit', exact: true });
  await expect(dialog).toContainText("Online sign-up isn't available in ConnectSphere yet.");
  await dialog.getByRole('link', { name: 'View Event Details', exact: true }).click();

  await expect(page).toHaveURL(/\/events\/101\?from=discovery$/);
  await expect(page.getByRole('heading', { name: 'SMU Tech Summit', level: 1 })).toBeVisible();
  await expect(sidebar(page).getByRole('link', { name: 'Event Discovery', exact: true })).toHaveAttribute('aria-current', 'page');
  // Event Discovery's dialog and page read only the discovery endpoint.
  expect(detailRequests).toEqual({ myEvents: [], discovery: [101, 101] });
  await attachScreenshot(testInfo, page, 'event-page-from-discovery');
  await page.getByRole('link', { name: 'Back to Event Discovery' }).click();
  await expect(page).toHaveURL(/\/events$/);
});

test('[SPM-155] the full page fills known sections and labels every pending one', async ({ page }) => {
  const { detailRequests } = await installAttendee(page, { details: { 52: detail(52, 'Event 2', { myRegistration: registered }) } });
  await page.goto('/events/52?from=my-events');
  const main = page.locator('main');
  await expect(page.getByRole('heading', { name: 'Event 2', level: 1 })).toBeVisible();
  // Filled from the attendee detail, in SGT.
  for (const text of ['Event 2 description', 'Wed, 28 Oct 2026', '09:00 – 17:00 SGT', 'SMU Hall A', 'SMU Computing Club', '10 Oct 2026, 08:00 SGT', '27 Oct 2026, 23:59 SGT', 'Your place', 'Since 1 Oct 2026, 08:00 SGT']) {
    await expect(main).toContainText(text);
  }
  // Every section from the frame without data says so.
  for (const name of PENDING) await expect(main.locator(`[data-pending="${name}"]`)).toBeVisible();
  await expect(main.getByText('Not available yet', { exact: true })).toHaveCount(4);
  await expect(main.getByText('Seat numbers are not available in ConnectSphere yet.', { exact: true })).toBeVisible();
  // Neutral wording: nobody is promised to provide the missing details.
  await expect(main).not.toContainText(/to be confirmed|once the|organisers/i);
  await expect(main).not.toContainText(/complimentary|price|\$/i);
  // A registered attendee is not offered sign-up.
  await expect(main.getByRole('button', { name: /register|waitlist|notify/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Back to My Events' })).toHaveAttribute('href', '/my-registrations');
  expect(detailRequests).toEqual({ myEvents: [52], discovery: [] });
});

test('[SPM-155] an event open for sign-up keeps the disabled registration action on the page', async ({ page }) => {
  await installAttendee(page, { details: { 60: detail(60, 'Open event') } });
  await page.goto('/events/60?from=discovery');
  const action = page.locator('main').getByRole('button', { name: 'Register Now', exact: true });
  await expect(action).toHaveAttribute('aria-disabled', 'true');
  await expect(action).toHaveAccessibleDescription("Online sign-up isn't available in ConnectSphere yet.");
});

test('[SPM-155 AC4/AC5] Go to Event → My Events dialog → View Event Details → back to My Events', async ({ page }) => {
  await installAttendee(page, {
    notifications: [{ notification_id: 9, type: 'EVENT_CHANGED', title: 'Event details changed', message: 'Changed.', created_at: '2026-10-21T03:00:00.000Z', is_read: false, read_at: null, event: { event_id: 52, title: 'Event 2' }, target: { page: 'MY_EVENTS', event_id: 52 }, action_expires_at: null }],
    registrations: [{ registration_id: 520, registration_status: 'REGISTERED', event: { event_id: 52, title: 'Event 2', attendee_status: 'CONFIRMED', venue: null } }],
    details: { 52: detail(52, 'Event 2', { myRegistration: registered }) },
  });
  await page.goto('/notifications');
  await page.getByRole('button', { name: 'Go to Event: Event 2', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Event 2', exact: true });
  await dialog.getByRole('link', { name: 'View Event Details', exact: true }).click();
  await expect(page).toHaveURL(/\/events\/52\?from=my-events$/);
  await page.getByRole('link', { name: 'Back to My Events' }).click();
  await expect(page).toHaveURL(/\/my-registrations$/);
});

test('[SPM-155 AC5] a cancelled event shows only its title, status and an explanation', async ({ page }, testInfo) => {
  const { detailRequests } = await installAttendee(page, {
    details: { 54: detail(54, 'Cancelled gala', { description: null, startDatetime: null, endDatetime: null, location: null, organisationName: null, registrationOpenAt: null, registrationCloseAt: null, registrationAvailability: 'CLOSED', attendeeStatus: 'CANCELLED', detailsWithheld: true, myRegistration: { status: 'WAITLISTED', registeredAt: null } }) },
  });
  await page.goto('/events/54');
  const main = page.locator('main');
  await expect(page.getByRole('heading', { name: 'Cancelled gala', level: 1 })).toBeVisible();
  await expect(main.getByText('Cancelled', { exact: true })).toBeVisible();
  await expect(main.getByText('This event has been cancelled', { exact: true })).toBeVisible();
  await expect(main.getByRole('alert').filter({ hasText: 'This event has been cancelled' })).toContainText('Its date, time and venue are no longer shown.');
  await expect(main).not.toContainText(/notification|organiser/i);
  await expect(main.locator('[data-pending]')).toHaveCount(0);
  await expect(main).not.toContainText('About this event');
  await expect(main.getByRole('button', { name: /register|waitlist|notify/i })).toHaveCount(0);
  // No ?from= (e.g. a direct link): back to My Events, read from the registration.
  await expect(page.getByRole('link', { name: 'Back to My Events' })).toBeVisible();
  expect(detailRequests).toEqual({ myEvents: [54], discovery: [] });
  await attachScreenshot(testInfo, page, 'event-page-cancelled');
});

// Withheld but not cancelled: being reconfirmed (PENDING_CONFIRMATION) or
// confirmed but not published. Both say only that details are being confirmed.
for (const [label, attendeeStatus] of [['being reconfirmed', 'PENDING_CONFIRMATION'], ['not published', 'CONFIRMED']]) {
  test(`[SPM-155 AC5] an event ${label} says its details are being confirmed, and nothing more`, async ({ page }) => {
    await installAttendee(page, {
      details: { 56: detail(56, 'Held event', { description: null, startDatetime: null, endDatetime: null, location: null, organisationName: null, registrationOpenAt: null, registrationCloseAt: null, registrationAvailability: 'CLOSED', attendeeStatus, detailsWithheld: true, myRegistration: registered }) },
    });
    await page.goto('/events/56?from=my-events');
    const main = page.locator('main');
    await expect(main.getByText("This event's details are being confirmed", { exact: true })).toBeVisible();
    await expect(main.getByRole('status').filter({ hasText: "This event's details are being confirmed" })).toContainText('Check back here for the latest information.');
    await expect(main).not.toContainText(/notification|organiser|being updated|changing/i);
    await expect(main.locator('[data-pending]')).toHaveCount(0);
    await expect(main).not.toContainText('About this event');
  });
}

test('[SPM-155 AC6] an event the attendee cannot see shows not available', async ({ page }) => {
  await installAttendee(page, { details: { 77: 404 } });
  await page.goto('/events/77?from=discovery');
  await expect(page.getByText('This event is no longer available', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to Event Discovery' })).toBeVisible();
});

test('[SPM-155] an unknown origin cannot redirect the back link; without a place the page falls back to discovery', async ({ page }) => {
  const { detailRequests } = await installAttendee(page, { details: { 52: detail(52, 'Event 2') } });
  await page.goto('/events/52?from=https%3A%2F%2Fevil.example');
  await expect(page.getByRole('heading', { name: 'Event 2', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to My Events' })).toHaveAttribute('href', '/my-registrations');
  expect(detailRequests).toEqual({ myEvents: [52], discovery: [52] });
});

for (const role of ['ORGANISER', 'COORDINATOR']) {
  test(`[SPM-155 / SPM-33] ${role} keeps the event workspace at /events/<id>`, async ({ page }) => {
    const { detailRequests } = await installAttendee(page, { role });
    await page.route(/\/api\/events\/42(\/history.*)?$/, (route) => {
      if (route.request().method() === 'OPTIONS') return route.fallback();
      if (new URL(route.request().url()).pathname.endsWith('/history')) return route.fulfill({ json: { history: [], nextCursor: null } });
      return route.fulfill({ json: { event: { eventId: 42, requestId: 'REQ-000042', status: 'UNDER_REVIEW', statusLabel: 'Under Review', title: 'Workspace review event', purpose: 'Planning', description: 'Talks.', startDatetime: '2026-11-20T09:00:00.000Z', endDatetime: '2026-11-20T11:00:00.000Z', expectedAttendance: 120, preferredLayoutType: 'THEATRE', accessibilityNeeds: [], venuePreferences: [], equipmentRequirements: [], isRegistrationEnabled: false, registrationCapacity: null, createdAt: '2026-10-10T09:00:00.000Z', updatedAt: '2026-10-12T09:00:00.000Z', version: 3, organisation: { organisationId: 1, name: 'Org' }, isAssignedToCoordinator: true, isOwner: role === 'ORGANISER', viewerRelationship: role === 'ORGANISER' ? 'OWNER' : 'ASSIGNED_COORDINATOR', permissions: { canEdit: false, editableFields: [], canViewDraftHistory: false, canViewStaffHistory: false }, coordinatorId: 11, organiser: { userId: 5, name: 'Organiser' } } } });
    });
    await page.goto('/events/42');
    await expect(page.locator(`[data-dashboard-shell="${role}"]`)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Workspace review event', exact: true })).toBeVisible();
    await expect(page.locator('[data-pending]')).toHaveCount(0);
    expect(detailRequests).toEqual({ myEvents: [], discovery: [] });
  });
}

test('[SPM-155 TC-12] signed out, /events/<id> returns there after an attendee logs in', async ({ page }) => {
  await installLoginMock(page, { role: 'ATTENDEE' });
  await routeAttendeeEvents(page, { details: { 42: detail(42, 'Returned event', { myRegistration: registered }) } });
  await page.route('**/api/notifications/unread-count', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unreadCount: 0 }) }));
  await page.goto('/events/42');
  await expect(page).toHaveURL(/\/login\?next=%2Fevents%2F42/);
  await page.locator('#email').fill('user@example.com');
  await page.locator('#password').fill('Valid-password9');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/events\/42$/);
  await expect(page.getByRole('heading', { name: 'Returned event', level: 1 })).toBeVisible();
});

test('[SPM-155 UI] mobile: the event page fits 390px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAttendee(page, { details: { 52: detail(52, 'Event 2', { myRegistration: registered }) } });
  await page.goto('/events/52?from=my-events');
  await expect(page.locator('[data-pending="speakers"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await attachScreenshot(testInfo, page, 'event-page-mobile');
});
