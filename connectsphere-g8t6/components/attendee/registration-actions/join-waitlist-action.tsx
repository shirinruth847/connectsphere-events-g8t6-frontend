"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { toApiError } from "@/components/attendee/discovery/use-discovery-events";
import {
  PROFILE_FIELDS,
  fieldErrorsFromBackend,
  validateProfileValues,
  valuesFromProfile,
  type ProfileField,
  type ProfileFieldErrors,
  type ProfileValues,
} from "@/components/attendee/profile/profile-form";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, FormLabel, Skeleton, buttonClasses, fieldClasses } from "@/components/shared/primitives";
import type { ApiError } from "@/lib/api";
import { getMyAttendeeProfile } from "@/lib/api/attendee-profile";
import { joinWaitlist, newIdempotencyKey, type RegistrationActionResult } from "@/lib/api/registration-actions";
import { ROUTES } from "@/lib/auth";
import { actionErrorPresentation, placeLabel, type ActionErrorPresentation } from "./registration-action-rules";

const FIELD_LABELS: Record<ProfileField, string> = {
  dietaryRestrictions: "Dietary restrictions",
  accessibilityRequirements: "Accessibility requirements",
};

// Join Waitlist for a full event (SPM-163 AC1, AC2). The button opens "This
// event is full. Join the waitlist?" with Accept and Decline. Once the backend
// has added the attendee, the button is replaced by their position, so a
// second join is never offered from the same view.
export function JoinWaitlistAction({ eventId, title }: { eventId: number; title: string }) {
  const [open, setOpen] = useState(false);
  const [joined, setJoined] = useState<RegistrationActionResult | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLParagraphElement>(null);

  // Focus goes back to the button, or to the position that replaced it.
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => (joined ? status.current : button.current)?.focus());
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
  const [key] = useState(newIdempotencyKey);
  const [profile, setProfile] = useState<ProfileState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [values, setValues] = useState<ProfileValues>({ dietaryRestrictions: "", accessibilityRequirements: "" });
  const [fieldErrors, setFieldErrors] = useState<ProfileFieldErrors>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ActionErrorPresentation | null>(null);
  const [result, setResult] = useState<RegistrationActionResult | null>(null);
  const firstField = useRef<HTMLTextAreaElement>(null);

  // The answers start from the attendee's profile, as SPM-134's registration
  // form does; edits here apply to this event only.
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
    const errors = validateProfileValues(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      firstField.current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      const joined = await joinWaitlist(
        eventId,
        {
          dietaryRestrictions: values.dietaryRestrictions.trim() ? values.dietaryRestrictions : null,
          accessibilityRequirements: values.accessibilityRequirements.trim() ? values.accessibilityRequirements : null,
        },
        key,
      );
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
          <fieldset className="flex flex-col gap-4" disabled={pending || stale}>
            <legend className="mb-1 text-xs text-on-surface-variant">
              From your attendee profile. Changes here apply to this event only and don&apos;t update your profile.
            </legend>
            {PROFILE_FIELDS.map((field, index) => {
              const inputId = `${formId}-${field}`;
              const errorId = `${inputId}-error`;
              return (
                <div key={field}>
                  <FormLabel htmlFor={inputId}>{FIELD_LABELS[field]} (optional)</FormLabel>
                  <textarea
                    ref={index === 0 ? firstField : undefined}
                    id={inputId}
                    rows={2}
                    value={values[field]}
                    onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))}
                    aria-invalid={fieldErrors[field] ? true : undefined}
                    aria-describedby={fieldErrors[field] ? errorId : undefined}
                    className={`${fieldClasses} bg-surface-container-low focus:bg-surface-container-lowest ${fieldErrors[field] ? "border-error" : ""}`}
                    placeholder="None"
                  />
                  {fieldErrors[field] ? (
                    <p id={errorId} className="mt-1 text-xs text-error">
                      {fieldErrors[field]}
                    </p>
                  ) : null}
                </div>
              );
            })}
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
