import type { ReactNode } from "react";

interface SectionHeadingProps {
  id?: string;
  title: string;
  description?: ReactNode;
  // Right-aligned contextual action or permission pill.
  action?: ReactNode;
  // Numbered review sections (e.g. the coordinator assessment) show a step badge.
  step?: number;
  accent?: "primary" | "neutral";
  as?: "h2" | "h3";
}

// Section title preceded by a 4px accent bar, with an optional one-line description.
export function SectionHeading({ id, title, description, action, step, accent = "primary", as: Heading = "h2" }: SectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 items-start gap-3">
        {step ? (
          <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-control bg-primary-fixed text-xs font-bold text-primary">
            {step}
          </span>
        ) : (
          <span aria-hidden="true" className={`mt-0.5 h-5 w-1 shrink-0 rounded-full ${accent === "primary" ? "bg-primary" : "bg-on-surface-variant"}`} />
        )}
        <div className="min-w-0">
          <Heading id={id} className="text-base font-semibold leading-tight tracking-[-0.01em] text-on-surface sm:text-lg">
            {step ? <span className="sr-only">Section {step}: </span> : null}
            {title}
          </Heading>
          {description ? <p className="mt-1 max-w-readable text-xs leading-relaxed text-on-surface-variant sm:text-sm">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
