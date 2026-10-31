"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useSessionUser } from "@/components/auth/auth-gate";
import { formatEventDate, formatEventTime } from "@/components/attendee/discovery/format-event-time";
import { PreferenceField } from "@/components/attendee/profile/attendee-profile";
import { hasUnsavedChanges, valuesFromProfile } from "@/components/attendee/profile/profile-form";
import { Dialog } from "@/components/shared/dialog";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { useNavigationGuard } from "@/components/shared/navigation-guard";
import { PermissionPill } from "@/components/shared/permission-pill";
import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import { SectionHeading } from "@/components/shared/section-heading";
import { ApiError } from "@/lib/api";
import { getMyAttendeeProfile, type AttendeeProfile } from "@/lib/api/attendee-profile";
import { registerForEvent, type RegistrationConfirmation } from "@/lib/api/registrations";
import { announceNotificationsChanged } from "@/lib/notifications";
import { SESSION_EXPIRED } from "@/lib/session";
import {
  REGISTRATION_FIELDS,
  attemptFor,
  registrationOutcome,
  registrationRecoveryKey,
  toRegistrationAnswers,
  validateRegistrationValues,
  type RegistrationField,
  type RegistrationFieldErrors,
  type RegistrationOutcome,
  type RegistrationTarget,
  type RegistrationValues,
  type SubmissionAttempt,
} from "./registration-form";

const toApiError = (error: unknown) =>
  error instanceof ApiError ? error : new ApiError("The request could not be completed.", 0);

const FIELD_HINTS: Record<RegistrationField, string> = {
  dietaryRestrictions: "Optional. Filled in from your Attendee Profile; changes here apply to this registration only.",
  accessibilityRequirements: "Optional. Filled in from your Attendee Profile; changes here apply to this registration only.",
};

interface RegistrationDialogProps {
  // The event being registered for; null when the dialog is closed.
  target: RegistrationTarget | null;
  // Answers to start from instead of the profile (kept from an earlier open,
  // or restored after a session expiry), and whether they were restored.
  initialValues: RegistrationValues | null;
  restored: boolean;
  // Closing hands back the current answers so reopening keeps them.
  onClose: (values: RegistrationValues | null) => void;
  onRegistered: (confirmation: RegistrationConfirmation) => void;
  // The backend refused or no longer shows the event: reload its availability and places.
  onStale: (eventId: number) => void;
}

// The one registration form (SPM-134), opened by Register Now on an Event
// Discovery card and in Event Details. Name and email are read-only from the
// account; the two answers start from the Attendee Profile and are sent with
// this registration only; the profile is never updated from here.
export function RegistrationDialog({ target, initialValues, restored, onClose, onRegistered, onStale }: RegistrationDialogProps) {
  // The open form's latest answers, cleared once the registration succeeds.
  const latestValues = useRef<RegistrationValues | null>(null);
  const close = () => {
    const values = latestValues.current;
    latestValues.current = null;
    onClose(values);
  };

  return (
    <Dialog open={target !== null} onClose={close} title={target ? `Register for ${target.title}` : "Register"}>
      {target ? (
        <RegistrationContent
          key={target.eventId}
          target={target}
          initialValues={initialValues}
          restored={restored}
          onValues={(values) => { latestValues.current = values; }}
          onSucceeded={onRegistered}
          onStale={onStale}
          onDone={close}
        />
      ) : null}
    </Dialog>
  );
}

type ProfileState =
  | { status: "loading" }
  | { status: "ready"; profile: AttendeeProfile }
  | { status: "error"; error: ApiError };

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "registered"; confirmation: RegistrationConfirmation }
  | { status: "refused"; outcome: RegistrationOutcome }
  | { status: "invalid"; message: string }
  | { status: "session-ended" }
  | { status: "forbidden" };

function RegistrationContent({
  target,
  initialValues,
  restored,
  onValues,
  onSucceeded,
  onStale,
  onDone,
}: {
  target: RegistrationTarget;
  initialValues: RegistrationValues | null;
  restored: boolean;
  onValues: (values: RegistrationValues | null) => void;
  onSucceeded: (confirmation: RegistrationConfirmation) => void;
  onStale: (eventId: number) => void;
  onDone: () => void;
}) {
  const guard = useNavigationGuard();
  const user = useSessionUser();
  const recoveryKey = registrationRecoveryKey(user?.authId ?? user?.user_id ?? "anonymous");
  const [profileState, setProfileState] = useState<ProfileState>({ status: "loading" });
  const [profileAttempt, setProfileAttempt] = useState(0);
  // Null until the profile arrives, unless earlier answers were handed in.
  const [values, setValues] = useState<RegistrationValues | null>(initialValues);
  const [baseline, setBaseline] = useState<RegistrationValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<RegistrationFieldErrors>({});
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });
  const attempt = useRef<SubmissionAttempt | null>(null);
  const fieldRefs = useRef<Partial<Record<RegistrationField, HTMLTextAreaElement | null>>>({});
  const latest = useRef({ values, submit });
  const formId = useId();

  const registered = submit.status === "registered";
  const submitting = submit.status === "submitting";
  // Refusals that resubmitting cannot fix leave nothing to send.
  const closedOff = submit.status === "refused" && !submit.outcome.canRetry;
  const dirty = Boolean(values && baseline && !registered && (restored || hasUnsavedChanges(values, baseline)));

  // Pre-fill from the Attendee Profile; read again on every open so it is current.
  useEffect(() => {
    const controller = new AbortController();
    getMyAttendeeProfile(controller.signal)
      .then(({ profile }) => {
        if (controller.signal.aborted) return;
        const fromProfile = valuesFromProfile(profile);
        setProfileState({ status: "ready", profile });
        setBaseline(fromProfile);
        setValues((current) => current ?? fromProfile);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setProfileState({ status: "error", error: toApiError(error) });
      });
    return () => controller.abort();
  }, [profileAttempt]);

  useEffect(() => {
    latest.current = { values, submit };
    // After success there is nothing to keep for a later open.
    onValues(submit.status === "registered" ? null : values);
  });

  // The shared guard warns before page navigation, Back or reload with unsaved answers.
  useEffect(() => {
    guard.setBlocked(dirty);
    return () => guard.setBlocked(false);
  }, [dirty, guard]);

  // On session expiry, keep the answers so they survive sign-in (never submitted automatically).
  useEffect(() => {
    const preserve = () => {
      const current = latest.current;
      if (current.values && current.submit.status !== "registered") {
        try {
          sessionStorage.setItem(recoveryKey, JSON.stringify({ event: target, values: current.values, at: Date.now() }));
        } catch { /* storage unavailable: the answers cannot be kept */ }
      }
      guard.allowNavigation();
    };
    window.addEventListener(SESSION_EXPIRED, preserve);
    return () => window.removeEventListener(SESSION_EXPIRED, preserve);
  }, [guard, recoveryKey, target]);

  const update = (field: RegistrationField, value: string) => {
    setValues((current) => (current ? { ...current, [field]: value } : current));
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: validateRegistrationValues({ ...(values as RegistrationValues), [field]: value })[field] }));
    }
    if (submit.status === "invalid") setSubmit({ status: "idle" });
  };

  const focusFirstError = (errors: RegistrationFieldErrors) => {
    const first = REGISTRATION_FIELDS.find((field) => errors[field]);
    if (first) fieldRefs.current[first]?.focus();
  };

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!values || submitting || registered || closedOff) return;
    const errors = validateRegistrationValues(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setSubmit({ status: "invalid", message: "Correct the highlighted answers, then register again." });
      focusFirstError(errors);
      return;
    }
    const answers = toRegistrationAnswers(values);
    attempt.current = attemptFor(attempt.current, answers, () => crypto.randomUUID());
    setSubmit({ status: "submitting" });
    try {
      const { registration } = await registerForEvent(target.eventId, answers, attempt.current.key);
      // Success only now, from the backend's committed registration.
      guard.setBlocked(false);
      setSubmit({ status: "registered", confirmation: registration });
      announceNotificationsChanged();
      onSucceeded(registration);
    } catch (caught) {
      // The answers stay in the form in every failure case.
      const error = toApiError(caught);
      if (error.status === 400) {
        const backendErrors: RegistrationFieldErrors = {};
        for (const field of REGISTRATION_FIELDS) if (error.fields[field]) backendErrors[field] = error.fields[field];
        setFieldErrors(backendErrors);
        focusFirstError(backendErrors);
        setSubmit({
          status: "invalid",
          message: Object.keys(backendErrors).length ? "Correct the highlighted answers, then register again." : "Your registration could not be submitted. Close this form and try again.",
        });
        return;
      }
      if (error.status === 401) { setSubmit({ status: "session-ended" }); return; }
      if (error.status === 403) { setSubmit({ status: "forbidden" }); return; }
      const outcome = registrationOutcome(error);
      if (outcome.newKey) attempt.current = null;
      setSubmit({ status: "refused", outcome });
      if (outcome.refresh) onStale(target.eventId);
    }
  };

  if (registered) {
    return <RegisteredConfirmation confirmation={submit.confirmation} onDone={onDone} />;
  }

  return (
    <div className="grid gap-5">
      <p className="text-sm text-on-surface-variant">
        {formatEventDate(target.startDatetime, target.endDatetime)} · {formatEventTime(target.startDatetime, target.endDatetime)}
      </p>

      {restored ? (
        <AlertBanner tone="info" title="Your registration answers were restored">
          Review them, then select Register. Nothing has been submitted yet.
        </AlertBanner>
      ) : null}

      {profileState.status === "loading" ? (
        <div className="grid gap-3" role="status" aria-label="Loading your details">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : null}

      {profileState.status === "error" ? (
        <ProfileLoadError error={profileState.error} onRetry={() => { setProfileState({ status: "loading" }); setProfileAttempt((value) => value + 1); }} />
      ) : null}

      {profileState.status === "ready" && values ? (
        <>
          <section aria-labelledby={`${formId}-you`} className="grid gap-3">
            <SectionHeading
              id={`${formId}-you`}
              as="h3"
              title="Your details"
              description="From your ConnectSphere account."
              action={<PermissionPill tone="read-only">Read-only</PermissionPill>}
            />
            <KeyValuePanel
              rows={[
                { label: "Name", icon: "person", value: profileState.profile.name },
                { label: "Email", value: <span className="[overflow-wrap:anywhere]">{profileState.profile.email}</span> },
              ]}
            />
          </section>

          <form id={formId} noValidate onSubmit={send} aria-labelledby={`${formId}-answers`} className="grid gap-5">
            <SectionHeading
              id={`${formId}-answers`}
              as="h3"
              title="Registration details"
              description="Shared with the organiser for this event. Both are optional."
            />
            {REGISTRATION_FIELDS.map((field) => (
              <PreferenceField
                key={field}
                field={field}
                value={values[field]}
                error={fieldErrors[field]}
                hint={FIELD_HINTS[field]}
                readOnly={submitting || closedOff}
                inputRef={(element) => { fieldRefs.current[field] = element; }}
                onChange={(value) => update(field, value)}
              />
            ))}

            <SubmitFeedback submit={submit} />

            <div className="flex flex-col gap-2 border-t border-outline-variant/60 pt-4 sm:flex-row sm:items-center">
              {closedOff ? (
                <Button type="button" variant="secondary" onClick={onDone} className="w-full max-lg:min-h-11 sm:w-auto">Close</Button>
              ) : (
                <Button type="submit" disabled={submitting} className="w-full max-lg:min-h-11 sm:w-auto">
                  {submitting ? "Registering…" : submit.status === "refused" ? "Try again" : "Register"}
                </Button>
              )}
            </div>
          </form>
        </>
      ) : null}
    </div>
  );
}

function ProfileLoadError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  if (error.status === 401) return <AlertBanner tone="info" title="Your session has ended">Taking you to sign in…</AlertBanner>;
  if (error.status === 403) return <AlertBanner tone="error" title="Attendee access required">Only attendee accounts can register for events.</AlertBanner>;
  return (
    <AlertBanner tone="error" title="Could not load your details">
      {error.status === 0 && error.code === "NETWORK_ERROR" ? error.message : "Your details could not be loaded right now. Please try again."}
      <div className="mt-3">
        <Button variant="danger" onClick={onRetry} className="w-full max-lg:min-h-11 sm:w-auto">Try again</Button>
      </div>
    </AlertBanner>
  );
}

function SubmitFeedback({ submit }: { submit: SubmitState }) {
  switch (submit.status) {
    case "invalid":
      return <AlertBanner tone="error" title="Your registration was not submitted">{submit.message}</AlertBanner>;
    case "refused":
      return <AlertBanner tone={submit.outcome.tone} title={submit.outcome.title}>{submit.outcome.message}</AlertBanner>;
    case "session-ended":
      // apiRequest reports the 401 to AuthGate, which sends the attendee to sign in.
      return <AlertBanner tone="info" title="Your session has ended">You are not registered yet. Taking you to sign in; your answers will be kept.</AlertBanner>;
    case "forbidden":
      return <AlertBanner tone="error" title="Attendee access required">Only attendee accounts can register for events.</AlertBanner>;
    default:
      return null;
  }
}

// Shown only after the backend returned the committed registration (201).
function RegisteredConfirmation({ confirmation, onDone }: { confirmation: RegistrationConfirmation; onDone: () => void }) {
  const { event } = confirmation;
  return (
    <div className="grid gap-5">
      <AlertBanner tone="success" title="You're registered">
        Your registration for {event.title} is confirmed. A confirmation has been added to your notifications.
      </AlertBanner>
      <KeyValuePanel
        rows={[
          { label: "Event", value: event.title },
          { label: "Date", icon: "calendar", value: formatEventDate(event.startDatetime, event.endDatetime) },
          { label: "Time", icon: "schedule", value: formatEventTime(event.startDatetime, event.endDatetime) },
          { label: "Confirmation number", value: <span className="font-mono">{confirmation.confirmationNumber}</span> },
        ]}
      />
      <div className="flex border-t border-outline-variant/60 pt-4">
        <Button type="button" onClick={onDone} className="w-full max-lg:min-h-11 sm:w-auto">Done</Button>
      </div>
    </div>
  );
}
