import type { AttendeeProfile, AttendeeProfileSave } from "@/lib/api/attendee-profile";

// Attendee profile form rules (SPM-270). Pure, so the unit tests can load it.
// They mirror the backend's checks for instant feedback only; the backend
// validator stays authoritative.

export const PROFILE_TEXT_MAX = 1000;

export type ProfileField = "dietaryRestrictions" | "accessibilityRequirements";
export const PROFILE_FIELDS: readonly ProfileField[] = ["dietaryRestrictions", "accessibilityRequirements"];

export type ProfileValues = Record<ProfileField, string>;
export type ProfileFieldErrors = Partial<Record<ProfileField, string>>;

// The backend counts the trimmed value in JavaScript string units, so an emoji
// counts as two. Counting the same way keeps the counter and the backend in step.
export const countedLength = (value: string) => value.trim().length;

export function validateProfileText(value: string): string | null {
  if (value.includes("\u0000")) return "Remove the unsupported control character from this text.";
  const length = countedLength(value);
  if (length > PROFILE_TEXT_MAX) {
    return `Use ${PROFILE_TEXT_MAX} characters or fewer. This is ${length} characters long.`;
  }
  return null;
}

export function validateProfileValues(values: ProfileValues): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};
  for (const field of PROFILE_FIELDS) {
    const message = validateProfileText(values[field]);
    if (message) errors[field] = message;
  }
  return errors;
}

// The form's text for a saved profile; a null preference is an empty field.
export const valuesFromProfile = (profile: AttendeeProfile): ProfileValues => ({
  dietaryRestrictions: profile.dietaryRestrictions ?? "",
  accessibilityRequirements: profile.accessibilityRequirements ?? "",
});

// The PUT body. Both fields are always sent (the backend replaces both). A
// blank field is sent as null; other text is sent unchanged, so Unicode is
// never altered here (the backend trims). version is null for the first save.
export const toSaveBody = (values: ProfileValues, version: number | null): AttendeeProfileSave => ({
  dietaryRestrictions: values.dietaryRestrictions.trim() ? values.dietaryRestrictions : null,
  accessibilityRequirements: values.accessibilityRequirements.trim() ? values.accessibilityRequirements : null,
  version,
});

// Unsaved edits, compared the way the backend stores them (trimmed, blank = null).
export function hasUnsavedChanges(values: ProfileValues, saved: ProfileValues) {
  return PROFILE_FIELDS.some((field) => values[field].trim() !== saved[field].trim());
}

// Backend 400 field messages for the two editable fields only. Anything else
// (version, unknown fields) is not something the attendee can correct here.
export function fieldErrorsFromBackend(fields: Record<string, string>): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};
  for (const field of PROFILE_FIELDS) {
    if (typeof fields[field] === "string" && fields[field]) errors[field] = fields[field];
  }
  return errors;
}
