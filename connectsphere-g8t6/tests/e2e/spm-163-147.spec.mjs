import { test, expect } from '@playwright/test';
import { attachScreenshot } from './support.mjs';
import { inHours, installRegistrationActions, makeEvent } from './spm-163-mocks.mjs';

// Mocked journeys for joining and leaving a waitlist, answering a place offer
// (SPM-163) and withdrawing a registration (SPM-147), against
// spm-163-mocks.mjs, which follows the backend contract.

const offerFor = (hours = 20) => ({ offerId: 7, expiresAt: inHours(hours) });
const card = (page, title) => page.locator('[id^="registration-event-"]').filter({ hasText: title });
const discoveryCard = (page, title) => page.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const joinOn = (scope, title) => scope.getByRole('button', { name: `Join waitlist for ${title}`, exact: true });
const joinDialog = (page) => page.getByRole('dialog', { name: 'This event is full. Join the waitlist?', exact: true });
const LONG_TITLE = 'International Symposium on Sustainable Urban Mobility, Accessible Transport Design and Community-Led Climate Resilience Planning 2026';

// The unread count GET answers `count.value`, so the badge shows whether it was read again.
async function unreadCount(page, initial = 0) {
  const count = { value: initial, reads: 0 };
  await page.route('**/api/notifications/unread-count', (route) => {
    count.reads += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unreadCount: count.value }) });
  });
  return count;
}

test('[SPM-163 AC1-AC3] a full event offers the waitlist; Not Now sends nothing, Join Waitlist joins with the profile answers', async ({ page }, testInfo) => {
  const state = await installRegistrationActions(page, {
    events: { 101: { event: makeEvent(101, 'Full Workshop'), place: null } },
    profile: { dietaryRestrictions: 'Vegetarian' },
  });
  await page.goto('/events');
  await page.getByRole('button', { name: 'View event details for Full Workshop', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Full Workshop', exact: true });
  await joinOn(details, 'Full Workshop').click();

  const confirm = joinDialog(page);
  await expect(confirm.getByLabel('Dietary restrictions')).toHaveValue('Vegetarian');
  await expect(confirm.getByLabel('Accessibility requirements')).toHaveValue('');
  // Accept and Decline are for an actual place offer, never for joining.
  await expect(confirm.getByRole('button', { name: /^(Accept|Decline)/ })).toHaveCount(0);
  await confirm.getByRole('button', { name: 'Not Now', exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(details).toBeVisible();
  await expect(joinOn(details, 'Full Workshop')).toBeFocused();
  expect(state.actions).toEqual([]);

  await joinOn(details, 'Full Workshop').click();
  await confirm.getByLabel('Accessibility requirements').fill('Step-free access');
  await attachScreenshot(testInfo, page, 'join-waitlist-confirm');
  await confirm.getByRole('button', { name: 'Join Waitlist', exact: true }).click();

  const joined = page.getByRole('dialog', { name: "You're on the waitlist", exact: true });
  await expect(joined).toContainText('On the waitlist · Position 3');
  await expect(joined).toContainText("You're on the waitlist for Full Workshop. You'll be notified if a spot opens.");
  expect(state.actions).toHaveLength(1);
  expect(state.actions[0]).toMatchObject({ eventId: 101, action: 'waitlist', body: { dietaryRestrictions: 'Vegetarian', accessibilityRequirements: 'Step-free access' } });
  expect(state.actions[0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  await joined.getByRole('button', { name: 'Done', exact: true }).click();

  // The places are read again, so the join is not offered again: the footer
  // shows SPM-134's held-place state.
  await expect(joinOn(details, 'Full Workshop')).toHaveCount(0);
  await expect(details.getByRole('button', { name: 'On the waitlist for Full Workshop', exact: true })).toHaveAttribute('aria-disabled', 'true');
});

test('[SPM-163] a refused join explains why; a failed join retries with the same Idempotency-Key', async ({ page }) => {
  const state = await installRegistrationActions(page, {
    events: { 102: { event: makeEvent(102, 'Popular Talk'), place: null } },
    refuse: { waitlist: [{ status: 500, code: 'INTERNAL_ERROR' }, { status: 409, code: 'PLACES_AVAILABLE' }] },
  });
  await page.goto('/events');
  await page.getByRole('button', { name: 'View event details for Popular Talk', exact: true }).click();
  await joinOn(page.getByRole('dialog', { name: 'Popular Talk', exact: true }), 'Popular Talk').click();
  const confirm = joinDialog(page);
  await confirm.getByLabel('Dietary restrictions').fill('Halal');
  await confirm.getByRole('button', { name: 'Join Waitlist', exact: true }).click();
  await expect(confirm.getByRole('alert')).toContainText('Nothing was changed. Try again.');
  // The entered answers are kept for the retry.
  await expect(confirm.getByLabel('Dietary restrictions')).toHaveValue('Halal');
  await confirm.getByRole('button', { name: 'Try again: Join Waitlist', exact: true }).click();
  await expect(confirm.getByRole('alert')).toContainText('This event has places available again, so there is no waitlist to join.');
  await expect(confirm.getByRole('button', { name: /Join Waitlist/ })).toHaveCount(0);
  expect(state.actions.map((action) => action.idempotencyKey)).toEqual([state.actions[0].idempotencyKey, state.actions[0].idempotencyKey]);
  await confirm.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(confirm).toBeHidden();
});

test('[SPM-163 AC1] the discovery card, details dialog and event page all offer Join Waitlist; the position shown is the backend\'s', async ({ page }) => {
  const state = await installRegistrationActions(page, {
    events: { 111: { event: makeEvent(111, 'Packed Seminar'), place: null } },
    // Six people ahead, so the backend says Position 7.
    queueAhead: 6,
  });
  await page.goto('/events/111');
  const main = page.locator('main');
  await expect(main.getByRole('heading', { level: 1, name: 'Packed Seminar', exact: true })).toBeVisible();
  await expect(joinOn(main, 'Packed Seminar')).toBeEnabled();
  await expect(main.getByRole('button', { name: /^register now/i })).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Registration Full for Packed Seminar', exact: true })).toHaveCount(0);

  await page.goto('/events');
  const eventCard = discoveryCard(page, 'Packed Seminar');
  await expect(joinOn(eventCard, 'Packed Seminar')).toBeEnabled();
  await expect(eventCard.getByRole('button', { name: 'Registration Full for Packed Seminar', exact: true })).toHaveCount(0);
  await expect(eventCard.getByText('Full - Waitlist', { exact: true })).toBeVisible();
  await eventCard.getByRole('button', { name: 'View event details for Packed Seminar', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Packed Seminar', exact: true });
  await expect(joinOn(details, 'Packed Seminar')).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(details).toBeHidden();
  expect(state.actions).toEqual([]);

  // Joining from the card.
  await joinOn(eventCard, 'Packed Seminar').click();
  await joinDialog(page).getByRole('button', { name: 'Join Waitlist', exact: true }).click();
  const joined = page.getByRole('dialog', { name: "You're on the waitlist", exact: true });
  await expect(joined.getByText('On the waitlist · Position 7', { exact: true })).toBeVisible();
  await joined.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(joined).toBeHidden();
  await expect(joinOn(eventCard, 'Packed Seminar')).toHaveCount(0);
  await expect(eventCard.getByRole('button', { name: 'On the waitlist for Packed Seminar', exact: true })).toHaveAttribute('aria-disabled', 'true');
  // Focus does not fall to the page body when the Join Waitlist button goes.
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
  expect(state.actions).toMatchObject([{ eventId: 111, action: 'waitlist' }]);

  // The event page shows the backend's position for the place.
  await page.goto('/events/111');
  await expect(main.getByText('On the waitlist · Position 7', { exact: true })).toBeVisible();
  await expect(joinOn(main, 'Packed Seminar')).toHaveCount(0);
});

test('[SPM-163] Join Waitlist is not offered while the attendee\'s places cannot be loaded', async ({ page }) => {
  const state = await installRegistrationActions(page, {
    events: { 121: { event: makeEvent(121, 'Sold Out Gala'), place: null } },
    placesStatus: 503,
  });
  await page.goto('/events');
  await expect(page.getByText('Could not check your registrations', { exact: true })).toBeVisible();
  await expect(page.getByText(/Register Now and Join Waitlist are hidden until your registrations load/)).toBeVisible();
  const eventCard = discoveryCard(page, 'Sold Out Gala');
  await expect(joinOn(eventCard, 'Sold Out Gala')).toHaveCount(0);
  await expect(eventCard.getByRole('button', { name: 'Registration Full for Sold Out Gala', exact: true })).toHaveAttribute('aria-disabled', 'true');

  await eventCard.getByRole('button', { name: 'View event details for Sold Out Gala', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Sold Out Gala', exact: true });
  await expect(details.getByRole('button', { name: 'Registration Full for Sold Out Gala', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await expect(joinOn(details, 'Sold Out Gala')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.goto('/events/121');
  const main = page.locator('main');
  await expect(main.getByText('Could not check your registrations', { exact: true })).toBeVisible();
  await expect(joinOn(main, 'Sold Out Gala')).toHaveCount(0);
  await expect(main.getByRole('button', { name: 'Registration Full for Sold Out Gala', exact: true })).toHaveAttribute('aria-disabled', 'true');
  expect(state.actions).toEqual([]);

  // Once the places load, the join is offered.
  state.placesStatus = null;
  await main.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(joinOn(main, 'Sold Out Gala')).toBeEnabled();
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
  // SPM-141 AC4 replaced the earlier empty-state wording.
  await expect(page.getByText('You are not registered for any events yet.', { exact: true })).toBeVisible();
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
  await expect(item.getByRole('button', { name: 'Decline: Robotics Day', exact: true })).toBeVisible();
  await attachScreenshot(testInfo, page, 'offer-desktop');

  await item.getByRole('button', { name: 'Accept Slot: Robotics Day', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Accept this place?', exact: true });
  await expect(confirm).toContainText("You'll be registered for Robotics Day. This offer is open until");
  await confirm.getByRole('button', { name: 'Accept Slot', exact: true }).click();

  await expect(page.getByText("You're registered for Robotics Day.", { exact: true })).toBeVisible();
  await expect(item).toContainText('Registered');
  await expect(item.getByRole('button', { name: 'Withdraw Registration: Robotics Day', exact: true })).toBeVisible();
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
  // No automatic retry of the acceptance.
  await expect(confirm.getByRole('button', { name: /Accept Slot/ })).toHaveCount(0);
  // The backend has since closed the offer.
  state.events[303].place = { status: 'WAITLISTED', waitlistPosition: 1, offer: null };
  await confirm.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('Your place for Data Jam had changed. Showing its latest status.', { exact: true })).toBeVisible();
  await expect(card(page, 'Data Jam').getByRole('button', { name: 'Accept Slot: Data Jam' })).toHaveCount(0);
  await expect(card(page, 'Data Jam').getByRole('button', { name: 'Leave Waitlist: Data Jam', exact: true })).toBeVisible();
  expect(state.actions.filter((action) => action.action === 'offer/accept')).toHaveLength(1);
});

test('[SPM-163, SPM-147] a browser clock days ahead hides neither an open offer nor Withdraw Registration', async ({ page }) => {
  const state = await installRegistrationActions(page, {
    events: {
      311: { event: makeEvent(311, 'Offer Expo'), place: { status: 'WAITLISTED', waitlistPosition: 1, offer: offerFor(0.25) } },
      312: { event: makeEvent(312, 'Registered Expo', { registrationAvailability: 'OPEN', startDatetime: inHours(0.5), endDatetime: inHours(2) }), place: { status: 'REGISTERED' } },
    },
  });
  // 45 minutes ahead: past the offer deadline (15 minutes) and the event start
  // (30 minutes) by the browser's clock only. Kept under the mocked session's
  // one-hour lifetime, so the page still signs in.
  await page.clock.setFixedTime(new Date(Date.now() + 45 * 60 * 1000));
  await page.goto('/my-registrations');
  const offered = card(page, 'Offer Expo');
  await expect(offered).toContainText('A place has opened up for you.');
  await expect(offered.getByRole('button', { name: 'Accept Slot: Offer Expo', exact: true })).toBeVisible();
  await expect(offered.getByRole('button', { name: 'Decline: Offer Expo', exact: true })).toBeVisible();
  await expect(card(page, 'Registered Expo').getByRole('button', { name: 'Withdraw Registration: Registered Expo', exact: true })).toBeVisible();

  // The backend still holds the offer open, so accepting works.
  await offered.getByRole('button', { name: 'Accept Slot: Offer Expo', exact: true }).click();
  await page.getByRole('dialog', { name: 'Accept this place?', exact: true }).getByRole('button', { name: 'Accept Slot', exact: true }).click();
  await expect(page.getByText("You're registered for Offer Expo.", { exact: true })).toBeVisible();
  expect(state.actions).toMatchObject([{ eventId: 311, action: 'offer/accept', body: { offerId: 7 } }]);
});

test('[SPM-147 AC1-AC3] Withdraw Registration asks "Are you sure?" and withdraws once confirmed', async ({ page }, testInfo) => {
  const state = await installRegistrationActions(page, {
    events: { 401: { event: makeEvent(401, 'Career Fair', { registrationAvailability: 'OPEN' }), place: { status: 'REGISTERED' } } },
  });
  await page.goto('/my-registrations?eventId=401');
  const details = page.getByRole('dialog', { name: 'Career Fair', exact: true });
  await details.getByRole('button', { name: 'Withdraw Registration: Career Fair', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Withdraw Registration', exact: true });
  await expect(confirm).toContainText('Are you sure? This action cannot be undone.');
  await expect(confirm).toContainText("you'll join at the back of the queue");
  await attachScreenshot(testInfo, page, 'withdraw-confirm');
  await confirm.getByRole('button', { name: 'Keep Registration', exact: true }).click();
  await expect(confirm).toBeHidden();
  expect(state.actions).toEqual([]);

  await details.getByRole('button', { name: 'Withdraw Registration: Career Fair', exact: true }).click();
  await confirm.getByRole('button', { name: 'Confirm Withdrawal', exact: true }).click();
  await expect(details).toBeHidden();
  await expect(page.getByText('Your registration for Career Fair has been withdrawn.', { exact: true })).toBeVisible();
  await expect(card(page, 'Career Fair')).toHaveCount(0);
  await expect(page.getByText(/Withdrawed/)).toHaveCount(0);
  expect(state.actions).toMatchObject([{ eventId: 401, action: 'withdraw', body: {} }]);
});

test('[SPM-147 AC1, AC5] the backend, not the browser clock, refuses a withdrawal once the event has started', async ({ page }) => {
  const state = await installRegistrationActions(page, {
    events: {
      402: { event: makeEvent(402, 'Morning Run', { registrationAvailability: 'OPEN', startDatetime: inHours(-1), endDatetime: inHours(2) }), place: { status: 'REGISTERED' } },
      403: { event: makeEvent(403, 'Evening Talk', { registrationAvailability: 'OPEN', startDatetime: inHours(3) }), place: { status: 'REGISTERED' } },
    },
  });
  await page.goto('/my-registrations');
  const confirm = page.getByRole('dialog', { name: 'Withdraw Registration', exact: true });

  // Started by every clock: still offered, and the backend's refusal is explained.
  await card(page, 'Morning Run').getByRole('button', { name: 'Withdraw Registration: Morning Run', exact: true }).click();
  await confirm.getByRole('button', { name: 'Confirm Withdrawal', exact: true }).click();
  await expect(confirm.getByRole('alert')).toContainText('Cannot withdraw registration for past events');
  await confirm.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('Your place for Morning Run had changed. Showing its latest status.', { exact: true })).toBeVisible();
  await expect(card(page, 'Morning Run')).toContainText('Registered');

  // The browser clock says it has not started; the backend's EVENT_NOT_ACTIVE wins.
  state.refuse.withdraw = [{ status: 409, code: 'EVENT_NOT_ACTIVE' }];
  await card(page, 'Evening Talk').getByRole('button', { name: 'Withdraw Registration: Evening Talk', exact: true }).click();
  await confirm.getByRole('button', { name: 'Confirm Withdrawal', exact: true }).click();
  await expect(confirm.getByRole('alert')).toContainText('This event is no longer going ahead.');
  await expect(card(page, 'Evening Talk')).toHaveCount(1);
  expect(state.actions.map((action) => action.action)).toEqual(['withdraw', 'withdraw']);
});

test('[SPM-163] the newer refusal codes have their own messages', async ({ page }) => {
  const state = await installRegistrationActions(page, {
    events: {
      131: { event: makeEvent(131, 'Window Moved'), place: null },
      132: { event: makeEvent(132, 'Setup Changed'), place: null },
      133: { event: makeEvent(133, 'Queue Talk'), place: { status: 'WAITLISTED', waitlistPosition: 4, offer: null } },
    },
    refuse: {
      waitlist: [{ status: 409, code: 'REGISTRATION_NOT_YET_OPEN' }, { status: 409, code: 'REGISTRATION_UNAVAILABLE' }],
      'waitlist/leave': [{ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' }],
    },
  });
  await page.goto('/events');
  for (const [title, message] of [['Window Moved', "Registration for this event hasn't opened yet."], ['Setup Changed', 'Registration for this event is currently unavailable.']]) {
    await joinOn(discoveryCard(page, title), title).click();
    const confirm = joinDialog(page);
    await confirm.getByRole('button', { name: 'Join Waitlist', exact: true }).click();
    await expect(confirm.getByRole('alert')).toContainText(message);
    await expect(confirm.getByRole('alert')).not.toContainText('Backend says');
    await confirm.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(confirm).toBeHidden();
  }

  await page.goto('/my-registrations');
  await card(page, 'Queue Talk').getByRole('button', { name: 'Leave Waitlist: Queue Talk', exact: true }).click();
  const leave = page.getByRole('dialog', { name: 'Leave the waitlist?', exact: true });
  await leave.getByRole('button', { name: 'Leave Waitlist', exact: true }).click();
  await expect(leave.getByRole('alert')).toContainText("This request couldn't be matched to your earlier attempt. Close this and try again.");
  expect(state.actions.map((action) => action.action)).toEqual(['waitlist', 'waitlist', 'waitlist/leave']);
});

test('[SPM-163, SPM-147] the Updates badge is read again after every confirmed change to a place', async ({ page }) => {
  await installRegistrationActions(page, {
    events: {
      141: { event: makeEvent(141, 'Join Me'), place: null },
      142: { event: makeEvent(142, 'Leave Me'), place: { status: 'WAITLISTED', waitlistPosition: 2, offer: null } },
      143: { event: makeEvent(143, 'Accept Me'), place: { status: 'WAITLISTED', waitlistPosition: 1, offer: { offerId: 7, expiresAt: inHours(20) } } },
      144: { event: makeEvent(144, 'Decline Me'), place: { status: 'WAITLISTED', waitlistPosition: 1, offer: { offerId: 8, expiresAt: inHours(20) } } },
      145: { event: makeEvent(145, 'Withdraw Me', { registrationAvailability: 'OPEN' }), place: { status: 'REGISTERED' } },
    },
  });
  // Registered after the shared mocks, so it answers the unread count first.
  const count = await unreadCount(page);
  await page.goto('/events');
  const badge = (unread) => page.getByRole('button', { name: `Updates, ${unread} unread`, exact: true });
  await expect(page.getByRole('button', { name: 'Updates', exact: true })).toBeVisible();

  count.value = 1;
  await joinOn(discoveryCard(page, 'Join Me'), 'Join Me').click();
  await joinDialog(page).getByRole('button', { name: 'Join Waitlist', exact: true }).click();
  // The page behind the modal is inert, so the badge is checked once it closes.
  await page.getByRole('dialog', { name: "You're on the waitlist", exact: true }).getByRole('button', { name: 'Done', exact: true }).click();
  await expect(badge(1)).toBeVisible();

  await page.goto('/my-registrations');
  await expect(badge(1)).toBeVisible();
  for (const [unread, title, button, confirmTitle, confirmButton] of [
    [2, 'Leave Me', 'Leave Waitlist', 'Leave the waitlist?', 'Leave Waitlist'],
    [3, 'Accept Me', 'Accept Slot', 'Accept this place?', 'Accept Slot'],
    [4, 'Decline Me', 'Decline', 'Decline this place?', 'Decline Place'],
    [5, 'Withdraw Me', 'Withdraw Registration', 'Withdraw Registration', 'Confirm Withdrawal'],
  ]) {
    count.value = unread;
    await card(page, title).getByRole('button', { name: `${button}: ${title}`, exact: true }).click();
    await page.getByRole('dialog', { name: confirmTitle, exact: true }).getByRole('button', { name: confirmButton, exact: true }).click();
    await expect(badge(unread)).toBeVisible();
  }
});

test('[SPM-163 TC-REG-023 pattern] Join Waitlist answers survive a session expiry and wait for the attendee to confirm', async ({ page }) => {
  const state = await installRegistrationActions(page, {
    events: { 151: { event: makeEvent(151, 'Expiring Session Fair'), place: null } },
    refuse: { waitlist: [{ status: 401, code: 'UNAUTHENTICATED' }] },
    canSignInAgain: true,
  });
  await page.goto('/events');
  await joinOn(discoveryCard(page, 'Expiring Session Fair'), 'Expiring Session Fair').click();
  const confirm = joinDialog(page);
  await confirm.getByLabel('Dietary restrictions').fill('Typed before expiry 🌾');
  await confirm.getByRole('button', { name: 'Join Waitlist', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fevents/);
  await page.locator('#email').fill('user@example.com');
  await page.locator('#password').fill('Valid-password9');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/events$/);

  const restored = joinDialog(page);
  await expect(restored.getByText('Your waitlist answers were restored', { exact: true })).toBeVisible();
  await expect(restored.getByLabel('Dietary restrictions')).toHaveValue('Typed before expiry 🌾');
  // Nothing is sent again until the attendee confirms.
  expect(state.actions).toHaveLength(1);
  await restored.getByRole('button', { name: 'Join Waitlist', exact: true }).click();
  await expect(page.getByRole('dialog', { name: "You're on the waitlist", exact: true })).toBeVisible();
  expect(state.actions).toHaveLength(2);
  expect(state.actions[1].body).toEqual({ dietaryRestrictions: 'Typed before expiry 🌾', accessibilityRequirements: null });
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

test('[SPM-163, SPM-147] long titles and the offer deadline fit 390px on the card, the join dialog and My Events', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installRegistrationActions(page, {
    events: {
      601: { event: makeEvent(601, LONG_TITLE), place: null },
      602: { event: makeEvent(602, `${LONG_TITLE} (offer)`), place: { status: 'WAITLISTED', waitlistPosition: 12, offer: offerFor() } },
      603: { event: makeEvent(603, `${LONG_TITLE} (registered)`, { registrationAvailability: 'OPEN' }), place: { status: 'REGISTERED' } },
    },
  });
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  await page.goto('/events');
  const join = joinOn(discoveryCard(page, LONG_TITLE), LONG_TITLE);
  await expect(join).toBeVisible();
  expect((await join.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await fits()).toBe(true);
  await join.click();
  const confirm = joinDialog(page);
  await expect(confirm.getByText(LONG_TITLE, { exact: true })).toBeVisible();
  const [dialogBox, joinButton] = [await confirm.boundingBox(), await confirm.getByRole('button', { name: 'Join Waitlist', exact: true }).boundingBox()];
  expect(dialogBox.width).toBeLessThanOrEqual(390);
  expect(joinButton.x + joinButton.width).toBeLessThanOrEqual(dialogBox.x + dialogBox.width);
  expect(joinButton.height).toBeGreaterThanOrEqual(44);
  await attachScreenshot(testInfo, page, 'join-long-title-mobile');
  await confirm.getByRole('button', { name: 'Not Now', exact: true }).click();

  await page.goto('/my-registrations');
  const offered = card(page, `${LONG_TITLE} (offer)`);
  await expect(offered).toContainText('On the waitlist · Position 12');
  const deadline = offered.getByText(/Accept or decline by \d{1,2} \w{3} \d{4}, \d{2}:\d{2} SGT\./);
  await expect(deadline).toBeVisible();
  const [deadlineBox, offeredBox] = [await deadline.boundingBox(), await offered.boundingBox()];
  expect(deadlineBox.x + deadlineBox.width).toBeLessThanOrEqual(offeredBox.x + offeredBox.width);
  for (const name of [`Accept Slot: ${LONG_TITLE} (offer)`, `Decline: ${LONG_TITLE} (offer)`]) {
    expect((await offered.getByRole('button', { name, exact: true }).boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  await expect(card(page, `${LONG_TITLE} (registered)`).getByRole('button', { name: `Withdraw Registration: ${LONG_TITLE} (registered)`, exact: true })).toBeVisible();
  expect(await fits()).toBe(true);
  await attachScreenshot(testInfo, page, 'offer-long-title-mobile');
});

for (const role of ['ORGANISER', 'COORDINATOR', 'COORDINATOR_LEAD', 'VENUE_STAFF', 'TECH_SUPPORT', 'SAFETY_OFFICER']) {
  test(`[SPM-163, SPM-147] ${role} gets no waitlist, offer or withdrawal controls`, async ({ page }) => {
    const state = await installRegistrationActions(page, {
      role,
      events: {
        701: { event: makeEvent(701, 'Staff Full Event'), place: null },
        702: { event: makeEvent(702, 'Staff Offer Event'), place: { status: 'WAITLISTED', waitlistPosition: 1, offer: offerFor() } },
      },
    });
    for (const path of ['/events', '/events/701', '/my-registrations']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.getByRole('button', { name: /Join waitlist|Leave Waitlist|Accept Slot|Decline|Withdraw Registration/i })).toHaveCount(0);
    }
    expect(state.actions).toEqual([]);
  });
}
