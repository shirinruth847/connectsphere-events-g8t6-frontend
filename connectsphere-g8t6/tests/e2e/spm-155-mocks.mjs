import { installConnectSphereMocks } from './support.mjs';

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

// The notifications inbox and Updates panel, shared by the SPM-155 attendee and
// SPM-192 organiser journeys.
export const makeNotification = (id, overrides = {}) => ({
  notification_id: id,
  type: 'REGISTRATION_CONFIRMED',
  title: `Notification ${id}`,
  message: `Message for notification ${id}.`,
  // Newest first by ID: a higher ID is a later minute.
  created_at: new Date(Date.UTC(2026, 9, 1, 0, id)).toISOString(),
  is_read: false,
  read_at: null,
  event: { event_id: 50 + id, title: `Event ${id}` },
  target: { page: 'MY_EVENTS', event_id: 50 + id },
  action_expires_at: null,
  ...overrides,
});

// A stateful inbox: read actions change what later requests return. `gone`
// holds IDs the backend now hides (404 NOTIFICATION_NOT_FOUND).
// `details` maps an event ID to the attendee detail body, or to a status number.
export async function installInbox(page, { notifications = [], role = 'ATTENDEE', gone = [], listFailures = 0, registrations = [], details = {} } = {}) {
  const state = await installConnectSphereMocks(page, { role });
  const inbox = {
    items: notifications.map((item) => ({ ...item })),
    gone: new Set(gone),
    listFailures,
    listRequests: [],
    readRequests: [],
    readAllRequests: 0,
    countRequests: 0,
  };
  const unread = () => inbox.items.filter((item) => !item.is_read && !inbox.gone.has(item.notification_id)).length;
  await page.route('**/api/notifications**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'OPTIONS') return route.fallback();
    if (url.pathname === '/api/notifications/unread-count') {
      inbox.countRequests += 1;
      return json({ unreadCount: unread() });
    }
    if (url.pathname === '/api/notifications/read-all' && request.method() === 'POST') {
      inbox.readAllRequests += 1;
      const updated = unread();
      inbox.items = inbox.items.map((item) => ({ ...item, is_read: true, read_at: item.read_at ?? '2026-10-21T04:00:00.000Z' }));
      return json({ updated, unreadCount: 0 });
    }
    const read = url.pathname.match(/^\/api\/notifications\/(\d+)\/read$/);
    if (read && request.method() === 'POST') {
      const id = Number(read[1]);
      inbox.readRequests.push(id);
      const item = inbox.items.find((candidate) => candidate.notification_id === id);
      if (!item || inbox.gone.has(id)) return json({ error: 'Notification not found.', code: 'NOTIFICATION_NOT_FOUND' }, 404);
      item.is_read = true;
      item.read_at = item.read_at ?? '2026-10-21T04:00:00.000Z';
      return json({ notification: { notification_id: id, is_read: true, read_at: item.read_at }, unreadCount: unread() });
    }
    if (url.pathname === '/api/notifications' && request.method() === 'GET') {
      const limit = Number(url.searchParams.get('limit'));
      const cursor = url.searchParams.get('cursor');
      inbox.listRequests.push({ limit, cursor });
      if (inbox.listFailures > 0) {
        inbox.listFailures -= 1;
        return json({ error: 'Internal Server Error', code: 'INTERNAL_ERROR' }, 500);
      }
      const visible = inbox.items.filter((item) => !inbox.gone.has(item.notification_id)).sort((a, b) => b.notification_id - a.notification_id);
      const start = cursor ? Number(cursor.replace('after-', '')) : 0;
      const pageItems = visible.slice(start, start + limit);
      const nextCursor = start + limit < visible.length ? `after-${start + limit}` : null;
      return json({ notifications: pageItems, nextCursor, unreadCount: unread() });
    }
    return route.fallback();
  });
  const detailRequests = await routeAttendeeEvents(page, { details, registrations });
  return { state, inbox, detailRequests };
}

// Inbox cards on /notifications, the Updates button and its panel.
export const cards = (page) => page.locator('main li article');
export const unreadCards = (page) => page.locator('main li article[data-unread="true"]');
export const updatesButton = (page) => page.getByRole('button', { name: /^Updates/ });
export const panel = (page) => page.getByRole('dialog', { name: 'Notifications' });
