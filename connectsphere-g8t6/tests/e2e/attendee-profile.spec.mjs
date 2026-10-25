import { test, expect } from '@playwright/test';
import { installConnectSphereMocks, installLoginMock } from './support.mjs';

// SPM-270 Attendee Profile. The shared mocks sign in "Test User"
// (user@example.com); the profile endpoint is mocked here with the backend's
// confirmed contract: GET/PUT /api/attendee-profile/mine.
const makeProfile = (overrides = {}) => ({
  attendeeId: null, userId: 11, name: 'Test User', email: 'user@example.com', phone: '+65 8123 4567',
  dietaryRestrictions: null, accessibilityRequirements: null, version: null, createdAt: null, updatedAt: null,
  ...overrides,
});
const SAVED = makeProfile({
  attendeeId: 5, dietaryRestrictions: 'Vegetarian', accessibilityRequirements: 'Step-free access',
  version: 3, createdAt: '2026-10-20T02:00:00.000Z', updatedAt: '2026-10-21T02:00:00.000Z',
});

// `profile` is the GET body (or a status number). `saves` is a queue of PUT
// replies: { status, body } or a function of the request body. Without one, a
// PUT succeeds like the backend: 201 when version is null, otherwise 200 with
// the next version.
// `canSignInAgain` starts signed in with the login mock installed, for journeys
// where the session expires and the attendee signs in again.
async function installProfileMocks(page, { role = 'ATTENDEE', profile = makeProfile(), saves = [], signedOut = false, canSignInAgain = false } = {}) {
  const state = signedOut || canSignInAgain
    ? await installLoginMock(page, { role, authenticated: canSignInAgain })
    : await installConnectSphereMocks(page, { role });
  const calls = { get: 0, put: [] };
  let current = profile;
  await page.route('**/api/attendee-profile/mine', async (route) => {
    const request = route.request();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'GET') {
      calls.get += 1;
      return typeof current === 'number' ? json({ error: 'Failed' }, current) : json({ profile: current });
    }
    if (request.method() === 'PUT') {
      const body = request.postDataJSON();
      calls.put.push(body);
      const next = saves.shift();
      if (next) {
        const reply = typeof next === 'function' ? await next(body) : next;
        if (reply.status < 300) current = reply.body.profile;
        return json(reply.body, reply.status);
      }
      const trim = (value) => (value?.trim() ? value.trim() : null);
      current = {
        ...current, attendeeId: current.attendeeId ?? 9,
        dietaryRestrictions: trim(body.dietaryRestrictions), accessibilityRequirements: trim(body.accessibilityRequirements),
        version: (body.version ?? 0) + 1, createdAt: current.createdAt ?? '2026-10-25T02:00:00.000Z', updatedAt: '2026-10-25T03:00:00.000Z',
      };
      return json({ profile: current }, body.version === null ? 201 : 200);
    }
    return route.fallback();
  });
  return { state, calls, setProfile: (value) => { current = value; } };
}

const dietary = (page) => page.getByLabel('Dietary restrictions', { exact: true });
const accessibility = (page) => page.getByLabel('Accessibility requirements', { exact: true });
const saveButton = (page) => page.getByRole('button', { name: 'Save preferences', exact: true });
const identityLink = (page) => page.getByRole('link', { name: 'Attendee Profile for Test User', exact: true });

test('[SPM-270 TC-PROFILE-001] should_open_the_profile_when_an_attendee_selects_their_identity_block', async ({ page }) => {
  await installProfileMocks(page, { profile: SAVED });
  await page.goto('/my-registrations');
  const link = identityLink(page);
  await expect(link).toHaveAttribute('href', '/attendee-profile');
  await link.click();
  await expect(page).toHaveURL(/\/attendee-profile$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Attendee Profile', exact: true })).toBeVisible();
  await expect(identityLink(page)).toHaveAttribute('aria-current', 'page');
  // A sidebar link, not a tab: no main tab is marked current.
  await expect(page.getByRole('navigation', { name: 'Main Navigation', exact: true }).locator('[aria-current="page"]')).toHaveCount(0);
});

test('[SPM-270] should_open_the_profile_by_keyboard_with_a_visible_focus_ring', async ({ page }) => {
  await installProfileMocks(page, { profile: SAVED });
  await page.goto('/my-registrations');
  await page.getByRole('button', { name: 'Logout', exact: true }).focus();
  await page.keyboard.press('Tab');
  const link = identityLink(page);
  await expect(link).toBeFocused();
  await expect(link).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/attendee-profile$/);
});

for (const role of ['ORGANISER', 'COORDINATOR', 'COORDINATOR_LEAD', 'VENUE_STAFF', 'TECH_SUPPORT', 'SAFETY_OFFICER']) {
  test(`[SPM-270 TC-PROFILE-003] should_keep_a_static_identity_block_and_deny_the_profile_when_role_is_${role}`, async ({ page }) => {
    const { calls } = await installProfileMocks(page, { role, profile: SAVED });
    await page.goto('/dashboard');
    const sidebar = page.locator('#dashboard-sidebar');
    await expect(sidebar.getByText('Test User', { exact: true })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /Attendee Profile/ })).toHaveCount(0);
    await expect(sidebar.locator('a[href="/attendee-profile"]')).toHaveCount(0);

    await page.goto('/attendee-profile');
    await expect(page.getByText('This page is not available for your role.', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Attendee Profile', exact: true })).toHaveCount(0);
    expect(calls.get).toBe(0);
  });
}

test('[SPM-270 TC-PROFILE-002] should_redirect_to_login_and_return_when_a_signed_out_attendee_opens_the_profile', async ({ page }) => {
  await installProfileMocks(page, { signedOut: true, profile: SAVED });
  await page.goto('/attendee-profile');
  await expect(page).toHaveURL(/\/login\?next=%2Fattendee-profile/);
  await page.locator('#email').fill('user@example.com');
  await page.locator('#password').fill('Valid-password9');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/attendee-profile$/);
  await expect(dietary(page)).toHaveValue('Vegetarian');
});

test('[SPM-270 AC2] should_show_name_and_email_read_only_when_the_profile_loads', async ({ page }) => {
  await installProfileMocks(page, { profile: SAVED });
  await page.goto('/attendee-profile');
  const personal = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Personal information', exact: true }) });
  await expect(personal).toContainText('Test User');
  await expect(personal).toContainText('user@example.com');
  await expect(personal).toContainText('Read-only');
  await expect(personal.locator('input, textarea')).toHaveCount(0);
  await expect(dietary(page)).toHaveValue('Vegetarian');
  await expect(accessibility(page)).toHaveValue('Step-free access');
  await expect(page.getByText(/^Last saved 21 Oct 2026/)).toBeVisible();
});

// Requirement correction: attendees sign up without a phone, so the profile
// shows none, even when the backend response still includes one.
for (const [label, phone] of [['the_backend_returns_one', '+65 8123 4567'], ['the_backend_returns_none', null]]) {
  test(`[SPM-270 AC2] should_not_show_a_phone_row_when_${label}`, async ({ page }) => {
    await installProfileMocks(page, { profile: { ...SAVED, phone } });
    await page.goto('/attendee-profile');
    const personal = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Personal information', exact: true }) });
    await expect(personal).toContainText('user@example.com');
    await expect(personal.getByText('Phone', { exact: true })).toHaveCount(0);
    await expect(personal).not.toContainText('+65 8123 4567');
    await expect(page.getByText('Not provided', { exact: true })).toHaveCount(0);
  });
}

test('[SPM-270 TC-PROFILE-004/008] should_create_the_profile_with_version_null_when_saving_blank_fields_the_first_time', async ({ page }) => {
  const { calls } = await installProfileMocks(page);
  await page.goto('/attendee-profile');
  await expect(dietary(page)).toHaveValue('');
  await expect(accessibility(page)).toHaveValue('');
  await expect(page.getByText(/^Not saved yet/)).toBeVisible();
  await saveButton(page).click();
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible();
  expect(calls.put).toEqual([{ dietaryRestrictions: null, accessibilityRequirements: null, version: null }]);
  await expect(page.getByText(/^Last saved 25 Oct 2026/)).toBeVisible();
});

test('[SPM-270 TC-PROFILE-006/007] should_send_the_loaded_then_the_returned_version_when_updating_and_clearing', async ({ page }) => {
  const { calls } = await installProfileMocks(page, { profile: SAVED });
  await page.goto('/attendee-profile');
  await dietary(page).fill('Vegan, no peanuts');
  await accessibility(page).fill('');
  await saveButton(page).click();
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible();
  await expect(dietary(page)).toHaveValue('Vegan, no peanuts');
  await expect(accessibility(page)).toHaveValue('');

  await accessibility(page).fill('Captioning');
  await dietary(page).fill('   ');
  await saveButton(page).click();
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible();
  expect(calls.put).toEqual([
    { dietaryRestrictions: 'Vegan, no peanuts', accessibilityRequirements: null, version: 3 },
    { dietaryRestrictions: null, accessibilityRequirements: 'Captioning', version: 4 },
  ]);
  await expect(dietary(page)).toHaveValue('');
});

test('[SPM-270 TC-PROFILE-011] should_show_the_saved_values_when_the_attendee_revisits', async ({ page }) => {
  await installProfileMocks(page, { profile: SAVED });
  await page.goto('/attendee-profile');
  await dietary(page).fill('Halal');
  await saveButton(page).click();
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(dietary(page)).toHaveValue('Halal');
});

test('[SPM-270] should_show_success_only_after_the_backend_confirms_the_save', async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await installProfileMocks(page, {
    profile: SAVED,
    saves: [async (body) => { await gate; return { status: 200, body: { profile: { ...SAVED, dietaryRestrictions: body.dietaryRestrictions, version: 4 } } }; }],
  });
  await page.goto('/attendee-profile');
  await dietary(page).fill('Pescatarian');
  await saveButton(page).click();
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  await expect(page.getByText('Profile saved', { exact: true })).toHaveCount(0);
  release();
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible();
});

test('[SPM-270 TC-PROFILE-010] should_keep_entered_values_and_show_an_error_when_the_save_fails', async ({ page }) => {
  const { calls } = await installProfileMocks(page, {
    profile: SAVED,
    saves: [{ status: 500, body: { error: 'Internal Server Error', code: 'INTERNAL_ERROR' } }],
  });
  await page.goto('/attendee-profile');
  await dietary(page).fill('Kosher');
  await accessibility(page).fill('Seat near the exit');
  await saveButton(page).click();
  const alert = page.getByRole('alert').filter({ hasText: 'Your preferences were not saved' });
  await expect(alert).toContainText('Your changes are still here');
  await expect(alert).not.toContainText('Internal Server Error');
  await expect(page.getByText('Profile saved', { exact: true })).toHaveCount(0);
  await expect(dietary(page)).toHaveValue('Kosher');
  await expect(accessibility(page)).toHaveValue('Seat near the exit');
  // Retrying sends the same values and version.
  await saveButton(page).click();
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible();
  expect(calls.put[1]).toEqual(calls.put[0]);
  expect(calls.put[1].version).toBe(3);
});

test('[SPM-270] should_keep_entered_values_and_offer_reload_when_the_profile_is_stale', async ({ page }) => {
  const newer = { ...SAVED, dietaryRestrictions: 'Changed in another tab', version: 4, updatedAt: '2026-10-24T02:00:00.000Z' };
  const mocks = await installProfileMocks(page, {
    profile: SAVED,
    saves: [{ status: 409, body: { error: 'Your profile was changed since you opened it.', code: 'STALE_PROFILE' } }],
  });
  await page.goto('/attendee-profile');
  await dietary(page).fill('My newer edit');
  mocks.setProfile(newer);
  await saveButton(page).click();
  await expect(page.getByText('Your profile changed since you opened it', { exact: true })).toBeVisible();
  await expect(dietary(page)).toHaveValue('My newer edit');
  await expect(page.getByText('Profile saved', { exact: true })).toHaveCount(0);
  // No automatic retry with the newer version.
  expect(mocks.calls.put).toHaveLength(1);

  await page.getByRole('button', { name: 'Load latest profile', exact: true }).click();
  await expect(page.getByText('Latest profile loaded', { exact: true })).toBeVisible();
  await expect(dietary(page)).toHaveValue('Changed in another tab');
  expect(mocks.calls.get).toBe(2);
  await dietary(page).fill('Merged edit');
  await saveButton(page).click();
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible();
  expect(mocks.calls.put[1].version).toBe(4);
});

test('[SPM-270] should_show_backend_field_errors_on_the_field_and_keep_the_text', async ({ page }) => {
  await installProfileMocks(page, {
    profile: SAVED,
    saves: [{ status: 400, body: { error: 'Please correct the highlighted fields.', code: 'VALIDATION_FAILED', fields: { accessibilityRequirements: 'Enter text of 1000 characters or fewer, without control characters such as NUL.' } } }],
  });
  await page.goto('/attendee-profile');
  await accessibility(page).fill('Wheelchair space');
  await saveButton(page).click();
  await expect(accessibility(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(accessibility(page)).toHaveAccessibleDescription(/Enter text of 1000 characters or fewer/);
  await expect(accessibility(page)).toBeFocused();
  await expect(page.getByRole('alert').filter({ hasText: 'Your preferences were not saved' })).toContainText('Correct the highlighted fields');
  await expect(accessibility(page)).toHaveValue('Wheelchair space');
});

test('[SPM-270] should_block_text_over_1000_characters_before_sending', async ({ page }) => {
  const { calls } = await installProfileMocks(page, { profile: SAVED });
  await page.goto('/attendee-profile');
  await dietary(page).fill('a'.repeat(1001));
  await expect(page.getByText('1001 / 1000', { exact: false })).toBeVisible();
  await saveButton(page).click();
  await expect(dietary(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText(/Use 1000 characters or fewer/)).toBeVisible();
  expect(calls.put).toEqual([]);
  // The full text is kept, not cut to the limit.
  await expect(dietary(page)).toHaveValue('a'.repeat(1001));
  await dietary(page).fill('a'.repeat(1000));
  await expect(dietary(page)).toHaveAttribute('aria-invalid', 'false');
  await saveButton(page).click();
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible();
});

test('[SPM-270] should_send_and_show_unicode_text_unchanged', async ({ page }) => {
  const { calls } = await installProfileMocks(page);
  const text = 'Gluten-free 🌾, 素食, café';
  await page.goto('/attendee-profile');
  await dietary(page).fill(text);
  await saveButton(page).click();
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible();
  expect(calls.put[0].dietaryRestrictions).toBe(text);
  await expect(dietary(page)).toHaveValue(text);
});

test('[SPM-270] should_offer_retry_when_the_profile_cannot_be_loaded', async ({ page }) => {
  const mocks = await installProfileMocks(page, { profile: 503 });
  await page.goto('/attendee-profile');
  const alert = page.getByRole('alert').filter({ hasText: 'Could not load your profile' });
  await expect(alert).toBeVisible();
  await expect(dietary(page)).toHaveCount(0);
  mocks.setProfile(SAVED);
  await alert.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(dietary(page)).toHaveValue('Vegetarian');
});

test('[SPM-270] should_fit_390px_and_close_the_drawer_after_opening_the_profile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installProfileMocks(page, { profile: SAVED });
  await page.goto('/my-registrations');
  const menu = page.getByRole('button', { name: 'Open menu', exact: true });
  await menu.click();
  await identityLink(page).click();
  await expect(page).toHaveURL(/\/attendee-profile$/);
  await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(dietary(page)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  const small = await page.locator('main').locator('a[href], button, textarea').evaluateAll((elements) => elements
    .filter((element) => element.getClientRects().length > 0)
    .map((element) => ({ name: element.getAttribute('aria-label') || element.textContent.trim() || element.id, box: element.getBoundingClientRect() }))
    .filter(({ box }) => box.height < 44 || box.width < 44)
    .map(({ name, box }) => `${name} ${Math.round(box.width)}x${Math.round(box.height)}`));
  expect(small).toEqual([]);
  // Full-width save action on mobile.
  const save = await saveButton(page).boundingBox();
  const form = await page.locator('form').boundingBox();
  expect(save.width).toBeGreaterThan(form.width * 0.9);
});

// Session expiry during a save (Master 3.4: input survives recoverable errors).
async function signInAgain(page) {
  await expect(page).toHaveURL(/\/login\?next=%2Fattendee-profile/);
  await page.locator('#email').fill('user@example.com');
  await page.locator('#password').fill('Valid-password9');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/attendee-profile$/);
}

test('[SPM-270 TC-PROFILE-010] should_restore_unsaved_edits_after_sign_in_when_the_session_expires_during_save', async ({ page }) => {
  const { calls } = await installProfileMocks(page, {
    profile: SAVED, canSignInAgain: true,
    saves: [{ status: 401, body: { error: 'Please log in to continue.', code: 'UNAUTHENTICATED' } }],
  });
  await page.goto('/attendee-profile');
  await dietary(page).fill('Typed before expiry 🌾');
  await accessibility(page).fill('');
  await saveButton(page).click();
  await signInAgain(page);
  await expect(page.getByText('Your unsaved changes were restored', { exact: true })).toBeVisible();
  await expect(dietary(page)).toHaveValue('Typed before expiry 🌾');
  await expect(accessibility(page)).toHaveValue('');
  await expect(page.getByText('Profile saved', { exact: true })).toHaveCount(0);
  await saveButton(page).click();
  await expect(page.getByText('Profile saved', { exact: true })).toBeVisible();
  expect(calls.put).toEqual([
    { dietaryRestrictions: 'Typed before expiry 🌾', accessibilityRequirements: null, version: 3 },
    { dietaryRestrictions: 'Typed before expiry 🌾', accessibilityRequirements: null, version: 3 },
  ]);
  await expect(page.getByText('Your unsaved changes were restored', { exact: true })).toHaveCount(0);
  // Restored once only.
  await page.reload();
  await expect(page.getByText('Your unsaved changes were restored', { exact: true })).toHaveCount(0);
});

test('[SPM-270] should_warn_and_let_the_attendee_discard_restored_edits_when_the_profile_changed_while_signed_out', async ({ page }) => {
  const newer = { ...SAVED, dietaryRestrictions: 'Saved elsewhere', version: 4 };
  const mocks = await installProfileMocks(page, {
    profile: SAVED, canSignInAgain: true,
    saves: [{ status: 401, body: { error: 'Please log in to continue.', code: 'UNAUTHENTICATED' } }],
  });
  await page.goto('/attendee-profile');
  await dietary(page).fill('My edit before expiry');
  mocks.setProfile(newer);
  await saveButton(page).click();
  await signInAgain(page);
  await expect(page.getByText('Your profile changed while you were signed out', { exact: true })).toBeVisible();
  await expect(dietary(page)).toHaveValue('My edit before expiry');
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(dietary(page)).toHaveValue('Saved elsewhere');
  await expect(page.getByText('Your profile changed while you were signed out', { exact: true })).toHaveCount(0);
  // Nothing was written after the expired save.
  expect(mocks.calls.put).toHaveLength(1);
});
