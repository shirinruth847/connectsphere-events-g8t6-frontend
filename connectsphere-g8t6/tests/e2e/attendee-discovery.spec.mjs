import { test, expect } from '@playwright/test';
import { installConnectSphereMocks } from './support.mjs';

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
async function installDiscoveryMocks(page, { pages = { '': { events: [], nextCursor: null } }, details = {}, role = 'ATTENDEE' } = {}) {
  const state = await installConnectSphereMocks(page, { role });
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
  await expect(page.getByRole('heading', { name: 'No events to discover right now', exact: true })).toBeVisible();
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
  const register = dialog.getByRole('button', { name: 'Register Now', exact: true });
  await expect(register).toHaveAttribute('aria-disabled', 'true');
  await expect(dialog).toContainText('Registration coming soon');
  expect(requests.detail).toEqual([101]);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // The list row picks up the refreshed title, and focus returns to its button.
  await expect(card(page, 'SMU Tech Summit')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View event details for SMU Tech Summit', exact: true })).toBeFocused();
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

for (const role of ['ORGANISER', 'COORDINATOR_LEAD']) {
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
