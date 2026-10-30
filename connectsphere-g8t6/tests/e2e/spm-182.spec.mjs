import { test, expect } from '@playwright/test';
import { installConnectSphereMocks } from './support.mjs';

const supervised = (eventId, title, startDatetime, extra = {}) => ({
  eventId, requestId: `REQ-${String(eventId).padStart(6, '0')}`, title, status: 'PLANNING',
  startDatetime, endDatetime: startDatetime.replace('T02', 'T04'), expectedAttendance: 40, createdAt: '2026-10-01T00:00:00Z',
  coordinatorId: 21, coordinatorName: 'Coordinator A', supervisingLeadId: 11, hasScheduleConflict: false, ...extra,
});
const queued = (eventId, title, submittedAt) => ({
  eventId, requestId: `REQ-${String(eventId).padStart(6, '0')}`, title, status: 'SUBMITTED',
  startDatetime: '2027-03-01T02:00:00Z', endDatetime: '2027-03-01T04:00:00Z', expectedAttendance: 85,
  createdAt: '2026-10-01T00:00:00Z', submittedAt,
});

const e2 = supervised(182002, 'SPM182 review event', '2027-01-02T02:00:00Z', { status: 'UNDER_REVIEW', coordinatorName: 'Coordinator B', coordinatorId: 22 });
const e1 = supervised(182001, 'SPM182 conflicting event', '2027-01-03T02:00:00Z', { hasScheduleConflict: true });
const legacy = supervised(182010, 'SPM182 legacy event', '2027-02-01T02:00:00Z', { supervisingLeadId: null });
const e4 = queued(182004, 'SPM182 oldest queued event', '2026-10-20T01:00:00Z');
const e3 = queued(182003, 'SPM182 newer queued event', '2026-10-21T01:00:00Z');

const summaryValue = (page, label) => page.getByLabel('Assignment summary').locator('div').filter({ hasText: label }).locator('dd');
const unassignedList = (page) => page.getByRole('list', { name: 'Unassigned events' });

const openOverview = async (page, setup = () => {}) => {
  const state = await installConnectSphereMocks(page, { role: 'COORDINATOR_LEAD' });
  state.assignments = [e2, e1, legacy];
  state.queueEvents = [e4, e3];
  setup(state);
  await page.goto('/assignments');
  return state;
};

test('[SPM-182-AC1/AC3/AC4][TC-01][TC-02] shows supervised coordinators and identifies unassigned events', async ({ page }) => {
  await openOverview(page);

  const rows = unassignedList(page).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('SPM182 oldest queued event');
  await expect(rows.nth(1)).toContainText('SPM182 newer queued event');
  for (const row of await rows.all()) {
    await expect(row).toContainText('Unassigned');
    await expect(row).toContainText('85 expected');
    await expect(row).toContainText('Submitted');
  }
  await expect(page.getByRole('heading', { name: 'Unassigned (2)' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Assign in queue' })).toHaveAttribute('href', '/events');

  await expect(page.getByRole('heading', { name: 'Supervised events (3)' })).toBeVisible();
  await expect(page.getByRole('article', { name: e2.title })).toContainText('Current coordinator: Coordinator B');
  await expect(page.getByRole('article', { name: e1.title })).toContainText('Current coordinator: Coordinator A');
  await expect(page.getByRole('article', { name: e1.title }).getByRole('link', { name: e1.title })).toHaveAttribute('href', `/events/${e1.eventId}`);
  await expect(page.getByRole('article', { name: legacy.title })).toContainText('Unsupervised');
  for (const queuedEvent of [e3, e4]) await expect(page.getByRole('article', { name: queuedEvent.title })).toHaveCount(0);
});

test('[SPM-182-AC6][TC-10] summary counts match the rows and the conflict filter leaves the queue alone', async ({ page }) => {
  await openOverview(page);

  await expect(summaryValue(page, 'Supervised')).toHaveText('3');
  await expect(summaryValue(page, 'Unassigned')).toHaveText('2');
  await expect(summaryValue(page, 'Scheduling conflicts')).toHaveText('1');

  await page.getByLabel(/Show scheduling conflicts only/).check();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('article', { name: e1.title })).toBeVisible();
  await expect(unassignedList(page).getByRole('listitem')).toHaveCount(2);
});

test('[SPM-182-AC3/AC7][TC-03][TC-04] empty sections say so independently', async ({ page }) => {
  await openOverview(page, (state) => { state.queueEvents = []; });
  await expect(page.getByRole('heading', { name: 'No events are waiting for a coordinator.' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(3);

  await openOverview(page, (state) => { state.assignments = []; });
  await expect(page.getByRole('heading', { name: 'No active assignments' })).toBeVisible();
  await expect(unassignedList(page).getByRole('listitem')).toHaveCount(2);
});

test('[SPM-182-AC8][TC-11] a failed queue load keeps the supervised list and recovers on retry', async ({ page }) => {
  const state = await openOverview(page, (mocks) => { mocks.failure = { path: '/api/events/unassigned', status: 500, body: { error: 'Server error' } }; });

  const alert = page.getByRole('alert').filter({ hasText: 'Unassigned events could not be loaded.' });
  await expect(alert).toBeVisible();
  await expect(unassignedList(page)).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(summaryValue(page, 'Unassigned')).toHaveText('—');

  state.failure = null;
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(unassignedList(page).getByRole('listitem')).toHaveCount(2);
});

test('[SPM-182-AC8][TC-12] a failed assignments load keeps the queue and recovers on retry', async ({ page }) => {
  const state = await openOverview(page, (mocks) => { mocks.failure = { path: '/api/events/assignments', status: 500, body: { error: 'Server error' } }; });

  const alert = page.getByRole('alert').filter({ hasText: 'Assignments could not be loaded.' });
  await expect(alert).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(unassignedList(page).getByRole('listitem')).toHaveCount(2);
  await expect(summaryValue(page, 'Scheduling conflicts')).toHaveText('—');
  const conflictFilter = page.getByLabel(/Show scheduling conflicts only/);
  await expect(conflictFilter).toBeDisabled();
  await expect(page.getByText('Show scheduling conflicts only (—)')).toBeVisible();

  state.failure = null;
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(conflictFilter).toBeEnabled();
  await expect(page.getByText('Show scheduling conflicts only (1)')).toBeVisible();
});

test('[SPM-182-AC1/AC8][TC-16] a failed availability load keeps supervised events and pauses reassignment until retry', async ({ page }) => {
  const state = await openOverview(page, (mocks) => { mocks.failure = { path: '/api/events/coordinator-availability', status: 500, body: { error: 'Server error' } }; });

  const warning = page.getByText('Coordinator availability could not be loaded.').locator('..');
  await expect(warning).toContainText('Reassignment is unavailable until you retry.');
  await expect(page.getByText('Assignments could not be loaded.')).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByRole('article', { name: e2.title })).toContainText('Current coordinator: Coordinator B');
  await expect(summaryValue(page, 'Supervised')).toHaveText('3');
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByText(/No alternative coordinator is currently available/)).toHaveCount(0);

  state.failure = null;
  await warning.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('Coordinator availability could not be loaded.')).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveCount(3);
});

test('[SPM-182-AC5][TC-07] an event assigned from the queue moves into the supervised section', async ({ page }) => {
  const state = await openOverview(page, (mocks) => { mocks.assignments = []; mocks.queueEvents = [e4]; });
  await expect(unassignedList(page).getByRole('listitem')).toHaveCount(1);

  await page.getByRole('link', { name: 'Assign in queue' }).click();
  await expect(page).toHaveURL(/\/events$/);
  const card = page.getByRole('article').filter({ hasText: e4.title });
  await card.getByRole('button', { name: 'Assign coordinator', exact: true }).click();
  await page.getByRole('radio', { name: /Select coordinator/ }).first().check();
  await page.getByRole('button', { name: 'Confirm assignment' }).click();
  await expect(card).toHaveCount(0);
  expect(state.coordinatorChanges).toHaveLength(1);

  await page.goto('/assignments');
  await expect(page.getByRole('article', { name: e4.title })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No events are waiting for a coordinator.' })).toBeVisible();
  await expect(summaryValue(page, 'Unassigned')).toHaveText('0');
});

for (const role of ['ORGANISER', 'COORDINATOR', 'VENUE_STAFF', 'TECH_SUPPORT', 'SAFETY_OFFICER', 'ATTENDEE']) {
  test(`[SPM-182-AC9][TC-13] ${role} is denied the overview without loading either section`, async ({ page }) => {
    const state = await installConnectSphereMocks(page, { role });
    await page.goto('/assignments');
    await expect(page.getByText('Access denied', { exact: true })).toBeVisible();
    expect(state.requestLog.filter((r) => ['/api/events/assignments', '/api/events/unassigned'].includes(r.pathname))).toHaveLength(0);
  });
}

for (const width of [1440, 390]) {
  test(`[SPM-182] overview fits without horizontal scroll at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openOverview(page);
    await expect(unassignedList(page).getByRole('listitem')).toHaveCount(2);
    await expect(page.getByRole('article')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`spm-182-overview-${width}.png`), fullPage: true });
  });
}
