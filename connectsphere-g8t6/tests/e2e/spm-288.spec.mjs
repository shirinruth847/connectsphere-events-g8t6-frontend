import { test, expect } from '@playwright/test';
import { installConnectSphereMocks } from './support.mjs';

// Sunday 01:00 in Singapore is still Saturday in UTC, so a UTC reading would open the week before.
const request = {eventId:91,requestId:'REQ-000091',title:'Event week request',status:'SUBMITTED',startDatetime:'2030-03-09T17:00:00Z',endDatetime:'2030-03-09T19:00:00Z',expectedAttendance:30,createdAt:'2026-10-01T00:00:00Z'};
const commitment = {eventId:92,requestId:'REQ-000092',title:'Monday commitment',status:'PLANNING',startDatetime:'2030-03-11T02:00:00Z',endDatetime:'2030-03-11T04:00:00Z',expectedAttendance:10,createdAt:'2026-10-01T00:00:00Z',coordinatorId:21};

async function openAssignment(page) {
  const state = await installConnectSphereMocks(page, { role: 'COORDINATOR_LEAD' });
  state.coordinators = [
    { coordinatorId: 21, name: 'Coordinator A', events: [commitment] },
    { coordinatorId: 22, name: 'Coordinator B', events: [] },
  ];
  state.queueEvents = [{ ...request }];
  await page.goto('/events');
  const assign = page.getByRole('article').filter({ hasText: request.title }).getByRole('button', { name: 'Assign coordinator', exact: true });
  await assign.click();
  const dialog = page.getByRole('dialog', { name: request.title });
  await expect(dialog).toBeVisible();
  return { state, assign, dialog };
}

test('[SPM-288] keyboard focus stays in the assignment dialog and returns to the request on Escape', async ({ page }) => {
  const { assign, dialog } = await openAssignment(page);
  expect(await dialog.evaluate((element) => element.matches(':modal'))).toBe(true);
  for (let i = 0; i < 30; i += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => document.activeElement === document.body || element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(assign).toBeFocused();
});

test.describe('viewed from UTC', () => {
  test.use({ timezoneId: 'UTC' });
  for (const width of [1440, 390]) {
    test(`[SPM-288] the event week opens on the request's Singapore week and assigns from the calendar at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const { state, dialog } = await openAssignment(page);
      await dialog.getByRole('button', { name: 'Event week', exact: true }).click();
      await expect(dialog.locator('.calendar-title')).toHaveText('Sun 10, March 2030 – Sat 16');
      await expect(dialog.getByLabel(`Unassigned: ${request.title}`)).toHaveCount(1);
      await expect(dialog.getByText('No coordinator selected yet.', { exact: false })).toBeVisible();
      await dialog.getByLabel(/Monday commitment/).click();
      await dialog.getByLabel('Assign to').selectOption('22');
      await expect(dialog.getByText('Selected coordinator: Coordinator B.', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await testInfo.attach(`SPM-288-event-week-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
      await page.keyboard.press('Escape');
      await expect(dialog.getByLabel('Assign to')).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Confirm assignment', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('REQ-000091 assigned to Coordinator B');
      expect(state.coordinatorChanges).toEqual([{ coordinatorId: 22 }]);
    });
  }
});
