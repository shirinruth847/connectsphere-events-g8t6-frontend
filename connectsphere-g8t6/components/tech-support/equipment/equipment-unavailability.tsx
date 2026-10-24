"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, EmptyState, SectionCard, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { SectionHeading } from "@/components/shared/section-heading";
import { ApiError } from "@/lib/api";
import { formatEventWindow } from "@/lib/datetime";
import {
  EMPTY_UNAVAILABILITY_FORM,
  toSingaporeInput,
  toSingaporeInstant,
  validateUnavailabilityForm,
  type FieldErrors,
  type UnavailabilityFormValues,
} from "@/lib/equipment";
import {
  UNAVAILABILITY_REASON_OPTIONS,
  endUnavailability,
  recordUnavailability,
  updateUnavailability,
  type Equipment,
  type Unavailability,
} from "@/lib/api/equipment";
import { Field, ReasonChip, describedBy, errorText, type Saved } from "./equipment-parts";

const unavailabilityForm = (record: Unavailability): UnavailabilityFormValues => ({
  quantity: String(record.quantity),
  reason: record.reason,
  startsAt: toSingaporeInput(record.startsAt),
  endsAt: toSingaporeInput(record.endsAt),
  note: record.note,
});

// Records or edits unavailable stock (SPM-52 AC8). Times are Singapore time.
function UnavailabilityDialog({ equipment, record, open, onClose, onSaved }: {
  equipment: Equipment;
  record: Unavailability | null;
  open: boolean;
  onClose: () => void;
  onSaved: Saved;
}) {
  const initial = record ? unavailabilityForm(record) : EMPTY_UNAVAILABILITY_FORM;
  const [values, setValues] = useState<UnavailabilityFormValues>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const idPrefix = record ? `edit-unavailable-${record.unavailabilityId}` : "record-unavailable";

  const change = (key: keyof UnavailabilityFormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateUnavailabilityForm(values);
    setErrors(found);
    setFormError("");
    if (Object.keys(found).length) return;
    const input = {
      quantity: values.quantity.trim(),
      reason: values.reason as Unavailability["reason"],
      startsAt: toSingaporeInstant(values.startsAt),
      endsAt: toSingaporeInstant(values.endsAt),
      note: values.note.trim(),
    };
    setSaving(true);
    try {
      if (record) {
        const before = unavailabilityForm(record);
        const changes = Object.fromEntries(
          (Object.keys(input) as (keyof typeof input)[])
            .filter((key) => values[key].trim() !== before[key])
            .map((key) => [key, input[key]]),
        );
        if (!Object.keys(changes).length) {
          setFormError("No changes to save.");
          return;
        }
        const result = await updateUnavailability(equipment.equipmentId, record.unavailabilityId, { ...changes, version: record.version });
        onSaved(result.message, result.equipment);
      } else {
        const result = await recordUnavailability(equipment.equipmentId, input);
        onSaved(result.message, result.equipment);
      }
    } catch (caught) {
      if (caught instanceof ApiError && Object.keys(caught.fields).length) setErrors(caught.fields);
      setFormError(errorText(caught, "The unavailable stock could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const fields: { key: keyof UnavailabilityFormValues; label: string; type: string; hint?: string }[] = [
    { key: "quantity", label: "Quantity", type: "text", hint: `Up to ${equipment.totalQuantity} at any one time, counting overlapping records.` },
    { key: "startsAt", label: "Start (SGT)", type: "datetime-local" },
    { key: "endsAt", label: "End (SGT)", type: "datetime-local", hint: "Must be after the start and in the future." },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={record ? "Edit unavailable stock" : "Record unavailable stock"}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="quiet" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={`${idPrefix}-form`} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      }
    >
      <form id={`${idPrefix}-form`} noValidate onSubmit={submit} className="grid gap-4">
        {formError ? <AlertBanner tone={formError === "No changes to save." ? "warning" : "error"}>{formError}</AlertBanner> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => {
            const id = `${idPrefix}-${field.key}`;
            return (
              <Field key={field.key} id={id} label={field.label} required error={errors[field.key]} hint={field.hint}>
                <input
                  id={id}
                  type={field.type}
                  inputMode={field.key === "quantity" ? "numeric" : undefined}
                  className={fieldClasses}
                  value={values[field.key]}
                  disabled={saving}
                  aria-invalid={Boolean(errors[field.key])}
                  aria-describedby={describedBy(id, errors[field.key], field.hint)}
                  onChange={(event) => change(field.key, event.target.value)}
                />
              </Field>
            );
          })}
          <Field id={`${idPrefix}-reason`} label="Reason" required error={errors.reason}>
            <select
              id={`${idPrefix}-reason`}
              className={fieldClasses}
              value={values.reason}
              disabled={saving}
              aria-invalid={Boolean(errors.reason)}
              aria-describedby={describedBy(`${idPrefix}-reason`, errors.reason)}
              onChange={(event) => change("reason", event.target.value)}
            >
              <option value="">Choose a reason</option>
              {UNAVAILABILITY_REASON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        </div>
        <Field id={`${idPrefix}-note`} label="Note" required error={errors.note}>
          <textarea
            id={`${idPrefix}-note`}
            rows={3}
            className={fieldClasses}
            value={values.note}
            disabled={saving}
            aria-invalid={Boolean(errors.note)}
            aria-describedby={describedBy(`${idPrefix}-note`, errors.note)}
            onChange={(event) => change("note", event.target.value)}
          />
        </Field>
      </form>
    </Dialog>
  );
}

export function UnavailabilitySection({ equipment, records, loadedAt, onSaved }: { equipment: Equipment; records: Unavailability[]; loadedAt: number; onSaved: Saved }) {
  const [editing, setEditing] = useState<Unavailability | "new" | null>(null);
  const [ending, setEnding] = useState<Unavailability | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const end = async (record: Unavailability) => {
    setSaving(true);
    setError("");
    try {
      const result = await endUnavailability(equipment.equipmentId, record.unavailabilityId, record.version);
      setEnding(null);
      onSaved(result.message, result.equipment);
    } catch (caught) {
      setEnding(null);
      setError(errorText(caught, "The record could not be ended."));
    } finally {
      setSaving(false);
    }
  };

  const started = (record: Unavailability) => Date.parse(record.startsAt) <= loadedAt;

  return (
    <SectionCard className="grid gap-4">
      <SectionHeading
        step={4}
        title="Unavailable stock"
        description="Damaged, maintenance or other stock that cannot be used for a period. Periods that do not overlap are never added together."
        action={<Button variant="secondary" onClick={() => setEditing("new")}><Icon name="edit" size={16} />Record unavailable stock</Button>}
      />
      {error ? <AlertBanner tone="error">{error}</AlertBanner> : null}
      {records.length ? (
        <ul className="grid gap-3" aria-label="Current and upcoming unavailable stock">
          {records.map((record) => (
            <li key={record.unavailabilityId} className="grid gap-2 rounded-control bg-surface-container-low p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ReasonChip reason={record.reason} label={record.reasonLabel} />
                  <span className="font-mono text-sm font-semibold text-on-surface">{record.quantity} unit{record.quantity === 1 ? "" : "s"}</span>
                  {started(record) ? <span className="text-xs font-semibold text-on-surface-variant">In progress</span> : <span className="text-xs text-on-surface-variant">Upcoming</span>}
                </div>
                <p className="mt-1 text-sm text-on-surface">{formatEventWindow(record.startsAt, record.endsAt)}</p>
                <p className="mt-1 text-xs text-on-surface-variant [overflow-wrap:anywhere]">{record.note}{record.updatedBy?.name ? ` · ${record.updatedBy.name}` : ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setEditing(record)} aria-label={`Edit unavailable stock from ${formatEventWindow(record.startsAt, record.endsAt)}`}>Edit</Button>
                <Button variant="quiet" onClick={() => setEnding(record)} aria-label={`${started(record) ? "End" : "Cancel"} unavailable stock from ${formatEventWindow(record.startsAt, record.endsAt)}`}>
                  {started(record) ? "End now" : "Cancel record"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No unavailable stock" description="All stock is usable now and in the future. Record damaged or maintenance stock here." />
      )}

      {editing ? (
        <UnavailabilityDialog
          key={editing === "new" ? "new" : `${editing.unavailabilityId}-${editing.version}`}
          equipment={equipment}
          record={editing === "new" ? null : editing}
          open
          onClose={() => setEditing(null)}
          onSaved={(message, updated) => { setEditing(null); onSaved(message, updated); }}
        />
      ) : null}
      <Dialog
        open={ending !== null}
        onClose={() => setEnding(null)}
        title={ending && started(ending) ? "End this unavailable stock now?" : "Cancel this unavailable stock?"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="quiet" onClick={() => setEnding(null)}>Keep record</Button>
            <Button disabled={saving || !ending} onClick={() => ending && void end(ending)}>{saving ? "Saving…" : "Confirm"}</Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface">
          {ending && started(ending)
            ? "The units become available again from now. The record stays in the history."
            : "The record has not started, so it is cancelled and never counts. It stays in the history."}
        </p>
      </Dialog>
    </SectionCard>
  );
}
