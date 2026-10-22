"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import { SectionHeading } from "@/components/shared/section-heading";
import { ApiError } from "@/lib/api";
import {
  getEventReadiness,
  parseEventView,
  runLifecycleAction,
  type EventReadiness,
  type EventView,
  type LifecycleAction,
  type ReadinessFailure,
} from "@/lib/api/event-workspace";
import { describeLifecycleRefusal, lifecycleActionsFor, showsReadiness } from "@/lib/lifecycle-actions";

interface LifecyclePanelProps {
  event: EventView;
  // The event after a successful action, or the latest version after a conflict.
  onEventChange: (event: EventView, message?: string) => void;
  onAccessChanged: () => void;
}

type ReadinessState =
  | { status: "loading" }
  | { status: "ready"; readiness: EventReadiness }
  | { status: "error"; message: string };

type Banner = { tone: "error" | "warning"; title: string; message: string; failures: ReadinessFailure[] };

function FailureList({ failures }: { failures: ReadinessFailure[] }) {
  if (!failures.length) return null;
  return (
    <ul className="mt-2 grid gap-1.5">
      {failures.map((failure) => (
        <li key={failure.code} className="flex gap-2 text-sm">
          <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
          <span>{failure.message}</span>
        </li>
      ))}
    </ul>
  );
}

// SPM-173: the assigned coordinator's next lifecycle step (submit for safety
// review, confirm, start preparation, complete) with the readiness checklist.
export function LifecyclePanel({ event, onEventChange, onAccessChanged }: LifecyclePanelProps) {
  const wantsReadiness = showsReadiness(event.status);
  const [readiness, setReadiness] = useState<ReadinessState>({ status: "loading" });
  const [readinessAttempt, setReadinessAttempt] = useState(0);
  const [running, setRunning] = useState<LifecycleAction | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  // A retry of the same action on the same version reuses its key, so it cannot apply twice.
  const pendingKey = useRef<{ key: string; attempt: string } | null>(null);

  // Reloaded whenever the event changes (its version moves on every save or action).
  useEffect(() => {
    if (!wantsReadiness) return;
    let alive = true;
    getEventReadiness(event.eventId)
      .then((result) => {
        if (alive) setReadiness({ status: "ready", readiness: result });
      })
      .catch((caught: unknown) => {
        if (alive) {
          setReadiness({
            status: "error",
            message: caught instanceof ApiError ? caught.message : "Readiness could not be loaded. Try again.",
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [event.eventId, event.version, wantsReadiness, readinessAttempt]);

  const reloadReadiness = useCallback(() => {
    setReadiness({ status: "loading" });
    setReadinessAttempt((value) => value + 1);
  }, []);

  const ready = wantsReadiness && readiness.status === "ready" ? readiness.readiness.ready : null;
  const options = lifecycleActionsFor(event.status, event.endDatetime, ready).map((option) => {
    if (wantsReadiness && readiness.status !== "ready") {
      return { ...option, disabledReason: "Load the readiness checklist before continuing." };
    }
    return option;
  });
  if (!options.length) return null;

  const run = async (action: LifecycleAction) => {
    const attempt = `${action}:${event.version}`;
    const current = pendingKey.current?.attempt === attempt ? pendingKey.current : { key: crypto.randomUUID(), attempt };
    pendingKey.current = current;
    setRunning(action);
    setBanner(null);
    try {
      const result = await runLifecycleAction(event.eventId, action, event.version, current.key);
      pendingKey.current = null;
      onEventChange(result.event, result.message);
    } catch (caught) {
      handleError(caught);
    } finally {
      setRunning(null);
    }
  };

  const handleError = (caught: unknown) => {
    if (!(caught instanceof ApiError)) {
      setBanner({ tone: "error", title: "Action not completed", message: "Something went wrong. Try again.", failures: [] });
      return;
    }
    if (caught.code === "IDEMPOTENCY_IN_PROGRESS") {
      setBanner({ tone: "warning", title: "Still processing", message: "Your previous request is still being processed. Wait a moment, then try again.", failures: [] });
      return;
    }
    pendingKey.current = null;
    if (caught.code === "EVENT_NOT_FOUND") {
      setBanner({ tone: "error", title: "Event no longer available", message: "You can no longer open this event. It may have been reassigned.", failures: [] });
      onAccessChanged();
      return;
    }
    const refusal = describeLifecycleRefusal(caught);
    if (caught.code === "EVENT_VERSION_CONFLICT") {
      const latest = parseEventView(caught.details.event);
      if (latest) onEventChange(latest);
    }
    if (caught.code === "TRANSITION_NOT_ALLOWED") onAccessChanged();
    if (caught.code === "READINESS_BLOCKED") reloadReadiness();
    setBanner({
      tone: caught.status === 409 ? "warning" : "error",
      title: "Action not completed",
      message: refusal.message,
      failures: refusal.failures,
    });
  };

  return (
    <section aria-labelledby="lifecycle-heading" className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
      <SectionHeading id="lifecycle-heading" title="Next step" description="Move the event forward when it is ready." />

      {wantsReadiness ? (
        <div className="mt-4" aria-live="polite">
          {readiness.status === "loading" ? (
            <Skeleton className="h-16" />
          ) : readiness.status === "error" ? (
            <AlertBanner tone="error" title="Readiness unavailable" live={false}>
              {readiness.message}{" "}
              <button type="button" className="font-semibold underline" onClick={reloadReadiness}>Retry</button>
            </AlertBanner>
          ) : readiness.readiness.ready ? (
            <AlertBanner tone="success" title="Ready" live={false}>
              Venue bookings, technical arrangements and registration settings are in order.
            </AlertBanner>
          ) : (
            <AlertBanner tone="warning" title="Not ready yet" live={false}>
              <FailureList failures={readiness.readiness.failures} />
            </AlertBanner>
          )}
          {event.status === "SAFETY_REVIEW" ? (
            <p className="mt-3 text-sm text-on-surface-variant">
              Confirmation also needs a Safety Officer&apos;s approval for the current arrangements.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {options.map((option) => (
          <div key={option.action} className="grid gap-1">
            <Button
              fullWidth
              variant={option.action === "complete" ? "secondary" : "primary"}
              disabled={Boolean(option.disabledReason) || running !== null}
              onClick={() => void run(option.action)}
            >
              {running === option.action ? "Working…" : option.label}
            </Button>
            {option.disabledReason ? <p className="text-xs text-on-surface-variant">{option.disabledReason}</p> : null}
          </div>
        ))}
      </div>

      <div className="mt-4" aria-live="polite" role="status">
        {banner ? (
          <AlertBanner tone={banner.tone} title={banner.title} live={false}>
            {banner.message}
            <FailureList failures={banner.failures} />
          </AlertBanner>
        ) : null}
      </div>
    </section>
  );
}
