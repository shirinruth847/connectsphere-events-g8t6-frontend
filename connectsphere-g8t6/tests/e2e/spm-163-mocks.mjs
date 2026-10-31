import { installConnectSphereMocks } from './support.mjs';

// Browser-journey mocks of the backend's waitlist, offer and withdrawal routes
// (SPM-163, SPM-147; backend controller/waitlistController.js and
// validators/waitlistValidator.js). waitlistPosition (from 1, null when not
// waitlisted) and offer ({ offerId, expiresAt } while open, otherwise null)
// are on each GET /api/registrations/mine row and on myRegistration. The live
// journeys are in tests/live/spm-163-147-waitlist.live.spec.mjs.
//
// A stateful attendee: actions change what later GETs return.
//   GET  /api/registrations/mine                     My Events list (snake_case)
//   GET  /api/registrations/mine/:eventId            the attendee's own event
//   GET  /api/events/discovery/:id                   Event Discovery detail
//   GET  /api/attendee-profile/mine                  saved answers
//   POST /api/registrations/mine/:eventId/waitlist | waitlist/leave |
//        offer/accept | offer/decline | withdraw

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const conflict = (route, code) => json(route, { error: `Backend says ${code}`, code }, 409);

const HOUR = 60 * 60 * 1000;
export const inHours = (hours) => new Date(Date.now() + hours * HOUR).toISOString();

export const makeEvent = (eventId, title, overrides = {}) => ({
  eventId,
  title,
  description: `${title} description`,
  startDatetime: inHours(24 * 7),
  endDatetime: inHours(24 * 7 + 4),
  organisationName: 'SMU Computing Club',
  location: 'SMU Hall A',
  registrationAvailability: 'FULL_WAITLIST',
  registrationOpenAt: null,
  registrationCloseAt: null,
  ...overrides,
});

// `events` maps an ID to { event, place, attendeeStatus }. place is null, or
// { status, waitlistPosition, offer }. `refuse` maps an action to queued
// { status, code } answers, used once each before the rules apply.
export async function installRegistrationActions(page, { events = {}, profile = {}, refuse = {}, queueAhead = 2 } = {}) {
  await installConnectSphereMocks(page, { role: 'ATTENDEE' });
  const state = { events, refuse, queueAhead, actions: [] };
  const savedProfile = { attendeeId: 1, userId: 1, name: 'Test Attendee', email: 'attendee@example.test', phone: null, dietaryRestrictions: null, accessibilityRequirements: null, version: 1, createdAt: null, updatedAt: null, ...profile };

  const ownEvent = (id) => {
    const entry = state.events[id];
    return entry?.place ? entry : null;
  };

  await page.route('**/api/attendee-profile/mine', (route) => json(route, { profile: savedProfile }));

  await page.route('**/api/events/discovery**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/events/discovery') {
      return json(route, { events: Object.values(state.events).map(({ event }) => event), nextCursor: null });
    }
    const match = path.match(/^\/api\/events\/discovery\/(\d+)$/);
    const entry = match && state.events[match[1]];
    return entry ? json(route, { event: entry.event }) : json(route, { error: 'Event not found.', code: 'EVENT_NOT_FOUND' }, 404);
  });

  await page.route('**/api/registrations/mine**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path === '/api/registrations/mine') {
      const registrations = Object.values(state.events).filter((entry) => entry.place).map(({ event, place, attendeeStatus = 'CONFIRMED' }) => ({
        registration_id: event.eventId * 10,
        registration_status: place.status,
        registered_at: '2026-10-01T00:00:00.000Z',
        waitlistPosition: place.status === 'WAITLISTED' ? place.waitlistPosition : null,
        offer: place.offer ?? null,
        event: { event_id: event.eventId, title: event.title, description: event.description, start_datetime: event.startDatetime, attendee_status: attendeeStatus, venue: null },
      }));
      return json(route, { registrations, page: { next_offset: null } });
    }
    const detail = path.match(/^\/api\/registrations\/mine\/(\d+)$/);
    if (request.method() === 'GET' && detail) {
      const entry = ownEvent(detail[1]);
      if (!entry) return json(route, { error: 'Event request not found.', code: 'EVENT_NOT_FOUND' }, 404);
      return json(route, {
        event: { ...entry.event, attendeeStatus: entry.attendeeStatus ?? 'CONFIRMED', detailsWithheld: false, lastConfirmedAt: null },
        myRegistration: { status: entry.place.status, registeredAt: '2026-10-01T00:00:00.000Z', waitlistPosition: entry.place.waitlistPosition ?? null, offer: entry.place.offer ?? null },
      });
    }
    const action = path.match(/^\/api\/registrations\/mine\/(\d+)\/(waitlist|waitlist\/leave|offer\/accept|offer\/decline|withdraw)$/);
    if (request.method() !== 'POST' || !action) return route.fallback();
    const [, id, name] = action;
    const body = request.postDataJSON();
    state.actions.push({ eventId: Number(id), action: name, body, idempotencyKey: request.headers()['idempotency-key'] });
    const queued = state.refuse[name]?.shift();
    if (queued) return json(route, { error: `Backend says ${queued.code}`, code: queued.code }, queued.status);
    return answer(route, state, Number(id), name, body);
  });

  return state;
}

const ALLOWED = { waitlist: ['dietaryRestrictions', 'accessibilityRequirements'], 'offer/accept': ['offerId'], 'offer/decline': ['offerId'], 'waitlist/leave': [], withdraw: [] };

function answer(route, state, eventId, name, body) {
  const entry = state.events[eventId];
  if (!entry) return json(route, { error: 'Event request not found.', code: 'EVENT_NOT_FOUND' }, 404);
  const unknown = Object.keys(body ?? {}).filter((key) => !ALLOWED[name].includes(key));
  if (unknown.length) return json(route, { error: 'Please correct the highlighted fields.', code: 'VALIDATION_FAILED', fields: Object.fromEntries(unknown.map((key) => [key, 'This field is not supported.'])) }, 400);
  const { place } = entry;
  const result = (status, extra = {}) => ({
    registration: {
      registrationId: eventId * 10, status, outcome: null, waitlistPosition: null, registeredAt: null, withdrawnAt: null,
      event: { eventId, title: entry.event.title, startDatetime: entry.event.startDatetime, endDatetime: entry.event.endDatetime },
      ...extra,
    },
  });
  const openOffer = place?.offer && place.offer.offerId === body?.offerId ? place.offer : null;

  switch (name) {
    case 'waitlist':
      if (place?.status === 'REGISTERED') return conflict(route, 'ALREADY_REGISTERED');
      if (place?.status === 'WAITLISTED') return conflict(route, 'ALREADY_WAITLISTED');
      if (entry.event.registrationAvailability === 'OPEN') return conflict(route, 'PLACES_AVAILABLE');
      if (entry.event.registrationAvailability !== 'FULL_WAITLIST') return conflict(route, 'REGISTRATION_CLOSED');
      entry.place = { status: 'WAITLISTED', waitlistPosition: state.queueAhead + 1, offer: null };
      return json(route, result('WAITLISTED', { waitlistPosition: entry.place.waitlistPosition }), 201);
    case 'waitlist/leave':
      if (place?.status !== 'WAITLISTED') return conflict(route, 'NOT_WAITLISTED');
      entry.place = null;
      return json(route, result('WITHDRAWN', { withdrawnAt: new Date().toISOString() }));
    case 'offer/accept':
      if (!openOffer) return conflict(route, 'OFFER_NOT_OPEN');
      if (new Date(openOffer.expiresAt).getTime() <= Date.now()) return conflict(route, 'OFFER_EXPIRED');
      entry.place = { status: 'REGISTERED', waitlistPosition: null, offer: null };
      return json(route, result('REGISTERED', { registeredAt: new Date().toISOString() }));
    case 'offer/decline':
      if (!openOffer) return conflict(route, 'OFFER_NOT_OPEN');
      entry.place = null;
      return json(route, result('WITHDRAWN', { withdrawnAt: new Date().toISOString() }));
    case 'withdraw':
      if (place?.status !== 'REGISTERED') return conflict(route, 'NOT_REGISTERED');
      if (new Date(entry.event.startDatetime).getTime() <= Date.now()) return conflict(route, 'EVENT_STARTED');
      entry.place = null;
      return json(route, result('WITHDRAWN', { withdrawnAt: new Date().toISOString() }));
  }
}
