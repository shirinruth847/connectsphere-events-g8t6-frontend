import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAvailabilityPresentation, getRegistrationAction, isRegistrationEnabled } from '../components/attendee/discovery/registration-availability.ts';
import { formatDateTile, formatEventDate, formatEventTime, formatTimestamp } from '../components/attendee/discovery/format-event-time.ts';
import { appendUnique, discoveryReducer, initialDiscoveryState } from '../components/attendee/discovery/discovery-state.ts';
import { canViewPath, postLoginPath } from '../lib/auth.ts';

const NOW = new Date('2026-10-18T00:00:00Z');
const event = (eventId, title = `Event ${eventId}`) => ({ eventId, title, description: null, startDatetime: null, endDatetime: null, organisationName: null, location: null, registrationAvailability: 'OPEN' });

test('[SPM-34 AC3] OPEN shows Registration Open and Register Now', () => {
 assert.equal(getAvailabilityPresentation('OPEN').label, 'Registration Open');
 assert.equal(isRegistrationEnabled('OPEN'), true);
 assert.deepEqual(getRegistrationAction({ registrationAvailability: 'OPEN', registrationOpenAt: null }, NOW), { label: 'Register Now', variant: 'primary' });
});
test('[SPM-34 AC3] FULL_WAITLIST shows Full - Waitlist and Join Waitlist', () => {
 assert.equal(getAvailabilityPresentation('FULL_WAITLIST').label, 'Full - Waitlist');
 assert.equal(getRegistrationAction({ registrationAvailability: 'FULL_WAITLIST', registrationOpenAt: null }, NOW).label, 'Join Waitlist');
});
test('[SPM-34 AC3] CLOSED before the window opens offers a notify action', () => {
 assert.equal(getAvailabilityPresentation('CLOSED').label, 'Registration Closed');
 assert.deepEqual(getRegistrationAction({ registrationAvailability: 'CLOSED', registrationOpenAt: '2026-10-25T00:00:00Z' }, NOW), { label: 'Notify when registration opens', variant: 'secondary' });
});
test('[SPM-34 AC3] CLOSED after the window, or with no opening time, offers no action', () => {
 assert.equal(getRegistrationAction({ registrationAvailability: 'CLOSED', registrationOpenAt: '2026-10-01T00:00:00Z' }, NOW), null);
 assert.equal(getRegistrationAction({ registrationAvailability: 'CLOSED', registrationOpenAt: NOW.toISOString() }, NOW), null);
 assert.equal(getRegistrationAction({ registrationAvailability: 'CLOSED', registrationOpenAt: null }, NOW), null);
});
test('[SPM-34 AC4] NOT_ENABLED has no chip, wording or action', () => {
 assert.equal(getAvailabilityPresentation('NOT_ENABLED'), null);
 assert.equal(isRegistrationEnabled('NOT_ENABLED'), false);
 assert.equal(getRegistrationAction({ registrationAvailability: 'NOT_ENABLED', registrationOpenAt: '2026-10-25T00:00:00Z' }, NOW), null);
});
test('[SPM-34] an unknown availability value is never guessed into a chip or action', () => {
 for (const value of ['WAITLIST_ONLY', '', 'toString', '__proto__']) {
  assert.equal(getAvailabilityPresentation(value), null, value);
  assert.equal(isRegistrationEnabled(value), false, value);
  assert.equal(getRegistrationAction({ registrationAvailability: value, registrationOpenAt: null }, NOW), null, value);
 }
});
test('[SPM-34 AC2] dates and times are shown in Singapore time', () => {
 assert.equal(formatEventDate('2026-10-28T01:00:00Z', '2026-10-28T09:00:00Z'), 'Wed, 28 Oct 2026');
 assert.equal(formatEventDate('2026-10-28T01:00:00Z', '2026-10-29T09:00:00Z'), 'Wed, 28 Oct 2026 – Thu, 29 Oct 2026');
 assert.equal(formatEventTime('2026-10-28T01:00:00Z', '2026-10-28T09:00:00Z'), '09:00 – 17:00 SGT');
 assert.equal(formatEventTime('2026-10-28T01:00:00Z', null), '09:00 SGT');
 assert.equal(formatTimestamp('2026-10-20T02:30:00Z'), '20 Oct 2026, 10:30 SGT');
 // 17:00 UTC on the 27th is already the 28th in Singapore.
 assert.equal(formatEventDate('2026-10-27T17:00:00Z', '2026-10-27T18:00:00Z'), 'Wed, 28 Oct 2026');
 assert.deepEqual(formatDateTile('2026-10-27T17:00:00Z'), { month: 'OCT', day: '28' });
});
test('[SPM-34 AC2] missing or invalid times show a placeholder', () => {
 assert.equal(formatEventDate(null), 'Date to be announced');
 assert.equal(formatEventTime('not-a-date'), 'Time to be announced');
 assert.equal(formatDateTile(null), null);
 assert.equal(formatTimestamp(undefined), null);
});
test('[SPM-34 AC1] Load more keeps the first copy of an event returned twice', () => {
 const first = [event(1), event(2, 'Original title')];
 assert.deepEqual(appendUnique(first, [event(2, 'Repeated title'), event(3)]).map(item => [item.eventId, item.title]), [[1, 'Event 1'], [2, 'Original title'], [3, 'Event 3']]);
 let state = discoveryReducer(initialDiscoveryState, { type: 'loaded', events: first, nextCursor: 'c1' });
 state = discoveryReducer(state, { type: 'moreStarted' });
 state = discoveryReducer(state, { type: 'moreLoaded', events: [event(2, 'Repeated title'), event(3)], nextCursor: null });
 assert.deepEqual(state.events.map(item => item.eventId), [1, 2, 3]);
 assert.equal(state.events[1].title, 'Original title');
 assert.equal(state.pagesLoaded, 2);
 assert.equal(state.nextCursor, null);
 assert.equal(state.loadingMore, false);
});
test('[SPM-34/SPM-174] /events is an attendee or coordinator lead workspace', () => {
 assert.equal(canViewPath('ATTENDEE', '/events'), true);
 assert.equal(postLoginPath({role:'ATTENDEE'}, '/events'), '/events');
 assert.equal(canViewPath('COORDINATOR_LEAD', '/events'), true);
 for (const role of ['ORGANISER','COORDINATOR','VENUE_STAFF','TECH_SUPPORT']) assert.equal(canViewPath(role, '/events'), false, role);
 assert.equal(postLoginPath({role:'ORGANISER'}, '/events'), '/dashboard');
});
