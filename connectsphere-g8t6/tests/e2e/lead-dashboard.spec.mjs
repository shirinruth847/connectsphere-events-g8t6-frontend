import { test, expect } from '@playwright/test';
import { installConnectSphereMocks } from './support.mjs';

async function installLeadQueue(page) {
  const state = await installConnectSphereMocks(page, { role: 'COORDINATOR_LEAD' });
  state.queueEvents = [{
    eventId: 84,
    requestId: 'REQ-000084',
    title: 'Dashboard submitted request',
    status: 'SUBMITTED',
    purpose: 'Synthetic dashboard regression',
    startDatetime: '2030-01-31T02:00:00Z',
    endDatetime: '2030-01-31T04:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
    submittedAt: '2026-10-20T00:00:00Z',
    expectedAttendance: 20,
    organisation: { organisationId: 7, name: 'Synthetic Organisation' },
  }];
  state.coordinators = [{ coordinatorId: 22, name: 'Alex Coordinator', events: [] }];
  return state;
}

for (const width of [1440, 390]) {
  test(`[SPM-174 dashboard] shows submitted requests on Dashboard home at ${width}px`, async ({ page }, testInfo) => {
    const state = await installLeadQueue(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard submitted request', exact: true })).toBeVisible();
    const card = page.getByRole('article').filter({ hasText: 'Dashboard submitted request' });
    await expect(card).toContainText('REQ-000084');
    await expect(card).toContainText('Synthetic Organisation');
    await expect(card.getByRole('button', { name: 'Assign coordinator', exact: true })).toBeEnabled();
    expect(state.requestLog.filter(request => request.pathname === '/api/events/unassigned')).toHaveLength(1);
    await expect(page.locator('[data-dashboard-shell]')).toHaveCount(1);
    if (width === 1440) await expect(page.locator('#dashboard-sidebar').getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach(`lead-dashboard-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
}

test('[SPM-174 dashboard] confirms assignment and removes the request from home', async ({ page }) => {
  const state = await installLeadQueue(page);
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Assign coordinator', exact: true }).click();
  await page.getByRole('radio', { name: 'Select coordinator Alex Coordinator' }).check();
  expect(state.coordinatorChanges).toEqual([]);
  await page.getByRole('button', { name: 'Confirm assignment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard submitted request', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Queue cleared', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('REQ-000084 assigned to Alex Coordinator');
  expect(state.coordinatorChanges).toEqual([{ coordinatorId: 22 }]);
  await page.locator('#dashboard-sidebar').getByRole('link', { name: 'Assignments', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Dashboard submitted request' })).toContainText('Alex Coordinator');
});

test('[SPM-174 dashboard] displays an empty queue only after a successful read', async ({ page }) => {
  const state = await installLeadQueue(page);
  state.queueEvents = [];
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Queue cleared', exact: true })).toBeVisible();
  expect(state.requestLog.some(request => request.pathname === '/api/events/unassigned')).toBe(true);
});

test('[SPM-174 dashboard] retries failed reads without claiming the queue is empty', async ({ page }) => {
  const state = await installLeadQueue(page);
  state.failure = { path: '/api/events/unassigned', status: 503, body: { error: 'Synthetic temporary outage' } };
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Unable to load event requests', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Queue cleared', exact: true })).toHaveCount(0);
  state.failure = null;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard submitted request', exact: true })).toBeVisible();
});

test('[SPM-174 dashboard] preserves a backend access denial on home', async ({ page }) => {
  const state = await installLeadQueue(page);
  state.failure = { path: '/api/events/unassigned', status: 403, body: { error: 'Forbidden.', code: 'FORBIDDEN' } };
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Lead access required', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assign coordinator', exact: true })).toHaveCount(0);
  expect(state.coordinatorChanges).toEqual([]);
});

test('[SPM-174 dashboard] recovers an expired queue session through shared login', async ({ page }) => {
  const state = await installLeadQueue(page);
  state.failure = { path: '/api/events/unassigned', status: 401, body: { error: 'Please log in.', code: 'UNAUTHENTICATED' } };
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  expect(state.coordinatorChanges).toEqual([]);
});
