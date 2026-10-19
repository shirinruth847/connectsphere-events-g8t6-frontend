import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIGNUP_ACCOUNT_TYPES, isSignupAccountType, signupFieldErrors, validateSignup } from '../lib/signup.ts';

const valid = { accountType: 'ATTENDEE', name: 'Ada Lovelace', email: 'ada@example.com', password: 'Analytical1' };

test('[SPM-123] only attendees and event organisers may self-register', () => {
  assert.deepEqual([...SIGNUP_ACCOUNT_TYPES], ['ATTENDEE', 'ORGANISER']);
  for (const role of ['ATTENDEE', 'ORGANISER']) assert.equal(isSignupAccountType(role), true, role);
  for (const role of ['COORDINATOR', 'COORDINATOR_LEAD', 'VENUE_STAFF', 'TECH_SUPPORT', 'attendee', '', null, undefined]) {
    assert.equal(isSignupAccountType(role), false, String(role));
  }
  assert.equal(validateSignup({ ...valid, accountType: 'COORDINATOR' }).accountType, 'Choose Attendee or Event Organiser.');
  assert.deepEqual(validateSignup(valid), {});
  assert.deepEqual(validateSignup({ ...valid, accountType: 'ORGANISER' }), {});
});

test('[SPM-123] every field is required', () => {
  assert.deepEqual(validateSignup({ accountType: null, name: '  ', email: '', password: '' }), {
    accountType: 'Choose an account type.',
    name: 'Name is required.',
    email: 'Email is required.',
    password: 'Password is required.',
  });
});

test('[SPM-123] email and length limits match the backend validator', () => {
  for (const email of ['plainaddress', 'a@b', 'a b@c.com', 'a@b.', `${'a'.repeat(140)}@example.com`]) {
    assert.equal(validateSignup({ ...valid, email }).email, 'Enter a valid email address.', email);
  }
  assert.equal(validateSignup({ ...valid, name: 'x'.repeat(101) }).name, 'Name must be 100 characters or fewer.');
  assert.equal(validateSignup({ ...valid, name: 'x'.repeat(100) }).name, undefined);
});

test('[SPM-123] password policy: 8–72 characters, a letter and a digit', () => {
  for (const password of ['Abc1234', 'abcdefgh', '12345678', 'a1'.repeat(37)]) {
    assert.match(validateSignup({ ...valid, password }).password ?? '', /8 to 72 characters/, password);
  }
  for (const password of ['abcdefg1', '1234567a', 'a1'.repeat(36), ' spaced 1 ']) {
    assert.equal(validateSignup({ ...valid, password }).password, undefined, password);
  }
});

test('[SPM-123] backend field errors map only to fields on the form', () => {
  assert.deepEqual(signupFieldErrors({ email: 'Enter a valid email address.', role: 'This field cannot be set.' }), { email: 'Enter a valid email address.' });
  assert.deepEqual(signupFieldErrors(undefined), {});
});
