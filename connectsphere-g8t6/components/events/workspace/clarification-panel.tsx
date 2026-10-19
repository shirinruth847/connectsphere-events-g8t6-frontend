"use client";

import type { ReactNode } from "react";
import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import type { ClarificationRound } from "@/lib/api/event-workspace";
import { formatTimestamp } from "@/lib/datetime";
import type { ClarificationsState } from "./use-event-clarifications";

function Message({ tone, author, role, at, children }: {
  tone: "question" | "response";
  author: string;
  role: string;
  at: string;
  children: ReactNode;
}) {
  return (
    <article className={`rounded-control p-3 ${tone === "question" ? "bg-primary-fixed/60" : "bg-surface-container-low"}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className={`text-sm font-semibold ${tone === "question" ? "text-primary" : "text-on-surface"}`}>
          {author} <span className="font-normal text-on-surface-variant">({role})</span>
        </p>
        <time dateTime={at} className="text-xs text-on-surface-variant">{formatTimestamp(at)}</time>
      </header>
      <div className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-on-surface [overflow-wrap:anywhere]">{children}</div>
    </article>
  );
}

function Round({ round }: { round: ClarificationRound }) {
  return (
    <li className="grid gap-2" aria-label={`Clarification request ${round.round}`}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">Request {round.round}</span>
        {round.status === "OPEN" ? (
          <span className="rounded-pill bg-tertiary-fixed px-2 py-0.5 text-[11px] font-semibold text-on-tertiary-fixed">Awaiting organiser</span>
        ) : (
          <span className="rounded-pill bg-success-container/50 px-2 py-0.5 text-[11px] font-semibold text-on-success-container">Answered</span>
        )}
      </div>
      <Message tone="question" author={round.requestedBy.name ?? "Coordinator"} role="Coordinator" at={round.requestedAt}>
        &ldquo;{round.message}&rdquo;
      </Message>
      {round.status === "RESPONDED" && round.respondedAt ? (
        <Message tone="response" author={round.respondedBy?.name ?? "Organiser"} role="Organiser" at={round.respondedAt}>
          {round.response ? (
            <>&ldquo;{round.response}&rdquo;</>
          ) : (
            <span className="text-on-surface-variant">Resubmitted with changes to the event details, without a written response.</span>
          )}
        </Message>
      ) : null}
    </li>
  );
}

// SPM-41: the clarification questions and responses for one event, in the look
// of the review frame's message card (Figma 50:3296). Questions and answers only:
// there is no free-text note box and no internal notes, because everyone who can
// see the event (owner, same-organisation organisers, assigned coordinator) sees
// exactly this list.
export function ClarificationPanel({ eventId, state, onRetry }: { eventId: number; state: ClarificationsState; onRetry: () => void }) {
  const headingId = `event-${eventId}-clarifications`;
  const count = state.status === "ready" ? state.rounds.length : null;

  return (
    <section aria-labelledby={headingId} className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name="forum" size={20} className="shrink-0 text-primary" />
          <h2 id={headingId} className="text-base font-semibold leading-tight text-on-surface sm:text-lg">Clarification requests</h2>
        </div>
        {count ? (
          <span className="rounded-control bg-primary-fixed px-2 py-1 text-xs font-semibold text-primary">
            {count} {count === 1 ? "request" : "requests"}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-on-surface-variant sm:text-sm">Questions from the coordinator and the organiser&apos;s responses.</p>
      <div className="mt-4">
        {state.status === "loading" ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading clarification requests">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : state.status === "error" ? (
          <AlertBanner tone="error" title="Clarification requests unavailable">
            {state.message}
            <div className="mt-3"><Button variant="secondary" onClick={onRetry}><Icon name="refresh" size={16} />Try again</Button></div>
          </AlertBanner>
        ) : state.rounds.length === 0 ? (
          <p className="rounded-control bg-surface-container-low p-4 text-sm text-on-surface-variant">No clarification has been requested for this event.</p>
        ) : (
          <ol className="grid max-h-[32rem] gap-5 overflow-y-auto pr-1">
            {state.rounds.map((round) => <Round key={round.clarificationId} round={round} />)}
          </ol>
        )}
      </div>
      <p className="mt-4 text-xs text-on-surface-variant">Visible to the organiser, their organisation and the assigned coordinator.</p>
    </section>
  );
}
