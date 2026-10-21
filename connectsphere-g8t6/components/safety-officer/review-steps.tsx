"use client";

export interface ReviewStepItem {
  title: string;
  // e.g. "2 of 3 assessed", "Reference", "Ready to decide".
  status: string;
  complete: boolean;
}

// Numbered review steps in the event request wizard's style (SPM-35), with
// shared tokens. A review is read in any order, so every step can be opened.
export function ReviewSteps({
  steps,
  current,
  onSelect,
}: {
  steps: ReviewStepItem[];
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="Review steps" className="overflow-x-auto rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
      <div className="relative min-w-[640px]">
      <div aria-hidden="true" className="pointer-events-none absolute top-[21px] h-0.5 bg-surface-container-high" style={{ left: `${50 / steps.length}%`, right: `${50 / steps.length}%` }} />
      <ol className="relative grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((step, index) => {
          const active = index === current;
          const bubble = active
            ? "border-primary bg-primary text-on-primary"
            : step.complete
              ? "border-success bg-success-container text-success"
              : "border-outline-variant bg-surface-container-lowest text-on-surface-variant";
          return (
            <li key={step.title} className="relative z-[1] flex justify-center">
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={active ? "step" : undefined}
                className="flex min-h-11 min-w-0 flex-col items-center gap-2 rounded-control px-1 text-center transition-colors duration-150 hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className={`grid size-11 place-items-center rounded-full border-2 text-lg font-bold ${bubble}`}>
                  {step.complete && !active ? <span aria-hidden="true">✓</span> : index + 1}
                </span>
                <span className={`max-w-[160px] text-xs font-semibold leading-[18px] ${active ? "text-primary" : "text-on-surface"}`}>
                  <span className="sr-only">Step {index + 1}: </span>{step.title}
                </span>
                <span className={`text-[11px] font-semibold ${active ? "text-primary" : step.complete ? "text-success" : "text-on-surface-variant"}`}>
                  {step.status}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      </div>
    </nav>
  );
}
