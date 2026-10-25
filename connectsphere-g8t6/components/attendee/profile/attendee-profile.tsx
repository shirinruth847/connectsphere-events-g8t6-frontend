"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { PageContent } from "@/components/layout/page-content";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { useNavigationGuard } from "@/components/shared/navigation-guard";
import { PermissionPill } from "@/components/shared/permission-pill";
import { AlertBanner, Button, FormLabel, SectionCard, Skeleton, fieldClasses } from "@/components/shared/primitives";
import { SectionHeading } from "@/components/shared/section-heading";
import { ApiError } from "@/lib/api";
import { getMyAttendeeProfile, saveMyAttendeeProfile, type AttendeeProfile } from "@/lib/api/attendee-profile";
import { ROLE_LABELS } from "@/lib/auth";
import { formatTimestamp } from "@/lib/datetime";
import {
  PROFILE_FIELDS,
  PROFILE_TEXT_MAX,
  countedLength,
  fieldErrorsFromBackend,
  hasUnsavedChanges,
  toSaveBody,
  validateProfileText,
  validateProfileValues,
  valuesFromProfile,
  type ProfileField,
  type ProfileFieldErrors,
  type ProfileValues,
} from "./profile-form";

const toApiError = (error: unknown) =>
  error instanceof ApiError ? error : new ApiError("The request could not be completed.", 0);

type LoadState =
  | { status: "loading" }
  | { status: "ready"; profile: AttendeeProfile; reloaded: boolean }
  | { status: "error"; error: ApiError };

// /attendee-profile (SPM-270). Render inside DashboardWorkspace role="ATTENDEE":
// AuthGate handles sign-in and other roles; the backend enforces both again.
export function AttendeeProfilePage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  // Bumped on every load so the form starts again from the server values.
  const [generation, setGeneration] = useState(0);
  const reloaded = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    getMyAttendeeProfile(controller.signal)
      .then(({ profile }) => {
        if (controller.signal.aborted) return;
        setState({ status: "ready", profile, reloaded: reloaded.current });
        setGeneration((value) => value + 1);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", error: toApiError(error) });
      });
    return () => controller.abort();
  }, [attempt]);

  const load = ({ afterConflict }: { afterConflict: boolean }) => {
    reloaded.current = afterConflict;
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  };

  return (
    <PageContent
      eyebrow={ROLE_LABELS.ATTENDEE}
      title="Attendee Profile"
      description="Your contact details and the preferences ConnectSphere can reuse when you register for events."
    >
      {state.status === "loading" ? (
        <div className="grid gap-5" role="status" aria-label="Loading your profile">
          <Skeleton className="h-44 w-full rounded-panel" />
          <Skeleton className="h-80 w-full rounded-panel" />
        </div>
      ) : null}

      {state.status === "error" ? <LoadError error={state.error} onRetry={() => load({ afterConflict: false })} /> : null}

      {state.status === "ready" ? (
        <div className="grid gap-5">
          <PersonalInformation profile={state.profile} />
          <PreferencesForm
            key={generation}
            profile={state.profile}
            reloadedAfterConflict={state.reloaded}
            onLoadLatest={() => load({ afterConflict: true })}
          />
        </div>
      ) : null}
    </PageContent>
  );
}

function LoadError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  // apiRequest reports a 401 to AuthGate, which sends the attendee to sign in.
  if (error.status === 401) return <AlertBanner tone="info" title="Your session has ended">Taking you to sign in…</AlertBanner>;
  if (error.status === 403) {
    return <AlertBanner tone="error" title="Attendee access required">The Attendee Profile is available to attendee accounts only.</AlertBanner>;
  }
  return (
    <AlertBanner tone="error" title="Could not load your profile">
      {error.status === 0 && error.code === "NETWORK_ERROR" ? error.message : "Your profile could not be loaded right now. Please try again."}
      <div className="mt-3">
        <Button variant="danger" onClick={onRetry} className="w-full max-lg:min-h-11 sm:w-auto">Try again</Button>
      </div>
    </AlertBanner>
  );
}

function PersonalInformation({ profile }: { profile: AttendeeProfile }) {
  return (
    <SectionCard className="grid gap-4">
      <SectionHeading
        id="personal-information-heading"
        title="Personal information"
        description="From your ConnectSphere account. These details cannot be changed here."
        action={<PermissionPill tone="read-only">Read-only</PermissionPill>}
      />
      <KeyValuePanel
        rows={[
          { label: "Name", icon: "person", value: profile.name },
          { label: "Email", value: <span className="[overflow-wrap:anywhere]">{profile.email}</span> },
          { label: "Phone", value: profile.phone?.trim() ? profile.phone : <span className="font-normal text-on-surface-variant">Not provided</span> },
        ]}
      />
    </SectionCard>
  );
}

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "failed"; title: string; message: string }
  | { status: "conflict" }
  | { status: "session-ended" }
  | { status: "forbidden" };

const FIELD_COPY: Record<ProfileField, { label: string; hint: string; placeholder: string }> = {
  dietaryRestrictions: {
    label: "Dietary restrictions",
    hint: "Optional. For example allergies or meal preferences.",
    placeholder: "e.g. Vegetarian, nut allergy",
  },
  accessibilityRequirements: {
    label: "Accessibility requirements",
    hint: "Optional. Anything organisers should arrange so you can take part.",
    placeholder: "e.g. Step-free access, captioning",
  },
};

function PreferencesForm({
  profile,
  reloadedAfterConflict,
  onLoadLatest,
}: {
  profile: AttendeeProfile;
  reloadedAfterConflict: boolean;
  onLoadLatest: () => void;
}) {
  const guard = useNavigationGuard();
  // The last values the backend confirmed, and the version to send next.
  const [saved, setSaved] = useState(profile);
  const [values, setValues] = useState<ProfileValues>(() => valuesFromProfile(profile));
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const fieldRefs = useRef<Partial<Record<ProfileField, HTMLTextAreaElement | null>>>({});
  const dirty = hasUnsavedChanges(values, valuesFromProfile(saved));
  const saving = save.status === "saving";

  // Warn before leaving with unsaved edits, using the app's shared guard.
  useEffect(() => {
    guard.setBlocked(dirty);
    return () => guard.setBlocked(false);
  }, [dirty, guard]);

  const update = (field: ProfileField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    // Re-check a field that already shows an error, so it clears as soon as it is fixed.
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: validateProfileText(value) ?? undefined }));
    if (save.status === "saved") setSave({ status: "idle" });
  };

  const focusFirstError = (errors: ProfileFieldErrors) => {
    const first = PROFILE_FIELDS.find((field) => errors[field]);
    if (first) fieldRefs.current[first]?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const errors = validateProfileValues(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setSave({ status: "idle" });
      focusFirstError(errors);
      return;
    }
    setSave({ status: "saving" });
    try {
      const { profile: latest } = await saveMyAttendeeProfile(toSaveBody(values, saved.version));
      // Success is shown only now, with the values and version the backend returned.
      setSaved(latest);
      setValues(valuesFromProfile(latest));
      guard.setBlocked(false);
      setSave({ status: "saved" });
    } catch (caught) {
      // The typed values stay in the form in every failure case (TC-PROFILE-010).
      const error = toApiError(caught);
      if (error.status === 400) {
        const backendErrors = fieldErrorsFromBackend(error.fields);
        setFieldErrors(backendErrors);
        focusFirstError(backendErrors);
        setSave({
          status: "failed",
          title: "Your preferences were not saved",
          message: Object.keys(backendErrors).length
            ? "Correct the highlighted fields, then save again."
            : "Your profile could not be saved. Reload the page, then try again.",
        });
      } else if (error.status === 409) {
        setSave({ status: "conflict" });
      } else if (error.status === 401) {
        setSave({ status: "session-ended" });
      } else if (error.status === 403) {
        setSave({ status: "forbidden" });
      } else {
        setSave({
          status: "failed",
          title: "Your preferences were not saved",
          message: error.status === 0 && error.code === "NETWORK_ERROR"
            ? `${error.message} Your changes are still here.`
            : "Something went wrong while saving. Your changes are still here, so you can try again.",
        });
      }
    }
  };

  const discard = () => {
    setValues(valuesFromProfile(saved));
    setFieldErrors({});
    setSave({ status: "idle" });
  };

  return (
    <SectionCard className="grid gap-4">
      <SectionHeading
        id="registration-preferences-heading"
        title="Registration preferences"
        description="Shared with organisers when you register for an event. Both are optional; leave a field blank if it does not apply."
        action={<PermissionPill tone="edit">You can edit</PermissionPill>}
      />

      <p className="text-xs text-on-surface-variant">
        {saved.updatedAt ? `Last saved ${formatTimestamp(saved.updatedAt)}` : "Not saved yet. Your preferences are saved when you select Save preferences."}
      </p>

      {reloadedAfterConflict && save.status === "idle" && !dirty ? (
        <AlertBanner tone="info" title="Latest profile loaded">Review these preferences, make your changes again if needed, then save.</AlertBanner>
      ) : null}

      <form noValidate onSubmit={submit} aria-labelledby="registration-preferences-heading" className="grid gap-5">
        {PROFILE_FIELDS.map((field) => (
          <PreferenceField
            key={field}
            field={field}
            value={values[field]}
            error={fieldErrors[field]}
            readOnly={saving}
            inputRef={(element) => { fieldRefs.current[field] = element; }}
            onChange={(value) => update(field, value)}
          />
        ))}

        <SaveFeedback save={save} onLoadLatest={onLoadLatest} />

        <div className="flex flex-col gap-2 border-t border-outline-variant/60 pt-4 sm:flex-row sm:items-center">
          <Button type="submit" disabled={saving} className="w-full max-lg:min-h-11 sm:w-auto">
            {saving ? "Saving…" : "Save preferences"}
          </Button>
          {dirty && !saving ? (
            <Button type="button" variant="secondary" onClick={discard} className="w-full max-lg:min-h-11 sm:w-auto">
              Discard changes
            </Button>
          ) : null}
          {dirty && !saving ? <span className="text-xs text-on-surface-variant sm:ml-2">You have unsaved changes.</span> : null}
        </div>
      </form>
    </SectionCard>
  );
}

function SaveFeedback({ save, onLoadLatest }: { save: SaveState; onLoadLatest: () => void }) {
  switch (save.status) {
    case "saved":
      return <AlertBanner tone="success" title="Profile saved">Your registration preferences have been saved.</AlertBanner>;
    case "failed":
      return <AlertBanner tone="error" title={save.title}>{save.message}</AlertBanner>;
    case "conflict":
      return (
        <AlertBanner tone="warning" title="Your profile changed since you opened it">
          Your profile was updated somewhere else, so these changes were not saved. Your edits are still in the form: copy anything you want to keep, then load the latest profile and save again.
          <div className="mt-3">
            <Button type="button" variant="secondary" onClick={onLoadLatest} className="w-full max-lg:min-h-11 sm:w-auto">
              Load latest profile
            </Button>
          </div>
        </AlertBanner>
      );
    case "session-ended":
      // apiRequest reports the 401 to AuthGate, which sends the attendee to sign in.
      return <AlertBanner tone="info" title="Your session has ended">Your preferences were not saved. Taking you to sign in…</AlertBanner>;
    case "forbidden":
      return <AlertBanner tone="error" title="Attendee access required">Only attendee accounts can save an Attendee Profile.</AlertBanner>;
    default:
      return null;
  }
}

function PreferenceField({
  field,
  value,
  error,
  readOnly,
  inputRef,
  onChange,
}: {
  field: ProfileField;
  value: string;
  error?: string;
  // Read-only (not disabled) while saving, so a field with a backend error can take focus.
  readOnly: boolean;
  inputRef: (element: HTMLTextAreaElement | null) => void;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const inputId = `${field}-${id}`;
  const hintId = `${inputId}-hint`;
  const countId = `${inputId}-count`;
  const errorId = `${inputId}-error`;
  const copy = FIELD_COPY[field];
  const length = countedLength(value);
  const over = length > PROFILE_TEXT_MAX;

  return (
    <div>
      <FormLabel htmlFor={inputId}>{copy.label}</FormLabel>
      <p id={hintId} className="mb-2 text-xs text-on-surface-variant">{copy.hint}</p>
      {/* No maxLength: it would silently cut pasted text. Over-long text is shown as an error instead. */}
      <textarea
        id={inputId}
        name={field}
        ref={inputRef}
        rows={4}
        value={value}
        readOnly={readOnly}
        placeholder={copy.placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={[hintId, countId, error ? errorId : null].filter(Boolean).join(" ")}
        onChange={(event) => onChange(event.target.value)}
        className={`${fieldClasses} min-h-28 resize-y ${error ? "border-error" : ""}`}
      />
      <div className="mt-1.5 flex items-start justify-between gap-3">
        {error ? (
          <p id={errorId} className="text-sm text-error" role="alert">{error}</p>
        ) : <span />}
        <span id={countId} className={`shrink-0 text-xs tabular-nums ${over ? "font-semibold text-error" : "text-on-surface-variant"}`}>
          {length} / {PROFILE_TEXT_MAX}
          <span className="sr-only"> characters</span>
        </span>
      </div>
    </div>
  );
}
