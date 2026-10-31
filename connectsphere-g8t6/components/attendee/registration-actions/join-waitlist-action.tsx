"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { toApiError } from "@/components/attendee/discovery/use-discovery-events";
import { PreferenceField } from "@/components/attendee/profile/attendee-profile";
import { fieldErrorsFromBackend, valuesFromProfile } from "@/components/attendee/profile/profile-form";
import {
  REGISTRATION_FIELDS,
  attemptFor,
  toRegistrationAnswers,
  validateRegistrationValues,
  type RegistrationField,
  type RegistrationFieldErrors,
  type RegistrationValues,
  type SubmissionAttempt,
} from "@/components/attendee/registration/registration-form";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, Skeleton, buttonClasses } from "@/components/shared/primitives";
import type { ApiError } from "@/lib/api";
import { getMyAttendeeProfile } from "@/lib/api/attendee-profile";
import { joinWaitlist, newIdempotencyKey, type RegistrationActionResult } from "@/lib/api/registration-actions";
import { ROUTES } from "@/lib/auth";
import { actionErrorPresentation, placeLabel, type ActionErrorPresentation } from "./registration-action-rules";

const FIELD_HINT = "Optional. Filled in from your Attendee Profile; changes here apply to this event only.";

// Join Waitlist for a full event (SPM-163 AC1, AC2). The button opens "This
// event is full. Join the waitlist?" with Accept and Decline. Once the backend
// has added the attendee, the button is replaced by their position, so a
// second join is never offered from the same view; onJoined runs when the
// confirmation closes, so the surface can reload the attendee's places.
export function JoinWaitlistAction({ eventId, title, onJoined }: { eventId: number; title: string; onJoined?: () => void }) {
  const [open, setOpen] = useState(false);
  const [joined, setJoined] = useState<RegistrationActionResult | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLParagraphElement>(null);

  // Focus goes back to the button, or to the position that replaced it.
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => (joined ? status.current : button.current)?.focus());
    if (joined) onJoined?.();
  };

  return (
    <>
      {joined ? (
        <p ref={status} tabIndex={-1} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-tertiary focus:outline-none">
          {placeLabel({ status: joined.status, waitlistPosition: joined.waitlistPosition })}
          <Link href={`${ROUTES.registrations}?eventId=${eventId}`} className="text-primary underline underline-offset-2">
            View in My Events
          </Link>
        </p>
      ) : (
        <Button ref={button} type="button" variant="tertiary" onClick={() => setOpen(true)} className="w-full max-lg:min-h-11 sm:w-auto">
          Join Waitlist
        </Button>
      )}
      {open ? <JoinWaitlistDialog eventId={eventId} title={title} onClose={close} onJoined={setJoined} /> : null}
    </>
  );
}

type ProfileState = { status: "loading" } | { status: "ready" } | { status: "error"; error: ApiError };

function JoinWaitlistDialog({
  eventId,
  title,
  onClose,
  onJoined,
}: {
  eventId: number;
  title: string;
  onClose: () => void;
  onJoined: (result: RegistrationActionResult) => void;
}) {
  const formId = useId();
  // One key per set of answers, as SPM-134: a retry of the same answers is
  // replayed by the backend; changed answers are a new request.
  const submission = useRef<SubmissionAttempt | null>(null);
  const [profile, setProfile] = useState<ProfileState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [values, setValues] = useState<RegistrationValues>({ dietaryRestrictions: "", accessibilityRequirements: "" });
  const [fieldErrors, setFieldErrors] = useState<RegistrationFieldErrors>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ActionErrorPresentation | null>(null);
  const [result, setResult] = useState<RegistrationActionResult | null>(null);
  const fields = useRef<Partial<Record<RegistrationField, HTMLTextAreaElement | null>>>({});

  // The answers start from the attendee's profile, with SPM-134's registration
  // fields and rules; edits here apply to this event only.
  useEffect(() => {
    const controller = new AbortController();
    getMyAttendeeProfile(controller.signal)
      .then(({ profile: saved }) => {
        if (controller.signal.aborted) return;
        setValues(valuesFromProfile(saved));
        setProfile({ status: "ready" });
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setProfile({ status: "error", error: toApiError(caught) });
      });
    return () => controller.abort();
  }, [attempt]);

  const submit = async () => {
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
    setError(null);
    try {
      const joined = await joinWaitlist(eventId, answers, submission.current.key);
      setResult(joined);
      onJoined(joined);
    } catch (caught) {
      const apiError = toApiError(caught);
      setFieldErrors(fieldErrorsFromBackend(apiError.fields));
      setError(actionErrorPresentation(apiError));
    } finally {
      setPending(false);
    }
  };

  const close = () => {
    if (!pending) onClose();
  };

  if (result) {
    return (
      <Dialog
        open
        onClose={close}
        title="You're on the waitlist"
        footer={
          <>
            <Link href={`${ROUTES.registrations}?eventId=${eventId}`} className={`${buttonClasses("secondary")} max-lg:min-h-11 max-sm:w-full`}>
              View in My Events
            </Link>
            <Button type="button" onClick={close} className="max-lg:min-h-11 max-sm:w-full">
              Done
            </Button>
          </>
        }
      >
        <AlertBanner tone="success" title={placeLabel({ status: result.status, waitlistPosition: result.waitlistPosition })}>
          You&apos;re on the waitlist for <strong>{title}</strong>. You&apos;ll be notified if a spot opens.
        </AlertBanner>
      </Dialog>
    );
  }

  const stale = error !== null && !error.retryable;
  return (
    <Dialog
      open
      onClose={close}
      title="This event is full. Join the waitlist?"
      footer={
        stale ? (
          <Button type="button" variant="secondary" onClick={close} className="max-lg:min-h-11 max-sm:w-full">
            Close
          </Button>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={close} disabled={pending} className="max-lg:min-h-11 max-sm:w-full">
              Decline
            </Button>
            <Button
              type="submit"
              form={formId}
              variant="tertiary"
              disabled={pending || profile.status !== "ready"}
              className="max-lg:min-h-11 max-sm:w-full"
            >
              {pending ? "Joining…" : error ? "Try again: Accept" : "Accept"}
            </Button>
          </>
        )
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-4 text-sm leading-relaxed text-on-surface-variant"
      >
        <p className="max-w-[70ch]">
          <strong className="text-on-surface">{title}</strong> has no places left. Join its waitlist and you&apos;ll be offered a
          place if one opens up, in the order people joined. Joining doesn&apos;t register you yet.
        </p>
        {profile.status === "loading" ? (
          <div className="flex flex-col gap-3" role="status" aria-label="Loading your saved preferences">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : profile.status === "error" ? (
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
        ) : (
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
                onChange={(value) => setValues((current) => ({ ...current, [field]: value }))}
              />
            ))}
          </fieldset>
        )}
        {error ? (
          <AlertBanner tone="error" title={stale ? "You couldn't join the waitlist" : "Not sent"}>
            {error.message}
          </AlertBanner>
        ) : null}
      </form>
    </Dialog>
  );
}
