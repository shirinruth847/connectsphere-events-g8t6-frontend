import type { RegistrationAnswers } from "@/lib/api/registrations";
import { PROFILE_FIELDS, validateProfileText, type ProfileField, type ProfileValues } from "../profile/profile-form";

// Event registration form rules (SPM-134). Pure, so the unit tests can load
// it. The answers follow the Attendee Profile text rules, because the backend
// validates both with the same function; the backend stays authoritative.

export type RegistrationField = ProfileField;
export const REGISTRATION_FIELDS = PROFILE_FIELDS;
export type RegistrationValues = ProfileValues;
export type RegistrationFieldErrors = Partial<Record<RegistrationField, string>>;

export function validateRegistrationValues(values: RegistrationValues): RegistrationFieldErrors {
  const errors: RegistrationFieldErrors = {};
  for (const field of REGISTRATION_FIELDS) {
    const message = validateProfileText(values[field]);
    if (message) errors[field] = message;
  }
  return errors;
}

// The POST body: both answers, blank as null, other text unchanged so Unicode
// is never altered here (the backend trims).
export const toRegistrationAnswers = (values: RegistrationValues): RegistrationAnswers => ({
  dietaryRestrictions: values.dietaryRestrictions.trim() ? values.dietaryRestrictions : null,
  accessibilityRequirements: values.accessibilityRequirements.trim() ? values.accessibilityRequirements : null,
});

// One logical submission keeps one Idempotency-Key, so an explicit retry of the
// same answers is replayed rather than registered twice. Changed answers are a
// new submission with a new key.
export interface SubmissionAttempt {
  key: string;
  payload: string;
}
export function attemptFor(previous: SubmissionAttempt | null, answers: RegistrationAnswers, newKey: () => string): SubmissionAttempt {
  const payload = JSON.stringify(answers);
  return previous && previous.payload === payload ? previous : { key: newKey(), payload };
}

export interface RegistrationOutcome {
  tone: "info" | "warning" | "error";
  title: string;
  message: string;
  // Reload the event's availability and the attendee's places afterwards.
  refresh: boolean;
  // Resubmitting can still succeed (same key for in-progress, a new one when reused).
  canRetry: boolean;
  newKey?: boolean;
}

const OUTCOMES: Record<string, RegistrationOutcome> = {
  REGISTRATION_FULL: {
    tone: "warning", refresh: true, canRetry: false,
    title: "This event is now full",
    message: "The last place was taken before your registration was submitted, so direct registration is no longer available. You can join the waitlist from the event's details.",
  },
  REGISTRATION_CLOSED: {
    tone: "warning", refresh: true, canRetry: false,
    title: "Registration has closed",
    message: "The registration period for this event ended before your registration was submitted.",
  },
  REGISTRATION_NOT_YET_OPEN: {
    tone: "warning", refresh: true, canRetry: false,
    title: "Registration hasn't opened yet",
    message: "Registration for this event has not opened yet, so your registration was not submitted. Your answers are still here.",
  },
  // Neither full nor closed; the reason is internal to the event's set-up.
  REGISTRATION_UNAVAILABLE: {
    tone: "warning", refresh: true, canRetry: false,
    title: "Registration is currently unavailable",
    message: "Your registration was not submitted. Please check this event again later. Your answers are still here.",
  },
  ALREADY_REGISTERED: {
    tone: "info", refresh: true, canRetry: false,
    title: "You're already registered",
    message: "You already have a registration for this event, so another one was not created.",
  },
  ALREADY_WAITLISTED: {
    tone: "info", refresh: true, canRetry: false,
    title: "You're already on the waitlist",
    message: "You hold a waitlist place for this event, so you can't register directly. Your waitlist place has not changed.",
  },
  IDEMPOTENCY_IN_PROGRESS: {
    tone: "info", refresh: false, canRetry: true,
    title: "Your registration is still being processed",
    message: "Wait a moment, then select Register again to check the result. You won't be registered twice.",
  },
  IDEMPOTENCY_KEY_REUSED: {
    tone: "error", refresh: false, canRetry: true, newKey: true,
    title: "Your registration was not submitted",
    message: "Please select Register again. Your answers are still here.",
  },
  EVENT_NOT_FOUND: {
    tone: "warning", refresh: true, canRetry: false,
    title: "This event is no longer available",
    message: "It can't be registered for any more. It may have been unpublished or rescheduled.",
  },
};

// A request can commit before its reply is lost. Preserve uncertainty until
// the same-key retry returns the backend's result.
const GENERIC_FAILURE: RegistrationOutcome = {
  tone: "error", refresh: false, canRetry: true,
  title: "We couldn't confirm your registration",
  message: "Your registration may have been received. Your answers are still here. Select Try again to check the result without registering twice.",
};

// The outcome of a failed POST, from the status and stable code only; the
// backend's own wording is never shown.
export function registrationOutcome(error: { status: number; code: string; message: string }): RegistrationOutcome {
  if (error.status === 404) return OUTCOMES.EVENT_NOT_FOUND;
  if (error.status === 409 && Object.prototype.hasOwnProperty.call(OUTCOMES, error.code)) return OUTCOMES[error.code];
  if (error.status === 0 && error.code === "NETWORK_ERROR") return { ...GENERIC_FAILURE, message: `${error.message} ${GENERIC_FAILURE.message}` };
  return GENERIC_FAILURE;
}

// Unsaved answers kept across a session expiry, like the Attendee Profile and
// event request forms: stored on "connectsphere:session-expired" and restored
// once after sign-in. They are never submitted automatically.
export const REGISTRATION_RECOVERY_MAX_AGE_MS = 30 * 60 * 1000;
export const registrationRecoveryKey = (userKey: string | number) => `connectsphere:recovery:${userKey}:registration`;
// The Join Waitlist answers (SPM-163), kept and read back the same way.
export const waitlistRecoveryKey = (userKey: string | number) => `connectsphere:recovery:${userKey}:waitlist`;

export interface RegistrationTarget {
  eventId: number;
  title: string;
  startDatetime: string | null;
  endDatetime: string | null;
}

export interface RegistrationRecovery {
  event: RegistrationTarget;
  values: RegistrationValues;
  at: number;
}

const isTime = (value: unknown) => value === null || typeof value === "string";

export function parseRegistrationRecovery(raw: string | null, now: number): RegistrationRecovery | null {
  if (!raw) return null;
  try {
    const recovery = JSON.parse(raw);
    const { event, values, at } = recovery ?? {};
    if (!values || REGISTRATION_FIELDS.some((field) => typeof values[field] !== "string")) return null;
    if (!event || !Number.isSafeInteger(event.eventId) || event.eventId < 1 || typeof event.title !== "string") return null;
    if (!isTime(event.startDatetime) || !isTime(event.endDatetime)) return null;
    if (typeof at !== "number" || now - at > REGISTRATION_RECOVERY_MAX_AGE_MS || now < at) return null;
    return {
      event: { eventId: event.eventId, title: event.title, startDatetime: event.startDatetime, endDatetime: event.endDatetime },
      values: { dietaryRestrictions: values.dietaryRestrictions, accessibilityRequirements: values.accessibilityRequirements },
      at,
    };
  } catch {
    return null;
  }
}
