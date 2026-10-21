"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSessionUser } from "@/components/auth/auth-gate";
import { EventHistoryPanel } from "@/components/events/workspace/event-history-panel";
import { RoundStatusChip, SafetyRoundCard, SafetyRoundList } from "@/components/events/workspace/safety-review-section";
import { Dialog } from "@/components/shared/dialog";
import { Icon } from "@/components/shared/icon";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { useNavigationGuard } from "@/components/shared/navigation-guard";
import { PermissionPill } from "@/components/shared/permission-pill";
import { AlertBanner, Button, buttonClasses, EmptyState, fieldClasses, PageHeader, Skeleton, StatusChip } from "@/components/shared/primitives";
import { SectionHeading } from "@/components/shared/section-heading";
import { ApiError } from "@/lib/api";
import type { EventView } from "@/lib/api/event-workspace";
import {
  claimSafetyReview,
  decideSafetyReview,
  handBackSafetyReview,
  saveSafetyProgress,
  type SafetyPanel,
} from "@/lib/api/safety-reviews";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import {
  completedFactorCount,
  DECISION_LABELS,
  DECISION_STEP,
  describeSafetyError,
  FACTOR_DETAILS,
  factorField,
  factorStep,
  firstErrorStep,
  formFromRound,
  officerRoundState,
  REVIEW_STEPS,
  SAFETY_FACTORS,
  SAFETY_LIMITS,
  SAFETY_MESSAGES,
  toDecisionPayload,
  toProgressPayload,
  unsatisfactoryFactors,
  validateChecklist,
  validateDecision,
  type ChecklistEntry,
  type DecisionForm,
  type FieldErrors,
  type OfficerRoundState,
  type SafetyChecklist,
  type SafetyFactor,
} from "@/lib/safety-review";
import { DecisionFormFields } from "./decision-form";
import { FactorFieldset, FactorResultChip } from "./factor-fieldset";
import { AccessEvidence, AttendanceEvidence, bookingTitle, VenueEvidence } from "./review-evidence";
import { ReviewSteps, type ReviewStepItem } from "./review-steps";
import { useSafetyReview } from "./use-safety-review";

type Banner = { tone: "success" | "warning" | "error" | "info"; title: string; message: string };

const DECISION_RESULTS: Record<string, string> = {
  APPROVED: "Approved. The coordinator has been told they can confirm the event; it is not confirmed until they do.",
  CHANGES_REQUESTED: "Changes requested. The event returned to planning and the coordinator has been notified.",
  REJECTED: "Venue bookings rejected. The event returned to planning, nothing was released, and the coordinator and venue staff have been notified.",
};

const ACCESS_PILLS: Record<OfficerRoundState, { tone: "edit" | "read-only"; label: string }> = {
  "claimed-by-me": { tone: "edit", label: "Claimed by you" },
  "awaiting-claim": { tone: "read-only", label: "Awaiting claim · read-only" },
  "claimed-by-other": { tone: "read-only", label: "Claimed by another officer · read-only" },
  decided: { tone: "read-only", label: "Decided · read-only" },
  closed: { tone: "read-only", label: "Superseded · read-only" },
};

function stepItems(checklist: SafetyChecklist, readOnly: boolean): ReviewStepItem[] {
  const assessed = completedFactorCount(checklist);
  return REVIEW_STEPS.map((step, index) => {
    if (step.factors.length) {
      const done = completedFactorCount(checklist, step.factors);
      return { title: step.title, status: `${done} of ${step.factors.length} assessed`, complete: done === step.factors.length };
    }
    if (index === DECISION_STEP) {
      if (readOnly) return { title: step.title, status: "Read-only", complete: false };
      return {
        title: step.title,
        status: assessed === SAFETY_FACTORS.length ? "Ready to decide" : `${assessed} of ${SAFETY_FACTORS.length} assessed`,
        complete: false,
      };
    }
    return { title: step.title, status: "Reference", complete: false };
  });
}

function AsideCard({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-4 rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
      <SectionHeading id={id} title={title} />
      {children}
    </section>
  );
}

interface WorkspaceProps {
  event: EventView;
  panel: SafetyPanel;
  officerId: number;
  refreshing: boolean;
  step: number;
  onStep: (step: number) => void;
  banner: Banner | null;
  onBanner: (banner: Banner | null) => void;
  onRefresh: () => void;
  onEventChanged: () => void;
}

// One round's review. Remounted (keyed) when the round changes hands or closes,
// so its form starts again from what the backend has saved.
function ReviewWorkspace({ event, panel, officerId, refreshing, step, onStep, banner, onBanner, onRefresh, onEventChanged }: WorkspaceProps) {
  const review = panel.review;
  const roundState = officerRoundState(review, officerId);
  const canEdit = roundState === "claimed-by-me";
  const [initial] = useState(() => formFromRound(review));
  const [checklist, setChecklist] = useState<SafetyChecklist>(initial.checklist);
  const [form, setForm] = useState<DecisionForm>(initial.form);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(toProgressPayload(initial.checklist, initial.form)));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState<"claim" | "save" | "hand-back" | "decide" | null>(null);
  const [handBackOpen, setHandBackOpen] = useState(false);
  const [handBackNote, setHandBackNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  // A retry of the same decision reuses its key, so it cannot apply twice.
  const pendingKey = useRef<{ key: string; payload: string } | null>(null);
  const { setBlocked, allowNavigation } = useNavigationGuard();
  // Moving between steps moves focus to the new step's heading (not on first render).
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    stepHeading.current?.focus();
  }, [step]);

  const dirty = canEdit && JSON.stringify(toProgressPayload(checklist, form)) !== savedSnapshot;
  useEffect(() => {
    setBlocked(dirty);
    return () => setBlocked(false);
  }, [dirty, setBlocked]);

  const unsatisfactory = unsatisfactoryFactors(checklist);
  const approveBlockedReason = unsatisfactory.length
    ? `Not possible while ${unsatisfactory.map((factor) => FACTOR_DETAILS[factor].label.toLowerCase()).join(", ")} ${unsatisfactory.length === 1 ? "is" : "are"} not satisfactory.`
    : null;
  const decisionBlockedReason = !panel.venueDetailsAvailable
    ? "Venue safety details could not be loaded. Retry on the Venues & layout step before deciding."
    : null;
  const assessed = completedFactorCount(checklist);
  const bookingLabel = (bookingId: number) => {
    const booking = panel.bookings.find((item) => item.bookingId === bookingId);
    return booking ? bookingTitle(booking) : `Venue booking #${bookingId}`;
  };

  const changeFactor = (factor: SafetyFactor, entry: ChecklistEntry) => {
    setChecklist((current) => ({ ...current, [factor]: entry }));
    setErrors((current) => {
      if (!current[factorField(factor)] && !current.outcome) return current;
      const next = { ...current };
      delete next[factorField(factor)];
      delete next.outcome;
      return next;
    });
  };

  const changeForm = (next: DecisionForm) => {
    setForm(next);
    setErrors((current) => {
      const kept: FieldErrors = {};
      for (const [field, message] of Object.entries(current)) if (field.startsWith("checklist.")) kept[field] = message;
      return kept;
    });
  };

  const showRefusal = (caught: unknown) => {
    const refusal = describeSafetyError(caught instanceof ApiError ? caught : { code: "UNKNOWN" });
    if (Object.keys(refusal.fields).length) {
      setErrors(refusal.fields);
      const target = firstErrorStep(refusal.fields);
      if (target !== null) onStep(target);
    }
    onBanner({ tone: refusal.tone, title: refusal.title, message: refusal.message });
    // Re-read the review only: the round may have left the officer's scope, and
    // re-reading the event would then replace this explanation with a 404.
    if (refusal.reload) {
      allowNavigation();
      onRefresh();
    }
  };

  const claim = async () => {
    setBusy("claim");
    onBanner(null);
    try {
      await claimSafetyReview(review.reviewId);
      onBanner({ tone: "success", title: "Review claimed", message: "Work through the steps, save your progress as you go, then record a decision." });
      setHistoryKey((value) => value + 1);
      onRefresh();
    } catch (caught) {
      showRefusal(caught);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const found = validateChecklist(checklist, { complete: false });
    if (Object.keys(found).length) {
      setErrors(found);
      onStep(firstErrorStep(found) ?? step);
      onBanner({ tone: "error", title: "Check the highlighted fields", message: "Nothing was saved." });
      return;
    }
    setBusy("save");
    onBanner(null);
    const payload = toProgressPayload(checklist, form);
    try {
      await saveSafetyProgress(review.reviewId, payload);
      setSavedSnapshot(JSON.stringify(payload));
      setSavedAt(new Date().toISOString());
      setErrors({});
      onBanner({ tone: "success", title: "Progress saved", message: "Your checklist and draft decision are saved on this round." });
    } catch (caught) {
      showRefusal(caught);
    } finally {
      setBusy(null);
    }
  };

  const handBack = async () => {
    if (handBackNote.trim().length > SAFETY_LIMITS.handBackNote) return;
    setBusy("hand-back");
    try {
      await handBackSafetyReview(review.reviewId, handBackNote);
      setHandBackOpen(false);
      allowNavigation();
      onBanner({ tone: "success", title: "Review handed back", message: "It is back under Awaiting review for any Safety Officer, and your saved progress was cleared." });
      onRefresh();
    } catch (caught) {
      setHandBackOpen(false);
      showRefusal(caught);
    } finally {
      setBusy(null);
    }
  };

  const openDecision = () => {
    const found = validateDecision(form, checklist);
    if (Object.keys(found).length) {
      setErrors(found);
      onStep(firstErrorStep(found) ?? DECISION_STEP);
      onBanner({ tone: "error", title: "Check the highlighted fields", message: "The decision was not recorded." });
      return;
    }
    setErrors({});
    setConfirmOpen(true);
  };

  const decide = async () => {
    const payload = toDecisionPayload(form, checklist, panel.event.arrangementVersion);
    const serialised = JSON.stringify(payload);
    const current = pendingKey.current?.payload === serialised ? pendingKey.current : { key: crypto.randomUUID(), payload: serialised };
    pendingKey.current = current;
    setBusy("decide");
    onBanner(null);
    try {
      await decideSafetyReview(review.reviewId, payload, current.key);
      pendingKey.current = null;
      setConfirmOpen(false);
      allowNavigation();
      onBanner({ tone: "success", title: "Safety decision recorded", message: DECISION_RESULTS[payload.outcome] });
      onStep(DECISION_STEP);
      onRefresh();
      onEventChanged();
    } catch (caught) {
      setConfirmOpen(false);
      showRefusal(caught);
    } finally {
      setBusy(null);
    }
  };

  const currentStep = REVIEW_STEPS[step];
  const factors = currentStep.factors;
  const previousRounds = panel.rounds.filter((round) => round.reviewId !== review.reviewId);

  let stepBody: ReactNode;
  if (currentStep.id === "attendance") stepBody = <AttendanceEvidence panel={panel} />;
  else if (currentStep.id === "venues") stepBody = <VenueEvidence panel={panel} onRetry={onRefresh} />;
  else if (currentStep.id === "access") stepBody = <AccessEvidence panel={panel} />;
  else if (currentStep.id === "history") {
    stepBody = (
      <div className="grid gap-5">
        <div className="grid gap-3">
          <h3 className="text-sm font-semibold text-on-surface">Previous rounds</h3>
          {previousRounds.length ? (
            <SafetyRoundList rounds={previousRounds} bookingLabel={bookingLabel} />
          ) : (
            <p className="text-sm text-on-surface-variant">This is the event&apos;s first safety review round.</p>
          )}
        </div>
        <EventHistoryPanel event={event} refreshKey={historyKey} />
      </div>
    );
  } else {
    stepBody = (
      <div className="grid gap-5">
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold text-on-surface">Checklist</h3>
          <ul className="grid gap-2">
            {SAFETY_FACTORS.map((factor) => (
              <li key={factor} className={`flex flex-wrap items-center justify-between gap-2 rounded-control p-3 ${errors[factorField(factor)] ? "bg-error-container/40" : "bg-surface-container-low"}`}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface">{FACTOR_DETAILS[factor].label}</p>
                  {checklist[factor]?.comment ? <p className="line-clamp-2 text-xs text-on-surface-variant">{checklist[factor]?.comment}</p> : null}
                  {errors[factorField(factor)] ? <p className="text-xs font-semibold text-error">{errors[factorField(factor)]}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <FactorResultChip result={checklist[factor]?.result} />
                  <Button variant="quiet" className="min-h-11" onClick={() => onStep(factorStep(factor))}>
                    {canEdit ? "Edit" : "View"}<span className="sr-only"> {FACTOR_DETAILS[factor].label}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        {canEdit ? (
          <>
            {decisionBlockedReason ? <AlertBanner tone="warning" title="Decision unavailable">{decisionBlockedReason}</AlertBanner> : null}
            <DecisionFormFields form={form} errors={errors} bookings={panel.bookings} approveBlockedReason={approveBlockedReason} onChange={changeForm} />
          </>
        ) : roundState === "awaiting-claim" ? (
          <AlertBanner tone="info" title="Claim this review to decide it">Only the Safety Officer who claims a round can assess and decide it.</AlertBanner>
        ) : (
          <SafetyRoundCard round={review} bookingLabel={bookingLabel} />
        )}
      </div>
    );
  }

  const pill = ACCESS_PILLS[roundState];
  const savedLabel = !canEdit ? null : dirty ? "Unsaved changes" : savedAt ? `Saved ${formatTimestamp(savedAt)}` : "No unsaved changes";

  return (
    <div className="grid gap-5 pb-2" aria-busy={refreshing || undefined}>
      <Link href="/dashboard" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <Icon name="arrow-back" size={16} />Back to dashboard
      </Link>

      <PageHeader
        eyebrow={`Safety review · Round ${review.roundNumber}`}
        title={panel.event.title || "Untitled event"}
        description={`${panel.event.requestId} · ${formatEventWindow(panel.event.startDatetime, panel.event.endDatetime)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={event.status} />
            <RoundStatusChip status={review.status} />
            <PermissionPill tone={pill.tone}>{pill.label}</PermissionPill>
          </div>
        }
      />

      <div aria-live="polite" role="status">
        {banner ? <AlertBanner tone={banner.tone} title={banner.title} live={false}>{banner.message}</AlertBanner> : null}
      </div>
      {roundState === "decided" ? (
        <AlertBanner tone="info" title="This round is decided" live={false}>
          It was decided {formatTimestamp(review.decidedAt)} and can no longer be changed. Every round is kept in the event&apos;s safety history.
        </AlertBanner>
      ) : roundState === "closed" ? (
        <AlertBanner tone="info" title="This round was superseded" live={false}>
          The event&apos;s arrangements changed, so this round closed without a decision and the event returned to planning.
        </AlertBanner>
      ) : null}

      <ReviewSteps steps={stepItems(checklist, !canEdit)} current={step} onSelect={onStep} />

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_332px]">
        <section aria-labelledby="review-step-heading" className="min-w-0 overflow-hidden rounded-panel bg-surface-container-lowest shadow-elevation-1">
          <header className="bg-surface-container-low px-5 py-5 sm:px-7">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-label text-primary">Step {step + 1} of {REVIEW_STEPS.length}</p>
            <h2 id="review-step-heading" ref={stepHeading} tabIndex={-1} className="scroll-mt-24 text-xl font-semibold leading-tight text-on-surface focus:outline-none">
              {currentStep.title}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">{currentStep.description}</p>
          </header>
          <div className="grid gap-6 px-5 py-5 sm:px-7 sm:py-6">
            {stepBody}
            {factors.length ? (
              <div className="grid gap-3">
                <SectionHeading
                  as="h3"
                  title="Assess"
                  description={canEdit ? "A comment is required unless the result is satisfactory." : roundState === "awaiting-claim" ? "Claim the review to assess these factors." : undefined}
                  action={canEdit ? <PermissionPill tone="edit">Editable</PermissionPill> : <PermissionPill tone="read-only">Read-only</PermissionPill>}
                />
                {factors.map((factor) => (
                  <FactorFieldset
                    key={factor}
                    factor={factor}
                    entry={checklist[factor]}
                    error={errors[factorField(factor)]}
                    readOnly={!canEdit}
                    onChange={(entry) => changeFactor(factor, entry)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="grid min-w-0 gap-5" aria-label="Review status and checklist">
          <AsideCard id="review-status-heading" title="Review status">
            <KeyValuePanel
              rows={[
                { icon: "shield", label: "Round", value: `Round ${review.roundNumber}` },
                { icon: "person", label: "Claimed by", value: review.claimedBy === null ? "Unclaimed" : review.claimedBy === officerId ? "You" : "Another Safety Officer" },
                ...(review.claimedAt ? [{ icon: "schedule" as const, label: "Claimed", value: formatTimestamp(review.claimedAt) }] : []),
                { icon: "history", label: "Submitted", value: formatTimestamp(review.submittedAt) },
              ]}
            />
            {roundState === "awaiting-claim" ? (
              <Button fullWidth disabled={busy !== null} onClick={() => void claim()}>
                <Icon name="shield" size={16} />{busy === "claim" ? "Claiming…" : "Claim this review"}
              </Button>
            ) : null}
            {canEdit ? (
              <Button fullWidth variant="secondary" disabled={busy !== null} onClick={() => setHandBackOpen(true)}>
                <Icon name="arrow-back" size={16} />Hand back to the queue
              </Button>
            ) : null}
          </AsideCard>

          <AsideCard id="checklist-progress-heading" title="Checklist">
            <p className="-mt-2 text-xs text-on-surface-variant">{assessed} of {SAFETY_FACTORS.length} factors assessed</p>
            <ul className="grid gap-1.5">
              {SAFETY_FACTORS.map((factor) => (
                <li key={factor}>
                  <button
                    type="button"
                    onClick={() => onStep(factorStep(factor))}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-control px-2 text-left text-sm text-on-surface transition-colors duration-150 hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    <span className="min-w-0 font-semibold">{FACTOR_DETAILS[factor].label}</span>
                    <FactorResultChip result={checklist[factor]?.result} />
                  </button>
                </li>
              ))}
            </ul>
          </AsideCard>

          <section aria-labelledby="review-guidance-heading" className="rounded-panel bg-surface-container p-5">
            <h2 id="review-guidance-heading" className="flex items-center gap-2 text-sm font-bold text-primary">
              <Icon name="info" size={16} />What to check
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{currentStep.guidance}</p>
          </section>
        </aside>
      </div>

      <section aria-label="Review actions" className="sticky bottom-0 z-10 -mx-4 border-t border-outline-variant bg-surface-container-lowest/95 px-4 py-3 backdrop-blur sm:-mx-7 sm:px-7 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-on-surface">{assessed} of {SAFETY_FACTORS.length} factors assessed</p>
            {savedLabel ? <p className={`text-xs ${dirty ? "font-semibold text-tertiary" : "text-on-surface-variant"}`}>{savedLabel}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <Button variant="secondary" disabled={busy !== null || !dirty} onClick={() => void save()}>
                {busy === "save" ? "Saving…" : "Save progress"}
              </Button>
            ) : null}
            {roundState === "awaiting-claim" ? (
              <Button disabled={busy !== null} onClick={() => void claim()}>{busy === "claim" ? "Claiming…" : "Claim"}</Button>
            ) : null}
            <Button variant="secondary" disabled={step === 0} onClick={() => onStep(step - 1)}>Back</Button>
            {step < DECISION_STEP ? (
              <Button onClick={() => onStep(step + 1)}>Next<Icon name="arrow-forward" size={16} /></Button>
            ) : canEdit ? (
              <Button disabled={busy !== null || decisionBlockedReason !== null} onClick={openDecision} title={decisionBlockedReason ?? undefined}>
                Record decision
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <Dialog
        open={confirmOpen}
        onClose={() => (busy === "decide" ? undefined : setConfirmOpen(false))}
        title="Record this decision?"
        badge={form.outcome ? <span className="rounded-chip bg-primary-fixed px-2 py-1 text-[11px] font-semibold uppercase tracking-label text-primary">{DECISION_LABELS[form.outcome].label}</span> : null}
        footer={
          <>
            <Button variant="secondary" disabled={busy === "decide"} onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant={form.outcome === "APPROVED" ? "primary" : "danger"} disabled={busy === "decide"} onClick={() => void decide()}>
              {busy === "decide" ? "Recording…" : "Record decision"}
            </Button>
          </>
        }
      >
        {form.outcome ? (
          <div className="grid gap-3 text-sm text-on-surface">
            <p>{DECISION_LABELS[form.outcome].description}</p>
            {form.outcome === "CHANGES_REQUESTED" ? (
              <p>{form.requestedChanges.filter((change) => change.trim()).length} requested change(s) will be shown to the coordinator.</p>
            ) : null}
            {form.outcome === "REJECTED" ? (
              <ul className="grid list-disc gap-1 pl-5">
                {Object.keys(form.rejectedBookings).map((bookingId) => <li key={bookingId}>{bookingLabel(Number(bookingId))}</li>)}
              </ul>
            ) : null}
            <p className="text-on-surface-variant">
              {form.organiserComment.trim() ? "Your comment will be shown to the organiser." : "No comment will be shown to the organiser."}
            </p>
            <p className="flex items-start gap-2 rounded-control bg-tertiary-fixed p-3 text-xs font-semibold text-on-tertiary-fixed">
              <Icon name="lock" size={16} />A decision cannot be changed once recorded.
            </p>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={handBackOpen}
        onClose={() => (busy === "hand-back" ? undefined : setHandBackOpen(false))}
        title="Hand this review back?"
        footer={
          <>
            <Button variant="secondary" disabled={busy === "hand-back"} onClick={() => setHandBackOpen(false)}>Keep reviewing</Button>
            <Button variant="danger" disabled={busy === "hand-back" || handBackNote.trim().length > SAFETY_LIMITS.handBackNote} onClick={() => void handBack()}>
              {busy === "hand-back" ? "Handing back…" : "Hand back"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <p className="text-sm text-on-surface">
            The review returns to Awaiting review for any Safety Officer. Your saved checklist and draft decision are cleared.
          </p>
          <div>
            <label htmlFor="hand-back-note" className="mb-1.5 block text-xs font-semibold text-on-surface">
              Note <span className="font-normal text-on-surface-variant">(optional, staff only)</span>
            </label>
            <textarea
              id="hand-back-note"
              rows={3}
              maxLength={SAFETY_LIMITS.handBackNote}
              value={handBackNote}
              onChange={(change) => setHandBackNote(change.target.value)}
              aria-describedby="hand-back-note-count"
              className={`${fieldClasses} resize-y`}
            />
            <p id="hand-back-note-count" className="mt-1 text-xs text-on-surface-variant">
              {handBackNote.length} / {SAFETY_LIMITS.handBackNote} characters
              {handBackNote.trim().length > SAFETY_LIMITS.handBackNote ? ` · ${SAFETY_MESSAGES.note}` : ""}
            </p>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

// SPM-252: the Safety Officer's view of /events/[eventId]. The round shown is
// the newest one in the officer's scope; out-of-scope events answer "not found".
export function SafetyReviewView({ event, onEventChanged }: { event: EventView; onEventChanged: () => void }) {
  const user = useSessionUser();
  const officerId = user?.user_id ?? 0;
  const { state, reload, refresh } = useSafetyReview(event.eventId, officerId);
  const [chosenStep, setChosenStep] = useState<number | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);

  if (state.status === "loading") {
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Loading safety review">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_332px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }
  if (state.status === "not-found") {
    return (
      <div className="grid gap-4">
        <div aria-live="polite" role="status">
          {banner ? <AlertBanner tone={banner.tone} title={banner.title} live={false}>{banner.message}</AlertBanner> : null}
        </div>
        <EmptyState
          title="Safety review not available"
          description="This event has no safety review round you can open. It may have been claimed by another Safety Officer."
          action={<Link href="/dashboard" className={buttonClasses("secondary")}><Icon name="arrow-back" size={16} />Back to dashboard</Link>}
        />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <AlertBanner tone="error" title="Could not load the safety review">
        {state.message}
        <div className="mt-3"><Button variant="secondary" onClick={reload}><Icon name="refresh" size={16} />Try again</Button></div>
      </AlertBanner>
    );
  }

  const { panel } = state;
  const review = panel.review;
  const decided = review.status !== "OPEN";
  const step = chosenStep ?? (decided ? DECISION_STEP : 0);
  return (
    <ReviewWorkspace
      key={`${review.reviewId}:${review.status}:${review.claimedBy ?? "none"}`}
      event={event}
      panel={panel}
      officerId={officerId}
      refreshing={state.refreshing}
      step={step}
      onStep={setChosenStep}
      banner={banner}
      onBanner={setBanner}
      onRefresh={refresh}
      onEventChanged={onEventChanged}
    />
  );
}
