import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNextPath, postLoginPath, canViewPath } from '../lib/auth.ts';
test('[SPM-32 TC-012] normalised redirect destinations stay on-site', () => {
  for (const path of ['//evil.example', '/..//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', '/\n/evil.example']) assert.equal(safeNextPath(path), null, path);
  assert.equal(safeNextPath('/events/new?draft=42'), '/events/new?draft=42');
});
test('[SPM-32 TC-001–005] each role reaches its permitted home', () => {
  for (const role of ['ORGANISER','COORDINATOR_LEAD','TECH_SUPPORT']) assert.equal(postLoginPath({role}, null), '/dashboard');
  for (const role of ['COORDINATOR','VENUE_STAFF']) assert.equal(postLoginPath({role}, null), '/venues');
  assert.equal(postLoginPath({role:'ATTENDEE'}, null), '/my-registrations');
});
test('[SPM-32 TC-004/011/012] return paths respect role permissions', () => {
  assert.equal(postLoginPath({role:'ATTENDEE'}, '/events/new'), '/my-registrations');
  assert.equal(postLoginPath({role:'ORGANISER'}, '/events/create?draft=42'), '/events/create?draft=42');
  for (const role of ['ATTENDEE','COORDINATOR','VENUE_STAFF','TECH_SUPPORT']) assert.equal(canViewPath(role, '/events/new'), false);
  assert.equal(postLoginPath({role:'ORGANISER'}, '/login'), '/dashboard');
});
