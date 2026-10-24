"use client";

import { fieldClasses } from "@/components/shared/primitives";
import type { EquipmentFormValues, FieldErrors } from "@/lib/equipment";
import { Field, describedBy } from "./equipment-parts";

type Change = (key: keyof EquipmentFormValues, value: string) => void;

const RECORD_FIELDS: { key: keyof EquipmentFormValues; label: string; hint?: string; numeric?: boolean }[] = [
  { key: "name", label: "Name", hint: "Unique in any letter case." },
  { key: "category", label: "Category", hint: "For example Audio, Visual or Lighting." },
  { key: "storageLocation", label: "Storage location", hint: "Where the stock is kept. It does not affect availability." },
  { key: "totalQuantity", label: "Total quantity", hint: "A whole number of 0 or more.", numeric: true },
];

const DETAIL_FIELDS: { key: keyof EquipmentFormValues; label: string }[] = [
  { key: "specifications", label: "Specifications" },
  { key: "technicalNotes", label: "Technical notes" },
  { key: "handlingNotes", label: "Handling and setup notes" },
];

// Name, category, storage location and total quantity (SPM-52 AC2).
export function EquipmentRecordFields({ idPrefix, values, errors, onChange, disabled, categories = [] }: {
  idPrefix: string;
  values: EquipmentFormValues;
  errors: FieldErrors;
  onChange: Change;
  disabled?: boolean;
  categories?: string[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {RECORD_FIELDS.map((field) => {
        const id = `${idPrefix}-${field.key}`;
        return (
          <Field key={field.key} id={id} label={field.label} required error={errors[field.key]} hint={field.hint}>
            <input
              id={id}
              className={fieldClasses}
              inputMode={field.numeric ? "numeric" : undefined}
              list={field.key === "category" && categories.length ? `${idPrefix}-categories` : undefined}
              value={values[field.key]}
              disabled={disabled}
              aria-invalid={Boolean(errors[field.key])}
              aria-describedby={describedBy(id, errors[field.key], field.hint)}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          </Field>
        );
      })}
      {categories.length ? (
        <datalist id={`${idPrefix}-categories`}>
          {categories.map((category) => <option key={category} value={category} />)}
        </datalist>
      ) : null}
    </div>
  );
}

// Optional descriptive details, kept in MongoDB and display only (Master 5.5).
export function EquipmentDetailFields({ idPrefix, values, errors, onChange, disabled }: {
  idPrefix: string;
  values: EquipmentFormValues;
  errors: FieldErrors;
  onChange: Change;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      {DETAIL_FIELDS.map((field) => {
        const id = `${idPrefix}-${field.key}`;
        return (
          <Field key={field.key} id={id} label={field.label} error={errors[field.key]}>
            <textarea
              id={id}
              rows={3}
              className={fieldClasses}
              value={values[field.key]}
              disabled={disabled}
              aria-invalid={Boolean(errors[field.key])}
              aria-describedby={describedBy(id, errors[field.key])}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          </Field>
        );
      })}
    </div>
  );
}
