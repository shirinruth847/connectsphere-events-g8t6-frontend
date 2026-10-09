// Client-side checks for the sign-up form. They mirror the backend's rules
// (validators/authValidator.js) for faster feedback; the backend stays
// authoritative and its 400 field errors replace these messages.

import type { SignupAccountType } from "@/lib/api/types";
import { ROLES } from "@/lib/permissions/roles";

// The only account types a visitor may choose. Staff roles need trusted provisioning.
export const SIGNUP_ACCOUNT_TYPES: readonly SignupAccountType[] = [ROLES.ATTENDEE, ROLES.ORGANISER];

export function isSignupAccountType(value: unknown): value is SignupAccountType {
  return typeof value === "string" && (SIGNUP_ACCOUNT_TYPES as readonly string[]).includes(value);
}

export type SignupValues = {
  accountType: string | null;
  name: string;
  email: string;
  password: string;
};
export type SignupField = keyof SignupValues;
export type SignupFieldErrors = Partial<Record<SignupField, string>>;

// Order of the fields on the page, used to focus the first invalid one.
export const SIGNUP_FIELDS: readonly SignupField[] = ["accountType", "name", "email", "password"];

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 150;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

// Same pattern as the backend: one @, no spaces, a dot in the domain.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export const PASSWORD_REQUIREMENTS = `${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters, with at least one letter and one number.`;

const meetsPasswordPolicy = (password: string) =>
  password.length >= MIN_PASSWORD_LENGTH &&
  password.length <= MAX_PASSWORD_LENGTH &&
  /[A-Za-z]/.test(password) &&
  /\d/.test(password);

export function validateSignup({ accountType, name, email, password }: SignupValues): SignupFieldErrors {
  const errors: SignupFieldErrors = {};
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();

  if (!accountType) {
    errors.accountType = "Choose an account type.";
  } else if (!isSignupAccountType(accountType)) {
    errors.accountType = "Choose Attendee or Event Organiser.";
  }

  if (!trimmedName) {
    errors.name = "Name is required.";
  } else if (trimmedName.length > MAX_NAME_LENGTH) {
    errors.name = `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  if (!trimmedEmail) {
    errors.email = "Email is required.";
  } else if (trimmedEmail.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(trimmedEmail)) {
    errors.email = "Enter a valid email address.";
  }

  // Not trimmed: surrounding spaces may be part of the password, as on the backend.
  if (!password) {
    errors.password = "Password is required.";
  } else if (!meetsPasswordPolicy(password)) {
    errors.password = `Password must be ${PASSWORD_REQUIREMENTS}`;
  }

  return errors;
}
