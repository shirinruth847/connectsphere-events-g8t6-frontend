"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, EmptyState, FormLabel, Skeleton, buttonClasses, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { useDebouncedValue } from "@/components/venues/use-debounced-value";
import { ApiError } from "@/lib/api";
import { formatTimestamp } from "@/lib/datetime";
import { DETAIL_KEYS, EMPTY_EQUIPMENT_FORM, validateEquipmentForm, type EquipmentFormValues, type FieldErrors } from "@/lib/equipment";
import {
  EMPTY_EQUIPMENT_OPTIONS,
  createEquipment,
  listEquipment,
  listEquipmentOptions,
  type Equipment,
  type EquipmentFilters,
  type EquipmentOptions,
  type EquipmentStatus,
} from "@/lib/api/equipment";
import { EquipmentDetailFields, EquipmentRecordFields } from "./equipment-fields";
import { EquipmentStatusChip, UnavailableBar, errorText } from "./equipment-parts";

type ListState =
  | { status: "loading" }
  | { status: "ready"; equipment: Equipment[]; nextOffset: number | null }
  | { status: "error"; message: string; forbidden: boolean };

type Notice = { tone: "success" | "warning"; text: string } | null;

const toCreateInput = (values: EquipmentFormValues) => ({
  name: values.name,
  category: values.category,
  storageLocation: values.storageLocation,
  totalQuantity: values.totalQuantity.trim(),
  ...Object.fromEntries(DETAIL_KEYS.map((key) => [key, values[key].trim() || null])),
});

function CreateEquipmentDialog({ open, categories, onClose, onCreated }: {
  open: boolean;
  categories: string[];
  onClose: () => void;
  onCreated: (equipment: Equipment) => void;
}) {
  const [values, setValues] = useState<EquipmentFormValues>(EMPTY_EQUIPMENT_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(EMPTY_EQUIPMENT_FORM);

  const reset = () => {
    setValues(EMPTY_EQUIPMENT_FORM);
    setErrors({});
    setFormError("");
    setConfirmDiscard(false);
  };
  // SPM-52 TC-17: cancelling with entered details asks first; nothing is saved.
  const requestClose = () => {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    reset();
    onClose();
  };
  const change = (key: keyof EquipmentFormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setConfirmDiscard(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateEquipmentForm(values);
    setErrors(found);
    setFormError("");
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const { equipment } = await createEquipment(toCreateInput(values));
      reset();
      onCreated(equipment);
    } catch (caught) {
      // Input is kept so the user can correct it (SPM-52 AC12).
      if (caught instanceof ApiError && Object.keys(caught.fields).length) setErrors(caught.fields);
      setFormError(errorText(caught, "The equipment could not be created."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      title="Add equipment"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="quiet" onClick={requestClose}>{confirmDiscard ? "Discard and close" : "Cancel"}</Button>
          <Button type="submit" form="create-equipment-form" disabled={saving}>{saving ? "Saving…" : "Save equipment"}</Button>
        </div>
      }
    >
      <form id="create-equipment-form" noValidate onSubmit={submit} className="grid gap-4">
        {confirmDiscard ? (
          <AlertBanner tone="warning">Discard this equipment? Nothing has been saved. Select “Discard and close” to confirm.</AlertBanner>
        ) : null}
        {formError ? <AlertBanner tone="error">{formError}</AlertBanner> : null}
        <EquipmentRecordFields idPrefix="create-equipment" values={values} errors={errors} onChange={change} disabled={saving} categories={categories} />
        <EquipmentDetailFields idPrefix="create-equipment" values={values} errors={errors} onChange={change} disabled={saving} />
        <p className="text-xs text-on-surface-variant">
          New equipment shows “Details pending” until its details are saved, and cannot be chosen for event requests until then.
        </p>
      </form>
    </Dialog>
  );
}

function EquipmentRow({ item }: { item: Equipment }) {
  return (
    <li className="grid gap-3 rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 transition-shadow duration-150 hover:shadow-elevation-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-on-surface [overflow-wrap:anywhere]">{item.name}</h3>
          <EquipmentStatusChip status={item.status} label={item.statusLabel} />
        </div>
        <p className="mt-1 text-sm text-on-surface-variant">
          {item.category} · {item.storageLocation ?? "No storage location recorded"}
        </p>
        {item.detailNotice ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-on-tertiary-fixed">
            <Icon name="warning" size={16} />{item.detailNotice}
          </p>
        ) : null}
      </div>
      <div className="grid gap-1 text-sm text-on-surface-variant">
        <UnavailableBar unavailable={item.unavailableNow} total={item.totalQuantity} />
        <p className="text-xs">Updated {formatTimestamp(item.updatedAt)}{item.updatedBy?.name ? ` by ${item.updatedBy.name}` : ""}</p>
      </div>
      <Link href={`/equipment/${item.equipmentId}`} className={buttonClasses("secondary")} aria-label={`Manage ${item.name}`}>
        Manage<Icon name="arrow-forward" size={16} />
      </Link>
    </li>
  );
}

// "Equipment" for Technical Support (SPM-52 AC5): search by name as you type,
// filter by category and status, create items and open one to manage it.
export function EquipmentList() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<EquipmentStatus | "">("");
  const debouncedSearch = useDebouncedValue(search.trim());
  const filters: EquipmentFilters = useMemo(() => ({ search: debouncedSearch, category, status }), [debouncedSearch, category, status]);
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [options, setOptions] = useState<EquipmentOptions>(EMPTY_EQUIPMENT_OPTIONS);
  const { categories } = options;
  const statusPills: { value: EquipmentStatus | ""; label: string }[] = [{ value: "", label: "All" }, ...options.statuses];
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const listRequestId = useRef(0);
  const filtered = Boolean(filters.search || filters.category || filters.status);

  useEffect(() => {
    let alive = true;
    listEquipmentOptions()
      .then((result) => { if (alive) setOptions(result); })
      // Without options the filters offer only "All"; the list still loads.
      .catch(() => { if (alive) setOptions(EMPTY_EQUIPMENT_OPTIONS); });
    return () => { alive = false; };
  }, [attempt]);

  useEffect(() => {
    listRequestId.current += 1;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(true);
    setLoadingMore(false);
    listEquipment(filters)
      .then((result) => { if (alive) setState({ status: "ready", equipment: result.equipment, nextOffset: result.nextOffset }); })
      .catch((caught: unknown) => {
        if (!alive) return;
        setState({
          status: "error",
          message: errorText(caught, "Equipment could not be loaded."),
          forbidden: caught instanceof ApiError && caught.status === 403,
        });
      })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [filters, attempt]);

  const clear = () => {
    setSearch("");
    setCategory("");
    setStatus("");
  };
  const reload = () => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  };
  const loadMore = async () => {
    if (loadingMore || state.status !== "ready" || state.nextOffset === null) return;
    const requestId = listRequestId.current;
    setLoadingMore(true);
    try {
      const next = await listEquipment(filters, state.nextOffset);
      if (requestId !== listRequestId.current) return;
      setState((current) => current.status === "ready"
        ? { ...current, equipment: [...current.equipment, ...next.equipment], nextOffset: next.nextOffset }
        : current);
    } catch (caught) {
      if (requestId === listRequestId.current) setNotice({ tone: "warning", text: errorText(caught, "More equipment could not be loaded.") });
    } finally {
      if (requestId === listRequestId.current) setLoadingMore(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-readable text-sm text-on-surface-variant">
          Add equipment, update stock and details, record unavailable stock and deactivate items. Deactivated items stay in existing requests and history.
        </p>
        <Button onClick={() => setCreating(true)}><Icon name="edit" size={16} />Add equipment</Button>
      </div>

      <div aria-live="polite">
        {notice ? <AlertBanner tone={notice.tone} live={false}>{notice.text}</AlertBanner> : null}
      </div>

      <section aria-label="Search and filter equipment" className="grid gap-3 rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr] sm:items-end">
          <div>
            <FormLabel htmlFor="equipment-search">Equipment name</FormLabel>
            <input id="equipment-search" type="search" className={fieldClasses} placeholder="Search by name" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div>
            <FormLabel htmlFor="equipment-category">Category</FormLabel>
            <select id="equipment-category" className={fieldClasses} value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">All categories</option>
              {categories.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="group" aria-label="Status" className="flex flex-wrap gap-2">
            {statusPills.map((pill) => {
              const active = status === pill.value;
              return (
                <button
                  key={pill.value || "all"}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatus(pill.value)}
                  className={`min-h-11 rounded-pill px-4 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    active ? "bg-primary text-on-primary" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
          <Button type="button" variant="quiet" disabled={!filtered && !search} onClick={clear}>Clear filters</Button>
        </div>
        <p className="text-xs text-on-surface-variant">Results update as you type.</p>
      </section>

      {busy && state.status === "ready" ? <p className="text-xs text-on-surface-variant" aria-live="polite">Updating…</p> : null}

      {state.status === "loading" ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Loading equipment"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : null}
      {state.status === "error" ? (
        <AlertBanner tone="error" title={state.forbidden ? "Equipment is for Technical Support only" : "Equipment could not be loaded"}>
          {state.message}
          {state.forbidden ? null : <div className="mt-3"><Button variant="secondary" onClick={reload}><Icon name="refresh" size={16} />Try again</Button></div>}
        </AlertBanner>
      ) : null}
      {state.status === "ready" && !state.equipment.length ? (
        <EmptyState
          title={filtered ? "No equipment matches these filters" : "No equipment yet"}
          description={filtered ? "Clear the filters to see all equipment." : "Add the first item so it can be requested for events."}
          action={filtered ? <Button variant="secondary" onClick={clear}>Clear filters</Button> : <Button onClick={() => setCreating(true)}>Add equipment</Button>}
        />
      ) : null}
      {state.status === "ready" && state.equipment.length ? (
        <>
          <ul className="grid gap-3" aria-label="Equipment" aria-busy={busy}>
            {state.equipment.map((item) => <EquipmentRow key={item.equipmentId} item={item} />)}
          </ul>
          {state.nextOffset !== null ? (
            <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more equipment"}</Button>
          ) : null}
        </>
      ) : null}

      <CreateEquipmentDialog
        open={creating}
        categories={categories}
        onClose={() => setCreating(false)}
        onCreated={(equipment) => {
          setCreating(false);
          setNotice(equipment.status === "DETAILS_PENDING"
            ? { tone: "warning", text: `“${equipment.name}” was created. Its details are still being saved, so it shows “Details pending” and cannot be requested yet.` }
            : { tone: "success", text: `“${equipment.name}” was created and is ${equipment.statusLabel.toLowerCase()}.` });
          reload();
        }}
      />
    </div>
  );
}
