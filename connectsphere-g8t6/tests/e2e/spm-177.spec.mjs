import { test, expect } from '@playwright/test';
import { installConnectSphereMocks } from './support.mjs';

async function openAssignment(page) {
  await page.goto('/events');
  await page.getByRole('button', { name: 'Assign coordinator', exact: true }).click();
  await page.getByRole('radio', { name: 'Select coordinator Alex Coordinator' }).check();
}

test('[SPM-177] successful retry restores a queue after a transient outage', async ({ page }) => {
  const state = await installConnectSphereMocks(page, { role: 'COORDINATOR_LEAD' });
  state.failure = { path: '/api/events/unassigned', status: 503, body: { error: 'Synthetic temporary failure' } };
  await page.goto('/events');
  await expect(page.getByRole('heading', { name: 'Unable to load event requests' })).toBeVisible();
  state.failure = null;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Assignment queue', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assign coordinator', exact: true })).toBeEnabled();
});

test('[SPM-177] availability outage preserves the queue and prevents unverified assignment', async ({ page }) => {
  const state = await installConnectSphereMocks(page, { role: 'COORDINATOR_LEAD' });
  state.failure = { path: '/api/events/coordinator-availability', status: 503, body: { error: 'Synthetic schedule outage' } };
  await page.goto('/events');
  await expect(page.getByRole('heading', { name: 'Queued event request', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assign coordinator', exact: true })).toBeDisabled();
  state.failure = null;
  await page.getByRole('button', { name: 'Refresh availability', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Assign coordinator', exact: true })).toBeEnabled();
});

test('[SPM-177] a lost committed response requires a read before another command', async ({ page }) => {
  const state = await installConnectSphereMocks(page, { role: 'COORDINATOR_LEAD' });
  let writes = 0;
  await page.route('**/api/events/84/coordinator', async route => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    writes += 1;
    state.unassignedEvents = [];
    return route.abort('failed');
  });
  await openAssignment(page);
  await page.getByRole('button', { name: 'Confirm assignment', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Assign coordinator', exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh availability', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Queue cleared', exact: true })).toBeVisible();
  expect(writes).toBe(1);
});

test('[SPM-177] a rejected stale assignment is refreshed before another attempt', async ({ page }) => {
  const state = await installConnectSphereMocks(page, { role: 'COORDINATOR_LEAD' });
  state.failure = { path: '/api/events/84/coordinator', status: 409, body: { error: 'Coordinator became unavailable.', code: 'COORDINATOR_CONFLICT' } };
  await openAssignment(page);
  await page.getByRole('button', { name: 'Confirm assignment', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Assign coordinator', exact: true })).toBeDisabled();
  state.failure = null;
  await page.getByRole('button', { name: 'Refresh availability', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Assign coordinator', exact: true })).toBeEnabled();
  expect(state.coordinatorAssignmentRequests).toHaveLength(0);
});

test('[SPM-177] queue business-call expiry uses the shared login recovery', async ({ page }) => {
  const state = await installConnectSphereMocks(page, { role: 'COORDINATOR_LEAD' });
  state.failure = { path: '/api/events/unassigned', status: 401, body: { error: 'Please log in.', code: 'UNAUTHENTICATED' } };
  await page.goto('/events');
  await expect(page).toHaveURL(/\/login\?/);
  expect(state.coordinatorAssignmentRequests).toEqual([]);
});

for (const width of [1440, 390]) {
  test(`[SPM-177] Lead queue and confirmed feedback fit at ${width}px`, async ({ page }, testInfo) => {
    const state = await installConnectSphereMocks(page, { role: 'COORDINATOR_LEAD' });
    await page.setViewportSize({ width, height: 900 });
    await openAssignment(page);
    await page.getByRole('button', { name: 'Confirm assignment', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('REQ-000084 assigned to Alex Coordinator');
    expect(state.coordinatorAssignmentRequests).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach(`SPM-177-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
}

test.describe('Singapore calendar viewed from another timezone', () => {
  test.use({ timezoneId: 'UTC' });
  test('[SPM-177] calendar retains overnight work and excludes exact midnight endings', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2030-01-31T04:00:00Z'));
    const state = await installConnectSphereMocks(page, { role: 'COORDINATOR_LEAD' });
    state.coordinators[0].events = [
      { eventId: 90, title: 'Overnight synthetic work', status: 'PLANNING', startDatetime: '2030-01-30T23:00:00+08:00', endDatetime: '2030-01-31T01:00:00+08:00' },
      { eventId: 91, title: 'Ended at midnight', status: 'PLANNING', startDatetime: '2030-01-30T22:00:00+08:00', endDatetime: '2030-01-31T00:00:00+08:00' },
    ];
    await page.goto('/calendar');
    await expect(page.locator('.calendar-title')).toHaveText('January 2030');
    await page.getByRole('button', { name: 'Day', exact: true }).click();
    await expect(page.locator('.calendar-title')).toHaveText('Thu, 31 January 2030');
    await expect(page.locator('.cal-event-block[aria-label="Overnight synthetic work"]')).toHaveCount(1);
    await expect(page.locator('.cal-event-block[aria-label="Ended at midnight"]')).toHaveCount(0);
    await expect(page.locator('.cal-time-label').first()).toHaveText('00:00');
    await page.getByRole('button', { name: 'Month', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.calendar-title')).toHaveText('February 2030');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.calendar-title')).toHaveText('March 2030');
  });
});


test('[SPM-177 AC4] backend denial is preserved even for a trusted Lead profile', async ({ page }) => {
  const state = await installConnectSphereMocks(page, { role: 'COORDINATOR_LEAD' });
  state.failure = { path: '/api/events/unassigned', status: 403, body: { error: 'Forbidden.', code: 'FORBIDDEN' } };
  await page.goto('/events');
  await expect(page.getByRole('heading', { name: 'Lead access required', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assign coordinator', exact: true })).toHaveCount(0);
  expect(state.coordinatorAssignmentRequests).toEqual([]);
});
