import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
 PROFILE_RECOVERY_MAX_AGE_MS, PROFILE_TEXT_MAX, countedLength, fieldErrorsFromBackend, hasUnsavedChanges, parseProfileRecovery, profileRecoveryKey, toSaveBody, validateProfileText, validateProfileValues, valuesFromProfile,
} from '../components/attendee/profile/profile-form.ts';
import { canViewPath, postLoginPath } from '../lib/auth.ts';

const ROLES = ['ORGANISER', 'COORDINATOR', 'COORDINATOR_LEAD', 'VENUE_STAFF', 'TECH_SUPPORT', 'SAFETY_OFFICER'];
const profile = (overrides = {}) => ({ attendeeId: null, userId: 7, name: 'Seed Attendee', email: 'a@example.test', phone: null, dietaryRestrictions: null, accessibilityRequirements: null, version: null, createdAt: null, updatedAt: null, ...overrides });

test('[SPM-270 AC1] should_allow_only_attendees_when_opening_the_attendee_profile_route', () => {
 assert.equal(canViewPath('ATTENDEE', '/attendee-profile'), true);
 for (const role of ROLES) assert.equal(canViewPath(role, '/attendee-profile'), false, role);
});
test('[SPM-270 TC-PROFILE-002] should_return_to_the_profile_when_an_attendee_signs_in_from_it', () => {
 assert.equal(postLoginPath({ role: 'ATTENDEE' }, '/attendee-profile'), '/attendee-profile');
 assert.equal(postLoginPath({ role: 'ORGANISER' }, '/attendee-profile'), '/dashboard');
});
test('[SPM-270 AC6] should_send_null_when_a_preference_is_blank_or_whitespace', () => {
 assert.deepEqual(toSaveBody({ dietaryRestrictions: '', accessibilityRequirements: '   \n ' }, null), { dietaryRestrictions: null, accessibilityRequirements: null, version: null });
});
test('[SPM-270 AC3] should_send_version_null_on_the_first_save_and_the_loaded_version_after', () => {
 assert.equal(toSaveBody({ dietaryRestrictions: 'Vegan', accessibilityRequirements: '' }, null).version, null);
 assert.equal(toSaveBody({ dietaryRestrictions: 'Vegan', accessibilityRequirements: '' }, 4).version, 4);
});
test('[SPM-270] should_send_unicode_text_unchanged_when_saving', () => {
 const text = 'Gluten-free 🌾, 素食, café';
 assert.equal(toSaveBody({ dietaryRestrictions: text, accessibilityRequirements: '' }, null).dietaryRestrictions, text);
 assert.equal(validateProfileText(text), null);
});
test('[SPM-270] should_accept_exactly_the_limit_and_reject_one_more_when_counting_trimmed_text', () => {
 assert.equal(validateProfileText('a'.repeat(PROFILE_TEXT_MAX)), null);
 assert.equal(validateProfileText(`  ${'a'.repeat(PROFILE_TEXT_MAX)}  `), null);
 assert.match(validateProfileText('a'.repeat(PROFILE_TEXT_MAX + 1)), /1000 characters or fewer/);
});
test('[SPM-270] should_count_emoji_as_the_backend_does_when_checking_length', () => {
 // The backend counts JavaScript string units: 501 emoji are 1002 units.
 assert.equal(countedLength('🌾'), 2);
 assert.ok(validateProfileText('🌾'.repeat(501)));
 assert.equal(validateProfileText('🌾'.repeat(500)), null);
});
test('[SPM-270] should_reject_a_nul_character_when_validating', () => {
 assert.ok(validateProfileText('nuts\u0000'));
});
test('[SPM-270] should_report_errors_per_field_when_validating_the_form', () => {
 const errors = validateProfileValues({ dietaryRestrictions: 'a'.repeat(1001), accessibilityRequirements: 'Ramp access' });
 assert.deepEqual(Object.keys(errors), ['dietaryRestrictions']);
});
test('[SPM-270] should_ignore_whitespace_only_edits_when_detecting_unsaved_changes', () => {
 const saved = valuesFromProfile(profile({ dietaryRestrictions: 'Vegan' }));
 assert.equal(hasUnsavedChanges({ ...saved, dietaryRestrictions: 'Vegan  ' }, saved), false);
 assert.equal(hasUnsavedChanges({ ...saved, dietaryRestrictions: '' }, saved), true);
});
test('[SPM-270] should_show_null_preferences_as_empty_fields_when_loading', () => {
 assert.deepEqual(valuesFromProfile(profile()), { dietaryRestrictions: '', accessibilityRequirements: '' });
});
test('[SPM-270] should_keep_only_editable_field_messages_when_mapping_backend_errors', () => {
 assert.deepEqual(fieldErrorsFromBackend({ dietaryRestrictions: 'Too long', version: 'Bad version', name: 'This field cannot be set.' }), { dietaryRestrictions: 'Too long' });
});
test('[SPM-270 TC-PROFILE-010] should_restore_recent_well_formed_edits_when_reading_session_recovery', () => {
 const now = 1_800_000_000_000;
 const raw = JSON.stringify({ values: { dietaryRestrictions: 'Vegan 🌱', accessibilityRequirements: '' }, version: 2, at: now - 60_000 });
 assert.deepEqual(parseProfileRecovery(raw, now), { values: { dietaryRestrictions: 'Vegan 🌱', accessibilityRequirements: '' }, version: 2, at: now - 60_000 });
 assert.equal(parseProfileRecovery(JSON.stringify({ values: { dietaryRestrictions: 'x', accessibilityRequirements: 'y' }, version: null, at: now }), now).version, null);
});
test('[SPM-270] should_ignore_expired_future_or_malformed_recovery_when_reading_it', () => {
 const now = 1_800_000_000_000;
 const ok = { values: { dietaryRestrictions: 'x', accessibilityRequirements: 'y' }, version: 1 };
 assert.equal(parseProfileRecovery(null, now), null);
 assert.equal(parseProfileRecovery('not json', now), null);
 assert.equal(parseProfileRecovery(JSON.stringify({ ...ok, at: now - PROFILE_RECOVERY_MAX_AGE_MS - 1 }), now), null);
 assert.equal(parseProfileRecovery(JSON.stringify({ ...ok, at: now + 1000 }), now), null);
 assert.equal(parseProfileRecovery(JSON.stringify({ ...ok, version: '2', at: now }), now), null);
 assert.equal(parseProfileRecovery(JSON.stringify({ values: { dietaryRestrictions: 'x' }, version: 1, at: now }), now), null);
});
test('[SPM-270] should_scope_recovery_to_the_signed_in_user', () => {
 assert.notEqual(profileRecoveryKey('auth-a'), profileRecoveryKey('auth-b'));
 assert.match(profileRecoveryKey('auth-a'), /attendee-profile$/);
});
