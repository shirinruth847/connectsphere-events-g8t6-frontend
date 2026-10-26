import { test, expect } from '@playwright/test';
import { installLoginMock } from './support.mjs';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
const created = (email) => ({ status: 201, body: { message: 'Account created. You can now log in.', user: { user_id: 99, email, name: 'New User', role: 'ATTENDEE', roles: ['ATTENDEE'], home_path: '/my-registrations' } } });

// Mocks POST /api/auth/signup on top of the shared login mocks and records each request body.
async function mockSignup(page, respond = (body) => created(body.email)) {
  const requests = [];
  await page.route('**/api/auth/signup', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = request.postDataJSON();
    requests.push(body);
    const result = await respond(body, requests.length);
    if (result === 'abort') return route.abort('connectionrefused');
    return route.fulfill({ status: result.status, headers: CORS, contentType: 'application/json', body: JSON.stringify(result.body) });
  });
  return requests;
}

async function fillSignup(page, { accountType = 'ATTENDEE', name = 'New User', email = 'new.user@example.com', password = 'Valid-password9' } = {}) {
  await page.goto('/signup');
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeEnabled();
  if (accountType) await page.locator(`#accountType-${accountType}`).check();
  await page.locator('#signup-name').fill(name);
  await page.locator('#signup-email').fill(email);
  await page.locator('#signup-password').fill(password);
}
const submit = (page) => page.getByRole('button', { name: 'Create account', exact: true }).click();

for (const [accountType, role, url, heading] of [['ATTENDEE', 'ATTENDEE', /\/events$/, 'Event Discovery'], ['ORGANISER', 'ORGANISER', /\/dashboard$/, 'Organisation Events']]) {
  test(`[SPM-123] ${accountType} signs up and is signed in automatically`, async ({ page }) => {
    await installLoginMock(page, { role });
    const requests = await mockSignup(page);
    await fillSignup(page, { accountType });
    await submit(page);
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    expect(requests).toEqual([{ accountType, name: 'New User', email: 'new.user@example.com', password: 'Valid-password9' }]);
  });
}

test('[SPM-123] the landing page follows the trusted /api/auth/me role, not the form choice', async ({ page }) => {
  await installLoginMock(page, { role: 'ORGANISER' });
  await mockSignup(page);
  await fillSignup(page, { accountType: 'ATTENDEE' });
  await submit(page);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('[SPM-123] only Attendee and Event Organiser can be chosen', async ({ page }) => {
  await installLoginMock(page);
  await page.goto('/signup');
  const radios = page.locator('input[type=radio][name=accountType]');
  await expect(radios).toHaveCount(2);
  expect(await radios.evaluateAll((inputs) => inputs.map((input) => input.value))).toEqual(['ATTENDEE', 'ORGANISER']);
  await expect(page.getByText('Attendee', { exact: true })).toBeVisible();
  await expect(page.getByText('Event Organiser', { exact: true })).toBeVisible();
  for (const staff of ['Coordinator', 'Venue Staff', 'Technical Support']) await expect(page.getByText(staff)).toHaveCount(0);
});

test('[SPM-123] a tampered radio value cannot submit a staff role', async ({ page }) => {
  await installLoginMock(page);
  const requests = await mockSignup(page);
  await fillSignup(page, { accountType: null });
  await page.locator('#accountType-ATTENDEE').evaluate((input) => { input.value = 'COORDINATOR'; });
  await page.locator('#accountType-ATTENDEE').check();
  await submit(page);
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].accountType).toBe('ATTENDEE');
});

test('[SPM-123] required fields are enforced without calling the API', async ({ page }) => {
  await installLoginMock(page);
  const requests = await mockSignup(page);
  await page.goto('/signup');
  await submit(page);
  for (const message of ['Choose an account type.', 'Name is required.', 'Email is required.', 'Password is required.']) await expect(page.getByText(message)).toBeVisible();
  await expect(page.locator('#accountType-ATTENDEE')).toBeFocused();
  expect(requests).toHaveLength(0);
});

test('[SPM-123] password and email rules match the backend before any request', async ({ page }) => {
  await installLoginMock(page);
  const requests = await mockSignup(page);
  await fillSignup(page, { email: 'not-an-email', password: 'abcdefgh' });
  await submit(page);
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await expect(page.getByText(/Password must be 8 to 72 characters/)).toBeVisible();
  expect(requests).toHaveLength(0);
});

test('[SPM-123] a duplicate email gets a generic message and stays on sign-up', async ({ page }) => {
  await installLoginMock(page);
  await mockSignup(page, () => ({ status: 409, body: { error: 'The email cannot be used for registration.', code: 'EMAIL_UNAVAILABLE' } }));
  await fillSignup(page);
  await submit(page);
  await expect(page.locator('#email-error')).toHaveText('The email cannot be used for registration.');
  await expect(page.getByText(/already (exists|registered)/i)).toHaveCount(0);
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.locator('#signup-password')).toHaveValue('');
  await expect(page.locator('#signup-email')).toHaveValue('new.user@example.com');
});

test('[SPM-123] backend validation errors appear on their fields', async ({ page }) => {
  await installLoginMock(page);
  await mockSignup(page, () => ({ status: 400, body: { error: 'Please correct the highlighted fields.', code: 'VALIDATION_FAILED', fields: { password: 'Password must be 8 to 72 characters and include at least one letter and one number.' } } }));
  await fillSignup(page);
  await submit(page);
  await expect(page.locator('#password-error')).toHaveText(/include at least one letter and one number/);
});

test('[SPM-123] rate limiting, server and network failures show safe messages', async ({ page }) => {
  await installLoginMock(page);
  let mode = 429;
  await mockSignup(page, () => mode === 'network' ? 'abort' : mode === 429
    ? { status: 429, body: { error: 'Too many sign-up attempts. Please wait and try again.', code: 'RATE_LIMITED' } }
    : { status: 500, body: { error: 'Internal stack detail', code: 'INTERNAL_ERROR' } });
  await fillSignup(page);
  await submit(page);
  await expect(page.getByText('Too many sign-up attempts. Please try again later.')).toBeVisible();
  for (const [next, text] of [[500, 'We couldn\'t create your account right now. Please try again.'], ['network', 'We couldn\'t reach ConnectSphere. Check your connection and try again.']]) {
    mode = next;
    await page.locator('#signup-password').fill('Valid-password9');
    await submit(page);
    await expect(page.getByText(text)).toBeVisible();
  }
  await expect(page.getByText('Internal stack detail')).toHaveCount(0);
});

test('[SPM-123] if automatic sign-in fails, the created account is not submitted again', async ({ page }) => {
  await installLoginMock(page, { invalid: true });
  const requests = await mockSignup(page);
  await fillSignup(page);
  await submit(page);
  await expect(page.getByText('Your account was created successfully, but we couldn\'t sign you in automatically. Please sign in.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).toHaveCount(0);
  expect(requests).toHaveLength(1);
  await page.getByRole('link', { name: 'Go to sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('[SPM-123] rapid repeated submits send one sign-up request', async ({ page }) => {
  await installLoginMock(page, { role: 'ATTENDEE' });
  const requests = await mockSignup(page, async (body) => { await new Promise((resolve) => setTimeout(resolve, 600)); return created(body.email); });
  await fillSignup(page);
  await page.locator('form[aria-label="Create your account"]').evaluate((form) => { form.requestSubmit(); form.requestSubmit(); form.requestSubmit(); });
  await expect(page).toHaveURL(/\/events$/);
  expect(requests).toHaveLength(1);
  expect(page.url()).not.toContain('password');
});

test('[SPM-123] login and sign-up pages link to each other', async ({ page }) => {
  await installLoginMock(page);
  await page.goto('/login');
  await page.getByRole('link', { name: 'Sign up', exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole('heading', { name: 'Create your account', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
});
