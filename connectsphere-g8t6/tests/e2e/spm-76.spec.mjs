import { test, expect } from '@playwright/test';
import { installConnectSphereMocks, localDateTimeInput, requirement, routeVenuePhotos, venueOption } from './support.mjs';

// SPM-76: the organiser's venue step, with synthetic venues and mocked API.
const hall = (index) => venueOption({ venueId: 100 + index, name: `Synthetic Hall ${String(index).padStart(2, '0')}` });
const booked = venueOption({
  venueId: 200,
  name: 'Synthetic Booked Hall',
  availability: {
    status: 'UNAVAILABLE_BOOKING', label: 'Unavailable – booking', occupiedStart: null, occupiedEnd: null,
    conflicts: [{ type: 'BOOKING', label: 'Unavailable – booking' }], operatingHoursWarning: null,
  },
  requirements: [requirement('availability', 'Availability', 'UNMET', 'Unavailable – booking')],
  unmetCount: 1,
  allRequirementsMet: false,
});
const VENUES = [...Array.from({ length: 20 }, (_, index) => hall(index + 1)), booked];

async function openVenueStep(page) {
  const state = await installConnectSphereMocks(page);
  await routeVenuePhotos(page);
  const optionQueries = [];
  const availabilityQueries = [];
  await page.route(/\/api\/venues\/options(\?.*)?$/, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    optionQueries.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ json: { venues: VENUES, detailsAvailable: true, availabilityChecked: true, filtersNotChecked: [] } });
  });
  await page.route(/\/api\/venues\/options\/\d+\/availability\?/, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    const url = new URL(route.request().url());
    availabilityQueries.push(url.searchParams);
    const venueId = Number(url.pathname.split('/').at(-2));
    return route.fulfill({ json: { venueId, availability: { status: 'UNAVAILABLE_BOOKING', label: 'Unavailable – booking', conflicts: [{ type: 'BOOKING', label: 'Unavailable – booking' }], operatingHoursWarning: null } } });
  });

  await page.goto('/events/new');
  await page.getByLabel('Event Title').fill('SPM-76 synthetic forum');
  await page.getByLabel('Event Purpose').fill('Synthetic purpose');
  await page.getByLabel('Executive Abstract & Event Scope').fill('Synthetic scope.');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const start = new Date(await page.evaluate(() => Date.now()) + 7 * 24 * 60 * 60 * 1000);
  start.setUTCHours(1, 0, 0, 0);
  await page.getByLabel('Primary Proposed Date').fill(localDateTimeInput(start));
  await page.getByLabel('Event End Date & Time').fill(localDateTimeInput(new Date(start.getTime() + 4 * 60 * 60 * 1000)));
  await page.getByLabel('Targeted In-Person Headcount').fill('150');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Venue & Layout Requirements' })).toBeVisible();
  const search = page.getByRole('region', { name: 'Venue search' });
  await expect(search.getByRole('article')).toHaveCount(10);
  return { state, search, optionQueries, availabilityQueries };
}

test('[SPM-76 AC2][TC-VS-001/002] 10 venues first, the request layout and required facilities check them, and Enter never submits', async ({ page }) => {
  const { state, search, optionQueries } = await openVenueStep(page);
  await expect(search.getByRole('button', { name: 'Show more venues (10 more)' })).toBeVisible();
  await search.getByLabel('Show', { exact: true }).selectOption('20');
  await expect(search.getByRole('article')).toHaveCount(20);
  await expect(search.getByRole('button', { name: 'Show more venues (1 more)' })).toBeVisible();

  // The request's own layout, not just a search filter (AC3).
  await page.getByLabel('Preferred Seating & Room Geometry').selectOption('THEATRE');
  await expect.poll(() => optionQueries.at(-1)?.get('preferredLayoutType')).toBe('THEATRE');

  await search.getByLabel('Required facilities').fill('Stage, Projector');
  await search.getByLabel('Required facilities').press('Enter');
  await expect.poll(() => optionQueries.at(-1)?.get('requiredFacilities')).toBe('Stage,Projector');
  // Required facilities rank venues; they never hide one.
  await expect(search.getByText('21 venues available')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Venue & Layout Requirements' })).toBeVisible();
  expect(state.draftCreateRequests).toHaveLength(0);
  expect(state.createEventRequests).toHaveLength(0);
  // No availability calendar for organisers (TC-VS-001).
  await expect(page.getByRole('button', { name: /calendar/i })).toHaveCount(0);
});

test('[SPM-76 AC3/AC4][TC-VS-003/004] details show every organiser field, and an unavailable venue only says why by kind', async ({ page }) => {
  const { search } = await openVenueStep(page);
  await search.getByRole('button', { name: 'Show more venues (10 more)' }).click();
  await search.getByRole('button', { name: 'Show more venues (1 more)' }).click();
  await search.getByRole('article', { name: 'Synthetic Booked Hall' }).getByRole('button', { name: 'View details' }).click();
  const panel = search.getByRole('region', { name: 'Venue details' });
  for (const [term, value] of [['Emergency access', 'Two exits on the north side'], ['Known restrictions', 'No open flames'], ['Description', 'Main hall with a stage.']]) {
    await expect(panel.getByText(term, { exact: true })).toBeVisible();
    await expect(panel.getByText(value, { exact: true })).toBeVisible();
  }
  await expect(panel.getByText('Rooms and related venues', { exact: true })).toBeVisible();
  await expect(panel.getByRole('list', { name: 'Conflicts' })).toHaveText('Unavailable – booking');
  await expect(panel.getByRole('textbox')).toHaveCount(0);
});

test('[SPM-76 AC6][TC-VS-006] choices are ranked, checked over their time, saved, resumed and submitted without a hold', async ({ page }) => {
  const { state, search, availabilityQueries } = await openVenueStep(page);
  const card = (name) => search.getByRole('article', { name });
  await card('Synthetic Hall 02').getByRole('button', { name: 'Choose as ideal venue' }).click();
  await card('Synthetic Hall 01').getByRole('button', { name: 'Add as a choice' }).click();
  await card('Synthetic Hall 03').getByRole('button', { name: 'Add as a choice' }).click();
  const choices = page.getByRole('region', { name: 'Your venue choices' });
  await choices.getByRole('button', { name: 'Move Synthetic Hall 01 up' }).click();
  await choices.getByRole('button', { name: 'Remove Synthetic Hall 03' }).click();
  await expect(choices.getByRole('listitem')).toHaveCount(2);
  await expect(choices.getByRole('listitem').first()).toContainText('Ideal venue');
  await expect(choices.getByRole('listitem').first()).toContainText('Synthetic Hall 01');
  await expect(choices.getByRole('listitem').nth(1)).toContainText('Choice 2');
  await expect(choices).toContainText('(2 / 20)');
  await expect(card('Synthetic Hall 01')).toContainText('Your choice 1');

  // Each choice is checked over its time: a status by kind, asked with start and end only.
  await expect(choices.getByRole('listitem').first()).toContainText('Unavailable at this time (booking)');
  expect([...availabilityQueries.at(-1).keys()].sort()).toEqual(['end', 'start']);

  await choices.getByRole('button', { name: 'Save choices' }).click();
  await expect.poll(() => state.draftCreateRequests.length).toBe(1);
  expect(state.draftCreateRequests[0].venuePreferences).toEqual([101, 102]);

  await page.goto('/events/new?draft=501');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(choices.getByRole('listitem').first()).toContainText('Synthetic Hall 01');
  await expect(choices.getByRole('listitem').nth(1)).toContainText('Synthetic Hall 02');
  for (let step = 0; step < 3; step += 1) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Submit Request', exact: true }).click();
  await expect(page.getByText('Your event request has been submitted successfully.')).toBeVisible();
  expect(state.submitDraftRequests.at(-1).venuePreferences).toEqual([101, 102]);
  // Choosing never holds or books a venue.
  expect(state.requestLog.some((entry) => /holds|venue-bookings/.test(entry.pathname))).toBe(false);
});
