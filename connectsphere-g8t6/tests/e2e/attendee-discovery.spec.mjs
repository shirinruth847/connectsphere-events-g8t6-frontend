import { test, expect } from '@playwright/test';
import { installConnectSphereMocks, installLoginMock } from './support.mjs';

const makeEvent = (overrides = {}) => ({
  eventId: 101,
  title: 'SMU Tech Summit',
  description: 'Talks and demos from student developers.',
  startDatetime: '2026-10-28T01:00:00.000Z',
  endDatetime: '2026-10-28T09:00:00.000Z',
  organisationName: 'SMU Computing Club',
  location: 'SMU Hall A',
  registrationAvailability: 'OPEN',
  registrationOpenAt: '2026-10-10T00:00:00.000Z',
  registrationCloseAt: '2026-10-27T15:59:00.000Z',
  ...overrides,
});

// Attendee session from the shared mocks, plus the two discovery endpoints.
// `pages` maps a cursor ('' for the first page) to { events, nextCursor };
// `details` maps an event ID to its detail body, or to a status number.
// `signedOut` starts without a session, using the shared login mock.
async function installDiscoveryMocks(page, { pages = { '': { events: [], nextCursor: null } }, details = {}, role = 'ATTENDEE', signedOut = false } = {}) {
  const state = signedOut ? await installLoginMock(page, { role }) : await installConnectSphereMocks(page, { role });
  const requests = { list: [], detail: [] };
  await page.route('**/api/events/discovery**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') return route.fallback();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const detail = url.pathname.match(/^\/api\/events\/discovery\/(\d+)$/);
    if (detail) {
      requests.detail.push(Number(detail[1]));
      const body = details[detail[1]];
      if (typeof body === 'number') return json({ error: 'Event not found.' }, body);
      return body ? json({ event: body }) : json({ error: 'Event not found.' }, 404);
    }
    const cursor = url.searchParams.get('cursor') ?? '';
    requests.list.push(cursor);
    return json(pages[cursor] ?? { events: [], nextCursor: null });
  });
  return { state, requests };
}

const card = (page, title) => page.getByRole('article', { name: title, exact: true });

const UNAVAILABLE_NOTE = "Online sign-up isn't available in ConnectSphere yet.";

// The action stays focusable, describes why it is unavailable and uses the
// shared Button's disabled look (no pointer interaction, 55% opacity).
async function expectUnavailableAction(dialog, label) {
  const action = dialog.getByRole('button', { name: label, exact: true });
  await expect(action).toHaveAttribute('aria-disabled', 'true');
  await expect(action).not.toHaveAttribute('disabled');
  await expect(action).toHaveAccessibleDescription(UNAVAILABLE_NOTE);
  await expect(action).toHaveCSS('pointer-events', 'none');
  await expect(action).toHaveCSS('opacity', '0.55');
  await expect(dialog).not.toContainText('Registration coming soon');
}

test('[SPM-34 AC1/AC2] attendee sees published events in the shared workspace', async ({ page }) => {
  await installDiscoveryMocks(page, { pages: { '': { events: [makeEvent(), makeEvent({ eventId: 102, title: 'Career Fair', location: null, registrationAvailability: 'FULL_WAITLIST' })], nextCursor: null } } });
  await page.goto('/events');
  await expect(page.getByRole('heading', { name: 'Event Discovery', exact: true })).toBeVisible();
  await expect(page.locator('[data-dashboard-shell]')).toHaveAttribute('data-dashboard-shell', 'ATTENDEE');
  const nav = page.getByRole('navigation', { name: 'Main Navigation', exact: true });
  await expect(nav.getByRole('link', { name: 'Event Discovery', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'My Events', exact: true })).toHaveAttribute('href', '/my-registrations');

  const summit = card(page, 'SMU Tech Summit');
  await expect(summit).toContainText('Registration Open');
  await expect(summit).toContainText('SMU Hall A');
  await expect(summit).toContainText('Wed, 28 Oct 2026');
  await expect(summit).toContainText('09:00 – 17:00 SGT');
  await expect(summit).toContainText('SMU Computing Club');
  const fair = card(page, 'Career Fair');
  await expect(fair).toContainText('Full - Waitlist');
  await expect(fair).toContainText('Location details coming soon');
  await expect(page.getByText('Showing 2 events', { exact: true })).toBeVisible();
});

test('[SPM-34 AC5] empty list shows the empty state', async ({ page }) => {
  await installDiscoveryMocks(page);
  await page.goto('/events');
  await expect(page.getByRole('heading', { name: 'No events are available at the moment.', exact: true })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Load more events', exact: true })).toHaveCount(0);
});

test('[SPM-34 AC1] Load more appends the next page without duplicates', async ({ page }) => {
  const { requests } = await installDiscoveryMocks(page, {
    pages: {
      '': { events: [makeEvent(), makeEvent({ eventId: 102, title: 'Career Fair' })], nextCursor: 'page-2' },
      'page-2': { events: [makeEvent({ eventId: 102, title: 'Career Fair (repeated)' }), makeEvent({ eventId: 103, title: 'Hackathon' })], nextCursor: null },
    },
  });
  await page.goto('/events');
  await expect(page.getByRole('article')).toHaveCount(2);
  await expect(page.getByText('Showing 2 events · more available', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Load more events', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(card(page, 'Hackathon')).toBeVisible();
  await expect(card(page, 'Career Fair (repeated)')).toHaveCount(0);
  await expect(page.getByText('You have reached the end of the list.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load more events', exact: true })).toHaveCount(0);
  expect(requests.list).toEqual(['', 'page-2']);
});

test('[SPM-34 AC3/AC6] details modal shows the latest details and a disabled action', async ({ page }) => {
  const { requests } = await installDiscoveryMocks(page, {
    pages: { '': { events: [makeEvent({ title: 'Old title' })], nextCursor: null } },
    details: { 101: makeEvent({ title: 'SMU Tech Summit', description: 'Updated programme for the summit.' }) },
  });
  await page.goto('/events');
  const open = page.getByRole('button', { name: 'View event details for Old title', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'SMU Tech Summit', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Updated programme for the summit.');
  await expect(dialog).toContainText('Wed, 28 Oct 2026');
  await expect(dialog).toContainText('09:00 – 17:00 SGT');
  await expect(dialog).toContainText('SMU Hall A');
  await expect(dialog).toContainText('SMU Computing Club');
  await expect(dialog).toContainText('10 Oct 2026, 08:00 SGT');
  await expect(dialog).toContainText('27 Oct 2026, 23:59 SGT');
  await expectUnavailableAction(dialog, 'Register Now');
  expect(requests.detail).toEqual([101]);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // The list row picks up the refreshed title, and focus returns to its button.
  await expect(card(page, 'SMU Tech Summit')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View event details for SMU Tech Summit', exact: true })).toBeFocused();
});

test('[SPM-34 AC1/AC6] pagination and retry survive every loaded event becoming unavailable', async ({ page }) => {
  const events = Array.from({ length: 10 }, (_, index) => makeEvent({ eventId: 201 + index, title: `Removed event ${index}` }));
  const { requests } = await installDiscoveryMocks(page, {
    pages: {
      '': { events, nextCursor: 'page-2' },
      'page-2': { events: [makeEvent({ eventId: 301, title: 'Still available' })], nextCursor: null },
    },
  });
  await page.goto('/events');
  await expect(page.getByRole('article')).toHaveCount(10);
  for (const event of events) {
    await page.getByRole('button', { name: `View event details for ${event.title}`, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('This event is no longer available', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close event details', exact: true }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No events are available at the moment.', exact: true })).toHaveCount(0);
  await page.route('**/api/events/discovery?*', (route) => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporarily unavailable' }),
  }), { times: 1 });
  await page.getByRole('button', { name: 'Load more events', exact: true }).click();
  await expect(page.getByText('Could not load more events', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(card(page, 'Still available')).toBeVisible();
  expect(requests.list).toEqual(['', 'page-2']);
  await expect(page.getByText('You have reached the end of the list.', { exact: true })).toBeVisible();
});

// Join Waitlist works since SPM-163 (tests/e2e/spm-163-147.spec.mjs); the
// notify action stays unavailable.
test('[SPM-34 AC3 / SPM-163 AC1] Join Waitlist is offered for a full event; notify stays unavailable', async ({ page }) => {
  const waitlist = makeEvent({ eventId: 106, title: 'Full Workshop', registrationAvailability: 'FULL_WAITLIST' });
  // Opens far in the future, so the browser clock always reads it as not yet open.
  const upcoming = makeEvent({ eventId: 107, title: 'Future Gala', registrationAvailability: 'CLOSED', registrationOpenAt: '2099-01-01T00:00:00.000Z', registrationCloseAt: null });
  await installDiscoveryMocks(page, { pages: { '': { events: [waitlist, upcoming], nextCursor: null } }, details: { 106: waitlist, 107: upcoming } });
  await page.goto('/events');
  await page.getByRole('button', { name: 'View event details for Full Workshop', exact: true }).click();
  const full = page.getByRole('dialog', { name: 'Full Workshop', exact: true });
  await expect(full.getByRole('button', { name: 'Join Waitlist', exact: true })).toBeEnabled();
  await expect(full.getByRole('button', { name: 'Join Waitlist', exact: true })).not.toHaveAttribute('aria-disabled', 'true');
  await expect(full).not.toContainText(UNAVAILABLE_NOTE);
  await page.keyboard.press('Escape');
  await expect(full).toBeHidden();

  await page.getByRole('button', { name: 'View event details for Future Gala', exact: true }).click();
  const upcomingDialog = page.getByRole('dialog', { name: 'Future Gala', exact: true });
  await expectUnavailableAction(upcomingDialog, 'Notify when registration opens');
  await page.keyboard.press('Escape');
  await expect(upcomingDialog).toBeHidden();
});

test('[SPM-34 AC4] NOT_ENABLED events show no registration wording', async ({ page }) => {
  const event = makeEvent({ eventId: 104, title: 'Open House', description: 'Walk in any time.', registrationAvailability: 'NOT_ENABLED', registrationOpenAt: null, registrationCloseAt: null });
  await installDiscoveryMocks(page, { pages: { '': { events: [event], nextCursor: null } }, details: { 104: event } });
  await page.goto('/events');
  await expect(card(page, 'Open House')).not.toContainText(/regist|waitlist/i);
  await page.getByRole('button', { name: 'View event details for Open House', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Open House', exact: true });
  await expect(dialog).toContainText('Walk in any time.');
  await expect(dialog).not.toContainText(/regist|waitlist|notify/i);
  await expect(dialog.getByRole('button', { name: /register|waitlist|notify/i })).toHaveCount(0);
});

test('[SPM-34 AC6] a 404 on details says the event is no longer available', async ({ page }) => {
  await installDiscoveryMocks(page, {
    pages: { '': { events: [makeEvent(), makeEvent({ eventId: 105, title: 'Cancelled Talk' })], nextCursor: null } },
    details: { 105: 404 },
  });
  await page.goto('/events');
  await page.getByRole('button', { name: 'View event details for Cancelled Talk', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('This event is no longer available', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /register|waitlist|notify/i })).toHaveCount(0);
  await expect(card(page, 'Cancelled Talk')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close event details', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('article')).toHaveCount(1);
});

for (const role of ['ORGANISER']) {
  test(`[SPM-34] ${role} gets the standard access-denied message at /events`, async ({ page }) => {
    const { requests } = await installDiscoveryMocks(page, { role, pages: { '': { events: [makeEvent()], nextCursor: null } } });
    await page.goto('/events');
    await expect(page.getByText('This page is not available for your role.', { exact: false })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to your dashboard', exact: true })).toHaveAttribute('href', '/dashboard');
    await expect(page.getByRole('heading', { name: 'Event Discovery', exact: true })).toHaveCount(0);
    await expect(page.getByRole('article')).toHaveCount(0);
    expect(requests.list).toEqual([]);
  });
}

// Records any attendee call to the staff workspace endpoint GET /api/events/:id.
async function trackWorkspaceRequests(page) {
  const workspace = [];
  await page.route(/\/api\/events\/\d+(\?.*)?$/, (route) => {
    workspace.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Forbidden' }) });
  });
  return workspace;
}

test('[SPM-44 TC-EVENT-003] every returned event renders as its own card, whatever its registration availability', async ({ page }) => {
  const events = [
    makeEvent({ eventId: 401, title: 'Open Event', registrationAvailability: 'OPEN' }),
    makeEvent({ eventId: 402, title: 'Closed Event', registrationAvailability: 'CLOSED' }),
    makeEvent({ eventId: 403, title: 'No Registration Event', registrationAvailability: 'NOT_ENABLED' }),
    makeEvent({ eventId: 404, title: 'Waitlist Event', registrationAvailability: 'FULL_WAITLIST' }),
  ];
  const { requests } = await installDiscoveryMocks(page, { pages: { '': { events, nextCursor: null } } });
  await page.goto('/events');
  await expect(page.getByRole('article')).toHaveCount(4);
  await expect(card(page, 'Open Event')).toContainText('Registration Open');
  await expect(card(page, 'Closed Event')).toContainText('Registration Closed');
  await expect(card(page, 'No Registration Event')).toBeVisible();
  await expect(card(page, 'Waitlist Event')).toContainText('Full - Waitlist');
  await expect(page.getByText('Showing 4 events', { exact: true })).toBeVisible();
  expect(requests.list).toEqual(['']);
});

test('[SPM-44] a failed discovery request shows an error with retry, not the empty state', async ({ page }) => {
  await installDiscoveryMocks(page, { pages: { '': { events: [makeEvent()], nextCursor: null } } });
  await page.route('**/api/events/discovery?*', (route) => route.fulfill({
    status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Something went wrong.' }),
  }), { times: 1 });
  await page.goto('/events');
  await expect(page.getByText('Could not load events', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No events are available at the moment.', exact: true })).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(card(page, 'SMU Tech Summit')).toBeVisible();
});

test('[SPM-44] a hidden event is not rebuilt from list data in the details dialog', async ({ page }) => {
  await installDiscoveryMocks(page, { pages: { '': { events: [makeEvent({ eventId: 105, title: 'Now Hidden Talk' })], nextCursor: null } }, details: { 105: 404 } });
  await page.goto('/events');
  await page.getByRole('button', { name: 'View event details for Now Hidden Talk', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Event unavailable', exact: true });
  await expect(dialog.getByText('This event is no longer available', { exact: true })).toBeVisible();
  await expect(dialog).not.toContainText('Now Hidden Talk');
  await expect(dialog).not.toContainText('Registration Open');
});

test('[SPM-44] an attendee opening /events/:id reads only the discovery details endpoint', async ({ page }) => {
  const { requests } = await installDiscoveryMocks(page, { details: { 101: makeEvent() } });
  const workspace = await trackWorkspaceRequests(page);
  await page.goto('/events/101');
  await expect(page.getByRole('heading', { level: 1, name: 'SMU Tech Summit', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Event information', exact: true })).toBeVisible();
  await expect(page.getByText('Registration Open', { exact: true })).toBeVisible();
  await expect(page.getByText('SMU Hall A', { exact: true })).toBeVisible();
  await expect(page.getByText('SMU Computing Club', { exact: true })).toBeVisible();
  await expectUnavailableAction(page.locator('main'), 'Register Now');
  const nav = page.getByRole('navigation', { name: 'Main Navigation', exact: true });
  await expect(nav.getByRole('link', { name: 'Event Discovery', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: 'Back to Event Discovery', exact: true })).toHaveAttribute('href', '/events');
  expect(requests.detail).toEqual([101]);
  expect(workspace).toEqual([]);
});

for (const [label, rawId, detail] of [['a hidden (non-CONFIRMED) event', '105', 404], ['a malformed ID', 'abc', undefined]]) {
  test(`[SPM-44] an attendee opening ${label} directly sees the not-available state`, async ({ page }) => {
    const { requests } = await installDiscoveryMocks(page, { details: detail ? { [rawId]: detail } : {} });
    const workspace = await trackWorkspaceRequests(page);
    await page.goto(`/events/${rawId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Event details', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This event is not available', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /register|waitlist|notify/i })).toHaveCount(0);
    expect(workspace).toEqual([]);
    expect(requests.detail).toEqual(detail ? [Number(rawId)] : []);
  });
}

test('[SPM-44] a details failure on /events/:id offers retry', async ({ page }) => {
  await installDiscoveryMocks(page, { details: { 101: 503 } });
  await page.goto('/events/101');
  await expect(page.getByText('Could not load the event details', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'This event is not available', exact: true })).toHaveCount(0);
});

test('[SPM-44] a 400 from discovery shows safe wording with retry, not the backend message', async ({ page }) => {
  await installDiscoveryMocks(page, { pages: { '': { events: [makeEvent()], nextCursor: null } } });
  await page.route('**/api/events/discovery?*', (route) => route.fulfill({
    status: 400, contentType: 'application/json',
    body: JSON.stringify({ error: 'Please correct the highlighted fields.', code: 'VALIDATION_FAILED', fields: { cursor: 'Invalid page cursor.' } }),
  }), { times: 1 });
  await page.goto('/events');
  const alert = page.getByRole('alert').filter({ hasText: 'Could not load events' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('The events could not be loaded right now. Please try again.');
  await expect(alert).not.toContainText(/highlighted|cursor/i);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(card(page, 'SMU Tech Summit')).toBeVisible();
});

test('[SPM-44] a failed Load more keeps the loaded cards and recovers on retry', async ({ page }) => {
  const { requests } = await installDiscoveryMocks(page, {
    pages: {
      '': { events: [makeEvent(), makeEvent({ eventId: 102, title: 'Career Fair' })], nextCursor: 'page-2' },
      'page-2': { events: [makeEvent({ eventId: 103, title: 'Hackathon' })], nextCursor: null },
    },
  });
  await page.goto('/events');
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.route('**/api/events/discovery?*cursor=*', (route) => route.fulfill({
    status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal Server Error' }),
  }), { times: 1 });
  await page.getByRole('button', { name: 'Load more events', exact: true }).click();
  await expect(page.getByText('Could not load more events', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not load more events' })).toContainText('The next events could not be loaded right now. Please try again.');
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(card(page, 'Hackathon')).toBeVisible();
  // The retry reuses the backend's cursor unchanged.
  expect(requests.list).toEqual(['', 'page-2']);
});

test('[SPM-44] a 403 in the details dialog explains access without a retry', async ({ page }) => {
  await installDiscoveryMocks(page, { pages: { '': { events: [makeEvent()], nextCursor: null } }, details: { 101: 403 } });
  await page.goto('/events');
  await page.getByRole('button', { name: 'View event details for SMU Tech Summit', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Attendee access required', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
});

test('[SPM-44] a details failure on /events/:id recovers on retry', async ({ page }) => {
  await installDiscoveryMocks(page, { details: { 101: makeEvent() } });
  await page.route('**/api/events/discovery/101', (route) => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Service unavailable from upstream proxy' }),
  }), { times: 1 });
  await page.goto('/events/101');
  await expect(page.getByRole('alert').filter({ hasText: 'Could not load the event details' })).toContainText('The event details could not be loaded right now. Please try again.');
  await expect(page.getByText(/upstream proxy/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'SMU Tech Summit', exact: true })).toBeVisible();
});

test('[SPM-44] a signed-out attendee returns to /events/:id after login', async ({ page }) => {
  const { requests } = await installDiscoveryMocks(page, { signedOut: true, details: { 101: makeEvent() } });
  await page.goto('/events/101');
  await expect(page).toHaveURL(/\/login\?next=%2Fevents%2F101/);
  await page.locator('#email').fill('user@example.com');
  await page.locator('#password').fill('Valid-password9');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/events\/101$/);
  await expect(page.getByRole('heading', { level: 1, name: 'SMU Tech Summit', exact: true })).toBeVisible();
  expect(requests.detail).toEqual([101]);
});

// Wrong-role journeys (SPM-44, Master 4.2: attendees get the published view;
// other roles do not use the attendee discovery surface). /events is the Lead's
// own queue, so the Lead is checked for "no attendee surface" instead of the
// access-denied banner.
for (const [role, eventsSurface] of [
  ['COORDINATOR', 'denied'],
  ['COORDINATOR_LEAD', 'Unassigned requests'],
  ['VENUE_STAFF', 'denied'],
  ['TECH_SUPPORT', 'denied'],
]) {
  test(`[SPM-44 AC1] should_not_show_attendee_event_discovery_when_role_is_${role}`, async ({ page }) => {
    const { requests } = await installDiscoveryMocks(page, { role, pages: { '': { events: [makeEvent()], nextCursor: null } }, details: { 101: makeEvent() } });
    await page.goto('/events');
    if (eventsSurface === 'denied') {
      await expect(page.getByText('This page is not available for your role.', { exact: false })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Go to your dashboard', exact: true })).toHaveAttribute('href', '/dashboard');
    } else {
      await expect(page.getByRole('heading', { level: 1, name: eventsSurface, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Event Discovery', exact: true })).toHaveCount(0);
    await expect(card(page, 'SMU Tech Summit')).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: 'Main Navigation', exact: true });
    await expect(nav.getByRole('link', { name: 'Event Discovery', exact: true })).toHaveCount(0);
    expect(requests.list).toEqual([]);
    expect(requests.detail).toEqual([]);
  });

  test(`[SPM-44] should_use_the_staff_workspace_not_attendee_details_when_${role}_opens_an_event_url`, async ({ page }) => {
    const { state, requests } = await installDiscoveryMocks(page, { role, details: { 101: makeEvent() } });
    const staffEndpoint = role === 'VENUE_STAFF' ? '/api/venues/bookings/events/101' : '/api/events/101';
    if (role === 'VENUE_STAFF') {
      await page.route('**/api/venues/bookings/events/101', (route) => {
        state.requestLog.push({ pathname: staffEndpoint, method: route.request().method() });
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found.' }) });
      });
    }
    await page.goto('/events/101');
    // An unrelated staff event is answered as not found (SPM-33); nothing from the
    // attendee view is requested or shown.
    await expect(page.getByRole('heading', { name: 'Event not available', exact: true })).toBeVisible();
    await expect(page.getByText('SMU Tech Summit', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Event information', exact: true })).toHaveCount(0);
    expect(requests.detail).toEqual([]);
    expect(requests.list).toEqual([]);
    expect(state.requestLog.some((entry) => entry.pathname === staffEndpoint && entry.method === 'GET')).toBe(true);
  });
}

// 390px geometry (Master 3.4 practical mobile layouts; design system: 44px
// touch targets and no horizontal page scroll).
const MOBILE = { width: 390, height: 844 };

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
}

// Every visible link and button inside main is at least 44px in both directions.
async function expectTouchTargets(page) {
  const small = await page.locator('main').locator('a[href], button').evaluateAll((elements) => elements
    .filter((element) => element.getClientRects().length > 0)
    .map((element) => ({ name: element.getAttribute('aria-label') || element.textContent.trim(), box: element.getBoundingClientRect() }))
    .filter(({ box }) => box.height < 44 || box.width < 44)
    .map(({ name, box }) => `${name} ${Math.round(box.width)}x${Math.round(box.height)}`));
  expect(small).toEqual([]);
}

const LONG_TITLE = 'Annual Interfaculty Sustainability and Innovation Symposium with an Exceptionally Long Name';

test('[SPM-44] should_fit_390px_with_readable_cards_and_44px_actions_when_viewing_event_discovery', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  const events = [
    makeEvent({ eventId: 501, title: LONG_TITLE, registrationAvailability: 'OPEN', location: 'Lee Kong Chian School of Business Auditorium, Level 2' }),
    makeEvent({ eventId: 502, title: 'Closed Event', registrationAvailability: 'CLOSED' }),
    makeEvent({ eventId: 503, title: 'No Registration Event', registrationAvailability: 'NOT_ENABLED', organisationName: null }),
    makeEvent({ eventId: 504, title: 'Waitlist Event', registrationAvailability: 'FULL_WAITLIST', location: null }),
  ];
  await installDiscoveryMocks(page, { pages: { '': { events, nextCursor: 'page-2' }, 'page-2': { events: [], nextCursor: null } } });
  await page.goto('/events');
  await expect(page.getByRole('article')).toHaveCount(4);
  await expectNoHorizontalOverflow(page);

  for (const article of await page.getByRole('article').all()) {
    const box = await article.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(MOBILE.width);
    // Card text wraps inside the card rather than overflowing it.
    expect(await article.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
    const titleSize = await article.getByRole('heading', { level: 3 }).evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(titleSize).toBeGreaterThanOrEqual(16);
    const action = article.getByRole('button', { name: /^View event details for / });
    await expect(action).toBeVisible();
    // Full-width CTA under 768px.
    expect((await action.boundingBox()).width).toBeGreaterThan(box.width * 0.8);
  }
  // Status stays in text at this width.
  await expect(card(page, 'Closed Event')).toContainText('Registration Closed');
  await expect(card(page, 'Waitlist Event')).toContainText('Full - Waitlist');
  await expect(page.getByRole('button', { name: 'Load more events', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeVisible();
  await expectTouchTargets(page);
});

test('[SPM-44] should_fit_390px_with_44px_actions_when_viewing_attendee_event_details_page', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await installDiscoveryMocks(page, {
    details: { 101: makeEvent({ title: LONG_TITLE, description: 'Unbroken words such as Supercalifragilisticexpialidociousnessandmorecharacters still wrap.' }) },
  });
  await page.goto('/events/101');
  await expect(page.getByRole('heading', { level: 2, name: 'Event information', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const main = page.locator('main');
  expect(await main.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
  for (const label of ['Date', 'Time', 'Location', 'Organised by', 'Registration opens', 'Registration closes']) {
    await expect(main.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(main.getByText('Registration Open', { exact: true })).toBeVisible();
  await expect(main.getByRole('link', { name: 'Back to Event Discovery', exact: true })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Register Now', exact: true })).toBeVisible();
  await expectTouchTargets(page);
});

test('[SPM-44] should_fit_390px_when_showing_the_event_not_available_state', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await installDiscoveryMocks(page, { details: { 105: 404 } });
  await page.goto('/events/105');
  await expect(page.getByRole('heading', { name: 'This event is not available', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page);
});
