"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, EmptyState, PageHeader, ReferenceIdTag, SectionCard, Skeleton, buttonClasses, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { SectionHeading } from "@/components/shared/section-heading";
import { ApiError } from "@/lib/api";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import {
  DETAIL_KEYS,
  EMPTY_EQUIPMENT_FORM,
  EMPTY_UNAVAILABILITY_FORM,
  RECORD_KEYS,
  toSingaporeInput,
  toSingaporeInstant,
  validateEquipmentForm,
  validateUnavailabilityForm,
  type EquipmentFormValues,
  type FieldErrors,
  type UnavailabilityFormValues,
} from "@/lib/equipment";
import {
  UNAVAILABILITY_REASON_OPTIONS,
  changeEquipmentStatus,
  endUnavailability,
  getEquipment,
  listEquipmentCategories,
  recordUnavailability,
  updateEquipment,
  updateUnavailability,
  type Equipment,
  type EquipmentDetails,
  type Unavailability,
  type UpcomingEquipmentRequest,
} from "@/lib/api/equipment";
import { EquipmentDetailFields, EquipmentRecordFields } from "./equipment-fields";
import { EquipmentStatusChip, Field, ReasonChip, UnavailableBar, describedBy } from "./equipment-parts";

// loadedAt is when the data arrived; "in progress" is judged against it, not the render time.
type Loaded = { equipment: Equipment; details: EquipmentDetails | null; detailsRead: "OK" | "NOT_CHECKED"; unavailability: Unavailability[]; loadedAt: number };
type PageState =
  | { status: "loading" }
  | { status: "ready"; data: Loaded }
  | { status: "not-found" }
  | { status: "error"; message: string; forbidden: boolean };
type Notice = { tone: "success" | "error" | "warning"; text: string } | null;
// Called after every confirmed save with the item the backend returned; the page
// shows it at once and then reloads everything the save may have changed.
type Saved = (message: string, equipment?: Equipment) => void;

const errorText = (caught: unknown, fallback: string) => (caught instanceof Error ? caught.message : fallback);

const recordForm = (equipment: Equipment): EquipmentFormValues => ({
  ...EMPTY_EQUIPMENT_FORM,
  name: equipment.name,
  category: equipment.category,
  storageLocation: equipment.storageLocation ?? "",
  totalQuantity: String(equipment.totalQuantity),
});

const detailForm = (details: EquipmentDetails | null): EquipmentFormValues => ({
  ...EMPTY_EQUIPMENT_FORM,
  specifications: details?.specifications ?? "",
  technicalNotes: details?.technicalNotes ?? "",
  handlingNotes: details?.handlingNotes ?? "",
});

// A stale save (SPM-52 AC6): the current values come with the refusal, so they are
// shown and the user chooses to load them; nothing is overwritten silently.
function ConflictBanner({ current, onLoad }: { current: Equipment; onLoad: () => void }) {
  return (
    <AlertBanner tone="warning" title="This equipment was changed after you loaded it">
      <p>Current values: {current.name} · {current.category} · {current.storageLocation ?? "no storage location"} · total {current.totalQuantity} (version {current.version}).</p>
      <div className="mt-3"><Button variant="secondary" onClick={onLoad}><Icon name="refresh" size={16} />Load current values</Button></div>
    </AlertBanner>
  );
}

function RecordSection({ equipment, categories, onSaved }: { equipment: Equipment; categories: string[]; onSaved: Saved }) {
  const [values, setValues] = useState(() => recordForm(equipment));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<Notice>(null);
  const [conflict, setConflict] = useState<Equipment | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const original = recordForm(equipment);
    const changed = RECORD_KEYS.filter((key) => values[key].trim() !== original[key]);
    // Rows from before SPM-52 may lack a storage location; only changed fields are checked.
    const found = validateEquipmentForm(values, changed);
    setErrors(found);
    setMessage(null);
    setConflict(null);
    if (Object.keys(found).length) return;
    if (!changed.length) {
      setMessage({ tone: "warning", text: "No changes to save." });
      return;
    }
    setSaving(true);
    try {
      const result = await updateEquipment(equipment.equipmentId, {
        ...Object.fromEntries(changed.map((key) => [key, values[key].trim()])),
        version: equipment.version,
      });
      onSaved(result.message, result.equipment);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "EQUIPMENT_VERSION_CONFLICT" && caught.details.current) {
        setConflict(caught.details.current as Equipment);
      } else {
        if (caught instanceof ApiError && Object.keys(caught.fields).length) setErrors(caught.fields);
        setMessage({ tone: "error", text: errorText(caught, "The equipment could not be saved.") });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard className="grid gap-4">
      <SectionHeading step={1} title="Equipment record" description="Name, category, storage location and total stock. Lowering the total below stock already marked unavailable is refused." />
      <form noValidate onSubmit={submit} className="grid gap-4">
        {message ? <AlertBanner tone={message.tone}>{message.text}</AlertBanner> : null}
        {conflict ? <ConflictBanner current={conflict} onLoad={() => onSaved("The current values have been loaded.", conflict)} /> : null}
        <EquipmentRecordFields
          idPrefix="edit-equipment"
          values={values}
          errors={errors}
          categories={categories}
          disabled={saving}
          onChange={(key, value) => { setValues({ ...values, [key]: value }); setErrors({ ...errors, [key]: undefined }); }}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save record"}</Button>
          <Button type="button" variant="quiet" disabled={saving} onClick={() => { setValues(recordForm(equipment)); setErrors({}); setMessage(null); }}>Reset</Button>
        </div>
      </form>
    </SectionCard>
  );
}

function DetailsSection({ equipment, details, detailsRead, onSaved }: {
  equipment: Equipment;
  details: EquipmentDetails | null;
  detailsRead: "OK" | "NOT_CHECKED";
  onSaved: Saved;
}) {
  const [values, setValues] = useState(() => detailForm(details));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<Notice>(null);
  const [conflict, setConflict] = useState<Equipment | null>(null);
  const [saving, setSaving] = useState(false);

  if (detailsRead === "NOT_CHECKED") {
    return (
      <SectionCard className="grid gap-4">
        <SectionHeading step={2} title="Specifications and notes" />
        <AlertBanner tone="warning">The details cannot be read right now, so they cannot be edited. Stock and status still work. Reload the page to try again.</AlertBanner>
      </SectionCard>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const original = detailForm(details);
    const changed = DETAIL_KEYS.filter((key) => values[key].trim() !== original[key]);
    const found = validateEquipmentForm(values, changed);
    setErrors(found);
    setMessage(null);
    setConflict(null);
    if (Object.keys(found).length) return;
    if (!changed.length) {
      setMessage({ tone: "warning", text: "No changes to save." });
      return;
    }
    setSaving(true);
    try {
      const result = await updateEquipment(equipment.equipmentId, {
        ...Object.fromEntries(changed.map((key) => [key, values[key].trim() || null])),
        version: equipment.version,
      });
      onSaved(result.equipment.detailNotice ? `${result.message} The details are still being saved, so they may be out of date for a moment.` : result.message, result.equipment);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "EQUIPMENT_VERSION_CONFLICT" && caught.details.current) {
        setConflict(caught.details.current as Equipment);
      } else {
        if (caught instanceof ApiError && Object.keys(caught.fields).length) setErrors(caught.fields);
        setMessage({ tone: "error", text: errorText(caught, "The details could not be saved.") });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard className="grid gap-4">
      <SectionHeading step={2} title="Specifications and notes" description="Display information for planning. Quantities and availability never depend on it." />
      <form noValidate onSubmit={submit} className="grid gap-4">
        {message ? <AlertBanner tone={message.tone}>{message.text}</AlertBanner> : null}
        {conflict ? <ConflictBanner current={conflict} onLoad={() => onSaved("The current values have been loaded.", conflict)} /> : null}
        {equipment.detailNotice ? (
          <AlertBanner tone="warning" live={false}>{equipment.detailNotice}: a saved change has not reached the details store yet. It is retried automatically.</AlertBanner>
        ) : null}
        <EquipmentDetailFields
          idPrefix="edit-equipment"
          values={values}
          errors={errors}
          disabled={saving}
          onChange={(key, value) => { setValues({ ...values, [key]: value }); setErrors({ ...errors, [key]: undefined }); }}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save details"}</Button>
          <Button type="button" variant="quiet" disabled={saving} onClick={() => { setValues(detailForm(details)); setErrors({}); setMessage(null); }}>Reset</Button>
        </div>
      </form>
    </SectionCard>
  );
}

type Confirm = { step: "ask" } | { step: "upcoming"; count: number; events: UpcomingEquipmentRequest[] } | null;

function StatusSection({ equipment, onSaved }: { equipment: Equipment; onSaved: Saved }) {
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const send = async (active: boolean, confirmUpcomingRequests: boolean) => {
    setSaving(true);
    setError("");
    try {
      const result = await changeEquipmentStatus(equipment.equipmentId, { active, version: equipment.version, confirmUpcomingRequests });
      setConfirm(null);
      onSaved(result.upcomingRequests ? `${result.message} ${result.upcomingRequests} upcoming request(s) were kept.` : result.message, result.equipment);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "EQUIPMENT_HAS_UPCOMING_REQUESTS") {
        setConfirm({
          step: "upcoming",
          count: (caught.details.upcomingCount as number) ?? 0,
          events: (caught.details.upcomingEvents as UpcomingEquipmentRequest[]) ?? [],
        });
      } else {
        setConfirm(null);
        setError(errorText(caught, "The status could not be changed."));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard className="grid gap-4">
      <SectionHeading
        step={3}
        title="Active status"
        description="Inactive equipment cannot be chosen for new event requests. Existing requests and history are kept."
        action={<EquipmentStatusChip status={equipment.status} label={equipment.statusLabel} />}
      />
      {error ? <AlertBanner tone="error">{error}</AlertBanner> : null}
      {equipment.status === "DETAILS_PENDING" ? (
        <AlertBanner tone="info" live={false}>The details are still being saved. The item can be chosen for event requests once they are.</AlertBanner>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {equipment.isActive ? (
          <Button variant="danger" disabled={saving} onClick={() => setConfirm({ step: "ask" })}>Deactivate equipment</Button>
        ) : (
          <Button disabled={saving} onClick={() => void send(true, false)}>{saving ? "Saving…" : "Reactivate equipment"}</Button>
        )}
      </div>
      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Deactivate this equipment?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="quiet" onClick={() => setConfirm(null)}>Keep active</Button>
            <Button variant="danger" disabled={saving} onClick={() => void send(false, confirm?.step === "upcoming")}>{saving ? "Saving…" : "Deactivate"}</Button>
          </div>
        }
      >
        {confirm?.step === "upcoming" ? (
          <AlertBanner tone="warning" title={`Requested by ${confirm.count} upcoming event${confirm.count === 1 ? "" : "s"}`}>
            <ul className="mt-1 grid gap-1">
              {confirm.events.map((event) => (
                <li key={event.eventId}><span className="font-mono text-xs">{event.requestId}</span> {event.title} · {formatEventWindow(event.startDatetime)}</li>
              ))}
            </ul>
            {confirm.count > confirm.events.length ? <p className="mt-1">and {confirm.count - confirm.events.length} more.</p> : null}
            <p className="mt-2">Their requests are kept, but the equipment cannot be added to new requests.</p>
          </AlertBanner>
        ) : (
          <p className="text-sm text-on-surface">The equipment will not be available for new event requests. It stays in existing requests and history and can be reactivated later.</p>
        )}
      </Dialog>
    </SectionCard>
  );
}

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

function UnavailabilitySection({ equipment, records, loadedAt, onSaved }: { equipment: Equipment; records: Unavailability[]; loadedAt: number; onSaved: Saved }) {
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

// /equipment/[equipmentId] for Technical Support (SPM-52): edit the record and
// details, deactivate or reactivate, and manage unavailable stock.
export function EquipmentDetailManager({ equipmentId }: { equipmentId: number | null }) {
  const [state, setState] = useState<PageState>(equipmentId ? { status: "loading" } : { status: "not-found" });
  const [categories, setCategories] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    if (!equipmentId) return;
    let alive = true;
    getEquipment(equipmentId)
      .then((data) => { if (alive) setState({ status: "ready", data: { ...data, loadedAt: Date.now() } }); })
      .catch((caught: unknown) => {
        if (!alive) return;
        if (caught instanceof ApiError && caught.status === 404) setState({ status: "not-found" });
        else setState({ status: "error", message: errorText(caught, "The equipment could not be loaded."), forbidden: caught instanceof ApiError && caught.status === 403 });
      });
    return () => { alive = false; };
  }, [equipmentId, attempt]);

  useEffect(() => {
    let alive = true;
    listEquipmentCategories()
      .then((result) => { if (alive) setCategories(result.categories); })
      .catch(() => { if (alive) setCategories([]); });
    return () => { alive = false; };
  }, []);

  const reload = () => setAttempt((value) => value + 1);
  // Status changes are shown only once the backend has confirmed them.
  const saved: Saved = (message, updated) => {
    if (updated) setState((current) => (current.status === "ready" ? { status: "ready", data: { ...current.data, equipment: updated } } : current));
    setNotice({ tone: "success", text: message });
    reload();
  };

  if (state.status === "loading") {
    return <div className="grid gap-4" aria-busy="true" aria-label="Loading equipment"><Skeleton className="h-28 w-full" /><Skeleton className="h-72 w-full" /></div>;
  }
  if (state.status === "not-found") {
    return (
      <EmptyState
        title="Equipment not found"
        description="This equipment does not exist."
        action={<Link href="/equipment" className={buttonClasses("secondary")}><Icon name="arrow-back" size={16} />Back to Equipment</Link>}
      />
    );
  }
  if (state.status === "error") {
    return (
      <AlertBanner tone="error" title={state.forbidden ? "Equipment is for Technical Support only" : "The equipment could not be loaded"}>
        {state.message}
        {state.forbidden ? null : <div className="mt-3"><Button variant="secondary" onClick={() => { setState({ status: "loading" }); reload(); }}><Icon name="refresh" size={16} />Try again</Button></div>}
      </AlertBanner>
    );
  }

  const { equipment, details, detailsRead, unavailability, loadedAt } = state.data;
  const sectionKey = `${equipment.version}-${attempt}`;
  return (
    <div className="grid gap-5">
      <Link href="/equipment" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <Icon name="arrow-back" size={16} />Equipment
      </Link>
      <PageHeader
        eyebrow="Equipment catalogue"
        title={equipment.name}
        description={`${equipment.category} · ${equipment.storageLocation ?? "No storage location recorded"}`}
        action={<EquipmentStatusChip status={equipment.status} label={equipment.statusLabel} />}
      />
      <div className="-mt-2 flex flex-wrap items-center gap-3">
        <ReferenceIdTag value={`EQUIPMENT-${equipment.equipmentId}`} />
        {equipment.detailNotice ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-on-tertiary-fixed"><Icon name="warning" size={16} />{equipment.detailNotice}</span>
        ) : null}
      </div>
      <div aria-live="polite">
        {notice ? <AlertBanner tone={notice.tone} live={false}>{notice.text}</AlertBanner> : null}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-12">
        <div className="grid gap-5 xl:col-span-8">
          <RecordSection key={`record-${sectionKey}`} equipment={equipment} categories={categories} onSaved={saved} />
          <DetailsSection key={`details-${sectionKey}`} equipment={equipment} details={details} detailsRead={detailsRead} onSaved={saved} />
          <StatusSection key={`status-${sectionKey}`} equipment={equipment} onSaved={saved} />
          <UnavailabilitySection key={`unavailable-${sectionKey}`} equipment={equipment} records={unavailability} loadedAt={loadedAt} onSaved={saved} />
        </div>
        <aside className="grid gap-5 xl:col-span-4" aria-label="Stock and history">
          <section className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
            <SectionHeading title="Stock now" />
            <div className="mt-4"><UnavailableBar unavailable={equipment.unavailableNow} total={equipment.totalQuantity} /></div>
          </section>
          <section className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
            <SectionHeading title="Record history" />
            <KeyValuePanel
              className="mt-4"
              rows={[
                { icon: "history", label: "Created", value: `${formatTimestamp(equipment.createdAt)}${equipment.createdBy?.name ? ` by ${equipment.createdBy.name}` : ""}` },
                { icon: "history", label: "Last updated", value: `${formatTimestamp(equipment.updatedAt)}${equipment.updatedBy?.name ? ` by ${equipment.updatedBy.name}` : ""}` },
                { icon: "history", label: "Details updated", value: details?.updatedAt ? formatTimestamp(details.updatedAt) : "Not recorded" },
              ]}
            />
            <p className="mt-3 text-xs text-on-surface-variant">Every change is recorded in the audit log.</p>
          </section>
          <Button variant="secondary" onClick={reload}><Icon name="refresh" size={16} />Reload equipment</Button>
        </aside>
      </div>
    </div>
  );
}
