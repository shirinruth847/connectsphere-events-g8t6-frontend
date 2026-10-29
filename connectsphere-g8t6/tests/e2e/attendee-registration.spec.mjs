import { test, expect } from '@playwright/test';
import { installConnectSphereMocks, installLoginMock } from './support.mjs';

// SPM-134 direct registration. The mocks follow the confirmed backend contract:
// GET /api/events/discovery(/:id), GET /api/registrations/mine,
// GET /api/attendee-profile/mine and POST /api/registrations/mine/:eventId.
const makeEvent = (overrides = {}) => ({
  eventId: 101, title: 'SMU Tech Summit', description: 'Talks and demos from student developers.',
  startDatetime: '2026-11-28T01:00:00.000Z', endDatetime: '2026-11-28T09:00:00.000Z',
  organisationName: 'SMU Computing Club', location: 'SMU Hall A', registrationAvailability: 'OPEN',
  registrationOpenAt: '2026-10-10T00:00:00.000Z', registrationCloseAt: '2026-11-27T15:59:00.000Z',
  ...overrides,
});
const makeProfile = (overrides = {}) => ({
  attendeeId: 9, userId: 11, name: 'Test User', email: 'user@example.com', phone: null,
  dietaryRestrictions: 'Vegetarian', accessibilityRequirements: null, version: 2,
  createdAt: '2026-10-20T02:00:00.000Z', updatedAt: '2026-10-21T02:00:00.000Z', ...overrides,
});
const confirmationFor = (event, body, registrationId = 42) => ({
  registration: {
    registrationId, confirmationNumber: `REG-${String(registrationId).padStart(6, '0')}`, status: 'REGISTERED',
    registeredAt: '2026-10-29T03:00:00.000Z', dietaryRestrictions: body.dietaryRestrictions, accessibilityRequirements: body.accessibilityRequirements,
    event: { eventId: event.eventId, title: event.title, startDatetime: event.startDatetime, endDatetime: event.endDatetime, organisationName: event.organisationName },
  },
});

// `events` is the discovery list (and detail bodies by ID unless `details`
// overrides one with an event or a status). `places` maps an event ID to a
// registration status. `posts` is a queue of POST replies ({ status, body },
// or a function of (body, eventId)); without one the POST succeeds like the
// backend: 201, and the place becomes REGISTERED.
async function installRegistrationMocks(page, { role = 'ATTENDEE', events = [makeEvent()], details = {}, places = {}, profile = makeProfile(), posts = [], canSignInAgain = false } = {}) {
  const state = canSignInAgain ? await installLoginMock(page, { role, authenticated: true }) : await installConnectSphereMocks(page, { role });
  const calls = { list: 0, detail: [], places: 0, profileGet: 0, profilePut: 0, posts: [] };
  const current = { events: [...events], details: { ...details }, places: typeof places === 'number' ? places : { ...places } };
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/events/discovery**', (route) => {
    const url = new URL(route.request().url());
    const detail = url.pathname.match(/^\/api\/events\/discovery\/(\d+)$/);
    if (detail) {
      const id = Number(detail[1]);
      calls.detail.push(id);
      const override = current.details[id];
      if (typeof override === 'number') return json(route, { error: 'Event not found.', code: 'EVENT_NOT_FOUND' }, override);
      const event = override ?? current.events.find((item) => item.eventId === id);
      return event ? json(route, { event }) : json(route, { error: 'Event not found.', code: 'EVENT_NOT_FOUND' }, 404);
    }
    calls.list += 1;
    return json(route, { events: current.events, nextCursor: null });
  });
  await page.route('**/api/registrations/mine**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const one = url.pathname.match(/^\/api\/registrations\/mine\/(\d+)$/);
    if (one && request.method() === 'POST') {
      const id = Number(one[1]);
      const body = request.postDataJSON();
      calls.posts.push({ eventId: id, body, key: request.headers()['idempotency-key'] ?? null });
      const next = posts.shift();
      const event = current.events.find((item) => item.eventId === id) ?? makeEvent({ eventId: id });
      const reply = next ? (typeof next === 'function' ? await next(body, id, current) : next) : { status: 201, body: confirmationFor(event, body) };
      if (reply.status === 201) current.places[id] = 'REGISTERED';
      return json(route, reply.body, reply.status);
    }
    if (url.pathname === '/api/registrations/mine' && request.method() === 'GET') {
      calls.places += 1;
      if (typeof current.places === 'number') return json(route, { error: 'Failed' }, current.places);
      const registrations = Object.entries(current.places).map(([id, status]) => ({
        registration_id: Number(id) * 10, registration_status: status, registered_at: '2026-10-28T02:00:00.000Z',
        event: { event_id: Number(id), title: 'Event', attendee_status: 'CONFIRMED' },
      }));
      return json(route, { registrations, page: { limit: 100, offset: 0, next_offset: null } });
    }
    return route.fallback();
  });
  await page.route('**/api/attendee-profile/mine', (route) => {
    if (route.request().method() === 'GET') { calls.profileGet += 1; return json(route, { profile }); }
    calls.profilePut += 1;
    return json(route, { error: 'Profile updates are not part of registration.' }, 500);
  });
  return { state, calls, current };
}

const card = (page, title) => page.getByRole('article', { name: title, exact: true });
const registerOn = (scope, title) => scope.getByRole('button', { name: `Register now for ${title}`, exact: true });
const registrationDialog = (page, title) => page.getByRole('dialog', { name: `Register for ${title}`, exact: true });
const dietary = (scope) => scope.getByLabel('Dietary restrictions', { exact: true });
const accessibility = (scope) => scope.getByLabel('Accessibility requirements', { exact: true });
const submit = (scope) => scope.getByRole('button', { name: 'Register', exact: true });

async function openFromCard(page, title = 'SMU Tech Summit') {
  await registerOn(card(page, title), title).click();
  const dialog = registrationDialog(page, title);
  await expect(dietary(dialog)).toBeVisible();
  return dialog;
}

test('[SPM-134 TC-REG-001] should_show_view_details_and_register_now_only_for_an_open_event_the_attendee_has_no_place_on', async ({ page }) => {
  await installRegistrationMocks(page, {
    events: [
      makeEvent(),
      makeEvent({ eventId: 102, title: 'Full Event', registrationAvailability: 'FULL_WAITLIST' }),
      makeEvent({ eventId: 103, title: 'Closed Event', registrationAvailability: 'CLOSED', registrationOpenAt: null }),
      makeEvent({ eventId: 104, title: 'No Registration Event', registrationAvailability: 'NOT_ENABLED' }),
      makeEvent({ eventId: 105, title: 'Already Registered Event' }),
      makeEvent({ eventId: 106, title: 'Waitlisted Event', registrationAvailability: 'FULL_WAITLIST' }),
    ],
    places: { 105: 'REGISTERED', 106: 'WAITLISTED' },
  });
  await page.goto('/events');
  await expect(card(page, 'SMU Tech Summit').getByRole('button', { name: 'View event details for SMU Tech Summit', exact: true })).toBeVisible();
  await expect(registerOn(card(page, 'SMU Tech Summit'), 'SMU Tech Summit')).toBeVisible();
  for (const title of ['Full Event', 'Closed Event', 'No Registration Event', 'Already Registered Event', 'Waitlisted Event']) {
    await expect(card(page, title).getByRole('button', { name: /^register now/i })).toHaveCount(0);
  }
  // TC-REG-017: the existing full state stays; joining the waitlist is not built here.
  await expect(card(page, 'Full Event')).toContainText('Full - Waitlist');
  await expect(card(page, 'Already Registered Event')).toContainText('Registered');
  await expect(card(page, 'Already Registered Event')).not.toContainText('Registration Open');
  await expect(card(page, 'Waitlisted Event')).toContainText('On the waitlist');
});

test('[SPM-134 TC-REG-003/005] should_prefill_read_only_name_and_email_and_editable_saved_preferences_when_the_form_opens', async ({ page }) => {
  await installRegistrationMocks(page, { profile: makeProfile({ dietaryRestrictions: 'Vegetarian', accessibilityRequirements: 'Step-free access' }) });
  await page.goto('/events');
  const dialog = await openFromCard(page);
  await expect(dialog).toContainText('Test User');
  await expect(dialog).toContainText('user@example.com');
  await expect(dialog).toContainText('Read-only');
  // Name and email are shown, not editable: the only fields are the two answers.
  await expect(dialog.locator('input, textarea')).toHaveCount(2);
  await expect(dietary(dialog)).toHaveValue('Vegetarian');
  await expect(accessibility(dialog)).toHaveValue('Step-free access');
  await expect(dietary(dialog)).toBeEditable();
  await expect(dialog).not.toContainText(/phone/i);
});

test('[SPM-134 TC-REG-004] should_show_blank_editable_fields_when_the_profile_has_no_preferences', async ({ page }) => {
  await installRegistrationMocks(page, { profile: makeProfile({ attendeeId: null, version: null, dietaryRestrictions: null, accessibilityRequirements: null }) });
  await page.goto('/events');
  const dialog = await openFromCard(page);
  await expect(dietary(dialog)).toHaveValue('');
  await expect(accessibility(dialog)).toHaveValue('');
  await accessibility(dialog).fill('Captioning');
  await expect(accessibility(dialog)).toHaveValue('Captioning');
});

test('[SPM-134 TC-REG-002] should_open_the_same_registration_form_from_event_details', async ({ page }) => {
  const { calls } = await installRegistrationMocks(page);
  await page.goto('/events');
  await page.getByRole('button', { name: 'View event details for SMU Tech Summit', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'SMU Tech Summit', exact: true });
  await registerOn(details, 'SMU Tech Summit').click();
  const dialog = registrationDialog(page, 'SMU Tech Summit');
  await expect(dietary(dialog)).toHaveValue('Vegetarian');
  await expect(dialog).toContainText('Your details');
  await expect(dialog).toContainText('Registration details');
  await submit(dialog).click();
  await expect(dialog.getByText("You're registered", { exact: true })).toBeVisible();
  expect(calls.posts).toHaveLength(1);
  // TC-REG-015: Event Details now shows the place and no Register Now.
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(details.getByText('Registered', { exact: true }).first()).toBeVisible();
  await expect(registerOn(details, 'SMU Tech Summit')).toHaveCount(0);
});

test('[SPM-134 TC-REG-006/007/011/012/014] should_submit_the_edited_answers_once_and_confirm_from_the_backend_without_updating_the_profile', async ({ page }) => {
  const { calls } = await installRegistrationMocks(page);
  await page.goto('/events');
  const placesBefore = calls.places;
  const dialog = await openFromCard(page);
  await dietary(dialog).fill('Vegetarian, no peanuts 🥜');
  await accessibility(dialog).fill('');
  await submit(dialog).click();
  await expect(dialog.getByText("You're registered", { exact: true })).toBeVisible();
  // Exactly the two answers; blank as null; Unicode unchanged; an Idempotency-Key.
  expect(calls.posts).toHaveLength(1);
  expect(calls.posts[0].eventId).toBe(101);
  expect(calls.posts[0].body).toEqual({ dietaryRestrictions: 'Vegetarian, no peanuts 🥜', accessibilityRequirements: null });
  expect(calls.posts[0].key).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
  expect(calls.profilePut).toBe(0);
  // The confirmation shows the backend's own values.
  await expect(dialog).toContainText('REG-000042');
  await expect(dialog).toContainText('SMU Tech Summit');
  await expect(dialog).toContainText('Sat, 28 Nov 2026');
  await expect(dialog).toContainText('09:00 – 17:00 SGT');
  await expect(dialog).not.toContainText(/email/i);
  // Places are read again, and the card shows the place without Register Now.
  await expect.poll(() => calls.places).toBeGreaterThan(placesBefore);
  await expect.poll(() => calls.detail).toContain(101);
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(registerOn(card(page, 'SMU Tech Summit'), 'SMU Tech Summit')).toHaveCount(0);
  await expect(card(page, 'SMU Tech Summit')).toContainText('Registered');
  // Register Now has gone, so focus lands on the event's details button.
  await expect(page.getByRole('button', { name: 'View event details for SMU Tech Summit', exact: true })).toBeFocused();
});

test('[SPM-134] should_show_success_only_after_the_backend_returns_201', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await installRegistrationMocks(page, { posts: [async (body) => { await gate; return { status: 201, body: confirmationFor(makeEvent(), body) }; }] });
  await page.goto('/events');
  const dialog = await openFromCard(page);
  await submit(dialog).click();
  await expect(dialog.getByRole('button', { name: 'Registering…', exact: true })).toBeDisabled();
  await expect(dialog.getByText("You're registered", { exact: true })).toHaveCount(0);
  await expect(dietary(dialog)).toHaveAttribute('readonly', '');
  release();
  await expect(dialog.getByText("You're registered", { exact: true })).toBeVisible();
});

for (const [code, title, refreshedAvailability] of [
  ['REGISTRATION_FULL', 'This event is now full', 'FULL_WAITLIST'],
  ['REGISTRATION_CLOSED', 'Registration has closed', 'CLOSED'],
  ['REGISTRATION_NOT_ENABLED', "Registration isn't available", 'NOT_ENABLED'],
]) {
  test(`[SPM-134 TC-REG-021 AC16] should_keep_answers_refresh_and_drop_register_now_when_the_backend_returns_${code}`, async ({ page }) => {
    const { calls } = await installRegistrationMocks(page, {
      posts: [(body, id, current) => {
        current.events = current.events.map((event) => (event.eventId === id ? { ...event, registrationAvailability: refreshedAvailability, registrationOpenAt: null } : event));
        return { status: 409, body: { error: 'raw backend wording', code } };
      }],
    });
    await page.goto('/events');
    const dialog = await openFromCard(page);
    await dietary(dialog).fill('Typed before the refusal');
    await submit(dialog).click();
    await expect(dialog.getByText(title, { exact: true })).toBeVisible();
    await expect(dialog).not.toContainText('raw backend wording');
    await expect(dialog.getByText("You're registered", { exact: true })).toHaveCount(0);
    await expect(dietary(dialog)).toHaveValue('Typed before the refusal');
    // Nothing more to submit; the attendee closes, and no retry is made.
    await expect(submit(dialog)).toHaveCount(0);
    await expect.poll(() => calls.detail).toContain(101);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(registerOn(card(page, 'SMU Tech Summit'), 'SMU Tech Summit')).toHaveCount(0);
    expect(calls.posts).toHaveLength(1);
  });
}

test('[SPM-134 TC-REG-020 AC15] should_say_already_registered_and_show_the_place_when_a_stale_screen_submits_again', async ({ page }) => {
  const { calls } = await installRegistrationMocks(page, {
    posts: [(body, id, current) => { current.places[id] = 'REGISTERED'; return { status: 409, body: { error: 'x', code: 'ALREADY_REGISTERED' } }; }],
  });
  await page.goto('/events');
  const dialog = await openFromCard(page);
  await submit(dialog).click();
  await expect(dialog.getByText("You're already registered", { exact: true })).toBeVisible();
  await expect(dialog.getByText('Your registration was not submitted', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(card(page, 'SMU Tech Summit')).toContainText('Registered');
  await expect(registerOn(card(page, 'SMU Tech Summit'), 'SMU Tech Summit')).toHaveCount(0);
  expect(calls.posts).toHaveLength(1);
});

test('[SPM-134] should_say_already_on_the_waitlist_without_waitlist_actions_when_the_backend_returns_ALREADY_WAITLISTED', async ({ page }) => {
  await installRegistrationMocks(page, {
    posts: [(body, id, current) => { current.places[id] = 'WAITLISTED'; return { status: 409, body: { error: 'x', code: 'ALREADY_WAITLISTED' } }; }],
  });
  await page.goto('/events');
  const dialog = await openFromCard(page);
  await submit(dialog).click();
  await expect(dialog.getByText("You're already on the waitlist", { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /waitlist/i })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(card(page, 'SMU Tech Summit')).toContainText('On the waitlist');
});

test('[SPM-134] should_explain_and_remove_the_event_when_it_is_no_longer_available_on_submit', async ({ page }) => {
  await installRegistrationMocks(page, {
    events: [makeEvent(), makeEvent({ eventId: 102, title: 'Other Event' })],
    posts: [(body, id, current) => { current.details[id] = 404; return { status: 404, body: { error: 'Event request not found.', code: 'EVENT_NOT_FOUND' } }; }],
  });
  await page.goto('/events');
  const dialog = await openFromCard(page);
  await dietary(dialog).fill('Kept for the attendee');
  await submit(dialog).click();
  await expect(dialog.getByText('This event is no longer available', { exact: true })).toBeVisible();
  await expect(dietary(dialog)).toHaveValue('Kept for the attendee');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(card(page, 'SMU Tech Summit')).toHaveCount(0);
  await expect(card(page, 'Other Event')).toBeVisible();
});

test('[SPM-134 TC-REG-022 AC17] should_keep_answers_and_retry_with_the_same_key_when_the_server_fails', async ({ page }) => {
  const { calls } = await installRegistrationMocks(page, { posts: [{ status: 500, body: { error: 'Internal Server Error', code: 'INTERNAL_ERROR' } }] });
  await page.goto('/events');
  const dialog = await openFromCard(page);
  await dietary(dialog).fill('Halal');
  await accessibility(dialog).fill('Seat near the exit');
  await submit(dialog).click();
  await expect(dialog.getByText('Your registration was not submitted', { exact: true })).toBeVisible();
  await expect(dialog).not.toContainText('Internal Server Error');
  await expect(dialog.getByText("You're registered", { exact: true })).toHaveCount(0);
  await expect(dietary(dialog)).toHaveValue('Halal');
  await expect(accessibility(dialog)).toHaveValue('Seat near the exit');
  await dialog.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(dialog.getByText("You're registered", { exact: true })).toBeVisible();
  expect(calls.posts).toHaveLength(2);
  expect(calls.posts[1].body).toEqual(calls.posts[0].body);
  expect(calls.posts[1].key).toBe(calls.posts[0].key);
});

test('[SPM-134] should_use_a_new_key_when_the_answers_change_after_a_failure', async ({ page }) => {
  const { calls } = await installRegistrationMocks(page, { posts: [{ status: 500, body: { error: 'x', code: 'INTERNAL_ERROR' } }] });
  await page.goto('/events');
  const dialog = await openFromCard(page);
  await submit(dialog).click();
  await expect(dialog.getByText('Your registration was not submitted', { exact: true })).toBeVisible();
  await dietary(dialog).fill('Changed after the failure');
  await dialog.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(dialog.getByText("You're registered", { exact: true })).toBeVisible();
  expect(calls.posts[1].key).not.toBe(calls.posts[0].key);
});

test('[SPM-134 TC-REG-022] should_keep_answers_and_retry_with_the_same_key_only_when_asked_when_the_backend_reports_IDEMPOTENCY_IN_PROGRESS', async ({ page }) => {
  const { calls } = await installRegistrationMocks(page, { posts: [{ status: 409, body: { error: 'This request is still being processed. Try again shortly.', code: 'IDEMPOTENCY_IN_PROGRESS' } }] });
  await page.goto('/events');
  const dialog = await openFromCard(page);
  await dietary(dialog).fill('Kosher');
  await submit(dialog).click();
  await expect(dialog.getByText('Your registration is still being processed', { exact: true })).toBeVisible();
  await expect(dialog.getByText("You're registered", { exact: true })).toHaveCount(0);
  await expect(dietary(dialog)).toHaveValue('Kosher');
  await page.waitForTimeout(1000);
  expect(calls.posts).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(dialog.getByText("You're registered", { exact: true })).toBeVisible();
  expect(calls.posts).toHaveLength(2);
  expect(calls.posts[1].key).toBe(calls.posts[0].key);
});

test('[SPM-134 TC-REG-022] should_retry_with_a_new_key_only_when_asked_when_the_backend_reports_IDEMPOTENCY_KEY_REUSED', async ({ page }) => {
  const { calls } = await installRegistrationMocks(page, { posts: [{ status: 409, body: { error: 'This Idempotency-Key was already used for a different request.', code: 'IDEMPOTENCY_KEY_REUSED' } }] });
  await page.goto('/events');
  const dialog = await openFromCard(page);
  await dietary(dialog).fill('No shellfish');
  await submit(dialog).click();
  await expect(dialog.getByText('Your registration was not submitted', { exact: true })).toBeVisible();
  await expect(dialog).not.toContainText('Idempotency-Key');
  await expect(dietary(dialog)).toHaveValue('No shellfish');
  await page.waitForTimeout(1000);
  expect(calls.posts).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(dialog.getByText("You're registered", { exact: true })).toBeVisible();
  expect(calls.posts[1].body).toEqual(calls.posts[0].body);
  expect(calls.posts[1].key).not.toBe(calls.posts[0].key);
});

test('[SPM-134 TC-REG-009/010 AC7] should_block_invalid_text_and_keep_the_valid_answer_without_submitting', async ({ page }) => {
  const { calls } = await installRegistrationMocks(page);
  await page.goto('/events');
  const dialog = await openFromCard(page);
  await dietary(dialog).fill('a'.repeat(1001));
  await accessibility(dialog).fill('Step-free access');
  await submit(dialog).click();
  await expect(dietary(dialog)).toHaveAttribute('aria-invalid', 'true');
  await expect(dietary(dialog)).toHaveAccessibleDescription(/Use 1000 characters or fewer/);
  await expect(dietary(dialog)).toBeFocused();
  await expect(accessibility(dialog)).toHaveValue('Step-free access');
  await expect(dietary(dialog)).toHaveValue('a'.repeat(1001));
  expect(calls.posts).toEqual([]);
});

test('[SPM-134 TC-REG-010] should_show_backend_field_errors_on_the_field', async ({ page }) => {
  await installRegistrationMocks(page, {
    posts: [{ status: 400, body: { error: 'Please correct the highlighted fields.', code: 'VALIDATION_FAILED', fields: { accessibilityRequirements: 'Enter text of 1000 characters or fewer, without control characters such as NUL.' } } }],
  });
  await page.goto('/events');
  const dialog = await openFromCard(page);
  await accessibility(dialog).fill('Wheelchair space');
  await submit(dialog).click();
  await expect(accessibility(dialog)).toHaveAttribute('aria-invalid', 'true');
  await expect(accessibility(dialog)).toHaveAccessibleDescription(/Enter text of 1000 characters or fewer/);
  await expect(accessibility(dialog)).toHaveValue('Wheelchair space');
});

test('[SPM-134 TC-REG-023 AC18] should_restore_answers_after_sign_in_without_submitting_when_the_session_expires', async ({ page }) => {
  const { calls } = await installRegistrationMocks(page, {
    canSignInAgain: true,
    posts: [{ status: 401, body: { error: 'Please log in to continue.', code: 'UNAUTHENTICATED' } }],
  });
  await page.goto('/events');
  const dialog = await openFromCard(page);
  await dietary(dialog).fill('Typed before expiry 🌾');
  await submit(dialog).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fevents/);
  await page.locator('#email').fill('user@example.com');
  await page.locator('#password').fill('Valid-password9');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/events$/);
  const restored = registrationDialog(page, 'SMU Tech Summit');
  await expect(restored.getByText('Your registration answers were restored', { exact: true })).toBeVisible();
  await expect(dietary(restored)).toHaveValue('Typed before expiry 🌾');
  expect(calls.posts).toHaveLength(1);
  await submit(restored).click();
  await expect(restored.getByText("You're registered", { exact: true })).toBeVisible();
  expect(calls.posts).toHaveLength(2);
});

test('[SPM-134] should_trap_focus_restore_it_and_keep_typed_answers_when_closed_and_reopened', async ({ page }) => {
  await installRegistrationMocks(page);
  await page.goto('/events');
  const opener = registerOn(card(page, 'SMU Tech Summit'), 'SMU Tech Summit');
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = registrationDialog(page, 'SMU Tech Summit');
  await expect(dietary(dialog)).toBeVisible();
  await dietary(dialog).fill('Typed then closed');
  // Tabbing never reaches the page behind the modal: focus is inside the dialog,
  // or on the browser itself (body) as Chrome allows for native modal dialogs.
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => {
      const active = document.activeElement;
      return !active || active === document.body || Boolean(active.closest('dialog[open]'));
    })).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(dietary(dialog)).toHaveValue('Typed then closed');
});

test('[SPM-134] should_hide_register_now_and_explain_when_the_attendee_registrations_cannot_be_loaded', async ({ page }) => {
  const { current } = await installRegistrationMocks(page, { places: 503 });
  await page.goto('/events');
  await expect(page.getByText('Could not check your registrations', { exact: true })).toBeVisible();
  await expect(registerOn(card(page, 'SMU Tech Summit'), 'SMU Tech Summit')).toHaveCount(0);
  current.places = {};
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(registerOn(card(page, 'SMU Tech Summit'), 'SMU Tech Summit')).toBeVisible();
});

test('[SPM-134 TC-REG-002/015] should_register_from_the_event_details_page_and_keep_the_confirmation_open', async ({ page }) => {
  const { calls } = await installRegistrationMocks(page);
  await page.goto('/events/101');
  await expect(page.getByRole('heading', { level: 1, name: 'SMU Tech Summit', exact: true })).toBeVisible();
  await registerOn(page.locator('main'), 'SMU Tech Summit').click();
  const dialog = registrationDialog(page, 'SMU Tech Summit');
  await submit(dialog).click();
  await expect(dialog.getByText("You're registered", { exact: true })).toBeVisible();
  await expect(dialog).toContainText('REG-000042');
  // The page reloads its event behind the dialog; the confirmation stays.
  await expect.poll(() => calls.detail.filter((id) => id === 101).length).toBeGreaterThan(1);
  await expect(dialog.getByText("You're registered", { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(registerOn(page.locator('main'), 'SMU Tech Summit')).toHaveCount(0);
  await expect(page.locator('main').getByText('Registered', { exact: true }).first()).toBeVisible();
});

test('[SPM-134] should_fit_390px_with_44px_targets_in_the_registration_form', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installRegistrationMocks(page);
  await page.goto('/events');
  const registerButton = registerOn(card(page, 'SMU Tech Summit'), 'SMU Tech Summit');
  const box = await registerButton.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  const dialog = await openFromCard(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
  const small = await dialog.locator('button, textarea').evaluateAll((elements) => elements
    .filter((element) => element.getClientRects().length > 0)
    .map((element) => ({ name: element.getAttribute('aria-label') || element.textContent.trim() || element.id, box: element.getBoundingClientRect() }))
    .filter(({ box }) => box.height < 44 || box.width < 44)
    .map(({ name, box }) => `${name} ${Math.round(box.width)}x${Math.round(box.height)}`));
  expect(small).toEqual([]);
});

for (const role of ['ORGANISER', 'COORDINATOR', 'COORDINATOR_LEAD', 'VENUE_STAFF', 'TECH_SUPPORT', 'SAFETY_OFFICER']) {
  test(`[SPM-134] should_offer_no_registration_controls_when_role_is_${role}`, async ({ page }) => {
    const { calls } = await installRegistrationMocks(page, { role });
    await page.goto('/events');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('button', { name: /register now/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Event Discovery', exact: true })).toHaveCount(0);
    expect(calls.places).toBe(0);
    expect(calls.posts).toEqual([]);
  });
}
