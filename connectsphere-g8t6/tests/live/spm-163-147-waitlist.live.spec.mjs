// SPM-163 waitlist and place offers, and SPM-147 withdrawal, against the real
// backend (:8000) and Supabase Auth, through the running frontend (:3000).
// Nothing is mocked. Accounts come from the backend's registration fixture
// (Auth Admin + trusted setup); each journey creates its own run-scoped events
// with one place (organiser cap 1) on their own primary venue. Waitlist places
// other attendees hold are joined through the backend's own route, so the
// backend sets their queue order. Every ID goes into the backend's fixture
// manifest and is removed in afterAll, with the audit entries, through the
// privileged test connection. Run with `npm run test:e2e:live`.
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
let eventCount = 0;

// Trusted setup only: a published event with one place, CONFIRMED unless
// overridden (PREPARATION is attendee-facing too, SPM-289).
async function createEvent(name, overrides = {}) {
  eventCount += 1;
  const startsAt = Date.now() + (30 + eventCount) * DAY;
  const { data, error } = await supabase.from('event').insert({
    title: `spm163-${runId} ${name}`,
    description: 'Synthetic SPM-163/147 browser journey event',
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
    ...overrides,
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

// Another attendee acting through the backend's own routes, as the browser would.
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
async function joinAs(accountKey, event) {
  const { status, body } = await api(accountKey, 'POST', `/registrations/mine/${event.id}/waitlist`, NO_ANSWERS);
  if (status !== 201) throw new Error(`Fixture join for ${accountKey} returned ${status} ${body?.code}`);
  return body.registration;
}
// The attendee's own place as the backend reports it (status, position, offer).
async function placeOf(accountKey, event) {
  const { status, body } = await api(accountKey, 'GET', `/registrations/mine/${event.id}`);
  return status === 200 ? body.myRegistration : null;
}
async function statusInDatabase(accountKey, event) {
  const { data, error } = await supabase.from('registration').select('registration_status')
    .eq('event_id', event.id).eq('attendee_id', fixtures.accounts[accountKey].userId).maybeSingle();
  if (error) throw error;
  return data?.registration_status ?? null;
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  // Audit entries these journeys write can only be removed through the privileged connection.
  await assertAuditCleanupAvailable();
  fixtures = await createRegistrationFixtures(runId, [
    { key: 'joiner', role: 'ATTENDEE' },
    { key: 'holder', role: 'ATTENDEE' },
    { key: 'first', role: 'ATTENDEE' },
    { key: 'second', role: 'ATTENDEE' },
    { key: 'organiser', role: 'ORGANISER', organisation: 'A' },
  ]);
});

test.afterAll(async () => {
  test.setTimeout(240_000);
  // Places the browser and the routes created join the manifest, so cleanup removes them too.
  if (eventIds.length) {
    const { data } = await supabase.from('registration').select('registration_id').in('event_id', eventIds);
    recordFixtureIds(runId, 'registrationIds', (data || []).map((row) => row.registration_id));
  }
  // Throws if anything this run created is still present.
  await cleanupAuthFixtures(runId);
});

// Browser helpers ----------------------------------------------------------

// Counts the browser's reads of the unread count, without changing any reply.
function watchUnreadReads(page) {
  const seen = { unreadReads: 0, posts: [] };
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/notifications/unread-count') seen.unreadReads += 1;
    if (request.method() === 'POST' && url.pathname.startsWith('/api/registrations/mine/')) seen.posts.push(url.pathname);
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

async function newSignedInPage(browser, accountKey) {
  const context = await browser.newContext({ timezoneId: 'Asia/Singapore' });
  const page = await context.newPage();
  await signIn(page, accountKey);
  return page;
}

const placesLoaded = (page) => page.waitForResponse((res) => new URL(res.url()).pathname === '/api/registrations/mine' && res.request().method() === 'GET');
const discoveryCard = (page, event) => page.getByRole('article', { name: event.title, exact: true });
const joinOn = (scope, event) => scope.getByRole('button', { name: `Join waitlist for ${event.title}`, exact: true });
const myEvent = (page, event) => page.locator('[id^="registration-event-"]').filter({ has: page.getByRole('heading', { name: event.title, exact: true }) });
const actionResponse = (page, event, action) => page.waitForResponse((res) => new URL(res.url()).pathname === `/api/registrations/mine/${event.id}/${action}` && res.request().method() === 'POST');

async function openDiscoveryCard(page, event) {
  const loaded = placesLoaded(page);
  await page.goto('/events');
  await loaded;
  const target = discoveryCard(page, event);
  await expect(async () => {
    if (await target.count()) return;
    const more = page.getByRole('button', { name: 'Load more events', exact: true });
    if (await more.isVisible()) await more.click();
    throw new Error('event card not listed yet');
  }).toPass({ timeout: 45_000, intervals: [500, 1000] });
  return target;
}

async function openMyEvents(page) {
  const loaded = placesLoaded(page);
  await page.goto('/my-registrations');
  await loaded;
}

// Journeys -----------------------------------------------------------------

test('[SPM-163 AC1-AC4] should_join_a_full_event_from_its_card_show_the_backend_position_and_leave_after_confirming', async ({ page }) => {
  const event = await createEvent('join and leave');
  await takePlace(event, 'holder');
  await joinAs('first', event);
  const seen = watchUnreadReads(page);
  await signIn(page, 'joiner');

  const eventCard = await openDiscoveryCard(page, event);
  await expect(eventCard).toContainText('Full - Waitlist');
  await expect(eventCard.getByRole('button', { name: `Register now for ${event.title}`, exact: true })).toHaveCount(0);
  await joinOn(eventCard, event).click();
  const confirm = page.getByRole('dialog', { name: 'This event is full. Join the waitlist?', exact: true });
  await expect(confirm.getByRole('button', { name: 'Not Now', exact: true })).toBeVisible();
  await expect(confirm.getByRole('button', { name: /^(Accept|Decline)/ })).toHaveCount(0);

  const unreadReadsBefore = seen.unreadReads;
  const joining = actionResponse(page, event, 'waitlist');
  await confirm.getByRole('button', { name: 'Join Waitlist', exact: true }).click();
  const joined = await joining;
  expect(joined.status()).toBe(201);
  const result = (await joined.json()).registration;
  // One attendee joined first, so the backend says Position 2.
  expect(result).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 2 });
  const success = page.getByRole('dialog', { name: "You're on the waitlist", exact: true });
  await expect(success.getByText('On the waitlist · Position 2', { exact: true })).toBeVisible();
  expect(await statusInDatabase('joiner', event)).toBe('WAITLISTED');
  // The Updates badge is read again after the change.
  await expect.poll(() => seen.unreadReads).toBeGreaterThan(unreadReadsBefore);
  await success.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(joinOn(eventCard, event)).toHaveCount(0);
  await expect(eventCard.getByRole('button', { name: `On the waitlist for ${event.title}`, exact: true })).toHaveAttribute('aria-disabled', 'true');

  // My Events shows the backend's position, then Leave Waitlist after confirming.
  await openMyEvents(page);
  const item = myEvent(page, event);
  await expect(item).toContainText('On the waitlist · Position 2');
  await item.getByRole('button', { name: `Leave Waitlist: ${event.title}`, exact: true }).click();
  const leave = page.getByRole('dialog', { name: 'Leave the waitlist?', exact: true });
  await expect(leave).toContainText('(Position 2)');
  const leaving = actionResponse(page, event, 'waitlist/leave');
  await leave.getByRole('button', { name: 'Leave Waitlist', exact: true }).click();
  expect((await leaving).status()).toBe(200);
  await expect(page.getByText(`You left the waitlist for ${event.title}.`, { exact: true })).toBeVisible();
  await expect(item).toHaveCount(0);
  expect(await statusInDatabase('joiner', event)).toBe('WITHDRAWN');
  // The attendee ahead keeps their place.
  expect(await placeOf('first', event)).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 });
});

test('[SPM-147 AC1-AC6 / SPM-163 AC5-AC6] should_offer_the_freed_place_to_the_first_waitlisted_attendee_when_a_registered_attendee_withdraws_and_register_them_on_accept', async ({ browser }) => {
  const event = await createEvent('withdraw then accept');
  await takePlace(event, 'holder');
  await joinAs('first', event);
  await joinAs('second', event);

  // The registered attendee withdraws, after "Are you sure?".
  const holderPage = await newSignedInPage(browser, 'holder');
  try {
    const seen = watchUnreadReads(holderPage);
    await openMyEvents(holderPage);
    const item = myEvent(holderPage, event);
    await expect(item).toContainText('Registered');
    await item.getByRole('button', { name: `Withdraw Registration: ${event.title}`, exact: true }).click();
    const confirm = holderPage.getByRole('dialog', { name: 'Withdraw Registration', exact: true });
    await expect(confirm).toContainText('Are you sure? This action cannot be undone.');
    const unreadReadsBefore = seen.unreadReads;
    const withdrawing = actionResponse(holderPage, event, 'withdraw');
    await confirm.getByRole('button', { name: 'Confirm Withdrawal', exact: true }).dblclick();
    expect((await withdrawing).status()).toBe(200);
    await expect(holderPage.getByText(`Your registration for ${event.title} has been withdrawn.`, { exact: true })).toBeVisible();
    await expect(item).toHaveCount(0);
    await expect(holderPage.getByText(/Withdrawed/)).toHaveCount(0);
    await expect.poll(() => seen.unreadReads).toBeGreaterThan(unreadReadsBefore);
    // One request despite the double click.
    expect(seen.posts.filter((post) => post.endsWith('/withdraw'))).toHaveLength(1);
  } finally {
    await holderPage.context().close();
  }
  expect(await statusInDatabase('holder', event)).toBe('WITHDRAWN');

  // The backend, not the browser, offered the place to the first in the queue.
  const offered = await placeOf('first', event);
  expect(offered).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 });
  expect(offered.offer).toMatchObject({ offerId: expect.any(Number), expiresAt: expect.any(String) });
  expect((await placeOf('second', event)).offer).toBeNull();

  // The offered attendee sees it in My Events and accepts.
  const firstPage = await newSignedInPage(browser, 'first');
  try {
    await openMyEvents(firstPage);
    const item = myEvent(firstPage, event);
    await expect(item).toContainText('A place has opened up for you.');
    await expect(item).toContainText(/Accept or decline by \d{1,2} \w{3} \d{4}, \d{2}:\d{2} SGT\./);
    await expect(item.getByRole('button', { name: `Decline: ${event.title}`, exact: true })).toBeVisible();
    await item.getByRole('button', { name: `Accept Slot: ${event.title}`, exact: true }).click();
    const accepting = actionResponse(firstPage, event, 'offer/accept');
    await firstPage.getByRole('dialog', { name: 'Accept this place?', exact: true }).getByRole('button', { name: 'Accept Slot', exact: true }).click();
    const accepted = await accepting;
    expect(accepted.status()).toBe(200);
    expect(accepted.request().postDataJSON()).toEqual({ offerId: offered.offer.offerId });
    await expect(firstPage.getByText(`You're registered for ${event.title}.`, { exact: true })).toBeVisible();
    await expect(item).toContainText('Registered');
    await expect(item.getByRole('button', { name: `Withdraw Registration: ${event.title}`, exact: true })).toBeVisible();
    await expect(item.getByRole('button', { name: `Accept Slot: ${event.title}`, exact: true })).toHaveCount(0);
  } finally {
    await firstPage.context().close();
  }
  expect(await statusInDatabase('first', event)).toBe('REGISTERED');
  // The second attendee is now first in the queue, with no offer: the place is taken.
  expect(await placeOf('second', event)).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1, offer: null });
});

test('[SPM-163 AC5, AC7] should_hand_the_place_to_the_next_attendee_when_the_offered_attendee_declines', async ({ browser }) => {
  const event = await createEvent('decline then handoff');
  await takePlace(event, 'holder');
  await joinAs('first', event);
  await joinAs('second', event);
  const { status } = await api('holder', 'POST', `/registrations/mine/${event.id}/withdraw`, {});
  expect(status).toBe(200);
  const offered = await placeOf('first', event);
  expect(offered.offer).not.toBeNull();

  const firstPage = await newSignedInPage(browser, 'first');
  try {
    await openMyEvents(firstPage);
    const item = myEvent(firstPage, event);
    await item.getByRole('button', { name: `Decline: ${event.title}`, exact: true }).click();
    const confirm = firstPage.getByRole('dialog', { name: 'Decline this place?', exact: true });
    const declining = actionResponse(firstPage, event, 'offer/decline');
    await confirm.getByRole('button', { name: 'Decline Place', exact: true }).click();
    expect((await declining).status()).toBe(200);
    await expect(firstPage.getByText(`You declined the place for ${event.title} and left its waitlist.`, { exact: true })).toBeVisible();
    await expect(item).toHaveCount(0);
  } finally {
    await firstPage.context().close();
  }
  expect(await statusInDatabase('first', event)).toBe('WITHDRAWN');

  // The backend offered the place to the next attendee, who sees it.
  const next = await placeOf('second', event);
  expect(next).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 });
  expect(next.offer).toMatchObject({ offerId: expect.any(Number) });
  expect(next.offer.offerId).not.toBe(offered.offer.offerId);
  const secondPage = await newSignedInPage(browser, 'second');
  try {
    await openMyEvents(secondPage);
    const item = myEvent(secondPage, event);
    await expect(item).toContainText('A place has opened up for you.');
    await expect(item.getByRole('button', { name: `Accept Slot: ${event.title}`, exact: true })).toBeVisible();
  } finally {
    await secondPage.context().close();
  }
});

test('[SPM-163] should_explain_a_stale_offer_and_remove_its_controls_when_the_backend_has_already_closed_it', async ({ browser }) => {
  const event = await createEvent('stale offer');
  await takePlace(event, 'holder');
  await joinAs('first', event);
  expect((await api('holder', 'POST', `/registrations/mine/${event.id}/withdraw`, {})).status).toBe(200);
  const offered = await placeOf('first', event);
  expect(offered.offer).not.toBeNull();

  const firstPage = await newSignedInPage(browser, 'first');
  try {
    await openMyEvents(firstPage);
    const item = myEvent(firstPage, event);
    await expect(item.getByRole('button', { name: `Accept Slot: ${event.title}`, exact: true })).toBeVisible();
    // Answered elsewhere (another tab) after this page loaded.
    expect((await api('first', 'POST', `/registrations/mine/${event.id}/offer/decline`, { offerId: offered.offer.offerId })).status).toBe(200);

    await item.getByRole('button', { name: `Accept Slot: ${event.title}`, exact: true }).click();
    const confirm = firstPage.getByRole('dialog', { name: 'Accept this place?', exact: true });
    const accepting = actionResponse(firstPage, event, 'offer/accept');
    await confirm.getByRole('button', { name: 'Accept Slot', exact: true }).click();
    const refused = await accepting;
    expect(refused.status()).toBe(409);
    expect((await refused.json()).code).toBe('OFFER_NOT_OPEN');
    await expect(confirm.getByRole('alert')).toContainText('This offer has already been answered.');
    await expect(confirm.getByRole('button', { name: /Accept Slot/ })).toHaveCount(0);
    await confirm.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(firstPage.getByText(`Your place for ${event.title} had changed. Showing its latest status.`, { exact: true })).toBeVisible();
    // The reloaded list no longer holds the event: declining left the waitlist.
    await expect(item).toHaveCount(0);
  } finally {
    await firstPage.context().close();
  }
  expect(await statusInDatabase('first', event)).toBe('WITHDRAWN');
});

// SPM-289: in PREPARATION the waitlist and offers work as in CONFIRMED. The
// attendee joins from the card; the backend offers the freed place, and the
// attendee accepts it on My Events.
test('[SPM-289 / SPM-163 AC1-AC6] should_join_the_waitlist_and_accept_a_freed_place_when_the_event_is_in_PREPARATION', async ({ page }) => {
  const event = await createEvent('preparation waitlist offer', { status: 'PREPARATION' });
  await takePlace(event, 'holder');
  await signIn(page, 'joiner');

  const eventCard = await openDiscoveryCard(page, event);
  await expect(eventCard).toContainText('Full - Waitlist');
  await joinOn(eventCard, event).click();
  const confirm = page.getByRole('dialog', { name: 'This event is full. Join the waitlist?', exact: true });
  const joining = actionResponse(page, event, 'waitlist');
  await confirm.getByRole('button', { name: 'Join Waitlist', exact: true }).click();
  const joined = await joining;
  expect(joined.status()).toBe(201);
  expect((await joined.json()).registration).toMatchObject({ status: 'WAITLISTED', waitlistPosition: 1 });
  const success = page.getByRole('dialog', { name: "You're on the waitlist", exact: true });
  await expect(success.getByText('On the waitlist · Position 1', { exact: true })).toBeVisible();
  await success.getByRole('button', { name: 'Done', exact: true }).click();

  // The holder withdraws through the backend's route; the backend makes the offer.
  const { status } = await api('holder', 'POST', `/registrations/mine/${event.id}/withdraw`, {});
  expect(status).toBe(200);
  const offered = await placeOf('joiner', event);
  expect(offered.offer).toMatchObject({ offerId: expect.any(Number), expiresAt: expect.any(String) });

  await openMyEvents(page);
  const item = myEvent(page, event);
  await expect(item).toContainText('A place has opened up for you.');
  await expect(item.getByRole('button', { name: `Decline: ${event.title}`, exact: true })).toBeVisible();
  await item.getByRole('button', { name: `Accept Slot: ${event.title}`, exact: true }).click();
  const accepting = actionResponse(page, event, 'offer/accept');
  await page.getByRole('dialog', { name: 'Accept this place?', exact: true }).getByRole('button', { name: 'Accept Slot', exact: true }).click();
  const accepted = await accepting;
  expect(accepted.status()).toBe(200);
  expect(accepted.request().postDataJSON()).toEqual({ offerId: offered.offer.offerId });
  await expect(page.getByText(`You're registered for ${event.title}.`, { exact: true })).toBeVisible();
  await expect(item.getByRole('button', { name: `Withdraw Registration: ${event.title}`, exact: true })).toBeVisible();
  expect(await statusInDatabase('joiner', event)).toBe('REGISTERED');
});
