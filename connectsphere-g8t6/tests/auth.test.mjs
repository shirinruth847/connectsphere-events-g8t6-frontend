import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNextPath, postLoginPath, canViewPath } from '../lib/auth.ts';
test('[SPM-32 TC-012] normalised redirect destinations stay on-site', () => {
  for (const path of ['//evil.example', '/..//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', '/\n/evil.example']) assert.equal(safeNextPath(path), null, path);
  assert.equal(safeNextPath('/events/new?draft=42'), '/events/new?draft=42');
});
test('[SPM-32 TC-001–005] each role reaches its permitted home', () => {
  // Staff land on /dashboard (Master section 3.4); the Lead lands on the SPM-174
  // assignment queue at /events.
  for (const role of ['ORGANISER','COORDINATOR','TECH_SUPPORT','VENUE_STAFF']) assert.equal(postLoginPath({role}, null), '/dashboard');
  assert.equal(postLoginPath({role:'COORDINATOR_LEAD'}, null), '/events');
  assert.equal(postLoginPath({role:'ATTENDEE'}, null), '/events');
});
test('[SPM-32 TC-004/011/012] return paths respect role permissions', () => {
  assert.equal(postLoginPath({role:'ATTENDEE'}, '/events/new'), '/events');
  assert.equal(postLoginPath({role:'ORGANISER'}, '/events/create?draft=42'), '/events/create?draft=42');
  for (const role of ['ATTENDEE','COORDINATOR','VENUE_STAFF','TECH_SUPPORT']) assert.equal(canViewPath(role, '/events/new'), false);
  assert.equal(postLoginPath({role:'ORGANISER'}, '/login'), '/dashboard');
});
test('[SPM-33 AC1][SPM-181 AC4][SPM-44] event detail URLs are valid return paths for permitted roles', () => {
  for (const role of ['ORGANISER', 'COORDINATOR', 'VENUE_STAFF']) {
    assert.equal(postLoginPath({ role }, '/events/42'), '/events/42');
  }

  assert.equal(
    postLoginPath({ role: 'VENUE_STAFF' }, '/events/42?booking=7'),
    '/events/42?booking=7'
  );

  // SPM-44: attendees may return to attendee-safe event details.
  assert.equal(canViewPath('ATTENDEE', '/events/42'), true);

  // These roles still cannot use the event-detail return path.
  for (const role of ['COORDINATOR_LEAD', 'TECH_SUPPORT']) {
    assert.equal(canViewPath(role, '/events/42'), false);
  }

  // Reserved organiser routes remain unavailable.
  assert.equal(canViewPath('VENUE_STAFF', '/events/new'), false);
  assert.equal(canViewPath('COORDINATOR', '/events/new'), false);
  assert.equal(canViewPath('ATTENDEE', '/events/new'), false);
  assert.equal(canViewPath('ATTENDEE', '/events/create'), false);
});
test('[SPM-177/SPM-34] /events returns Leads to the queue, attendees to discovery', () => {
  assert.equal(canViewPath('COORDINATOR_LEAD', '/events'), true);
  assert.equal(postLoginPath({role:'COORDINATOR_LEAD'}, '/events'), '/events');
  assert.equal(canViewPath('COORDINATOR', '/events'), false);
  assert.equal(postLoginPath({role:'COORDINATOR'}, '/events'), '/dashboard');
  assert.equal(canViewPath('ATTENDEE', '/events'), true);
  assert.equal(postLoginPath({role:'ATTENDEE'}, '/events'), '/events');
});
