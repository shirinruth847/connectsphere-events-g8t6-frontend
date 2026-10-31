import { test, expect } from '@playwright/test';
import { attachScreenshot } from './support.mjs';
import { inHours, installRegistrationActions, makeEvent } from './spm-163-mocks.mjs';

// Mocked journeys for joining and leaving a waitlist and answering a place offer
// (SPM-163). The routes are not live
// yet: spm-163-mocks.mjs follows the planned backend contract.

const offerFor = (hours = 20) => ({ offerId: 7, expiresAt: inHours(hours) });
const card = (page, title) => page.locator('[id^="registration-event-"]').filter({ hasText: title });

test('[SPM-163 AC1-AC3] a full event offers the waitlist; Decline sends nothing, Accept joins with the profile answers', async ({ page }, testInfo) => {
  const state = await installRegistrationActions(page, {
    events: { 101: { event: makeEvent(101, 'Full Workshop'), place: null } },
    profile: { dietaryRestrictions: 'Vegetarian' },
  });
  await page.goto('/events');
  await page.getByRole('button', { name: 'View event details for Full Workshop', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Full Workshop', exact: true });
  await details.getByRole('button', { name: 'Join Waitlist', exact: true }).click();

  const confirm = page.getByRole('dialog', { name: 'This event is full. Join the waitlist?', exact: true });
  await expect(confirm.getByLabel('Dietary restrictions (optional)')).toHaveValue('Vegetarian');
  await expect(confirm.getByLabel('Accessibility requirements (optional)')).toHaveValue('');
  await confirm.getByRole('button', { name: 'Decline', exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(details).toBeVisible();
  await expect(details.getByRole('button', { name: 'Join Waitlist', exact: true })).toBeFocused();
  expect(state.actions).toEqual([]);

  await details.getByRole('button', { name: 'Join Waitlist', exact: true }).click();
  await confirm.getByLabel('Accessibility requirements (optional)').fill('Step-free access');
  await attachScreenshot(testInfo, page, 'join-waitlist-confirm');
  await confirm.getByRole('button', { name: 'Accept', exact: true }).click();

  const joined = page.getByRole('dialog', { name: "You're on the waitlist", exact: true });
  await expect(joined).toContainText('On the waitlist · Position 3');
  await expect(joined).toContainText("You're on the waitlist for Full Workshop. You'll be notified if a spot opens.");
  expect(state.actions).toHaveLength(1);
  expect(state.actions[0]).toMatchObject({ eventId: 101, action: 'waitlist', body: { dietaryRestrictions: 'Vegetarian', accessibilityRequirements: 'Step-free access' } });
  expect(state.actions[0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  await joined.getByRole('button', { name: 'Done', exact: true }).click();

  // The join is not offered again from the same view.
  await expect(details.getByRole('button', { name: 'Join Waitlist', exact: true })).toHaveCount(0);
  await expect(details).toContainText('On the waitlist · Position 3');
  await expect(details.getByRole('link', { name: 'View in My Events', exact: true })).toHaveAttribute('href', '/my-registrations?eventId=101');
});

test('[SPM-163] a refused join explains why; a failed join retries with the same Idempotency-Key', async ({ page }) => {
  const state = await installRegistrationActions(page, {
    events: { 102: { event: makeEvent(102, 'Popular Talk'), place: null } },
    refuse: { waitlist: [{ status: 500, code: 'INTERNAL_ERROR' }, { status: 409, code: 'PLACES_AVAILABLE' }] },
  });
  await page.goto('/events');
  await page.getByRole('button', { name: 'View event details for Popular Talk', exact: true }).click();
  await page.getByRole('button', { name: 'Join Waitlist', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'This event is full. Join the waitlist?', exact: true });
  await confirm.getByLabel('Dietary restrictions (optional)').fill('Halal');
  await confirm.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(confirm.getByRole('alert')).toContainText('Nothing was changed. Try again.');
  // The entered answers are kept for the retry.
  await expect(confirm.getByLabel('Dietary restrictions (optional)')).toHaveValue('Halal');
  await confirm.getByRole('button', { name: 'Try again: Accept', exact: true }).click();
  await expect(confirm.getByRole('alert')).toContainText('This event has places available again, so there is no waitlist to join.');
  await expect(confirm.getByRole('button', { name: /Accept/ })).toHaveCount(0);
  expect(state.actions.map((action) => action.idempotencyKey)).toEqual([state.actions[0].idempotencyKey, state.actions[0].idempotencyKey]);
  await confirm.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(confirm).toBeHidden();
});

test('[SPM-163 AC3, AC4] My Events shows the position; Leave Waitlist asks first, then removes it', async ({ page }, testInfo) => {
  const state = await installRegistrationActions(page, {
    events: { 201: { event: makeEvent(201, 'Design Sprint'), place: { status: 'WAITLISTED', waitlistPosition: 2, offer: null } } },
  });
  await page.goto('/my-registrations');
  const item = card(page, 'Design Sprint');
  await expect(item).toContainText('On the waitlist · Position 2');
  await expect(item).toContainText('A place is not yet confirmed.');
  await expect(item.getByText('Waitlisted', { exact: true })).toHaveCount(0);

  await item.getByRole('button', { name: 'Leave Waitlist: Design Sprint', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Leave the waitlist?', exact: true });
  await expect(confirm).toContainText("You'll lose your place (Position 2) on the waitlist for Design Sprint.");
  await expect(confirm).toContainText("If you join the waitlist again later, you'll go to the back of the queue.");
  await confirm.getByRole('button', { name: 'Stay on Waitlist', exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(item.getByRole('button', { name: 'Leave Waitlist: Design Sprint', exact: true })).toBeFocused();
  expect(state.actions).toEqual([]);

  await item.getByRole('button', { name: 'Leave Waitlist: Design Sprint', exact: true }).click();
  await confirm.getByRole('button', { name: 'Leave Waitlist', exact: true }).click();
  const message = page.getByText('You left the waitlist for Design Sprint.', { exact: true });
  await expect(message).toBeVisible();
  await expect(card(page, 'Design Sprint')).toHaveCount(0);
  await expect(page.getByText('You have no registrations or waitlist entries.', { exact: true })).toBeVisible();
  await expect(page.locator('[aria-live="polite"]').filter({ has: message })).toBeFocused();
  expect(state.actions).toMatchObject([{ eventId: 201, action: 'waitlist/leave', body: {} }]);
  await attachScreenshot(testInfo, page, 'left-waitlist');
});

test('[SPM-163 AC5, AC6] an open offer shows its deadline; Accept Slot registers the attendee', async ({ page }, testInfo) => {
  const state = await installRegistrationActions(page, {
    events: { 301: { event: makeEvent(301, 'Robotics Day'), place: { status: 'WAITLISTED', waitlistPosition: 1, offer: offerFor() } } },
  });
  await page.goto('/my-registrations');
  const item = card(page, 'Robotics Day');
  await expect(item).toContainText('A place has opened up for you.');
  await expect(item).toContainText(/Accept or decline by \d{1,2} \w{3} \d{4}, \d{2}:\d{2} SGT\./);
  await expect(item.getByRole('button', { name: 'Leave Waitlist: Robotics Day' })).toHaveCount(0);
  await attachScreenshot(testInfo, page, 'offer-desktop');

  await item.getByRole('button', { name: 'Accept Slot: Robotics Day', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Accept this place?', exact: true });
  await expect(confirm).toContainText("You'll be registered for Robotics Day. This offer is open until");
  await confirm.getByRole('button', { name: 'Accept Slot', exact: true }).click();

  await expect(page.getByText("You're registered for Robotics Day.", { exact: true })).toBeVisible();
  await expect(item).toContainText('Registered');
  expect(state.actions).toMatchObject([{ eventId: 301, action: 'offer/accept', body: { offerId: 7 } }]);
});

test("[SPM-163 AC5, AC7] the details dialog's actions slot offers the place; Decline closes it", async ({ page }) => {
  const state = await installRegistrationActions(page, {
    events: { 302: { event: makeEvent(302, 'Hack Night'), place: { status: 'WAITLISTED', waitlistPosition: 1, offer: offerFor() } } },
  });
  await page.goto('/my-registrations?eventId=302');
  const details = page.getByRole('dialog', { name: 'Hack Night', exact: true });
  await expect(details).toContainText('A place has opened up for you.');
  await expect(details.getByRole('button', { name: 'Accept Slot: Hack Night', exact: true })).toBeVisible();
  await details.getByRole('button', { name: 'Decline: Hack Night', exact: true }).click();

  const confirm = page.getByRole('dialog', { name: 'Decline this place?', exact: true });
  await expect(confirm).toContainText("If you join the waitlist again later, you'll go to the back of the queue.");
  // Escape closes only the confirmation, not the details behind it.
  await page.keyboard.press('Escape');
  await expect(confirm).toBeHidden();
  await expect(details).toBeVisible();

  await details.getByRole('button', { name: 'Decline: Hack Night', exact: true }).click();
  await confirm.getByRole('button', { name: 'Decline Place', exact: true }).click();
  await expect(details).toBeHidden();
  await expect(page).toHaveURL(/\/my-registrations$/);
  await expect(page.getByText('You declined the place for Hack Night and left its waitlist.', { exact: true })).toBeVisible();
  await expect(card(page, 'Hack Night')).toHaveCount(0);
  expect(state.actions).toMatchObject([{ eventId: 302, action: 'offer/decline', body: { offerId: 7 } }]);
});

test('[SPM-163] an expired offer says so and the place is reloaded', async ({ page }) => {
  const state = await installRegistrationActions(page, {
    events: { 303: { event: makeEvent(303, 'Data Jam'), place: { status: 'WAITLISTED', waitlistPosition: 1, offer: offerFor() } } },
    refuse: { 'offer/accept': [{ status: 409, code: 'OFFER_EXPIRED' }] },
  });
  await page.goto('/my-registrations');
  await card(page, 'Data Jam').getByRole('button', { name: 'Accept Slot: Data Jam', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Accept this place?', exact: true });
  await confirm.getByRole('button', { name: 'Accept Slot', exact: true }).click();
  await expect(confirm.getByRole('alert')).toContainText('This offer has expired.');
  // The backend has since closed the offer.
  state.events[303].place = { status: 'WAITLISTED', waitlistPosition: 1, offer: null };
  await confirm.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('Your place for Data Jam had changed. Showing its latest status.', { exact: true })).toBeVisible();
  await expect(card(page, 'Data Jam').getByRole('button', { name: 'Accept Slot: Data Jam' })).toHaveCount(0);
  await expect(card(page, 'Data Jam').getByRole('button', { name: 'Leave Waitlist: Data Jam', exact: true })).toBeVisible();
});

test('[SPM-163] My Events actions stack full width at phone size', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installRegistrationActions(page, {
    events: { 501: { event: makeEvent(501, 'Robotics Day'), place: { status: 'WAITLISTED', waitlistPosition: 1, offer: offerFor() } } },
  });
  await page.goto('/my-registrations');
  const item = card(page, 'Robotics Day');
  const accept = item.getByRole('button', { name: 'Accept Slot: Robotics Day', exact: true });
  await expect(accept).toBeVisible();
  const [acceptBox, itemBox] = [await accept.boundingBox(), await item.boundingBox()];
  expect(acceptBox.height).toBeGreaterThanOrEqual(44);
  expect(acceptBox.width).toBeGreaterThan(itemBox.width * 0.75);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await attachScreenshot(testInfo, page, 'offer-mobile');
});
