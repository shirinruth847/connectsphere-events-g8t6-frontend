import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAvailabilityPresentation, getRegistrationState, showsRegistrationWindow } from '../components/attendee/discovery/registration-availability.ts';
import { formatDateTile, formatEventDate, formatEventTime, formatTimestamp } from '../components/attendee/discovery/format-event-time.ts';
import { appendUnique, discoveryErrorMessage, discoveryReducer, initialDiscoveryState } from '../components/attendee/discovery/discovery-state.ts';
import { canViewPath, postLoginPath } from '../lib/auth.ts';

const event = (eventId, title = `Event ${eventId}`) => ({ eventId, title, description: null, startDatetime: null, endDatetime: null, organisationName: null, location: null, registrationAvailability: 'OPEN' });
const UNAVAILABLE_STATE = { kind: 'unavailable', label: 'Registration Unavailable' };

test('[SPM-34 AC3] OPEN shows Registration Open and Register Now', () => {
 assert.equal(getAvailabilityPresentation('OPEN').label, 'Registration Open');
 assert.equal(showsRegistrationWindow('OPEN'), true);
 assert.deepEqual(getRegistrationState('OPEN', null, true), { kind: 'register', label: 'Register Now' });
});
test('[SPM-134] NOT_YET_OPEN shows Not Yet Open and a disabled Registration Not Yet Open', () => {
 assert.equal(getAvailabilityPresentation('NOT_YET_OPEN').label, 'Not Yet Open');
 assert.equal(showsRegistrationWindow('NOT_YET_OPEN'), true);
 assert.deepEqual(getRegistrationState('NOT_YET_OPEN', null, true), { kind: 'unavailable', label: 'Registration Not Yet Open' });
});
test('[SPM-34 AC3] FULL_WAITLIST shows Full - Waitlist and a disabled Registration Full, with no waitlist action', () => {
 assert.equal(getAvailabilityPresentation('FULL_WAITLIST').label, 'Full - Waitlist');
 assert.deepEqual(getRegistrationState('FULL_WAITLIST', null, true), { kind: 'unavailable', label: 'Registration Full' });
});
test('[SPM-34 AC3] CLOSED shows a disabled Registration Closed', () => {
 assert.equal(getAvailabilityPresentation('CLOSED').label, 'Registration Closed');
 assert.equal(showsRegistrationWindow('CLOSED'), true);
 assert.deepEqual(getRegistrationState('CLOSED', null, true), { kind: 'unavailable', label: 'Registration Closed' });
});
test('[SPM-134] UNAVAILABLE is neutral: not full or closed, and no registration window', () => {
 assert.equal(getAvailabilityPresentation('UNAVAILABLE').label, 'Unavailable');
 assert.equal(showsRegistrationWindow('UNAVAILABLE'), false);
 assert.deepEqual(getRegistrationState('UNAVAILABLE', null, true), UNAVAILABLE_STATE);
});
test('[SPM-134] an unknown availability value, including the retired NOT_ENABLED, is never guessed into a chip or shown as open', () => {
 for (const value of ['NOT_ENABLED', 'WAITLIST_ONLY', '', 'toString', '__proto__']) {
  assert.equal(getAvailabilityPresentation(value), null, value);
  assert.equal(showsRegistrationWindow(value), false, value);
  assert.deepEqual(getRegistrationState(value, null, true), UNAVAILABLE_STATE, value);
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
test('[SPM-44] attendees may return to an event details URL after login', () => {
 assert.equal(canViewPath('ATTENDEE', '/events/42'), true);
 assert.equal(postLoginPath({role:'ATTENDEE'}, '/events/42'), '/events/42');
 for (const path of ['/events/new', '/events/create', '/events/abc', '/events/42/edit']) assert.equal(canViewPath('ATTENDEE', path), false, path);
});
test('[SPM-44] discovery errors never show backend wording, except the client network message', () => {
 const safe = 'The events could not be loaded right now. Please try again.';
 assert.equal(discoveryErrorMessage({ status: 400, code: 'VALIDATION_FAILED', message: 'Please correct the highlighted fields.' }, 'events'), safe);
 assert.equal(discoveryErrorMessage({ status: 500, code: 'REQUEST_FAILED', message: 'Internal Server Error' }, 'events'), safe);
 assert.equal(discoveryErrorMessage({ status: 409, code: 'SOMETHING_NEW', message: 'raw detail' }, 'events'), safe);
 assert.equal(discoveryErrorMessage({ status: 0, code: 'NETWORK_ERROR', message: 'ConnectSphere could not reach the backend.' }, 'events'), 'ConnectSphere could not reach the backend.');
});
test('[SPM-44] attendees land on Event Discovery and can still return to My Events', () => {
 assert.equal(postLoginPath({role:'ATTENDEE'}, null), '/events');
 assert.equal(postLoginPath({role:'ATTENDEE'}, '/my-registrations'), '/my-registrations');
 assert.equal(canViewPath('COORDINATOR_LEAD', '/my-registrations'), false);
 assert.equal(postLoginPath({role:'COORDINATOR_LEAD'}, '/events'), '/events');
});
