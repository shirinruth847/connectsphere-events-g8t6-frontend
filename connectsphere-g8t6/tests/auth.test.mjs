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
<<<<<<< HEAD
test('[SPM-33 / SPM-174] the event workspace and Lead queue keep their role boundaries', () => {
  for (const role of ['ORGANISER','COORDINATOR']) assert.equal(postLoginPath({role}, '/events/42'), '/events/42');
  for (const role of ['COORDINATOR_LEAD','VENUE_STAFF','TECH_SUPPORT']) assert.equal(canViewPath(role, '/events/42'), false);
  assert.equal(postLoginPath({role:'COORDINATOR_LEAD'}, '/events/42'), '/events');
  assert.equal(canViewPath('COORDINATOR_LEAD', '/events'), true);
=======
test('[SPM-33 AC1][SPM-181 AC4] the event workspace is a return path for organisers, coordinators and Venue Staff only', () => {
  for (const role of ['ORGANISER','COORDINATOR','VENUE_STAFF']) assert.equal(postLoginPath({role}, '/events/42'), '/events/42');
  assert.equal(postLoginPath({role:'VENUE_STAFF'}, '/events/42?booking=7'), '/events/42?booking=7');
  for (const role of ['COORDINATOR_LEAD','TECH_SUPPORT','ATTENDEE']) assert.equal(canViewPath(role, '/events/42'), false);
  assert.equal(canViewPath('VENUE_STAFF', '/events/new'), false);
>>>>>>> 5a20b0e2f95136615620b006f6e7491b8f7671ba
  assert.equal(canViewPath('COORDINATOR', '/events/new'), false);
});
test('[SPM-177/SPM-34] /events returns Leads to the queue, attendees to discovery', () => {
  assert.equal(canViewPath('COORDINATOR_LEAD', '/events'), true);
  assert.equal(postLoginPath({role:'COORDINATOR_LEAD'}, '/events'), '/events');
  assert.equal(canViewPath('COORDINATOR', '/events'), false);
  assert.equal(postLoginPath({role:'COORDINATOR'}, '/events'), '/dashboard');
  assert.equal(canViewPath('ATTENDEE', '/events'), true);
  assert.equal(postLoginPath({role:'ATTENDEE'}, '/events'), '/events');
});
