"use client";

import { useEffect, useRef, useState } from "react";
import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import { Dialog } from "@/components/shared/dialog";
import { Icon } from "@/components/shared/icon";
import type { ClarificationMessage, ClarificationRound, EventView } from "@/lib/api/event-workspace";
import { formatTimestamp } from "@/lib/datetime";
import { canCompleteClarification, canPostClarificationMessage, canRequestClarification } from "@/lib/permissions/event-workspace";
import { ClarificationCompleteControl } from "./clarification-complete-control";
import { ClarificationMessageComposer } from "./clarification-message-composer";
import { RequestClarificationDialog } from "./request-clarification-dialog";
import type { ClarificationsState } from "./use-event-clarifications";

const ROLE_LABELS: Record<string, string> = { COORDINATOR: "Coordinator", ORGANISER: "Organiser" };

function StatusBadge({ open }: { open: boolean }) {
  return open ? (
    <span className="shrink-0 rounded-pill bg-tertiary-fixed px-2 py-0.5 text-[11px] font-semibold text-on-tertiary-fixed">Open</span>
  ) : (
    <span className="shrink-0 rounded-pill bg-success-container/50 px-2 py-0.5 text-[11px] font-semibold text-on-success-container">Complete</span>
  );
}

function Message({ message }: { message: ClarificationMessage }) {
  const fromCoordinator = message.author.role === "COORDINATOR";
  const role = message.author.role ? ROLE_LABELS[message.author.role] ?? message.author.role : null;
  return (
    <li className={`rounded-control p-3 ${fromCoordinator ? "bg-primary-fixed/60" : "bg-surface-container-low"}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className={`text-sm font-semibold ${fromCoordinator ? "text-primary" : "text-on-surface"}`}>
          {message.author.name ?? role ?? "Unknown"}
          {role ? <span className="font-normal text-on-surface-variant"> ({role})</span> : null}
        </p>
        <time dateTime={message.createdAt} className="text-xs text-on-surface-variant">{formatTimestamp(message.createdAt)}</time>
      </header>
      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-on-surface [overflow-wrap:anywhere]">{message.body}</p>
    </li>
  );
}

// Older rows without copied messages still show the question.
const messagesOf = (round: ClarificationRound): ClarificationMessage[] =>
  round.messages.length
    ? round.messages
    : [{ messageId: 0, body: round.message, createdAt: round.requestedAt, author: { userId: round.requestedBy.userId, name: round.requestedBy.name, role: "COORDINATOR" } }];

interface ThreadActions {
  event: EventView;
  onRoundUpdated: (round: ClarificationRound) => void;
  onCompleted: (event: EventView, message: string) => void;
  onEventReplaced: (event: EventView) => void;
  onAccessChanged: () => void;
}

// One request's messages in the shared Dialog, oldest first. The owner and the
// assigned coordinator reply while it is open; only the coordinator marks it
// complete, from the tick in the header. Everyone else reads.
function ThreadDialog({ round, open, onClose, actions }: { round: ClarificationRound | null; open: boolean; onClose: () => void; actions: ThreadActions }) {
  const { event } = actions;
  const [confirming, setConfirming] = useState(false);
  const completedHere = useRef(false);
  const list = useRef<HTMLOListElement>(null);
  const completedNote = useRef<HTMLParagraphElement>(null);
  const isOpen = round?.status === "OPEN";
  const canPost = isOpen && canPostClarificationMessage(event.permissions);
  const canComplete = isOpen && canCompleteClarification(event.permissions);
  const confirmId = `event-${event.eventId}-clarification-${round?.round ?? 0}-complete`;
  const messageCount = round?.messages.length ?? 0;
  const status = round?.status;

  // Like a chat, the newest message is in view on opening and after a reply.
  useEffect(() => {
    if (open) list.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [open, messageCount]);

  // The header tick and the reply box go once the request is complete, so focus moves to the outcome.
  useEffect(() => {
    if (completedHere.current && status && status !== "OPEN") {
      completedHere.current = false;
      completedNote.current?.focus();
    }
  }, [status]);

  const close = () => {
    setConfirming(false);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={round ? `Request ${round.round}` : "Clarification request"}
      badge={round ? <StatusBadge open={isOpen} /> : null}
      actions={
        canComplete ? (
          <Button variant="secondary" aria-expanded={confirming} aria-controls={confirmId} onClick={() => setConfirming((value) => !value)}>
            <Icon name="check" size={16} /><span className="sr-only sm:not-sr-only">Mark complete</span>
          </Button>
        ) : null
      }
      footer={
        round && (canPost || canComplete) ? (
          <div className="grid w-full gap-3">
            {canComplete ? (
              <ClarificationCompleteControl
                id={confirmId}
                event={event}
                round={round.round}
                confirming={confirming}
                onCancel={() => setConfirming(false)}
                onCompleted={(updated, message, done) => {
                  completedHere.current = true;
                  setConfirming(false);
                  if (done) actions.onRoundUpdated(done);
                  actions.onCompleted(updated, message);
                }}
                onEventReplaced={actions.onEventReplaced}
                onAccessChanged={actions.onAccessChanged}
              />
            ) : null}
            {canPost ? (
              <ClarificationMessageComposer
                key={round.clarificationId}
                eventId={event.eventId}
                round={round.round}
                placeholder={event.viewerRelationship === "ASSIGNED_COORDINATOR" ? "Reply to the organiser." : "Reply to your coordinator."}
                onSent={(updated) => { if (updated) actions.onRoundUpdated(updated); }}
                onAccessChanged={actions.onAccessChanged}
              />
            ) : null}
          </div>
        ) : undefined
      }
    >
      {round ? (
        <div className="grid gap-3">
          <ol ref={list} className="grid gap-2" aria-label="Messages, oldest first">
            {messagesOf(round).map((message) => <Message key={message.messageId} message={message} />)}
          </ol>
          {!isOpen && round.completedAt ? (
            <p ref={completedNote} tabIndex={-1} className="rounded-control text-xs text-on-surface-variant">
              Marked complete{round.completedBy?.name ? ` by ${round.completedBy.name}` : ""} on <time dateTime={round.completedAt}>{formatTimestamp(round.completedAt)}</time>.
            </p>
          ) : null}
          {isOpen && !canPost ? (
            <p className="text-xs text-on-surface-variant">Only the organiser who made the request and the assigned coordinator can reply.</p>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

interface ClarificationPanelProps extends ThreadActions {
  state: ClarificationsState;
  onRetry: () => void;
  // Opening a request marks it read.
  onThreadOpened: (round: ClarificationRound) => void;
  // Given on the coordinator's view, where Request Clarification sits at the top of the list.
  onRequested?: (event: EventView) => void;
}

// SPM-41: every clarification request for one event as a list, newest first,
// in the look of the review frame's message card (Figma 50:3296). Selecting a
// request opens its messages. Everyone who can see the event (owner,
// same-organisation organisers, assigned coordinator) sees exactly these
// messages; only the owner and the assigned coordinator write in the open
// request, and only the coordinator marks it complete. No internal notes.
export function ClarificationPanel({ state, onRetry, onThreadOpened, onRequested, ...actions }: ClarificationPanelProps) {
  const { event } = actions;
  const headingId = `event-${event.eventId}-clarifications`;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [viewing, setViewing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const requestButton = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const wasRequesting = useRef(false);
  const focusNewest = useRef(false);

  const rounds = state.status === "ready" ? [...state.rounds].sort((a, b) => b.round - a.round) : [];
  const selected = rounds.find((round) => round.clarificationId === selectedId) ?? null;
  const newestId = rounds[0]?.clarificationId;
  const canRequest = Boolean(onRequested) && canRequestClarification(event.permissions);

  // Back to Request Clarification when its dialog is cancelled.
  useEffect(() => {
    if (wasRequesting.current && !requesting && !focusNewest.current) requestButton.current?.focus();
    wasRequesting.current = requesting;
  }, [requesting]);

  // After a request is sent, focus its new row once the list has it.
  useEffect(() => {
    if (focusNewest.current && newestId !== undefined) {
      focusNewest.current = false;
      list.current?.querySelector("button")?.focus();
    }
  }, [newestId]);

  const openThread = (round: ClarificationRound) => {
    setSelectedId(round.clarificationId);
    setViewing(true);
    onThreadOpened(round);
  };

  return (
    <section aria-labelledby={headingId} className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name="forum" size={20} className="shrink-0 text-primary" />
          <h2 id={headingId} className="text-base font-semibold leading-tight text-on-surface sm:text-lg">Clarification requests</h2>
        </div>
        {rounds.length ? (
          <span className="rounded-control bg-primary-fixed px-2 py-1 text-xs font-semibold text-primary">
            {rounds.length} {rounds.length === 1 ? "request" : "requests"}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-on-surface-variant sm:text-sm">Newest first. Open a request to read its messages.</p>
      {canRequest ? (
        <Button ref={requestButton} variant="secondary" fullWidth className="mt-4" onClick={() => setRequesting(true)}>
          <Icon name="help" size={16} />Request Clarification
        </Button>
      ) : null}
      <div className="mt-4">
        {state.status === "loading" ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading clarification requests">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : state.status === "error" ? (
          <AlertBanner tone="error" title="Clarification requests unavailable">
            {state.message}
            <div className="mt-3"><Button variant="secondary" onClick={onRetry}><Icon name="refresh" size={16} />Try again</Button></div>
          </AlertBanner>
        ) : rounds.length === 0 ? (
          <p className="rounded-control bg-surface-container-low p-4 text-sm text-on-surface-variant">No clarification has been requested for this event.</p>
        ) : (
          <ol ref={list} className="grid max-h-[24rem] gap-2 overflow-y-auto" aria-label="Clarification requests, newest first">
            {rounds.map((round) => (
              <li key={round.clarificationId}>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => openThread(round)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-control bg-surface-container-low px-3 py-2.5 text-left text-sm font-semibold text-on-surface transition-colors duration-150 hover:bg-primary-fixed/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span>Request {round.round}</span>
                  <StatusBadge open={round.status === "OPEN"} />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="mt-4 text-xs text-on-surface-variant">Visible to the organiser, their organisation and the assigned coordinator.</p>

      {/* Stays mounted so closing returns focus to the row that opened it; keyed so each request starts fresh. */}
      <ThreadDialog key={selectedId ?? 0} round={selected} open={viewing && selected !== null} onClose={() => setViewing(false)} actions={actions} />

      {requesting && onRequested ? (
        <RequestClarificationDialog
          event={event}
          onClose={() => setRequesting(false)}
          onRequested={(updated) => {
            focusNewest.current = true;
            setRequesting(false);
            onRequested(updated);
          }}
          onEventReplaced={actions.onEventReplaced}
          onAccessChanged={actions.onAccessChanged}
        />
      ) : null}
    </section>
  );
}
