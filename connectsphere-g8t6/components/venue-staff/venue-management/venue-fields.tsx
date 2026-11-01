"use client";

import type { ReactNode } from "react";
import { FormLabel, fieldClasses } from "@/components/shared/primitives";
import { VENUE_STATUS_LABELS, type VenueStatus } from "@/lib/api/venues";
import type { VenueFormValues } from "./venue-form-rules";

export type FieldErrors = Partial<Record<string, string>>;

const STATUS_CHIPS: Record<VenueStatus, string> = {
  ACTIVE: "bg-[#DCFCE7] text-[#166534]",
  INACTIVE: "bg-[#F3F4F6] text-[#4B5563]",
  UNDER_MAINTENANCE: "bg-[#FEF3C7] text-[#92400E]",
};

export function VenueStatusChip({ status }: { status: VenueStatus }) {
  return (
    <span className={`inline-flex w-fit rounded-chip px-2 py-1 text-[11px] font-semibold uppercase tracking-label ${STATUS_CHIPS[status] ?? "bg-slate-100 text-slate-700"}`}>
      {VENUE_STATUS_LABELS[status] ?? status}
    </span>
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

const CORE_FIELDS: { key: keyof VenueFormValues; label: string; type?: string; inputMode?: "numeric" | "email" | "tel"; autoComplete?: string }[] = [
  { key: "name", label: "Venue name" },
  { key: "address", label: "Address / location" },
  { key: "maxCapacity", label: "Capacity", inputMode: "numeric" },
  { key: "contactPerson", label: "Contact person", autoComplete: "name" },
  { key: "contactEmail", label: "Contact email", type: "email", inputMode: "email", autoComplete: "email" },
  { key: "contactNumber", label: "Contact number", type: "tel", inputMode: "tel", autoComplete: "tel" },
];

// The venue record fields (SPM-73 AC3). Email or number: at least one.
export function VenueCoreFields({ idPrefix, values, errors, onChange, disabled }: {
  idPrefix: string;
  values: VenueFormValues;
  errors: FieldErrors;
  onChange: (key: keyof VenueFormValues, value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {CORE_FIELDS.map((field) => {
        const id = `${idPrefix}-${field.key}`;
        return (
          <Field
            key={field.key}
            id={id}
            label={field.label}
            required={!["contactEmail", "contactNumber"].includes(field.key)}
            error={errors[field.key]}
            hint={field.key === "contactNumber" ? "A contact number or email is required." : undefined}
          >
            <input
              id={id}
              type={field.type ?? "text"}
              inputMode={field.inputMode}
              autoComplete={field.autoComplete}
              className={fieldClasses}
              value={values[field.key]}
              disabled={disabled}
              aria-invalid={Boolean(errors[field.key])}
              aria-describedby={errors[field.key] ? `${id}-error` : undefined}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          </Field>
        );
      })}
    </div>
  );
}

// Setup and turnaround are set once each and locked afterwards (Master 5.4.1).
export function BufferFields({ idPrefix, values, errors, onChange, disabled, locked = {}, required = false }: {
  idPrefix: string;
  values: Pick<VenueFormValues, "setupMinutes" | "turnaroundMinutes">;
  errors: FieldErrors;
  onChange: (key: "setupMinutes" | "turnaroundMinutes", value: string) => void;
  disabled?: boolean;
  locked?: Partial<Record<"setupMinutes" | "turnaroundMinutes", boolean>>;
  // Creating a venue: both times are required.
  required?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {([["setupMinutes", "Setup time (minutes)"], ["turnaroundMinutes", "Turnaround time (minutes)"]] as const).map(([key, label]) => (
        <Field
          key={key}
          id={`${idPrefix}-${key}`}
          label={label}
          required={required}
          error={errors[key]}
          hint={locked[key] ? "Set once; it cannot be changed." : "Whole minutes, 0 allowed. Can be set only once."}
        >
          <input
            id={`${idPrefix}-${key}`}
            inputMode="numeric"
            className={`${fieldClasses} read-only:cursor-not-allowed read-only:bg-surface-container read-only:text-on-surface-variant`}
            value={values[key]}
            disabled={disabled}
            readOnly={locked[key]}
            aria-readonly={locked[key] || undefined}
            aria-describedby={`${idPrefix}-${key}-hint`}
            aria-invalid={Boolean(errors[key])}
            onChange={(event) => onChange(key, event.target.value)}
          />
        </Field>
      ))}
    </div>
  );
}
