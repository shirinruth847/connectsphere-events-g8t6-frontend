// Attendee event detail mocks for the SPM-155 journeys, answering as the
// backend does:
//   GET /api/registrations/mine            My Events list
//   GET /api/registrations/mine/:eventId   an event the attendee holds a place on
//   GET /api/events/discovery/:id          Event Discovery's detail (SPM-34 rules)
// `details` maps an event ID to the attendee's view of it: with myRegistration
// when they hold a place, detailsWithheld when the details are held back. A
// number answers with that status instead. The returned arrays record which
// endpoint was asked for which event.
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const notFound = (route, status = 404) => json(route, { error: 'Event request not found.', code: 'EVENT_NOT_FOUND' }, status);

export async function routeAttendeeEvents(page, { details = {}, registrations = [] } = {}) {
  const requests = { myEvents: [], discovery: [] };

  await page.route('**/api/registrations/mine**', (route) => {
    const match = new URL(route.request().url()).pathname.match(/^\/api\/registrations\/mine\/(\d+)$/);
    if (!match) return json(route, { registrations, page: { next_offset: null } });
    requests.myEvents.push(Number(match[1]));
    const body = details[match[1]];
    if (typeof body === 'number') return notFound(route, body);
    if (!body?.myRegistration) return notFound(route);
    const { myRegistration, ...event } = body;
    return json(route, { event: { attendeeStatus: 'CONFIRMED', detailsWithheld: false, lastConfirmedAt: null, ...event }, myRegistration });
  });

  await page.route('**/api/events/discovery/*', (route) => {
    const match = new URL(route.request().url()).pathname.match(/^\/api\/events\/discovery\/(\d+)$/);
    if (!match) return route.fallback();
    requests.discovery.push(Number(match[1]));
    const body = details[match[1]];
    if (typeof body === 'number') return notFound(route, body);
    // Discovery shows only confirmed, published events, and never the attendee's place.
    if (!body || body.detailsWithheld || (body.attendeeStatus && body.attendeeStatus !== 'CONFIRMED')) return notFound(route);
    const event = { ...body };
    for (const key of ['myRegistration', 'attendeeStatus', 'detailsWithheld', 'lastConfirmedAt']) delete event[key];
    return json(route, { event });
  });

  return requests;
}
