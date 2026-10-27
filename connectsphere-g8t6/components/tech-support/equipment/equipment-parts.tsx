"use client";

import type { ReactNode } from "react";
import { FormLabel } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { unavailableShare } from "@/lib/equipment";
import type { Equipment, EquipmentStatus, UnavailabilityReason } from "@/lib/api/equipment";

// Called after every confirmed save with the item the backend returned; the page
// shows it at once and then reloads everything the save may have changed.
export type Saved = (message: string, equipment?: Equipment) => void;

export const errorText = (caught: unknown, fallback: string) => (caught instanceof Error ? caught.message : fallback);

// Status categories of the design system: success (usable), primary (pending),
// neutral (inactive), error (needs action), tertiary (special).
const CATEGORY_CLASSES = {
  success: "bg-success-container text-on-success-container",
  primary: "bg-primary-fixed text-primary",
  neutral: "bg-surface-container-high text-on-surface-variant",
  error: "bg-error-container text-on-error-container",
  tertiary: "bg-tertiary-fixed text-on-tertiary-fixed",
} as const;

const STATUS_CATEGORY: Record<EquipmentStatus, keyof typeof CATEGORY_CLASSES> = {
  ACTIVE: "success",
  DETAILS_PENDING: "primary",
  INACTIVE: "neutral",
};

const REASON_CATEGORY: Record<UnavailabilityReason, keyof typeof CATEGORY_CLASSES> = {
  DAMAGED: "error",
  MAINTENANCE: "tertiary",
  OTHER: "neutral",
};

const chipClasses = "inline-flex w-fit items-center rounded-chip px-2 py-1 text-[11px] font-semibold uppercase tracking-label";

// The label always comes from the backend; a status it adds later shows neutral.
export function EquipmentStatusChip({ status, label }: { status: string; label: string }) {
  const category = STATUS_CATEGORY[status as EquipmentStatus];
  return (
    <span
      className={`${chipClasses} ${CATEGORY_CLASSES[category ?? "neutral"]}`}
      title={category ? undefined : `Status "${status}" is not an equipment status`}
    >
      {label || status}
    </span>
  );
}

export function ReasonChip({ reason, label }: { reason: string; label: string }) {
  return <span className={`${chipClasses} ${CATEGORY_CLASSES[REASON_CATEGORY[reason as UnavailabilityReason] ?? "neutral"]}`}>{label || reason}</span>;
}

// "n / total" with a bar and percentage. Fully unavailable stock turns the bar
// red and adds a lock icon and words, never colour alone.
export function UnavailableBar({ unavailable, total }: { unavailable: number; total: number }) {
  const share = unavailableShare(unavailable, total);
  const full = total > 0 && unavailable >= total;
  return (
    <div className="grid gap-1">
      <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
        {full ? <Icon name="lock" size={16} className="text-error" /> : null}
        <span className="font-mono font-semibold text-on-surface">{unavailable} / {total}</span>
        unavailable now · {share}%{full ? " · none available" : ""}
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-container-high" aria-hidden="true">
        <div className={`h-full rounded-pill transition-[width] duration-400 ease-out ${full ? "bg-error" : "bg-primary"}`} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

export function Field({ id, label, required, error, hint, children }: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <FormLabel htmlFor={id} required={required}>{label}</FormLabel>
      {children}
      {hint && !error ? <p id={`${id}-hint`} className="mt-1 text-xs text-on-surface-variant">{hint}</p> : null}
      {error ? <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-semibold text-error">{error}</p> : null}
    </div>
  );
}

// aria-describedby for a field: its error when there is one, otherwise its hint.
export const describedBy = (id: string, error?: string, hint?: string) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);
