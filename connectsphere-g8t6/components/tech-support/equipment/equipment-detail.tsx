"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { AlertBanner, Button, EmptyState, PageHeader, ReferenceIdTag, SectionCard, Skeleton, buttonClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { SectionHeading } from "@/components/shared/section-heading";
import { ApiError } from "@/lib/api";
import { formatTimestamp } from "@/lib/datetime";
import {
  DETAIL_KEYS,
  EMPTY_EQUIPMENT_FORM,
  RECORD_KEYS,
  validateEquipmentForm,
  type EquipmentFormValues,
  type FieldErrors,
} from "@/lib/equipment";
import {
  getEquipment,
  listEquipmentCategories,
  updateEquipment,
  type Equipment,
  type EquipmentDetails,
  type Unavailability,
} from "@/lib/api/equipment";
import { EquipmentDetailFields, EquipmentRecordFields } from "./equipment-fields";
import { EquipmentStatusChip, UnavailableBar, errorText, type Saved } from "./equipment-parts";
import { StatusSection } from "./equipment-status";
import { UnavailabilitySection } from "./equipment-unavailability";

// loadedAt is when the data arrived; "in progress" is judged against it, not the render time.
type Loaded = { equipment: Equipment; details: EquipmentDetails | null; detailsRead: "OK" | "NOT_CHECKED"; unavailability: Unavailability[]; loadedAt: number };
type PageState =
  | { status: "loading" }
  | { status: "ready"; data: Loaded }
  | { status: "not-found" }
  | { status: "error"; message: string; forbidden: boolean };
type Notice = { tone: "success" | "error" | "warning"; text: string } | null;

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

type EquipmentKey = keyof EquipmentFormValues;

// The record and details forms (SPM-52 AC6): only changed fields are checked and
// sent with the loaded version. A stale save is shown with the current values and
// nothing is overwritten; other refusals keep the input and show the backend's
// field messages. formFor gives the saved values the form starts from.
function useEquipmentForm({ equipment, formFor, keys, toValue, failure, successText, onSaved }: {
  equipment: Equipment;
  formFor: () => EquipmentFormValues;
  keys: readonly EquipmentKey[];
  toValue: (text: string) => string | null;
  failure: string;
  successText: (message: string, saved: Equipment) => string;
  onSaved: Saved;
}) {
  const [values, setValues] = useState(formFor);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<Notice>(null);
  const [conflict, setConflict] = useState<Equipment | null>(null);
  const [saving, setSaving] = useState(false);

  const change = (key: EquipmentKey, value: string) => {
    setValues({ ...values, [key]: value });
    setErrors({ ...errors, [key]: undefined });
  };

  const reset = () => {
    setValues(formFor());
    setErrors({});
    setMessage(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const original = formFor();
    const changed = keys.filter((key) => values[key].trim() !== original[key]);
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
        ...Object.fromEntries(changed.map((key) => [key, toValue(values[key].trim())])),
        version: equipment.version,
      });
      onSaved(successText(result.message, result.equipment), result.equipment);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "EQUIPMENT_VERSION_CONFLICT" && caught.details.current) {
        setConflict(caught.details.current as Equipment);
      } else {
        if (caught instanceof ApiError && Object.keys(caught.fields).length) setErrors(caught.fields);
        setMessage({ tone: "error", text: errorText(caught, failure) });
      }
    } finally {
      setSaving(false);
    }
  };

  return { values, errors, message, conflict, saving, change, reset, submit };
}

function FormBanners({ message, conflict, onSaved }: { message: Notice; conflict: Equipment | null; onSaved: Saved }) {
  return (
    <>
      {message ? <AlertBanner tone={message.tone}>{message.text}</AlertBanner> : null}
      {conflict ? <ConflictBanner current={conflict} onLoad={() => onSaved("The current values have been loaded.", conflict)} /> : null}
    </>
  );
}

function RecordSection({ equipment, categories, onSaved }: { equipment: Equipment; categories: string[]; onSaved: Saved }) {
  // Rows from before SPM-52 may lack a storage location; only changed fields are checked.
  const form = useEquipmentForm({
    equipment,
    formFor: () => recordForm(equipment),
    keys: RECORD_KEYS,
    toValue: (text) => text,
    failure: "The equipment could not be saved.",
    successText: (message) => message,
    onSaved,
  });

  return (
    <SectionCard className="grid gap-4">
      <SectionHeading step={1} title="Equipment record" description="Name, category, storage location and total stock. Lowering the total below stock already marked unavailable is refused." />
      <form noValidate onSubmit={form.submit} className="grid gap-4">
        <FormBanners message={form.message} conflict={form.conflict} onSaved={onSaved} />
        <EquipmentRecordFields
          idPrefix="edit-equipment"
          values={form.values}
          errors={form.errors}
          categories={categories}
          disabled={form.saving}
          onChange={form.change}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={form.saving}>{form.saving ? "Saving…" : "Save record"}</Button>
          <Button type="button" variant="quiet" disabled={form.saving} onClick={form.reset}>Reset</Button>
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
  // A cleared detail field is sent as null.
  const form = useEquipmentForm({
    equipment,
    formFor: () => detailForm(details),
    keys: DETAIL_KEYS,
    toValue: (text) => text || null,
    failure: "The details could not be saved.",
    successText: (message, saved) => (saved.detailNotice ? `${message} The details are still being saved, so they may be out of date for a moment.` : message),
    onSaved,
  });

  if (detailsRead === "NOT_CHECKED") {
    return (
      <SectionCard className="grid gap-4">
        <SectionHeading step={2} title="Specifications and notes" />
        <AlertBanner tone="warning">The details cannot be read right now, so they cannot be edited. Stock and status still work. Reload the page to try again.</AlertBanner>
      </SectionCard>
    );
  }

  return (
    <SectionCard className="grid gap-4">
      <SectionHeading step={2} title="Specifications and notes" description="Display information for planning. Quantities and availability never depend on it." />
      <form noValidate onSubmit={form.submit} className="grid gap-4">
        <FormBanners message={form.message} conflict={form.conflict} onSaved={onSaved} />
        {equipment.detailNotice ? (
          <AlertBanner tone="warning" live={false}>{equipment.detailNotice}: a saved change has not reached the details store yet. It is retried automatically.</AlertBanner>
        ) : null}
        <EquipmentDetailFields
          idPrefix="edit-equipment"
          values={form.values}
          errors={form.errors}
          disabled={form.saving}
          onChange={form.change}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={form.saving}>{form.saving ? "Saving…" : "Save details"}</Button>
          <Button type="button" variant="quiet" disabled={form.saving} onClick={form.reset}>Reset</Button>
        </div>
      </form>
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
