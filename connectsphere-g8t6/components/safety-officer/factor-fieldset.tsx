"use client";

import { fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import {
  FACTOR_DETAILS,
  FACTOR_RESULT_LABELS,
  FACTOR_RESULTS,
  SAFETY_LIMITS,
  type ChecklistEntry,
  type FactorResult,
  type SafetyFactor,
} from "@/lib/safety-review";

const RESULT_TONES: Record<FactorResult, string> = {
  SATISFACTORY: "bg-success-container text-success",
  NOT_SATISFACTORY: "bg-error-container text-on-error-container",
  NOT_APPLICABLE: "bg-surface-container-high text-on-surface-variant",
};

export function FactorResultChip({ result }: { result: FactorResult | null | undefined }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-chip px-2 py-1 text-[11px] font-semibold uppercase tracking-label ${result ? RESULT_TONES[result] : "bg-surface-container-low text-on-surface-variant"}`}>
      {result ? FACTOR_RESULT_LABELS[result] : "Not assessed"}
    </span>
  );
}

// One checklist factor: a result and a comment, required unless satisfactory
// (SPM-243 AC7). Read-only once the officer cannot change the round.
export function FactorFieldset({
  factor,
  entry,
  error,
  readOnly,
  onChange,
}: {
  factor: SafetyFactor;
  entry: ChecklistEntry | undefined;
  error?: string;
  readOnly: boolean;
  onChange: (entry: ChecklistEntry) => void;
}) {
  const details = FACTOR_DETAILS[factor];
  const result = entry?.result ?? null;
  const comment = entry?.comment ?? "";
  const commentRequired = Boolean(result) && result !== "SATISFACTORY";
  const errorId = `factor-${factor}-error`;
  const hintId = `factor-${factor}-hint`;
  const commentId = `factor-${factor}-comment`;

  if (readOnly) {
    return (
      <div id={`factor-${factor}`} className="grid gap-2 rounded-control bg-surface-container-low p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-on-surface">{details.label}</p>
          <FactorResultChip result={result} />
        </div>
        <p className="text-xs text-on-surface-variant">{details.hint}</p>
        {comment ? <p className="whitespace-pre-line text-sm text-on-surface [overflow-wrap:anywhere]">{comment}</p> : null}
      </div>
    );
  }

  return (
    <fieldset
      id={`factor-${factor}`}
      aria-describedby={`${hintId}${error ? ` ${errorId}` : ""}`}
      className={`grid gap-3 rounded-control border p-3 sm:p-4 ${error ? "border-error bg-error-container/30" : "border-outline-variant bg-surface-container-lowest"}`}
    >
      <legend className="sr-only">{details.label}</legend>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p aria-hidden="true" className="text-sm font-semibold text-on-surface">{details.label}</p>
          <p id={hintId} className="mt-0.5 text-xs text-on-surface-variant">{details.hint}</p>
        </div>
        <FactorResultChip result={result} />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {FACTOR_RESULTS.map((option) => (
          <label
            key={option}
            className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-3 text-sm font-semibold transition-colors duration-150 ${
              result === option ? "border-primary bg-primary-fixed text-primary" : "border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container"
            }`}
          >
            <input
              type="radio"
              name={`factor-${factor}`}
              value={option}
              checked={result === option}
              onChange={() => onChange({ result: option, comment })}
              className="size-4 accent-primary"
            />
            {FACTOR_RESULT_LABELS[option]}
          </label>
        ))}
      </div>

      <div>
        <label htmlFor={commentId} className="mb-1.5 block text-xs font-semibold text-on-surface">
          Comment
          {commentRequired ? <span aria-hidden="true" className="ml-1 text-error">*</span> : null}
          {commentRequired ? <span className="sr-only"> (required)</span> : <span className="ml-1 font-normal text-on-surface-variant">(optional when satisfactory)</span>}
        </label>
        <textarea
          id={commentId}
          rows={2}
          maxLength={SAFETY_LIMITS.factorComment}
          value={comment}
          onChange={(change) => onChange({ result, comment: change.target.value })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${fieldClasses} resize-y`}
          placeholder={commentRequired ? "Explain the result." : "Add a note if useful."}
        />
      </div>
      {error ? (
        <p id={errorId} className="flex items-center gap-1.5 text-xs font-semibold text-error">
          <Icon name="warning" size={16} />{error}
        </p>
      ) : null}
    </fieldset>
  );
}
