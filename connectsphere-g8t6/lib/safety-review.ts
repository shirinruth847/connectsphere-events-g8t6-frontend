// SPM-243: Safety Officer review rules the browser needs for instant feedback:
// the six checklist factors, the five review steps, decision checks and
// payloads, which round the officer is looking at, and error wording.
// Presentation only: the backend rechecks every rule under the round lock.

export const SAFETY_FACTORS = [
  "attendanceCapacity",
  "layout",
  "emergencyAccess",
  "accessibility",
  "equipmentPlacement",
  "venueRestrictions",
] as const;
export type SafetyFactor = (typeof SAFETY_FACTORS)[number];

export const FACTOR_RESULTS = ["SATISFACTORY", "NOT_SATISFACTORY", "NOT_APPLICABLE"] as const;
export type FactorResult = (typeof FACTOR_RESULTS)[number];

export const DECISION_OUTCOMES = ["APPROVED", "CHANGES_REQUESTED", "REJECTED"] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

export type RoundStatus = "OPEN" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | "SUPERSEDED";

export interface ChecklistEntry {
  result: FactorResult | null;
  comment: string | null;
}
export type SafetyChecklist = Partial<Record<SafetyFactor, ChecklistEntry>>;

// Backend validators/safetyValidator.js LIMITS.
export const SAFETY_LIMITS = {
  factorComment: 1000,
  organiserComment: 2000,
  internalNotes: 4000,
  handBackNote: 500,
  requestedChange: 500,
  requestedChanges: 20,
  rejectionReason: 1000,
  rejectedBookings: 20,
} as const;

// Master 5.9 factor names (SPM-243 AC7), with what the officer checks.
export const FACTOR_DETAILS: Record<SafetyFactor, { label: string; hint: string }> = {
  attendanceCapacity: { label: "Attendance and capacity", hint: "Expected attendance and registrations fit every booked venue's capacity." },
  layout: { label: "Layout", hint: "Each booking's layout suits the event and its attendance." },
  emergencyAccess: { label: "Emergency access", hint: "Each venue's emergency access works for this event as arranged." },
  accessibility: { label: "Accessibility", hint: "The requested accessibility needs can be met at the booked venues." },
  equipmentPlacement: { label: "Equipment placement", hint: "Requested equipment can be placed safely, clear of exits and walkways." },
  venueRestrictions: { label: "Known venue restrictions", hint: "Nothing in the venues' known restrictions conflicts with the event." },
};

export const FACTOR_RESULT_LABELS: Record<FactorResult, string> = {
  SATISFACTORY: "Satisfactory",
  NOT_SATISFACTORY: "Not satisfactory",
  NOT_APPLICABLE: "Not applicable",
};

export const DECISION_LABELS: Record<DecisionOutcome, { label: string; description: string }> = {
  APPROVED: {
    label: "Approve",
    description: "The arrangements are safe. The event stays in safety review until its coordinator confirms it.",
  },
  CHANGES_REQUESTED: {
    label: "Request changes",
    description: "The event returns to planning with the changes you list. Nothing is reset.",
  },
  REJECTED: {
    label: "Reject venue bookings",
    description: "The named bookings are unsuitable as arranged. The event returns to planning; the event itself is not rejected and nothing is released.",
  },
};

// ---------- review steps ----------

export interface ReviewStep {
  id: "attendance" | "venues" | "access" | "history" | "decision";
  title: string;
  description: string;
  guidance: string;
  factors: readonly SafetyFactor[];
}

// The five steps of the Safety Officer's review. Each information step ends
// with the factors judged from it, so the evidence is on screen while assessing.
export const REVIEW_STEPS: readonly ReviewStep[] = [
  {
    id: "attendance",
    title: "Attendance & schedule",
    description: "Expected attendance, registrations and timing.",
    guidance: "Compare expected attendance and current registrations with the capacity of every booked venue, for the whole event window.",
    factors: ["attendanceCapacity"],
  },
  {
    id: "venues",
    title: "Venues & layout",
    description: "Each active venue booking with its emergency access and known restrictions.",
    guidance: "Check each booking's layout, the venue's emergency access and any recorded restriction. A venue without a safety record needs a comment.",
    factors: ["layout", "emergencyAccess", "venueRestrictions"],
  },
  {
    id: "access",
    title: "Accessibility & equipment",
    description: "Accessibility needs and where requested equipment will be placed.",
    guidance: "Confirm the accessibility needs can be met and that equipment placement keeps exits, walkways and access routes clear.",
    factors: ["accessibility", "equipmentPlacement"],
  },
  {
    id: "history",
    title: "History & previous rounds",
    description: "Changes relevant to the review and the outcome of earlier rounds.",
    guidance: "Check what changed since earlier rounds, and whether changes requested before have been made.",
    factors: [],
  },
  {
    id: "decision",
    title: "Decision",
    description: "Review your checklist and record the outcome of this round.",
    guidance: "Approval needs every factor satisfactory or not applicable. A decision cannot be changed once recorded.",
    factors: [],
  },
];

export const DECISION_STEP = REVIEW_STEPS.length - 1;

export const factorStep = (factor: SafetyFactor) => REVIEW_STEPS.findIndex((step) => step.factors.includes(factor));

const textLength = (value: string | null | undefined) => (typeof value === "string" ? value.trim().length : 0);

// A factor is complete when it has a result, and a comment unless satisfactory.
export const factorComplete = (entry: ChecklistEntry | undefined) =>
  Boolean(entry?.result) &&
  (entry?.result === "SATISFACTORY" || textLength(entry?.comment) > 0) &&
  (entry?.comment ?? "").length <= SAFETY_LIMITS.factorComment;

export const completedFactorCount = (checklist: SafetyChecklist, factors: readonly SafetyFactor[] = SAFETY_FACTORS) =>
  factors.filter((factor) => factorComplete(checklist[factor])).length;

export const unsatisfactoryFactors = (checklist: SafetyChecklist) =>
  SAFETY_FACTORS.filter((factor) => checklist[factor]?.result === "NOT_SATISFACTORY");

// ---------- validation (mirrors the backend messages) ----------

export const SAFETY_MESSAGES = {
  factorRequired: "Record a result for this factor.",
  commentRequired: "Explain the result in a comment.",
  commentTooLong: `Keep the comment to ${SAFETY_LIMITS.factorComment} characters.`,
  organiserComment: `Keep the comment for the organiser to ${SAFETY_LIMITS.organiserComment} characters.`,
  internalNotes: `Keep the internal notes to ${SAFETY_LIMITS.internalNotes} characters.`,
  note: `Keep the note to ${SAFETY_LIMITS.handBackNote} characters.`,
  outcome: "Choose an outcome.",
  requestedChangesRequired: "List at least one change.",
  requestedChanges: `List up to ${SAFETY_LIMITS.requestedChanges} changes of at most ${SAFETY_LIMITS.requestedChange} characters each.`,
  rejectedBookingsRequired: "Name at least one venue booking and why it is unsuitable.",
  rejectedBookings: `Name up to ${SAFETY_LIMITS.rejectedBookings} venue bookings.`,
  rejectionReasonRequired: "Explain why this booking is unsuitable.",
  rejectionReasonTooLong: `Keep the reason to ${SAFETY_LIMITS.rejectionReason} characters.`,
  factorsNotSatisfactory: "A factor is not satisfactory, so the round cannot be approved.",
} as const;

export type FieldErrors = Record<string, string>;
export const factorField = (factor: SafetyFactor) => `checklist.${factor}`;

// "complete" demands every factor (a decision); otherwise only what is entered
// is checked (saving progress).
export function validateChecklist(checklist: SafetyChecklist, { complete }: { complete: boolean }): FieldErrors {
  const errors: FieldErrors = {};
  for (const factor of SAFETY_FACTORS) {
    const entry = checklist[factor];
    const field = factorField(factor);
    if ((entry?.comment ?? "").length > SAFETY_LIMITS.factorComment) errors[field] = SAFETY_MESSAGES.commentTooLong;
    else if (!entry?.result) {
      if (complete) errors[field] = SAFETY_MESSAGES.factorRequired;
    } else if (complete && entry.result !== "SATISFACTORY" && textLength(entry.comment) === 0) {
      errors[field] = SAFETY_MESSAGES.commentRequired;
    }
  }
  return errors;
}

export interface DecisionForm {
  outcome: DecisionOutcome | null;
  requestedChanges: string[];
  // Selected booking IDs mapped to the reason typed for each.
  rejectedBookings: Record<number, string>;
  organiserComment: string;
  internalNotes: string;
}

export const EMPTY_DECISION_FORM: DecisionForm = {
  outcome: null,
  requestedChanges: [""],
  rejectedBookings: {},
  organiserComment: "",
  internalNotes: "",
};

const filledChanges = (changes: string[]) => changes.map((change) => change.trim()).filter(Boolean);

export const rejectionField = (bookingId: number) => `rejectedBookings.${bookingId}`;

export function validateDecision(form: DecisionForm, checklist: SafetyChecklist): FieldErrors {
  const errors: FieldErrors = { ...validateChecklist(checklist, { complete: true }) };
  if (!form.outcome) errors.outcome = SAFETY_MESSAGES.outcome;
  if (textLength(form.organiserComment) > SAFETY_LIMITS.organiserComment) errors.organiserComment = SAFETY_MESSAGES.organiserComment;
  if (textLength(form.internalNotes) > SAFETY_LIMITS.internalNotes) errors.internalNotes = SAFETY_MESSAGES.internalNotes;

  if (form.outcome === "APPROVED" && unsatisfactoryFactors(checklist).length) {
    errors.outcome = SAFETY_MESSAGES.factorsNotSatisfactory;
  }
  if (form.outcome === "CHANGES_REQUESTED") {
    const changes = filledChanges(form.requestedChanges);
    if (!changes.length) errors.requestedChanges = SAFETY_MESSAGES.requestedChangesRequired;
    else if (changes.length > SAFETY_LIMITS.requestedChanges || changes.some((change) => change.length > SAFETY_LIMITS.requestedChange)) {
      errors.requestedChanges = SAFETY_MESSAGES.requestedChanges;
    }
  }
  if (form.outcome === "REJECTED") {
    const selected = Object.entries(form.rejectedBookings);
    if (!selected.length) errors.rejectedBookings = SAFETY_MESSAGES.rejectedBookingsRequired;
    else if (selected.length > SAFETY_LIMITS.rejectedBookings) errors.rejectedBookings = SAFETY_MESSAGES.rejectedBookings;
    for (const [bookingId, reason] of selected) {
      if (!textLength(reason)) errors[rejectionField(Number(bookingId))] = SAFETY_MESSAGES.rejectionReasonRequired;
      else if (reason.trim().length > SAFETY_LIMITS.rejectionReason) errors[rejectionField(Number(bookingId))] = SAFETY_MESSAGES.rejectionReasonTooLong;
    }
  }
  return errors;
}

// ---------- payloads ----------

const trimmedOrNull = (value: string | null | undefined) => (textLength(value) ? (value as string).trim() : null);

// Every factor with an entry; comments trimmed, blanks sent as null.
export function toChecklistPayload(checklist: SafetyChecklist, { complete }: { complete: boolean }): SafetyChecklist {
  const payload: SafetyChecklist = {};
  for (const factor of SAFETY_FACTORS) {
    const entry = checklist[factor];
    if (!complete && !entry?.result && !textLength(entry?.comment)) continue;
    payload[factor] = { result: entry?.result ?? null, comment: trimmedOrNull(entry?.comment) };
  }
  return payload;
}

// PUT .../progress: the partial checklist and the decision drafts.
export function toProgressPayload(checklist: SafetyChecklist, form: DecisionForm) {
  const changes = filledChanges(form.requestedChanges);
  return {
    checklist: toChecklistPayload(checklist, { complete: false }),
    organiserComment: trimmedOrNull(form.organiserComment),
    internalNotes: trimmedOrNull(form.internalNotes),
    requestedChanges: changes.length ? changes : null,
  };
}

// POST .../decision: only the fields the chosen outcome allows (the backend
// refuses requestedChanges on approval and rejectedBookings unless rejecting).
export function toDecisionPayload(form: DecisionForm, checklist: SafetyChecklist, arrangementVersion: number) {
  const outcome = form.outcome as DecisionOutcome;
  const payload: {
    outcome: DecisionOutcome;
    checklist: SafetyChecklist;
    arrangementVersion: number;
    organiserComment?: string;
    internalNotes?: string;
    requestedChanges?: string[];
    rejectedBookings?: Array<{ bookingId: number; reason: string }>;
  } = { outcome, checklist: toChecklistPayload(checklist, { complete: true }), arrangementVersion };
  const organiserComment = trimmedOrNull(form.organiserComment);
  const internalNotes = trimmedOrNull(form.internalNotes);
  if (organiserComment) payload.organiserComment = organiserComment;
  if (internalNotes) payload.internalNotes = internalNotes;
  if (outcome === "CHANGES_REQUESTED") payload.requestedChanges = filledChanges(form.requestedChanges);
  if (outcome === "REJECTED") {
    payload.rejectedBookings = Object.entries(form.rejectedBookings)
      .map(([bookingId, reason]) => ({ bookingId: Number(bookingId), reason: reason.trim() }))
      .sort((left, right) => left.bookingId - right.bookingId);
  }
  return payload;
}

// The saved round back into form state (progress survives a reload, TC-11).
export function formFromRound(round: {
  checklist: SafetyChecklist | null;
  organiserComment: string | null;
  internalNotes: string | null;
  requestedChanges: string[] | null;
}): { checklist: SafetyChecklist; form: DecisionForm } {
  return {
    checklist: { ...(round.checklist ?? {}) },
    form: {
      ...EMPTY_DECISION_FORM,
      requestedChanges: round.requestedChanges?.length ? [...round.requestedChanges] : [""],
      organiserComment: round.organiserComment ?? "",
      internalNotes: round.internalNotes ?? "",
    },
  };
}

// ---------- the officer's relation to the round on screen ----------

// The backend chooses which round the officer sees (EventView.safetyReviewId);
// this only says how the officer stands to it, to pick the controls to offer.
interface ScopedRound {
  status: RoundStatus;
  claimedBy: number | null;
}

export type OfficerRoundState = "awaiting-claim" | "claimed-by-me" | "claimed-by-other" | "decided" | "closed";

export function officerRoundState(round: ScopedRound, officerId: number): OfficerRoundState {
  if (round.status === "OPEN") {
    if (round.claimedBy === null) return "awaiting-claim";
    return round.claimedBy === officerId ? "claimed-by-me" : "claimed-by-other";
  }
  return round.status === "SUPERSEDED" ? "closed" : "decided";
}

// ---------- round status presentation ----------

// Design-system status categories, drawn with shared tokens only.
export type StatusTone = "neutral" | "primary" | "tertiary" | "success" | "error";

export const TONE_CLASSES: Record<StatusTone, { chip: string; border: string }> = {
  neutral: { chip: "bg-surface-container-high text-on-surface-variant", border: "border-t-outline-variant" },
  primary: { chip: "bg-primary-fixed text-primary", border: "border-t-primary" },
  tertiary: { chip: "bg-tertiary-fixed text-tertiary", border: "border-t-tertiary" },
  success: { chip: "bg-success-container text-success", border: "border-t-success" },
  error: { chip: "bg-error-container text-on-error-container", border: "border-t-error" },
};

// Labels are the Master 5.9 outcomes in sentence case; the description restates
// what each means so a safety approval is never read as a confirmation.
export const ROUND_STATUS_PRESENTATION: Record<RoundStatus, { label: string; tone: StatusTone; description: string }> = {
  OPEN: { label: "In review", tone: "primary", description: "A Safety Officer is reviewing the event's arrangements." },
  APPROVED: { label: "Approved", tone: "success", description: "Safety approved. The event is not confirmed until its coordinator confirms it." },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "error", description: "The event returned to planning with changes to make before another review." },
  REJECTED: { label: "Venue bookings rejected", tone: "error", description: "Named venue bookings are unsuitable as arranged. The event returned to planning; it is not rejected." },
  SUPERSEDED: { label: "Superseded", tone: "neutral", description: "Closed because the event's arrangements changed. A new review follows when it is resubmitted." },
};

export const roundStatusPresentation = (status: string) =>
  ROUND_STATUS_PRESENTATION[status as RoundStatus] ?? { label: status.replaceAll("_", " "), tone: "neutral" as StatusTone, description: "" };

// ---------- errors ----------

export interface SafetyErrorLike {
  status?: number;
  code?: string;
  message?: string;
  fields?: Record<string, string>;
  details?: Record<string, unknown>;
}

export interface SafetyRefusal {
  tone: "error" | "warning";
  title: string;
  message: string;
  // Reload the round: it changed hands, closed or was superseded.
  reload: boolean;
  fields: FieldErrors;
}

const REFUSALS: Record<string, Omit<SafetyRefusal, "fields">> = {
  NOT_CLAIMANT: { tone: "warning", title: "You no longer hold this review", message: "It was handed back or claimed by another Safety Officer. The review has been reloaded.", reload: true },
  ROUND_NOT_OPEN: { tone: "warning", title: "This round is closed", message: "It was already decided or superseded. The review has been reloaded.", reload: true },
  TRANSITION_NOT_ALLOWED: { tone: "warning", title: "This round is closed", message: "The event is no longer awaiting a safety decision. The review has been reloaded.", reload: true },
  ROUND_NOT_CLAIMABLE: { tone: "warning", title: "Already claimed", message: "Another Safety Officer claimed this review first.", reload: true },
  ARRANGEMENTS_CHANGED: {
    tone: "warning",
    title: "Arrangements changed",
    message: "The event's arrangements changed after this review opened, so the round was closed and the event returned to planning. Nothing you entered was recorded as a decision.",
    reload: true,
  },
  SAFETY_FACTOR_NOT_SATISFACTORY: { tone: "error", title: "Approval refused", message: SAFETY_MESSAGES.factorsNotSatisfactory, reload: false },
  VENUE_DETAILS_UNAVAILABLE: {
    tone: "warning",
    title: "Venue safety details unavailable",
    message: "Venue safety details could not be loaded, so the review cannot be decided now. Your input is kept; try again shortly.",
    reload: false,
  },
  IDEMPOTENCY_IN_PROGRESS: { tone: "warning", title: "Still processing", message: "Your previous request is still being processed. Wait a moment, then try again.", reload: false },
  REVIEW_NOT_FOUND: { tone: "error", title: "Review not available", message: "This review is no longer in your scope.", reload: true },
  VALIDATION_FAILED: { tone: "error", title: "Check the highlighted fields", message: "Some entries need attention. Nothing was saved.", reload: false },
  NETWORK_ERROR: { tone: "error", title: "Could not reach ConnectSphere", message: "Check your connection and try again. Your input is kept.", reload: false },
};

export function describeSafetyError(error: SafetyErrorLike): SafetyRefusal {
  const known = error.code ? REFUSALS[error.code] : undefined;
  const fields: FieldErrors = { ...(error.fields ?? {}) };
  if (error.code === "SAFETY_FACTOR_NOT_SATISFACTORY" && Array.isArray(error.details?.factors)) {
    for (const factor of error.details.factors as string[]) fields[`checklist.${factor}`] = "Not satisfactory: approval is not possible.";
  }
  const base = known ?? { tone: "error" as const, title: "Action not completed", message: error.message || "Something went wrong. Try again.", reload: false };
  return { ...base, fields };
}

// The first step holding an error, so the officer is taken to it.
export function firstErrorStep(fields: FieldErrors) {
  for (const factor of SAFETY_FACTORS) if (fields[factorField(factor)]) return factorStep(factor);
  return Object.keys(fields).length ? DECISION_STEP : null;
}
