import { test, expect } from '@playwright/test';
import { attachScreenshot } from './support.mjs';
import { installRegistrationActions, makeEvent } from './spm-163-mocks.mjs';

// My Events (SPM-141) against spm-163-mocks.mjs, which follows the backend's
// GET /api/registrations/mine contract: newest registration first, paged by
// next_offset, withheld values null. Leave Waitlist, offers and withdrawal on
// this page are covered by spm-163-147.spec.mjs (TC-MYE-010 to 022, 025).

const card = (page, title) => page.locator('[id^="registration-event-"]').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const row = (scope, label) => scope.locator('dl > div').filter({ has: scope.page().locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd');
const titles = (page) => page.locator('[id^="registration-event-"] h2').allTextContents();
const sgtDate = (iso) => new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

// Registered newest first, as the backend returns them; none in date order.
const MIXED = {
  901: { event: makeEvent(901, 'Alpha Summit', { startDatetime: '2027-03-10T01:00:00.000Z', endDatetime: '2027-03-10T03:00:00.000Z' }), place: { status: 'REGISTERED' }, venue: { name: 'SMU Hall A', address: '81 Victoria St' }, registeredAt: '2026-10-05T00:00:00.000Z' },
  902: { event: makeEvent(902, 'Beta Workshop', { startDatetime: '2027-02-01T06:00:00.000Z', endDatetime: '2027-02-01T08:00:00.000Z' }), place: { status: 'WAITLISTED', waitlistPosition: 4, offer: null }, venue: { name: 'Lab 2', address: null }, registeredAt: '2026-10-04T00:00:00.000Z' },
  903: { event: makeEvent(903, 'Gamma Talk', { startDatetime: null, endDatetime: null, description: null }), place: { status: 'REGISTERED' }, attendeeStatus: 'PENDING_CONFIRMATION', registeredAt: '2026-10-03T00:00:00.000Z' },
  904: { event: makeEvent(904, 'Delta Fair', { startDatetime: '2026-09-01T01:00:00.000Z', endDatetime: '2026-09-01T03:00:00.000Z' }), place: { status: 'REGISTERED' }, attendeeStatus: 'COMPLETED', registeredAt: '2026-10-02T00:00:00.000Z' },
  905: { event: makeEvent(905, 'Epsilon Gala', { startDatetime: null, endDatetime: null, description: null }), place: { status: 'REGISTERED' }, attendeeStatus: 'CANCELLED', registeredAt: '2026-10-01T00:00:00.000Z' },
};

test('[SPM-141 AC1, AC3 TC-MYE-001, 005, 006] every page is read, then upcoming events come first by date and closed ones after', async ({ page }, testInfo) => {
  const state = await installRegistrationActions(page, { events: structuredClone(MIXED), pageSize: 2 });
  await page.goto('/my-registrations');
  await expect(card(page, 'Epsilon Gala')).toBeVisible();
  expect(state.listReads.map((read) => read.offset)).toEqual([0, 2, 4]);
  // Nearest first; a withheld date is last among active events, never given one.
  expect(await titles(page)).toEqual(['Beta Workshop', 'Alpha Summit', 'Gamma Talk', 'Delta Fair', 'Epsilon Gala']);

  const alpha = card(page, 'Alpha Summit');
  await expect(row(alpha, 'Your place')).toHaveText('Registered');
  await expect(row(alpha, 'Event status')).toHaveText('Confirmed');
  await expect(row(alpha, 'Date')).toHaveText(sgtDate('2027-03-10T01:00:00.000Z'));
  await expect(row(alpha, 'Time')).toHaveText('09:00 – 11:00 SGT');
  await expect(row(alpha, 'Location')).toHaveText('SMU Hall A, 81 Victoria St');
  await expect(alpha.getByRole('button', { name: 'Withdraw Registration: Alpha Summit', exact: true })).toBeVisible();

  // A venue with no address shows its name alone.
  await expect(row(card(page, 'Beta Workshop'), 'Location')).toHaveText('Lab 2');

  const gamma = card(page, 'Gamma Talk');
  await expect(row(gamma, 'Event status')).toHaveText('Event confirmation pending');
  await expect(row(gamma, 'Date')).toHaveText('Date to be announced');
  await expect(row(gamma, 'Time')).toHaveText('Time to be announced');
  await expect(row(gamma, 'Location')).toHaveText('Location details coming soon');

  const delta = card(page, 'Delta Fair');
  await expect(row(delta, 'Event status')).toHaveText('Completed');
  await expect(delta.getByRole('button', { name: /Withdraw Registration|Leave Waitlist|Accept Slot|Decline/ })).toHaveCount(0);
  await attachScreenshot(testInfo, page, 'my-events-mixed');
});

test('[SPM-141 AC1 TC-MYE-003] a cancelled event shows Cancelled apart from the attendee\'s own place', async ({ page }) => {
  await installRegistrationActions(page, { events: { 905: structuredClone(MIXED[905]) } });
  await page.goto('/my-registrations');
  const gala = card(page, 'Epsilon Gala');
  await expect(gala.getByText('Cancelled', { exact: true })).toHaveCount(2);
  await expect(row(gala, 'Event status')).toHaveText('Cancelled');
  await expect(row(gala, 'Your place')).toHaveText('Registered');
  await expect(gala).not.toContainText(/withdraw/i);
  // Its withheld date and venue are left out rather than "to be announced".
  await expect(row(gala, 'Date')).toHaveCount(0);
  await expect(row(gala, 'Location')).toHaveCount(0);
  await expect(gala.getByRole('button', { name: /Withdraw Registration|Leave Waitlist/ })).toHaveCount(0);
  await expect(gala.getByRole('button', { name: 'View Event Details: Epsilon Gala', exact: true })).toBeVisible();
});

test('[SPM-141 AC1, AC5, AC8 TC-MYE-002, 023] the waitlist position is the backend\'s, and a refresh shows its new one', async ({ page }) => {
  const state = await installRegistrationActions(page, { events: { 902: structuredClone(MIXED[902]) } });
  await page.goto('/my-registrations');
  const beta = card(page, 'Beta Workshop');
  await expect(row(beta, 'Your place')).toHaveText('On the waitlist · Position 4');
  await expect(beta.getByRole('button', { name: 'Leave Waitlist: Beta Workshop', exact: true })).toBeVisible();

  state.events[902].place.waitlistPosition = 2;
  await page.reload();
  await expect(row(card(page, 'Beta Workshop'), 'Your place')).toHaveText('On the waitlist · Position 2');
});

test.describe('in a browser outside Singapore', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test('[SPM-141 AC3 TC-MYE-007] event dates and times stay in Singapore time', async ({ page }) => {
    await installRegistrationActions(page, { events: { 901: structuredClone(MIXED[901]) } });
    await page.goto('/my-registrations');
    expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('America/Los_Angeles');
    const alpha = card(page, 'Alpha Summit');
    // 01:00Z is 17:00 the evening before in Los Angeles.
    await expect(row(alpha, 'Date')).toHaveText(sgtDate('2027-03-10T01:00:00.000Z'));
    await expect(row(alpha, 'Date')).toContainText('10 Mar');
    await expect(row(alpha, 'Time')).toHaveText('09:00 – 11:00 SGT');
  });
});

test('[SPM-141 AC4 TC-MYE-008, 009] with no places, the empty state leads to Event Discovery', async ({ page }, testInfo) => {
  await installRegistrationActions(page, { events: {} });
  await page.goto('/my-registrations');
  await expect(page.getByText('You are not registered for any events yet.', { exact: true })).toBeVisible();
  const explore = page.getByRole('link', { name: 'Explore events', exact: true });
  await expect(explore).toBeVisible();
  await attachScreenshot(testInfo, page, 'my-events-empty');
  await explore.click();
  await expect(page).toHaveURL(/\/events$/);
});

test('[SPM-141 TC-MYE-024] a failed read shows a retry, never an empty list or actions', async ({ page }) => {
  const state = await installRegistrationActions(page, { events: { 901: structuredClone(MIXED[901]) }, placesStatus: 500 });
  await page.goto('/my-registrations');
  const alert = page.getByRole('alert').filter({ has: page.getByRole('button', { name: 'Retry', exact: true }) });
  await expect(alert).toBeVisible();
  await expect(alert).not.toContainText('Internal Server Error');
  await expect(page.getByText('You are not registered for any events yet.', { exact: true })).toHaveCount(0);
  await expect(page.locator('[id^="registration-event-"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /View Event Details|Withdraw Registration|Leave Waitlist|Accept Slot|Decline/ })).toHaveCount(0);

  state.placesStatus = null;
  await alert.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(card(page, 'Alpha Summit')).toBeVisible();
  await expect(page.getByRole('alert').filter({ has: page.getByRole('button', { name: 'Retry', exact: true }) })).toHaveCount(0);
  expect(state.actions).toEqual([]);
});

test('[SPM-141 AC7 TC-MYE-022] after a refused withdrawal the keyboard focus lands on the status message, not the page', async ({ page }) => {
  const state = await installRegistrationActions(page, {
    events: { 901: structuredClone(MIXED[901]) },
    refuse: { withdraw: [{ status: 409, code: 'EVENT_STARTED' }] },
  });
  await page.goto('/my-registrations');
  await card(page, 'Alpha Summit').getByRole('button', { name: 'Withdraw Registration: Alpha Summit', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Withdraw Registration', exact: true });
  await confirm.getByRole('button', { name: 'Confirm Withdrawal', exact: true }).click();
  await expect(confirm.getByRole('alert')).toContainText('Cannot withdraw registration for past events');
  await confirm.getByRole('button', { name: 'Close', exact: true }).click();
  const message = page.getByText('Your place for Alpha Summit had changed. Showing its latest status.', { exact: true });
  await expect(message).toBeVisible();
  await expect(page.locator('[aria-live="polite"]').filter({ has: message })).toBeFocused();
  await expect(row(card(page, 'Alpha Summit'), 'Your place')).toHaveText('Registered');
  expect(state.actions.map((action) => action.action)).toEqual(['withdraw']);
});

test('[SPM-141 AC2 TC-MYE-004] View Event Details opens the shared dialog from the attendee\'s own event', async ({ page }) => {
  await installRegistrationActions(page, { events: { 901: structuredClone(MIXED[901]) } });
  await page.goto('/my-registrations');
  const own = page.waitForRequest((request) => request.method() === 'GET' && new URL(request.url()).pathname === '/api/registrations/mine/901');
  const opener = card(page, 'Alpha Summit').getByRole('button', { name: 'View Event Details: Alpha Summit', exact: true });
  await opener.click();
  await own;
  const dialog = page.getByRole('dialog', { name: 'Alpha Summit', exact: true });
  await expect(dialog).toContainText('Alpha Summit description');
  await expect(dialog).toContainText('SMU Hall A');
  await expect(dialog).toContainText('09:00 – 11:00 SGT');
  await expect(dialog.getByRole('button', { name: 'Withdraw Registration: Alpha Summit', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/my-registrations\?eventId=901$/);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
