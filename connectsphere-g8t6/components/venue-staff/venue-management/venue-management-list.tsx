"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, EmptyState, FormLabel, Skeleton, buttonClasses, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { ApiError } from "@/lib/api";
import { formatTimestamp } from "@/lib/datetime";
import {
  VENUE_STATUS_LABELS,
  createVenue,
  listManagedVenues,
  updateVenueDetails,
  type ManagedVenue,
  type ManagedVenueFilters,
  type VenueStatus,
} from "@/lib/api/venues";
import { BufferFields, Field, VenueCoreFields, VenueStatusChip, type FieldErrors } from "./venue-fields";
import { EMPTY_VENUE_FORM, validateVenueForm, type VenueFormValues } from "./venue-form-rules";

type ListState =
  | { status: "loading" }
  | { status: "ready"; venues: ManagedVenue[]; nextOffset: number | null }
  | { status: "error"; message: string };

const EMPTY_FILTERS: ManagedVenueFilters = { search: "", location: "", status: "" };

function CreateVenueDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (venue: ManagedVenue, warning: string | null) => void;
}) {
  const [values, setValues] = useState<VenueFormValues>(EMPTY_VENUE_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(EMPTY_VENUE_FORM);

  const reset = () => {
    setValues(EMPTY_VENUE_FORM);
    setErrors({});
    setFormError("");
    setConfirmDiscard(false);
  };
  // SPM-73 TC10: cancelling with entered details asks first; nothing is saved.
  const requestClose = () => {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    reset();
    onClose();
  };
  const change = (key: keyof VenueFormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setConfirmDiscard(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateVenueForm(values);
    setErrors(found);
    setFormError("");
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const { venue } = await createVenue({
        name: values.name,
        address: values.address,
        maxCapacity: values.maxCapacity,
        contactPerson: values.contactPerson,
        contactEmail: values.contactEmail,
        contactNumber: values.contactNumber,
        status: values.status as VenueStatus,
        ...(values.status === "ACTIVE" ? {} : { statusReason: values.statusReason }),
      });
      let warning: string | null = null;
      if (values.setupMinutes.trim() || values.turnaroundMinutes.trim()) {
        try {
          await updateVenueDetails(venue.venueId, {
            version: 0,
            ...(values.setupMinutes.trim() ? { setupMinutes: Number(values.setupMinutes) } : {}),
            ...(values.turnaroundMinutes.trim() ? { turnaroundMinutes: Number(values.turnaroundMinutes) } : {}),
          });
        } catch {
          warning = "The venue was created, but its setup and turnaround times could not be saved. Add them on the venue page.";
        }
      }
      reset();
      onCreated(venue, warning);
    } catch (caught) {
      if (caught instanceof ApiError && Object.keys(caught.fields).length) setErrors(caught.fields);
      setFormError(caught instanceof Error ? caught.message : "The venue could not be created.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      title="Create venue"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="quiet" onClick={requestClose}>{confirmDiscard ? "Discard and close" : "Cancel"}</Button>
          <Button type="submit" form="create-venue-form" disabled={saving}>{saving ? "Saving…" : "Save venue"}</Button>
        </div>
      }
    >
      <form id="create-venue-form" noValidate onSubmit={submit} className="grid gap-4">
        {confirmDiscard ? (
          <AlertBanner tone="warning">Discard this venue? Nothing has been saved. Select “Discard and close” to confirm.</AlertBanner>
        ) : null}
        {formError ? <AlertBanner tone="error">{formError}</AlertBanner> : null}
        <VenueCoreFields idPrefix="create-venue" values={values} errors={errors} onChange={change} disabled={saving} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="create-venue-status" label="Venue status" required error={errors.status}>
            <select id="create-venue-status" className={fieldClasses} value={values.status} onChange={(event) => change("status", event.target.value)} disabled={saving}>
              {Object.entries(VENUE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          {values.status !== "ACTIVE" ? (
            <Field id="create-venue-reason" label="Reason" required={values.status === "UNDER_MAINTENANCE"} error={errors.statusReason}>
              <input id="create-venue-reason" className={fieldClasses} value={values.statusReason} onChange={(event) => change("statusReason", event.target.value)} disabled={saving} />
            </Field>
          ) : null}
        </div>
        <BufferFields idPrefix="create-venue" values={values} errors={errors} onChange={change} disabled={saving} />
        <p className="text-xs text-on-surface-variant">Setup and turnaround times are needed before the venue can receive holds or bookings.</p>
      </form>
    </Dialog>
  );
}

function ManagedVenueRow({ venue }: { venue: ManagedVenue }) {
  return (
    <li className="grid gap-3 rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-on-surface">{venue.name}</h3>
          <VenueStatusChip status={venue.status} />
        </div>
        <p className="mt-1 text-sm text-on-surface-variant">{venue.address}</p>
        {venue.statusReason ? <p className="mt-1 text-xs text-on-surface-variant">Reason: {venue.statusReason}</p> : null}
      </div>
      <div className="text-sm text-on-surface-variant">
        <p><span className="font-semibold text-on-surface">{venue.maxCapacity.toLocaleString()}</span> capacity</p>
        <p>Updated {formatTimestamp(venue.updatedAt)}{venue.updatedBy?.name ? ` by ${venue.updatedBy.name}` : ""}</p>
      </div>
      <Link href={`/venues/${venue.venueId}`} className={buttonClasses("secondary")}>
        Manage<Icon name="arrow-forward" size={16} />
      </Link>
    </li>
  );
}

// "My Venues" for Venue Staff (SPM-73): every venue not deleted, searchable by
// name and location and filterable by status, with create and manage actions.
export function VenueManagementList() {
  const [draft, setDraft] = useState<ManagedVenueFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<ManagedVenueFilters>(EMPTY_FILTERS);
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "warning"; text: string } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const filtered = Boolean(filters.search || filters.location || filters.status);

  useEffect(() => {
    let alive = true;
    listManagedVenues(filters)
      .then((result) => { if (alive) setState({ status: "ready", ...result }); })
      .catch((caught: unknown) => {
        if (alive) setState({ status: "error", message: caught instanceof Error ? caught.message : "Venues could not be loaded." });
      });
    return () => { alive = false; };
  }, [filters, attempt]);

  const apply = (next: ManagedVenueFilters) => {
    setState({ status: "loading" });
    setFilters(next);
  };
  const reload = () => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  };
  const loadMore = async () => {
    if (state.status !== "ready" || state.nextOffset === null) return;
    setLoadingMore(true);
    try {
      const next = await listManagedVenues(filters, state.nextOffset);
      setState({ status: "ready", venues: [...state.venues, ...next.venues], nextOffset: next.nextOffset });
    } catch (caught) {
      setNotice({ tone: "warning", text: caught instanceof Error ? caught.message : "More venues could not be loaded." });
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-on-surface-variant">Create venues, update their details and set their status. Deactivated venues stay in historical records.</p>
        <Button onClick={() => setCreating(true)}><Icon name="edit" size={16} />Create venue</Button>
      </div>

      <div aria-live="polite">
        {notice ? <AlertBanner tone={notice.tone} live={false}>{notice.text}</AlertBanner> : null}
      </div>

      <form
        aria-label="Search and filter venues"
        onSubmit={(event) => { event.preventDefault(); apply(draft); }}
        className="grid gap-3 rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:grid-cols-2 xl:grid-cols-[2fr_2fr_1fr_auto] xl:items-end"
      >
        <div>
          <FormLabel htmlFor="manage-search">Venue name</FormLabel>
          <input id="manage-search" className={fieldClasses} placeholder="Search by name" value={draft.search} onChange={(event) => setDraft({ ...draft, search: event.target.value })} />
        </div>
        <div>
          <FormLabel htmlFor="manage-location">Location</FormLabel>
          <input id="manage-location" className={fieldClasses} placeholder="Search by address" value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} />
        </div>
        <div>
          <FormLabel htmlFor="manage-status">Status</FormLabel>
          <select id="manage-status" className={fieldClasses} value={draft.status} onChange={(event) => { const next = { ...draft, status: event.target.value }; setDraft(next); apply(next); }}>
            <option value="">All statuses</option>
            {Object.entries(VENUE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <Button type="submit">Search</Button>
          <Button type="button" variant="quiet" disabled={!filtered} onClick={() => { setDraft(EMPTY_FILTERS); apply(EMPTY_FILTERS); }}>Clear</Button>
        </div>
      </form>

      {state.status === "loading" ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Loading venues"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : null}
      {state.status === "error" ? (
        <AlertBanner tone="error" title="Venues could not be loaded">
          {state.message}
          <div className="mt-3"><Button variant="secondary" onClick={reload}><Icon name="refresh" size={16} />Try again</Button></div>
        </AlertBanner>
      ) : null}
      {state.status === "ready" && !state.venues.length ? (
        <EmptyState
          title={filtered ? "No venues match these filters" : "No venues yet"}
          description={filtered ? "Clear the filters to see every venue." : "Create the first venue to make it available for booking."}
          action={filtered ? <Button variant="secondary" onClick={() => { setDraft(EMPTY_FILTERS); apply(EMPTY_FILTERS); }}>Clear filters</Button> : undefined}
        />
      ) : null}
      {state.status === "ready" && state.venues.length ? (
        <>
          <ul className="grid gap-3" aria-label="Venues">
            {state.venues.map((venue) => <ManagedVenueRow key={venue.venueId} venue={venue} />)}
          </ul>
          {state.nextOffset !== null ? (
            <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more venues"}</Button>
          ) : null}
        </>
      ) : null}

      <CreateVenueDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(venue, warning) => {
          setCreating(false);
          setNotice(warning ? { tone: "warning", text: warning } : { tone: "success", text: `Venue “${venue.name}” created with ${VENUE_STATUS_LABELS[venue.status]} status.` });
          reload();
        }}
      />
    </div>
  );
}
