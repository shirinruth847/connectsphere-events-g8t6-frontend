"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { PermissionPill } from "@/components/shared/permission-pill";
import { SectionHeading } from "@/components/shared/section-heading";
import { ApiError } from "@/lib/api";
import { getEventSafetyReviews, type SafetyOutcome, type SafetyRound } from "@/lib/api/safety-reviews";
import { formatTimestamp } from "@/lib/datetime";
import {
  FACTOR_DETAILS,
  FACTOR_RESULT_LABELS,
  roundStatusPresentation,
  SAFETY_FACTORS,
  TONE_CLASSES,
} from "@/lib/safety-review";

// A safety review round's status, coloured by its design-system category.
export function RoundStatusChip({ status }: { status: string }) {
  const presentation = roundStatusPresentation(status);
  return (
    <span className={`inline-flex w-fit items-center rounded-chip px-2 py-1 text-[11px] font-semibold uppercase tracking-label ${TONE_CLASSES[presentation.tone].chip}`}>
      {presentation.label}
    </span>
  );
}

const isFullRound = (round: SafetyOutcome | SafetyRound): round is SafetyRound => "reviewId" in round;

function TextBlock({ label, children, staffOnly = false }: { label: string; children: string; staffOnly?: boolean }) {
  return (
    <div className="grid gap-1">
      <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">
        {label}
        {staffOnly ? <PermissionPill tone="staff">Staff only</PermissionPill> : null}
      </p>
      <p className="whitespace-pre-line text-sm text-on-surface [overflow-wrap:anywhere]">{children}</p>
    </div>
  );
}

// One round. Full rounds (coordinator, Safety Officer) show the checklist,
// requested changes, rejected bookings and both comment fields; the organiser's
// shape carries only the outcome and the organiser-visible comment.
export function SafetyRoundCard({
  round,
  bookingLabel = (bookingId) => `Venue booking #${bookingId}`,
}: {
  round: SafetyOutcome | SafetyRound;
  bookingLabel?: (bookingId: number) => string;
}) {
  const presentation = roundStatusPresentation(round.status);
  const full = isFullRound(round) ? round : null;
  const checklist = full?.checklist ?? null;
  const rejected = round.rejectedBookings ?? [];
  return (
    <article
      aria-label={`Safety review round ${round.roundNumber}`}
      className={`grid gap-3 rounded-control border-t-4 ${TONE_CLASSES[presentation.tone].border} bg-surface-container-low p-3 sm:p-4`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-on-surface">Round {round.roundNumber}</p>
        <RoundStatusChip status={round.status} />
      </div>
      <p className="text-xs text-on-surface-variant">
        {presentation.description}
        {round.decidedAt ? <> Decided <time dateTime={round.decidedAt}>{formatTimestamp(round.decidedAt)}</time>.</> : null}
      </p>

      {full?.requestedChanges?.length ? (
        <div className="grid gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">Requested changes</p>
          <ol className="grid list-decimal gap-1 pl-5 text-sm text-on-surface">
            {full.requestedChanges.map((change, index) => <li key={index} className="[overflow-wrap:anywhere]">{change}</li>)}
          </ol>
        </div>
      ) : null}

      {rejected.length ? (
        <div className="grid gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">Rejected venue bookings</p>
          <ul className="grid gap-2">
            {rejected.map((item) => (
              <li key={item.bookingId} className="rounded-control bg-error-container p-2 text-sm text-on-error-container">
                <span className="font-semibold">{bookingLabel(item.bookingId)}</span>
                <span className="block [overflow-wrap:anywhere]">{item.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {round.organiserComment ? <TextBlock label="Comment for the organiser">{round.organiserComment}</TextBlock> : null}
      {full?.internalNotes ? <TextBlock label="Internal notes" staffOnly>{full.internalNotes}</TextBlock> : null}

      {checklist && Object.keys(checklist).length && round.status !== "OPEN" ? (
        <details className="group rounded-control bg-surface-container-lowest p-3">
          <summary className="cursor-pointer text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Checklist
          </summary>
          <dl className="mt-3 grid gap-2">
            {SAFETY_FACTORS.map((factor) => {
              const entry = checklist[factor];
              return (
                <div key={factor} className="grid gap-0.5">
                  <dt className="text-xs font-semibold text-on-surface">{FACTOR_DETAILS[factor].label}</dt>
                  <dd className="text-xs text-on-surface-variant">
                    {entry?.result ? FACTOR_RESULT_LABELS[entry.result] : "Not recorded"}
                    {entry?.comment ? ` · ${entry.comment}` : ""}
                  </dd>
                </div>
              );
            })}
          </dl>
        </details>
      ) : null}
    </article>
  );
}

export function SafetyRoundList({
  rounds,
  bookingLabel,
}: {
  rounds: Array<SafetyOutcome | SafetyRound>;
  bookingLabel?: (bookingId: number) => string;
}) {
  const ordered = [...rounds].sort((left, right) => left.roundNumber - right.roundNumber);
  return (
    <ol className="grid gap-3">
      {ordered.map((round) => <li key={round.roundNumber}><SafetyRoundCard round={round} bookingLabel={bookingLabel} /></li>)}
    </ol>
  );
}

type SectionState =
  | { status: "loading" }
  | { status: "ready"; rounds: Array<SafetyOutcome | SafetyRound> }
  | { status: "hidden" }
  | { status: "error"; message: string };

// SPM-251: the event page's "Safety review" section. The backend shapes the
// rounds for the caller (AC15); nothing renders before the first round exists.
export function SafetyReviewSection({ eventId, refreshKey = 0 }: { eventId: number; refreshKey?: number }) {
  const [state, setState] = useState<SectionState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    getEventSafetyReviews(eventId)
      .then(({ reviews }) => {
        if (alive) setState(reviews.length ? { status: "ready", rounds: reviews } : { status: "hidden" });
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        if (caught instanceof ApiError && (caught.status === 404 || caught.status === 403)) setState({ status: "hidden" });
        else setState({ status: "error", message: caught instanceof ApiError ? caught.message : "Safety reviews could not be loaded." });
      });
    return () => {
      alive = false;
    };
  }, [eventId, refreshKey, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  if (state.status === "hidden") return null;
  return (
    <section aria-labelledby="safety-review-heading" className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
      <SectionHeading id="safety-review-heading" title="Safety review" description="Every review round, oldest first." />
      <div className="mt-4">
        {state.status === "loading" ? (
          <Skeleton className="h-24" />
        ) : state.status === "error" ? (
          <AlertBanner tone="error" title="Safety reviews unavailable">
            {state.message}
            <div className="mt-3"><Button variant="secondary" onClick={retry}><Icon name="refresh" size={16} />Try again</Button></div>
          </AlertBanner>
        ) : (
          <SafetyRoundList rounds={state.rounds} />
        )}
      </div>
    </section>
  );
}
