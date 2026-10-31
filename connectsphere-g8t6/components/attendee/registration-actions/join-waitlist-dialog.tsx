"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useSessionUser } from "@/components/auth/auth-gate";
import { toApiError } from "@/components/attendee/discovery/use-discovery-events";
import { PreferenceField } from "@/components/attendee/profile/attendee-profile";
import { fieldErrorsFromBackend, valuesFromProfile } from "@/components/attendee/profile/profile-form";
import {
  REGISTRATION_FIELDS,
  attemptFor,
  toRegistrationAnswers,
  validateRegistrationValues,
  waitlistRecoveryKey,
  type RegistrationField,
  type RegistrationFieldErrors,
  type RegistrationTarget,
  type RegistrationValues,
  type SubmissionAttempt,
} from "@/components/attendee/registration/registration-form";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, Skeleton, buttonClasses } from "@/components/shared/primitives";
import type { ApiError } from "@/lib/api";
import { getMyAttendeeProfile } from "@/lib/api/attendee-profile";
import { joinWaitlist, newIdempotencyKey, type RegistrationActionResult } from "@/lib/api/registration-actions";
import { ROUTES } from "@/lib/auth";
import { announceNotificationsChanged } from "@/lib/notifications";
import { SESSION_EXPIRED } from "@/lib/session";
import { actionErrorPresentation, placeLabel, type ActionErrorPresentation } from "./registration-action-rules";

const FIELD_HINT = "Optional. Filled in from your Attendee Profile; changes here apply to this event only.";
const FOOTER = "flex flex-wrap justify-end gap-2 border-t border-outline-variant/60 pt-4";

interface JoinWaitlistDialogProps {
  // The full event; null when the dialog is closed.
  target: RegistrationTarget | null;
  // Answers restored after a session expiry, instead of the profile.
  initialValues: RegistrationValues | null;
  restored: boolean;
  onClose: () => void;
  // The backend has added the attendee: reload their places.
  onJoined: (result: RegistrationActionResult) => void;
  // The backend refused because the event or place changed: reload them.
  onStale: (eventId: number) => void;
}

// Join Waitlist for a full event (SPM-163 AC1, AC2), opened from the Event
// Discovery card, the event details dialog or the /events/[eventId] page. It
// asks "This event is full. Join the waitlist?" with Join Waitlist and Not
// Now, and the SPM-134 answers. The position shown afterwards is the
// backend's; nothing is sent until the attendee confirms.
export function JoinWaitlistDialog({ target, initialValues, restored, onClose, onJoined, onStale }: JoinWaitlistDialogProps) {
  const [joined, setJoined] = useState<RegistrationActionResult | null>(null);
  const result = joined && target && joined.event.eventId === target.eventId ? joined : null;
  const [pending, setPending] = useState(false);
  const close = () => {
    if (pending) return;
    setJoined(null);
    onClose();
  };

  return (
    <Dialog open={target !== null} onClose={close} title={!target ? "Join waitlist" : result ? "You're on the waitlist" : "This event is full. Join the waitlist?"}>
      {target && result ? (
        <div className="flex flex-col gap-4">
          <AlertBanner tone="success" title={placeLabel({ status: result.status, waitlistPosition: result.waitlistPosition })}>
            You&apos;re on the waitlist for <strong>{target.title}</strong>. You&apos;ll be notified if a spot opens.
          </AlertBanner>
          <div className={FOOTER}>
            <Link href={`${ROUTES.registrations}?eventId=${target.eventId}`} className={`${buttonClasses("secondary")} max-lg:min-h-11 max-sm:w-full`}>
              View in My Events
            </Link>
            <Button type="button" onClick={close} className="max-lg:min-h-11 max-sm:w-full">
              Done
            </Button>
          </div>
        </div>
      ) : target ? (
        <JoinWaitlistContent
          key={target.eventId}
          target={target}
          initialValues={initialValues}
          restored={restored}
          onPending={setPending}
          onJoined={(joinedResult) => {
            setJoined(joinedResult);
            onJoined(joinedResult);
          }}
          onStale={onStale}
          onClose={close}
        />
      ) : null}
    </Dialog>
  );
}

type ProfileState = { status: "loading" } | { status: "ready" } | { status: "error"; error: ApiError };

function JoinWaitlistContent({
  target,
  initialValues,
  restored,
  onPending,
  onJoined,
  onStale,
  onClose,
}: {
  target: RegistrationTarget;
  initialValues: RegistrationValues | null;
  restored: boolean;
  onPending: (pending: boolean) => void;
  onJoined: (result: RegistrationActionResult) => void;
  onStale: (eventId: number) => void;
  onClose: () => void;
}) {
  const formId = useId();
  const user = useSessionUser();
  const recoveryKey = waitlistRecoveryKey(user?.authId ?? user?.user_id ?? "anonymous");
  // One key per set of answers, as SPM-134: a retry of the same answers is
  // replayed by the backend; changed answers are a new request.
  const submission = useRef<SubmissionAttempt | null>(null);
  const [profile, setProfile] = useState<ProfileState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  // Null until the profile arrives, unless restored answers were handed in.
  const [values, setValues] = useState<RegistrationValues | null>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<RegistrationFieldErrors>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ActionErrorPresentation | null>(null);
  const fields = useRef<Partial<Record<RegistrationField, HTMLTextAreaElement | null>>>({});
  const latest = useRef(values);

  // The answers start from the attendee's profile, with SPM-134's registration
  // fields and rules; edits here apply to this event only.
  useEffect(() => {
    const controller = new AbortController();
    getMyAttendeeProfile(controller.signal)
      .then(({ profile: saved }) => {
        if (controller.signal.aborted) return;
        setValues((current) => current ?? valuesFromProfile(saved));
        setProfile({ status: "ready" });
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setProfile({ status: "error", error: toApiError(caught) });
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    latest.current = values;
  });

  // On session expiry, keep the answers so they survive sign-in, as SPM-134's
  // form does. They are reopened for the attendee to confirm, never sent.
  useEffect(() => {
    const preserve = () => {
      if (!latest.current) return;
      try {
        sessionStorage.setItem(recoveryKey, JSON.stringify({ event: target, values: latest.current, at: Date.now() }));
      } catch { /* storage unavailable: the answers cannot be kept */ }
    };
    window.addEventListener(SESSION_EXPIRED, preserve);
    return () => window.removeEventListener(SESSION_EXPIRED, preserve);
  }, [recoveryKey, target]);

  const submit = async () => {
    if (!values || pending) return;
    const errors = validateRegistrationValues(values);
    setFieldErrors(errors);
    const invalid = REGISTRATION_FIELDS.find((field) => errors[field]);
    if (invalid) {
      fields.current[invalid]?.focus();
      return;
    }
    const answers = toRegistrationAnswers(values);
    submission.current = attemptFor(submission.current, answers, newIdempotencyKey);
    setPending(true);
    onPending(true);
    setError(null);
    try {
      const joined = await joinWaitlist(target.eventId, answers, submission.current.key);
      announceNotificationsChanged();
      onPending(false);
      onJoined(joined);
    } catch (caught) {
      const apiError = toApiError(caught);
      const presentation = actionErrorPresentation(apiError);
      setFieldErrors(fieldErrorsFromBackend(apiError.fields));
      setError(presentation);
      setPending(false);
      onPending(false);
      if (apiError.status === 409 && !presentation.retryable) onStale(target.eventId);
    }
  };

  const stale = error !== null && !error.retryable;
  return (
    <form
      id={formId}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4 text-sm leading-relaxed text-on-surface-variant"
    >
      <p className="max-w-[70ch] [overflow-wrap:anywhere]">
        <strong className="text-on-surface">{target.title}</strong> has no places left. Join its waitlist and you&apos;ll be offered a
        place if one opens up, in the order people joined. Joining doesn&apos;t register you yet.
      </p>
      {restored ? (
        <AlertBanner tone="info" title="Your waitlist answers were restored">
          Review them, then select Join Waitlist. Nothing has been sent yet.
        </AlertBanner>
      ) : null}
      {profile.status === "loading" && !values ? (
        <div className="flex flex-col gap-3" role="status" aria-label="Loading your saved preferences">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : profile.status === "error" && !values ? (
        <AlertBanner tone="error" title="Could not load your saved preferences">
          {profile.error.status === 0 ? profile.error.message : "Try again to continue joining the waitlist."}
          <div className="mt-3">
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setProfile({ status: "loading" });
                setAttempt((value) => value + 1);
              }}
              className="max-lg:min-h-11"
            >
              Try again
            </Button>
          </div>
        </AlertBanner>
      ) : values ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="sr-only">Your answers for this event</legend>
          {REGISTRATION_FIELDS.map((field) => (
            <PreferenceField
              key={field}
              field={field}
              value={values[field]}
              error={fieldErrors[field]}
              hint={FIELD_HINT}
              readOnly={pending || stale}
              inputRef={(element) => {
                fields.current[field] = element;
              }}
              onChange={(value) => setValues((current) => (current ? { ...current, [field]: value } : current))}
            />
          ))}
        </fieldset>
      ) : null}
      {error ? (
        <AlertBanner tone="error" title={stale ? "You couldn't join the waitlist" : "Not sent"}>
          {error.message}
        </AlertBanner>
      ) : null}
      <div className={FOOTER}>
        {stale ? (
          <Button type="button" variant="secondary" onClick={onClose} className="max-lg:min-h-11 max-sm:w-full">
            Close
          </Button>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending} className="max-lg:min-h-11 max-sm:w-full">
              Not Now
            </Button>
            <Button type="submit" variant="tertiary" disabled={pending || !values} className="max-lg:min-h-11 max-sm:w-full">
              {pending ? "Joining…" : error ? "Try again: Join Waitlist" : "Join Waitlist"}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
