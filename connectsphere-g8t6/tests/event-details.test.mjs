import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventBackLink, eventDetailsHref } from '../components/attendee/event-details/event-details-links.ts';
import { canViewPath, postLoginPath } from '../lib/auth.ts';

const attendee = { user_id: 1, name: 'A', email: 'a@example.com', role: 'ATTENDEE' };

test('[SPM-155] View Event Details links to the event page and remembers its origin', () => {
  assert.equal(eventDetailsHref(42, 'discovery'), '/events/42?from=discovery');
  assert.equal(eventDetailsHref(42, 'my-events'), '/events/42?from=my-events');
});

test('[SPM-155] the back link returns to the origin, and to My Events otherwise', () => {
  assert.deepEqual(eventBackLink('discovery'), { href: '/events', label: 'Back to Event Discovery' });
  assert.deepEqual(eventBackLink('my-events'), { href: '/my-registrations', label: 'Back to My Events' });
  for (const from of [null, undefined, '', 'https://evil.example', '//evil.example', '/dashboard']) {
    assert.deepEqual(eventBackLink(from), { href: '/my-registrations', label: 'Back to My Events' }, String(from));
  }
});

test('[SPM-155] attendees may open /events/<id> and return there after login; SPM-33 roles unchanged', () => {
  assert.equal(canViewPath('ATTENDEE', '/events/42'), true);
  assert.equal(canViewPath('ATTENDEE', '/events/42?from=discovery'), true);
  assert.equal(postLoginPath(attendee, '/events/42'), '/events/42');
  assert.equal(canViewPath('ORGANISER', '/events/42'), true);
  assert.equal(canViewPath('COORDINATOR', '/events/42'), true);
  for (const role of ['VENUE_STAFF', 'TECH_SUPPORT', 'COORDINATOR_LEAD']) assert.equal(canViewPath(role, '/events/42'), false, role);
  assert.equal(canViewPath('ATTENDEE', '/events/new'), false);
});
