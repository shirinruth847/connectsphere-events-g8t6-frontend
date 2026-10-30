// SPM-134 attendee registration against the real backend (:8000) and Supabase
// Auth, through the running frontend (:3000). Nothing is mocked: accounts come
// from the backend's minimal registration fixture (Auth Admin + trusted setup),
// and each test creates its own run-scoped events. Every ID goes into the
// backend's fixture manifest and is removed in afterAll; attendees who wrote
// registration history stay deactivated, as the backend cleanup documents.
// Run with `npm run test:e2e:live`.
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const backendRoot = process.env.CONNECTSPHERE_BACKEND_DIR || path.resolve(import.meta.dirname, '../../../../connectsphere-events-g8t6-backend');
require(path.join(backendRoot, 'node_modules/dotenv')).config({ path: path.join(backendRoot, '.env'), quiet: true });
const supabase = require(path.join(backendRoot, 'config/supabase'));
const { newRunId, cleanupAuthFixtures, recordFixtureIds } = require(path.join(backendRoot, 'tests/fixtures/authFixtures'));
const { createRegistrationFixtures, bookPrimaryVenue } = require(path.join(backendRoot, 'tests/fixtures/registrationFixtures'));
const { signInWithPassword } = require(path.join(backendRoot, 'tests/fixtures/browserAuthClient'));

const API = process.env.LIVE_BACKEND_URL || 'http://localhost:8000';
const DAY = 24 * 60 * 60 * 1000;
const PROFILE = { dietaryRestrictions: 'Vegetarian', accessibilityRequirements: 'Aisle seat' };
const NON_ATTENDEES = [
  ['organiser', 'ORGANISER'], ['coordinator', 'COORDINATOR'], ['coordinatorLead', 'COORDINATOR_LEAD'],
  ['venueStaff', 'VENUE_STAFF'], ['techSupport', 'TECH_SUPPORT'], ['safetyOfficer', 'SAFETY_OFFICER'],
];

const runId = newRunId();
const eventIds = [];
let fixtures;
let eventCount = 0;

// Trusted setup only: an event the attendee can see, OPEN unless overridden.
// Each gets its own primary venue, whose capacity the backend reads; without
// one (venueCapacity null) the backend reports UNAVAILABLE.
async function createEvent(name, overrides = {}, { venueCapacity = 50 } = {}) {
  eventCount += 1;
  const startsAt = Date.now() + (12 + eventCount) * DAY;
  const { data, error } = await supabase.from('event').insert({
    title: `spm134-${runId} ${name}`,
    description: 'Synthetic SPM-134 browser journey event',
    organiser_id: fixtures.accounts.organiser.userId,
    coordinator_id: null,
    organisation_id: fixtures.organisations.A,
    status: 'CONFIRMED',
    start_datetime: new Date(startsAt).toISOString(),
    end_datetime: new Date(startsAt + 2 * 60 * 60 * 1000).toISOString(),
    expected_attendance: 25,
    preferred_layout_type: 'THEATRE',
    is_published: true,
    is_registration_enabled: true,
    registration_capacity: 10,
    registration_open_at: new Date(Date.now() - DAY).toISOString(),
    registration_close_at: new Date(startsAt - DAY).toISOString(),
    ...overrides,
  }).select('event_id, title, start_datetime, end_datetime').single();
  if (error) throw new Error(`Fixture event insert failed: ${error.message}`);
  recordFixtureIds(runId, 'eventIds', [data.event_id]);
  eventIds.push(data.event_id);
  if (venueCapacity !== null) {
    await bookPrimaryVenue(runId, {
      eventId: data.event_id,
      requestedBy: fixtures.accounts.organiser.userId,
      startDatetime: data.start_datetime,
      endDatetime: data.end_datetime,
      capacity: venueCapacity,
    });
  }
  return { id: data.event_id, title: data.title };
}

async function updateEvent(event, patch) {
  const { error } = await supabase.from('event').update(patch).eq('event_id', event.id);
  if (error) throw new Error(`Fixture event update failed: ${error.message}`);
}

// A place taken outside the browser (another attendee, or this one elsewhere).
async function takePlace(event, accountKey, status = 'REGISTERED') {
  const { data, error } = await supabase.from('registration').insert({
    event_id: event.id, attendee_id: fixtures.accounts[accountKey].userId, registration_status: status,
  }).select('registration_id').single();
  if (error) throw new Error(`Fixture registration insert failed: ${error.message}`);
  recordFixtureIds(runId, 'registrationIds', [data.registration_id]);
}

async function registrationsOn(event) {
  const { data, error } = await supabase.from('registration')
    .select('registration_id, attendee_id, registration_status, dietary_restrictions, accessibility_requirements')
    .eq('event_id', event.id);
  if (error) throw error;
  return data;
}

async function savedProfile(accountKey) {
  const { data, error } = await supabase.rpc('get_attendee_profile', { p_user_id: fixtures.accounts[accountKey].userId });
  if (error) throw error;
  return data;
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  fixtures = await createRegistrationFixtures(runId, [
    { key: 'attendee', role: 'ATTENDEE' },
    { key: 'blankAttendee', role: 'ATTENDEE' },
    { key: 'other', role: 'ATTENDEE' },
    { key: 'organiser', role: 'ORGANISER', organisation: 'A' },
    ...NON_ATTENDEES.filter(([key]) => key !== 'organiser').map(([key, role]) => ({ key, role })),
  ]);
  // The attendee's reusable answers, saved through the backend's own profile route.
  const { session, error } = await signInWithPassword(fixtures.accounts.attendee.email, fixtures.accounts.attendee.password);
  if (error || !session) throw new Error('Fixture attendee could not sign in');
  const res = await fetch(`${API}/api/attendee-profile/mine`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(PROFILE),
  });
  if (![200, 201].includes(res.status)) throw new Error(`Fixture profile save failed: ${res.status}`);
});

test.afterAll(async () => {
  test.setTimeout(240_000);
  if (eventIds.length) {
    const { data } = await supabase.from('registration').select('registration_id').in('event_id', eventIds);
    recordFixtureIds(runId, 'registrationIds', (data || []).map((row) => row.registration_id));
  }
  // Throws if anything this run created is still present.
  await cleanupAuthFixtures(runId);
});

// Browser helpers ----------------------------------------------------------

// Records what the browser sends to the backend, without changing any reply.
function watchBackend(page) {
  const seen = { posts: [], placeReads: 0, profileWrites: 0, registrationCalls: 0, unread: [] };
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return;
    if (url.pathname.startsWith('/api/registrations')) seen.registrationCalls += 1;
    if (request.method() === 'POST' && url.pathname.startsWith('/api/registrations/mine/')) {
      seen.posts.push({ eventId: Number(url.pathname.split('/').pop()), body: request.postDataJSON(), key: request.headers()['idempotency-key'] ?? null });
    }
    if (request.method() === 'GET' && url.pathname === '/api/registrations/mine') seen.placeReads += 1;
    if (request.method() !== 'GET' && url.pathname.startsWith('/api/attendee-profile')) seen.profileWrites += 1;
  });
  page.on('response', async (response) => {
    if (!response.url().endsWith('/api/notifications/unread-count') || response.status() !== 200) return;
    const body = await response.json().catch(() => null);
    if (typeof body?.unreadCount === 'number') seen.unread.push(body.unreadCount);
  });
  return seen;
}

async function signIn(page, accountKey) {
  const account = fixtures.accounts[accountKey];
  await page.goto('/login');
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

const placesLoaded = (page) => page.waitForResponse((res) => new URL(res.url()).pathname === '/api/registrations/mine' && res.request().method() === 'GET');
const card = (page, event) => page.getByRole('article', { name: event.title, exact: true });
const registerNow = (scope, event) => scope.getByRole('button', { name: `Register now for ${event.title}`, exact: true });
const registrationDialog = (page, event) => page.getByRole('dialog', { name: `Register for ${event.title}`, exact: true });
const dietary = (scope) => scope.getByLabel('Dietary restrictions', { exact: true });
const accessibility = (scope) => scope.getByLabel('Accessibility requirements', { exact: true });
const submit = (scope) => scope.getByRole('button', { name: 'Register', exact: true });
const registered = (scope) => scope.getByText("You're registered", { exact: true });
// The registration area's control for any state but Register Now: visible, inert.
const stateControl = (scope, event, label) => scope.getByRole('button', { name: `${label} for ${event.title}`, exact: true });
async function expectDisabledState(scope, event, label) {
  await expect(stateControl(scope, event, label)).toBeVisible();
  await expect(stateControl(scope, event, label)).toHaveAttribute('aria-disabled', 'true');
  await expect(registerNow(scope, event)).toHaveCount(0);
}

// Opens Event Discovery and loads pages until the event's card is listed.
async function openDiscoveryCard(page, event) {
  const loaded = placesLoaded(page);
  await page.goto('/events');
  await loaded;
  const target = card(page, event);
  await expect(async () => {
    if (await target.count()) return;
    const more = page.getByRole('button', { name: 'Load more events', exact: true });
    if (await more.isVisible()) await more.click();
    throw new Error('event card not listed yet');
  }).toPass({ timeout: 45_000, intervals: [500, 1000] });
  return target;
}

async function openDetailsPage(page, event) {
  const loaded = placesLoaded(page);
  await page.goto(`/events/${event.id}`);
  await loaded;
  await expect(page.getByRole('heading', { level: 1, name: event.title, exact: true })).toBeVisible();
}

async function openFormOnDetailsPage(page, event) {
  await openDetailsPage(page, event);
  await registerNow(page, event).click();
  const dialog = registrationDialog(page, event);
  await expect(dietary(dialog)).toBeVisible();
  return dialog;
}

// Journeys -----------------------------------------------------------------

test('[SPM-134 TC-REG-001/003/005/006/007/011/012/014 AC1/AC3/AC4/AC8/AC9/AC10] should_register_once_from_the_discovery_card_with_edited_answers_and_show_the_backend_confirmation', async ({ page }) => {
  const event = await createEvent('discovery card');
  const seen = watchBackend(page);
  const profileBefore = await savedProfile('attendee');
  await signIn(page, 'attendee');

  const eventCard = await openDiscoveryCard(page, event);
  await expect(eventCard.getByRole('button', { name: `View event details for ${event.title}`, exact: true })).toBeVisible();
  await expect(eventCard).toContainText('Registration Open');
  await registerNow(eventCard, event).click();
  const dialog = registrationDialog(page, event);

  await expect(dietary(dialog)).toHaveValue(PROFILE.dietaryRestrictions);
  await expect(accessibility(dialog)).toHaveValue(PROFILE.accessibilityRequirements);
  await expect(dialog.getByText(fixtures.accounts.attendee.email, { exact: true })).toBeVisible();
  await expect(dialog.getByText('Read-only', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('textbox')).toHaveCount(2);

  const answers = { dietaryRestrictions: 'Vegan 🌱 素食 café', accessibilityRequirements: 'Step-free route, near the exit' };
  await dietary(dialog).fill(answers.dietaryRestrictions);
  await accessibility(dialog).fill(answers.accessibilityRequirements);
  const unreadBefore = seen.unread.at(-1) ?? 0;
  const placeReadsBefore = seen.placeReads;
  await submit(dialog).dblclick();

  await expect(registered(dialog)).toBeVisible({ timeout: 30_000 });
  const rows = await registrationsOn(event);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ attendee_id: fixtures.accounts.attendee.userId, registration_status: 'REGISTERED', dietary_restrictions: answers.dietaryRestrictions, accessibility_requirements: answers.accessibilityRequirements });
  // The confirmation number is the backend's, for the row it created.
  await expect(dialog).toContainText(`REG-${String(rows[0].registration_id).padStart(6, '0')}`);
  await expect(dialog).toContainText(event.title);
  await expect(dialog).not.toContainText(/email (was )?sent/i);

  expect(seen.posts).toHaveLength(1);
  expect(seen.posts[0].body).toEqual(answers);
  expect(seen.posts[0].key).toMatch(/^[A-Za-z0-9_.:-]{8,128}$/);
  await expect.poll(() => seen.placeReads).toBeGreaterThan(placeReadsBefore);
  await expect.poll(() => seen.unread.at(-1)).toBe(unreadBefore + 1);

  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expectDisabledState(eventCard, event, 'Registered');
  await expect(registerNow(eventCard, event)).toHaveCount(0);
  await expect(page.getByRole('button', { name: `View event details for ${event.title}`, exact: true })).toBeFocused();

  expect(seen.profileWrites).toBe(0);
  expect(await savedProfile('attendee')).toEqual(profileBefore);
});

test('[SPM-134 TC-REG-002/015 AC2/AC10] should_use_the_same_form_from_the_event_details_dialog_and_show_registered_on_the_details_page_afterwards', async ({ page }) => {
  const event = await createEvent('details dialog');
  await signIn(page, 'attendee');

  const eventCard = await openDiscoveryCard(page, event);
  await eventCard.getByRole('button', { name: `View event details for ${event.title}`, exact: true }).click();
  const details = page.getByRole('dialog', { name: event.title, exact: true });
  await registerNow(details, event).click();
  const dialog = registrationDialog(page, event);
  await expect(dietary(dialog)).toHaveValue(PROFILE.dietaryRestrictions);
  await submit(dialog).click();
  await expect(registered(dialog)).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();

  await expect(details.getByText('Registered', { exact: true }).first()).toBeVisible();
  await expect(registerNow(details, event)).toHaveCount(0);

  await openDetailsPage(page, event);
  await expect(page.getByText('Registered', { exact: true }).first()).toBeVisible();
  await expect(registerNow(page, event)).toHaveCount(0);
});

test('[SPM-134 TC-REG-002/004 AC5] should_register_by_keyboard_at_390px_on_the_details_page_with_blank_answers_when_the_profile_has_none', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const event = await createEvent('details page mobile');
  const seen = watchBackend(page);
  await signIn(page, 'blankAttendee');
  await openDetailsPage(page, event);

  await registerNow(page, event).focus();
  await page.keyboard.press('Enter');
  const dialog = registrationDialog(page, event);
  await expect(dietary(dialog)).toHaveValue('');
  await expect(accessibility(dialog)).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  const box = await submit(dialog).boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);

  await submit(dialog).focus();
  await page.keyboard.press('Enter');
  await expect(registered(dialog)).toBeVisible({ timeout: 30_000 });
  expect(seen.posts.map((post) => post.body)).toEqual([{ dietaryRestrictions: null, accessibilityRequirements: null }]);
  // The details page reloads the event behind the dialog; the confirmation stays.
  await expect(page.getByText('Registered', { exact: true }).first()).toBeVisible();
  await expect(registered(dialog)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(registerNow(page, event)).toHaveCount(0);
});

// Every state the backend decides, from real event data: the card and the
// details page show the same disabled control and never Register Now.
for (const { ids, state, overrides = {}, venueCapacity = 50, label, place = null } of [
  { ids: 'AC12', state: 'not_yet_open', overrides: { registration_open_at: new Date(Date.now() + DAY).toISOString() }, label: 'Registration Not Yet Open' },
  { ids: 'TC-REG-017 AC12', state: 'full', overrides: { registration_capacity: 1 }, label: 'Registration Full', place: ['other', 'REGISTERED'] },
  // No organiser capacity (allowed only with the flag off, which no longer gates registration).
  { ids: 'TC-REG-017 AC12', state: 'full_at_the_venue_capacity', overrides: { is_registration_enabled: false, registration_capacity: null }, venueCapacity: 1, label: 'Registration Full', place: ['other', 'REGISTERED'] },
  { ids: 'TC-REG-018 AC13', state: 'closed', overrides: { registration_close_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() }, label: 'Registration Closed' },
  { ids: 'AC13', state: 'unavailable_without_a_primary_venue', venueCapacity: null, label: 'Registration Unavailable' },
  { ids: 'AC13', state: 'unavailable_without_a_registration_start_time', overrides: { registration_open_at: null }, label: 'Registration Unavailable' },
  { ids: 'TC-REG-020 AC15', state: 'already_registered', label: 'Registered', place: ['attendee', 'REGISTERED'] },
  { ids: 'AC15', state: 'already_waitlisted', label: 'On the waitlist', place: ['attendee', 'WAITLISTED'] },
]) {
  test(`[SPM-134 ${ids}] should_show_${label.replaceAll(' ', '_')}_and_no_register_now_when_the_event_is_${state}_on_a_fresh_load`, async ({ page }) => {
    const event = await createEvent(`fresh ${state}`, overrides, { venueCapacity });
    if (place) await takePlace(event, ...place);
    const seen = watchBackend(page);
    await signIn(page, 'attendee');
    const eventCard = await openDiscoveryCard(page, event);
    await expect(eventCard.getByRole('button', { name: `View event details for ${event.title}`, exact: true })).toBeVisible();
    await expectDisabledState(eventCard, event, label);
    if (label === 'Registration Unavailable') await expect(eventCard).not.toContainText(/full|closed/i);

    await openDetailsPage(page, event);
    const main = page.locator('main');
    await expectDisabledState(main, event, label);
    if (label === 'Registration Unavailable') await expect(main).not.toContainText(/full|closed|Registration opens|venue capacity/i);
    if (state === 'not_yet_open') await expect(stateControl(main, event, label)).toHaveAccessibleDescription(/^Registration opens /);
    await stateControl(main, event, label).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(seen.posts).toEqual([]);
  });
}

// The event changes after the form opened; the backend's answer decides (AC16).
for (const [state, change, title, after] of [
  ['capacity_fills', (event) => takePlace(event, 'other'), 'This event is now full', 'Registration Full'],
  ['registration_closes', (event) => updateEvent(event, { registration_close_at: new Date(Date.now() - 60 * 1000).toISOString() }), 'Registration has closed', 'Registration Closed'],
  ['registration_start_moves_later', (event) => updateEvent(event, { registration_open_at: new Date(Date.now() + DAY).toISOString() }), "Registration hasn't opened yet", 'Registration Not Yet Open'],
  ['registration_end_time_is_removed', (event) => updateEvent(event, { registration_close_at: null }), 'Registration is currently unavailable', 'Registration Unavailable'],
  ['attendee_registers_elsewhere', (event) => takePlace(event, 'attendee'), "You're already registered", 'Registered'],
]) {
  test(`[SPM-134 TC-REG-021 AC16] should_keep_answers_and_show_the_backend_refusal_without_retrying_when_${state}_after_the_form_opens`, async ({ page }) => {
    const event = await createEvent(`stale ${state}`, state === 'capacity_fills' ? { registration_capacity: 1 } : {});
    const seen = watchBackend(page);
    await signIn(page, 'attendee');
    const dialog = await openFormOnDetailsPage(page, event);
    await dietary(dialog).fill(`Typed before ${state} ✓`);
    await change(event);

    await submit(dialog).click();
    await expect(dialog.getByText(title, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(registered(dialog)).toHaveCount(0);
    await expect(dietary(dialog)).toHaveValue(`Typed before ${state} ✓`);
    await expect(submit(dialog)).toHaveCount(0);
    await page.waitForTimeout(1500);
    expect(seen.posts).toHaveLength(1);

    // The refusal itself names nothing internal (the event title may).
    await expect(dialog.getByText(title, { exact: true }).locator('xpath=..')).not.toContainText(/venue|capacity|configur/i);

    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    // The refreshed event shows the backend's new state.
    await expectDisabledState(page.locator('main'), event, after);
    const placesHeld = (await registrationsOn(event)).filter((row) => row.attendee_id === fixtures.accounts.attendee.userId);
    expect(placesHeld).toHaveLength(state === 'attendee_registers_elsewhere' ? 1 : 0);
  });
}

test('[SPM-134 TC-REG-021 AC16] should_say_the_event_is_unavailable_without_naming_its_lifecycle_when_it_leaves_CONFIRMED_after_the_form_opens', async ({ page }) => {
  const event = await createEvent('stale hidden');
  await signIn(page, 'attendee');
  const dialog = await openFormOnDetailsPage(page, event);
  await dietary(dialog).fill('Typed before it was hidden');
  await updateEvent(event, { status: 'PREPARATION' });

  await submit(dialog).click();
  await expect(dialog.getByText('This event is no longer available', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(registered(dialog)).toHaveCount(0);
  await expect(dietary(dialog)).toHaveValue('Typed before it was hidden');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('This event is not available', { exact: true })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/PREPARATION|Preparation|PLANNING|SAFETY_REVIEW/);
  expect(await registrationsOn(event)).toEqual([]);
});

test('[SPM-134 TC-REG-022 AC17] should_keep_answers_and_replay_the_original_registration_with_the_same_key_when_the_response_is_lost', async ({ page }) => {
  const event = await createEvent('lost response');
  const seen = watchBackend(page);
  await signIn(page, 'attendee');
  const dialog = await openFormOnDetailsPage(page, event);
  await dietary(dialog).fill('Halal');

  // The first POST reaches the backend and commits; only its reply is dropped.
  let dropped = false;
  await page.route(`**/api/registrations/mine/${event.id}`, async (route) => {
    if (route.request().method() !== 'POST' || dropped) return route.fallback();
    dropped = true;
    await route.fetch();
    await route.abort('failed');
  });
  await submit(dialog).click();
  await expect(dialog.getByRole('button', { name: 'Try again', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(registered(dialog)).toHaveCount(0);
  await expect(dietary(dialog)).toHaveValue('Halal');
  await page.waitForTimeout(1500);
  expect(seen.posts).toHaveLength(1);

  await dialog.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(registered(dialog)).toBeVisible({ timeout: 30_000 });
  expect(seen.posts).toHaveLength(2);
  expect(seen.posts[1].key).toBe(seen.posts[0].key);
  const rows = await registrationsOn(event);
  expect(rows).toHaveLength(1);
  await expect(dialog).toContainText(`REG-${String(rows[0].registration_id).padStart(6, '0')}`);
});

test('[SPM-134 TC-REG-009/010 AC7] should_accept_exactly_1000_units_of_emoji_end_to_end_and_block_one_more_in_the_browser', async ({ page }) => {
  const event = await createEvent('length boundary');
  const seen = watchBackend(page);
  await signIn(page, 'attendee');
  const dialog = await openFormOnDetailsPage(page, event);

  // An emoji is two units for both the browser counter and the backend.
  await dietary(dialog).fill('🌱'.repeat(501));
  await accessibility(dialog).fill('Hearing loop');
  await submit(dialog).click();
  await expect(dietary(dialog)).toHaveAttribute('aria-invalid', 'true');
  await expect(accessibility(dialog)).toHaveValue('Hearing loop');
  expect(seen.posts).toEqual([]);

  await dietary(dialog).fill('🌱'.repeat(500));
  await submit(dialog).click();
  await expect(registered(dialog)).toBeVisible({ timeout: 30_000 });
  const [row] = await registrationsOn(event);
  expect(row.dietary_restrictions).toBe('🌱'.repeat(500));
  expect(row.accessibility_requirements).toBe('Hearing loop');
});

test('[SPM-134 TC-REG-023 AC18] should_restore_answers_after_signing_in_again_and_wait_for_register_when_the_session_is_revoked', async ({ page }) => {
  const event = await createEvent('session revoked');
  const seen = watchBackend(page);
  await signIn(page, 'attendee');
  const dialog = await openFormOnDetailsPage(page, event);
  await dietary(dialog).fill('Typed before expiry 🌾');

  // Trusted setup ends this browser session in Supabase Auth; no app bypass.
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((name) => /^sb-.*-auth-token$/.test(name));
    return key ? JSON.parse(localStorage.getItem(key)).access_token : null;
  });
  const { error } = await supabase.auth.admin.signOut(token, 'local');
  if (error) throw error;

  await submit(dialog).click();
  await page.waitForURL((url) => url.pathname === '/login' && url.searchParams.get('next') === `/events/${event.id}`, { timeout: 30_000 });
  expect(seen.posts).toHaveLength(1);
  expect(await registrationsOn(event)).toEqual([]);

  await page.locator('#email').fill(fixtures.accounts.attendee.email);
  await page.locator('#password').fill(fixtures.accounts.attendee.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => url.pathname === `/events/${event.id}`, { timeout: 30_000 });
  const restored = registrationDialog(page, event);
  await expect(restored.getByText('Your registration answers were restored', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(dietary(restored)).toHaveValue('Typed before expiry 🌾');
  await page.waitForTimeout(2000);
  expect(seen.posts).toHaveLength(1);
  expect(await registrationsOn(event)).toEqual([]);

  await submit(restored).click();
  await expect(registered(restored)).toBeVisible({ timeout: 30_000 });
  expect((await registrationsOn(event))[0].dietary_restrictions).toBe('Typed before expiry 🌾');
});

test('[SPM-134 TC-REG-023 AC18] should_send_a_signed_out_visitor_to_login_and_back_to_the_event', async ({ page }) => {
  const event = await createEvent('signed out');
  await page.goto(`/events/${event.id}`);
  await page.waitForURL((url) => url.pathname === '/login' && url.searchParams.get('next') === `/events/${event.id}`, { timeout: 30_000 });
  await expect(registerNow(page, event)).toHaveCount(0);
});

test('[SPM-134] should_hide_register_now_until_registrations_load_and_recover_when_the_first_read_fails', async ({ page }) => {
  const event = await createEvent('places read');
  await signIn(page, 'attendee');
  // Leave the signed-in landing page first, so its own read of the places is
  // not the one held and failed below.
  await page.goto('about:blank');
  // Only the network fails; the retry goes to the real backend.
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let failed = false;
  await page.route((url) => url.pathname === '/api/registrations/mine', async (route) => {
    if (failed) return route.fallback();
    failed = true;
    await held;
    await route.abort('failed');
  });
  await page.goto(`/events/${event.id}`);
  await expect(page.getByRole('heading', { level: 1, name: event.title, exact: true })).toBeVisible();
  await expect(page.getByText('Registration Open', { exact: true }).first()).toBeVisible();
  await expect(registerNow(page, event)).toHaveCount(0);
  release();

  await expect(page.getByText('Could not check your registrations', { exact: true })).toBeVisible();
  await expect(registerNow(page, event)).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(registerNow(page, event)).toBeVisible();
  await expect(page.getByText('Could not check your registrations', { exact: true })).toHaveCount(0);
});

test('[SPM-134 TC-REG-001/002] should_offer_no_registration_journey_to_any_non_attendee_role', async ({ browser }) => {
  test.setTimeout(240_000);
  const event = await createEvent('staff view');
  for (const [key, role] of NON_ATTENDEES) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const seen = watchBackend(page);
    await signIn(page, key);
    for (const target of ['/events', `/events/${event.id}`]) {
      await page.goto(target);
      await expect(page.locator('main')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('button', { name: /^register now/i }), `${role} on ${target}`).toHaveCount(0);
      await expect(page.getByRole('dialog', { name: /^Register for/ }), `${role} on ${target}`).toHaveCount(0);
    }
    expect(seen.registrationCalls, `${role} registration requests`).toBe(0);
    await context.close();
  }
  expect(await registrationsOn(event)).toEqual([]);
});
