// SPM-141 My Events against the real backend (:8000) and Supabase Auth,
// through the running frontend (:3000). Nothing is mocked. Accounts come from
// the backend's registration fixture; each journey creates its own run-scoped
// events (organiser cap 1, own primary venue), and waitlist places are joined
// and left through the backend's own routes, so the backend sets the queue.
// Every ID goes into the backend's fixture manifest and is removed in
// afterAll, with the audit entries. Leave, offer and withdrawal journeys are
// in spm-163-147-waitlist.live.spec.mjs. Run with `npm run test:e2e:live`.
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
const { assertAuditCleanupAvailable } = require(path.join(backendRoot, 'tests/fixtures/adminCleanup'));

const API = process.env.LIVE_BACKEND_URL || 'http://localhost:8000';
const DAY = 24 * 60 * 60 * 1000;
const NO_ANSWERS = { dietaryRestrictions: null, accessibilityRequirements: null };

const runId = newRunId();
const eventIds = [];
let fixtures;

// Trusted setup only: a confirmed, published event with one place, `days`
// ahead at 12:00–14:00 SGT, so it never crosses midnight in Singapore.
async function createEvent(name, days) {
  const day = new Date(Date.now() + days * DAY);
  const startsAt = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 4);
  const { data, error } = await supabase.from('event').insert({
    title: `spm141-${runId} ${name}`,
    description: 'Synthetic SPM-141 My Events journey event',
    organiser_id: fixtures.accounts.organiser.userId,
    coordinator_id: null,
    organisation_id: fixtures.organisations.A,
    status: 'CONFIRMED',
    start_datetime: new Date(startsAt).toISOString(),
    end_datetime: new Date(startsAt + 2 * 60 * 60 * 1000).toISOString(),
    expected_attendance: 1,
    preferred_layout_type: 'THEATRE',
    is_published: true,
    is_registration_enabled: true,
    registration_capacity: 1,
    registration_open_at: new Date(Date.now() - DAY).toISOString(),
    registration_close_at: new Date(startsAt - DAY).toISOString(),
  }).select('event_id, title, start_datetime, end_datetime').single();
  if (error) throw new Error(`Fixture event insert failed: ${error.message}`);
  recordFixtureIds(runId, 'eventIds', [data.event_id]);
  eventIds.push(data.event_id);
  await bookPrimaryVenue(runId, {
    eventId: data.event_id,
    requestedBy: fixtures.accounts.organiser.userId,
    startDatetime: data.start_datetime,
    endDatetime: data.end_datetime,
    capacity: 50,
  });
  return { id: data.event_id, title: data.title };
}

// The one place, held by `accountKey` (inserted as SPM-134's own setup does).
async function takePlace(event, accountKey) {
  const { data, error } = await supabase.from('registration').insert({
    event_id: event.id, attendee_id: fixtures.accounts[accountKey].userId, registration_status: 'REGISTERED',
  }).select('registration_id').single();
  if (error) throw new Error(`Fixture registration insert failed: ${error.message}`);
  recordFixtureIds(runId, 'registrationIds', [data.registration_id]);
}

const sessions = new Map();
async function bearer(accountKey) {
  if (!sessions.has(accountKey)) {
    const account = fixtures.accounts[accountKey];
    const { session, error } = await signInWithPassword(account.email, account.password);
    if (error || !session) throw new Error(`Fixture ${accountKey} could not sign in`);
    sessions.set(accountKey, session.access_token);
  }
  return `Bearer ${sessions.get(accountKey)}`;
}
async function api(accountKey, method, route, body) {
  const res = await fetch(`${API}/api${route}`, {
    method,
    headers: { Authorization: await bearer(accountKey), 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function expectApi(accountKey, method, route, body, expected) {
  const { status, body: reply } = await api(accountKey, method, route, body);
  if (status !== expected) throw new Error(`Fixture ${method} ${route} for ${accountKey} returned ${status} ${reply?.code}`);
  return reply;
}
// The attendee's list rows as the backend returns them, keyed by event ID.
async function listRows(accountKey) {
  const reply = await expectApi(accountKey, 'GET', '/registrations/mine?limit=100&offset=0', undefined, 200);
  return new Map(reply.registrations.map((row) => [row.event.event_id, row]));
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  await assertAuditCleanupAvailable();
  fixtures = await createRegistrationFixtures(runId, [
    { key: 'viewer', role: 'ATTENDEE' },
    { key: 'empty', role: 'ATTENDEE' },
    { key: 'holder', role: 'ATTENDEE' },
    { key: 'ahead', role: 'ATTENDEE' },
    { key: 'organiser', role: 'ORGANISER', organisation: 'A' },
  ]);
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

async function signIn(page, accountKey) {
  const account = fixtures.accounts[accountKey];
  await page.goto('/login');
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

const placesLoaded = (page) => page.waitForResponse((res) => new URL(res.url()).pathname === '/api/registrations/mine' && res.request().method() === 'GET');
const myEvent = (page, event) => page.locator('[id^="registration-event-"]').filter({ has: page.getByRole('heading', { name: event.title, exact: true }) });
const row = (scope, label) => scope.locator('dl > div').filter({ has: scope.page().locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd');
const sgtDate = (iso) => new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

async function openMyEvents(page) {
  const loaded = placesLoaded(page);
  await page.goto('/my-registrations');
  await loaded;
}

test('[SPM-141 AC4 TC-MYE-008, 009] should_show_the_empty_state_and_lead_to_event_discovery_when_the_attendee_holds_no_place', async ({ page }) => {
  await signIn(page, 'empty');
  await openMyEvents(page);
  await expect(page.getByText('You are not registered for any events yet.', { exact: true })).toBeVisible();
  await expect(page.locator('[id^="registration-event-"]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Explore events', exact: true }).click();
  await expect(page).toHaveURL(/\/events$/);
});

test('[SPM-141 AC1-AC3, AC5, AC8 TC-MYE-001-006, 023] should_list_registered_waitlisted_and_cancelled_places_nearest_first_with_the_backend_position', async ({ page }) => {
  // Joined in an order unlike the event dates, so the backend's newest-first
  // order differs from the page's.
  const later = await createEvent('later registered', 40);
  await takePlace(later, 'viewer');
  const sooner = await createEvent('sooner waitlisted', 32);
  await takePlace(sooner, 'holder');
  await expectApi('ahead', 'POST', `/registrations/mine/${sooner.id}/waitlist`, NO_ANSWERS, 201);
  await expectApi('viewer', 'POST', `/registrations/mine/${sooner.id}/waitlist`, NO_ANSWERS, 201);
  const cancelled = await createEvent('cancelled registered', 35);
  await takePlace(cancelled, 'viewer');
  // Trusted setup: the event is cancelled after the attendee registered.
  const { error } = await supabase.from('event').update({ status: 'CANCELLED' }).eq('event_id', cancelled.id);
  if (error) throw new Error(`Fixture cancel failed: ${error.message}`);

  const rows = await listRows('viewer');
  expect(rows.get(sooner.id)).toMatchObject({ registration_status: 'WAITLISTED', waitlistPosition: 2 });
  expect(rows.get(cancelled.id).event.attendee_status).toBe('CANCELLED');

  await signIn(page, 'viewer');
  await openMyEvents(page);
  const mine = page.locator('[id^="registration-event-"] h2').filter({ hasText: `spm141-${runId}` });
  await expect(mine).toHaveCount(3);
  expect(await mine.allTextContents()).toEqual([sooner.title, later.title, cancelled.title]);

  const laterCard = myEvent(page, later);
  const laterRow = rows.get(later.id).event;
  await expect(row(laterCard, 'Your place')).toHaveText('Registered');
  await expect(row(laterCard, 'Event status')).toHaveText('Confirmed');
  await expect(row(laterCard, 'Date')).toHaveText(sgtDate(laterRow.start_datetime));
  await expect(row(laterCard, 'Time')).toHaveText('12:00 – 14:00 SGT');
  // One approved primary venue, so the backend returns it.
  expect(laterRow.venue).not.toBeNull();
  await expect(row(laterCard, 'Location')).toHaveText([laterRow.venue.name, laterRow.venue.address].filter(Boolean).join(', '));
  await expect(laterCard.getByRole('button', { name: `Withdraw Registration: ${later.title}`, exact: true })).toBeVisible();

  const soonerCard = myEvent(page, sooner);
  await expect(row(soonerCard, 'Your place')).toHaveText('On the waitlist · Position 2');
  await expect(soonerCard.getByRole('button', { name: `Leave Waitlist: ${sooner.title}`, exact: true })).toBeVisible();

  const cancelledCard = myEvent(page, cancelled);
  await expect(row(cancelledCard, 'Event status')).toHaveText('Cancelled');
  await expect(row(cancelledCard, 'Your place')).toHaveText('Registered');
  await expect(cancelledCard.getByRole('button', { name: /Withdraw Registration|Leave Waitlist/ })).toHaveCount(0);

  // The attendee ahead leaves; the backend moves the viewer up.
  await expectApi('ahead', 'POST', `/registrations/mine/${sooner.id}/waitlist/leave`, {}, 200);
  await openMyEvents(page);
  await expect(row(myEvent(page, sooner), 'Your place')).toHaveText('On the waitlist · Position 1');

  // View Event Details opens the shared dialog from the attendee's own event.
  const own = page.waitForResponse((res) => new URL(res.url()).pathname === `/api/registrations/mine/${later.id}` && res.request().method() === 'GET');
  await myEvent(page, later).getByRole('button', { name: `View Event Details: ${later.title}`, exact: true }).click();
  expect((await own).status()).toBe(200);
  const dialog = page.getByRole('dialog', { name: later.title, exact: true });
  await expect(dialog).toContainText('Synthetic SPM-141 My Events journey event');
  await expect(dialog.getByRole('button', { name: `Withdraw Registration: ${later.title}`, exact: true })).toBeVisible();
});
