"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionUser } from "@/components/auth/auth-gate";
import { ApiError } from "@/lib/api";
import type { AttendeeRegistration } from "@/lib/api/my-events";
import { listMyPlaces, type RegistrationConfirmation } from "@/lib/api/registrations";
import { RegistrationDialog } from "./registration-dialog";
import {
  parseRegistrationRecovery,
  registrationRecoveryKey,
  type RegistrationTarget,
  type RegistrationValues,
} from "./registration-form";

const toApiError = (error: unknown) =>
  error instanceof ApiError ? error : new ApiError("The request could not be completed.", 0);

// The attendee's active places (GET /api/registrations/mine), the source of
// their registered state on Event Discovery and Event Details. Null until
// loaded; a refresh keeps the last result on screen while it runs.
export function useMyPlaces() {
  const [places, setPlaces] = useState<ReadonlyMap<number, AttendeeRegistration> | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listMyPlaces(controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setPlaces(loaded);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(toApiError(caught));
      });
    return () => controller.abort();
  }, [attempt]);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  // Records a place the backend has just committed (its 201 response), before
  // the refetch returns, so Register Now goes at once.
  const recordRegistered = useCallback((confirmation: RegistrationConfirmation) => {
    setPlaces((current) => {
      const next = new Map(current ?? []);
      next.set(confirmation.event.eventId, { status: confirmation.status, registeredAt: confirmation.registeredAt, waitlistPosition: null, offer: null });
      return next;
    });
  }, []);

  return { places, error, refresh, recordRegistered };
}

// Opens the one registration form (SPM-134) from any entry point on a page and
// keeps it in step with the page:
// - answers typed and then closed are kept for that event until it succeeds;
// - answers kept across a session expiry are reopened once places are known;
// - after success or a refusal the event and the places are read again.
export function useRegistration({
  onEventChanged,
  focusFallback,
}: {
  // Re-read one event's availability after the backend registered or refused.
  onEventChanged: (eventId: number) => void;
  // Where focus goes on close when the Register Now that opened it is gone.
  focusFallback: () => HTMLElement | null;
}) {
  const user = useSessionUser();
  const myPlaces = useMyPlaces();
  const { places, refresh, recordRegistered } = myPlaces;
  const [target, setTarget] = useState<RegistrationTarget | null>(null);
  const [initialValues, setInitialValues] = useState<RegistrationValues | null>(null);
  const [restored, setRestored] = useState(false);
  const drafts = useRef(new Map<number, RegistrationValues>());
  const trigger = useRef<HTMLElement | null>(null);
  const recoveryChecked = useRef(false);
  const recoveryKey = registrationRecoveryKey(user?.authId ?? user?.user_id ?? "anonymous");

  const open = useCallback((next: RegistrationTarget, opener: HTMLElement | null) => {
    trigger.current = opener;
    setInitialValues(drafts.current.get(next.eventId) ?? null);
    setRestored(false);
    setTarget(next);
  }, []);

  // Reopen answers kept from an expired session, once, when places are known.
  // They are never submitted automatically; a place already held drops them.
  useEffect(() => {
    if (recoveryChecked.current || places === null) return;
    recoveryChecked.current = true;
    let recovery = null;
    try {
      recovery = parseRegistrationRecovery(sessionStorage.getItem(recoveryKey), Date.now());
      sessionStorage.removeItem(recoveryKey);
    } catch { /* storage unavailable */ }
    if (!recovery || places.has(recovery.event.eventId)) return;
    trigger.current = null;
    setInitialValues(recovery.values);
    setRestored(true);
    setTarget(recovery.event);
  }, [places, recoveryKey]);

  const close = (values: RegistrationValues | null) => {
    if (target) {
      if (values) drafts.current.set(target.eventId, values);
      else drafts.current.delete(target.eventId);
    }
    setTarget(null);
    // The shared Dialog returns focus to its opener; if that button has gone
    // (the attendee is now registered), focus a stable place instead.
    const opener = trigger.current;
    window.setTimeout(() => {
      if (!opener?.isConnected || document.activeElement === document.body) focusFallback()?.focus();
    }, 0);
  };

  const registered = (confirmation: RegistrationConfirmation) => {
    drafts.current.delete(confirmation.event.eventId);
    recordRegistered(confirmation);
    refresh();
    onEventChanged(confirmation.event.eventId);
  };

  const stale = (eventId: number) => {
    refresh();
    onEventChanged(eventId);
  };

  const dialog = (
    <RegistrationDialog
      target={target}
      initialValues={initialValues}
      restored={restored}
      onClose={close}
      onRegistered={registered}
      onStale={stale}
    />
  );

  return { ...myPlaces, open, dialog };
}
