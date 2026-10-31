"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import { Dialog } from "@/components/shared/dialog";
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
import { describeLifecycleRefusal, keepsIdempotencyKey, lifecycleActionsFor, showsReadiness } from "@/lib/lifecycle-actions";

interface LifecyclePanelProps {
  event: EventView;
  // The event after a successful action, or the latest version after a conflict.
  onEventChange: (event: EventView, message?: string) => void;
  onAccessChanged: () => void;
  approvalBlockedReason?: string | null;
  // Changes when arrangements change without a new event version, e.g. venue
  // bookings requested (SPM-179 moves arrangement_version only), so readiness reloads.
  refreshKey?: number;
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
export function LifecyclePanel({ event, onEventChange, onAccessChanged, approvalBlockedReason = null, refreshKey = 0 }: LifecyclePanelProps) {
  // The stored status, never one inferred from a label: without it no action is offered.
  const status = event.status ?? "";
  // SPM-39 requires a location preference before approval for planning.
  // The backend repeats this check under the event lock; bookings come later.
  const approvalBlock = approvalBlockedReason ?? (
    event.venuePreferences.length === 0
      ? "A venue preference is required before approving this request."
      : null
  );
  const wantsReadiness = showsReadiness(status);
  const [readiness, setReadiness] = useState<ReadinessState>({ status: "loading" });
  const [readinessAttempt, setReadinessAttempt] = useState(0);
  const [confirmApproval, setConfirmApproval] = useState(false);
  const inFlight = useRef(false);
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
  }, [event.eventId, event.version, wantsReadiness, readinessAttempt, refreshKey]);

  const reloadReadiness = useCallback(() => {
    setReadiness({ status: "loading" });
    setReadinessAttempt((value) => value + 1);
  }, []);

  const ready = wantsReadiness && readiness.status === "ready" ? readiness.readiness.ready : null;
  const options = lifecycleActionsFor(status, event.endDatetime, ready).map((option) =>
    option.action === "acceptFeasibility" && approvalBlock
      ? { ...option, disabledReason: option.disabledReason ?? approvalBlock }
      : option,
  );
  if (!options.length) return null;

  const run = async (action: LifecycleAction) => {
    if (action === "acceptFeasibility" && approvalBlock) return;
    if (inFlight.current) return;
    inFlight.current = true;
    setConfirmApproval(false);
    const attempt = `${action}:${event.version}`;
    // Persist only the command key, scoped to the trusted assignment and event version.
    // This survives a lost response, page reload or automatic session expiry.
    const recoverySlot = `connectsphere:recovery:spm39:${event.coordinatorId}:${event.eventId}:${event.version}`;
    let savedKey: string | null = null;
    if (action === "acceptFeasibility") {
      try { savedKey = sessionStorage.getItem(recoverySlot); } catch { /* Memory retry still works. */ }
    }
    const current = pendingKey.current?.attempt === attempt ? pendingKey.current : { key: savedKey && /^[0-9a-f-]{36}$/.test(savedKey) ? savedKey : crypto.randomUUID(), attempt };
    if (action === "acceptFeasibility") {
      try { sessionStorage.setItem(recoverySlot, current.key); } catch { /* Storage may be unavailable. */ }
    }
    pendingKey.current = current;
    setRunning(action);
    setBanner(null);
    try {
      const result = await runLifecycleAction(event.eventId, action, event.version, current.key);
      pendingKey.current = null;
      if (action === "acceptFeasibility") {
        try { sessionStorage.removeItem(recoverySlot); } catch { /* Storage may be unavailable. */ }
      }
      onEventChange(result.event, result.message);
    } catch (caught) {
      if (action === "acceptFeasibility" && !keepsIdempotencyKey(caught instanceof ApiError ? caught : null) && !(caught instanceof ApiError && caught.status === 401)) {
        try { sessionStorage.removeItem(recoverySlot); } catch { /* Storage may be unavailable. */ }
      }
      handleError(caught);
    } finally {
      inFlight.current = false;
      setRunning(null);
    }
  };

  const handleError = (caught: unknown) => {
    // An ambiguous failure keeps the key, so a retry is replayed if the action was applied.
    if (!keepsIdempotencyKey(caught instanceof ApiError ? caught : null)) pendingKey.current = null;
    if (!(caught instanceof ApiError)) {
      setBanner({ tone: "error", title: "Action not completed", message: "Something went wrong. Try again.", failures: [] });
      return;
    }
    if (caught.code === "IDEMPOTENCY_IN_PROGRESS") {
      setBanner({ tone: "warning", title: "Still processing", message: "Your previous request is still being processed. Wait a moment, then try again.", failures: [] });
      return;
    }
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
      failures: caught.code === "FEASIBILITY_REQUIREMENTS_MISSING" ? Object.entries(caught.fields).map(([code, message]) => ({ code, message })) : refusal.failures,
    });
  };

  return (
    <section aria-labelledby="lifecycle-heading" className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
      <SectionHeading id="lifecycle-heading" title="Next step" description="Move the event forward when it is ready." />

      {status === "REJECTED" || status === "CANCELLED" ? (
        <AlertBanner tone="warning" title="Request cannot be approved">This event request is {status.toLowerCase()}. Its status will remain unchanged.</AlertBanner>
      ) : null}
      <Dialog open={confirmApproval} onClose={() => setConfirmApproval(false)} title="Approve event request?" footer={<>
        <Button variant="secondary" onClick={() => setConfirmApproval(false)}>Keep reviewing</Button>
        <Button onClick={() => void run("acceptFeasibility")} disabled={running !== null || Boolean(approvalBlock)}>Confirm approval</Button>
      </>}>
        <p>Approve “{event.title}” for planning? The backend will check the mandatory requirements. This moves the request to Planning and notifies the organiser; it does not confirm the event or book resources.</p>
      </Dialog>
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
          {status === "SAFETY_REVIEW" ? (
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
              onClick={() => option.action === "acceptFeasibility" ? setConfirmApproval(true) : void run(option.action)}
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
