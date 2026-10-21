"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, EmptyState, FormLabel, Skeleton, buttonClasses, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { ApiError } from "@/lib/api";
import { formatTimestamp } from "@/lib/datetime";
import { useVenuePhoto } from "@/components/venues/use-venue-photo";
import { useDebouncedValue } from "@/components/venues/use-debounced-value";
import { MANAGED_VENUE_SORT_OPTIONS, type ManagedVenueSort } from "@/components/venues/venue-queries";
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
  | { status: "ready"; venues: ManagedVenue[]; nextOffset: number | null; sortNotChecked: boolean }
  | { status: "error"; message: string };

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

const formatMinutes = (minutes: number | null | undefined) => (minutes == null ? "Not recorded" : `${minutes} min`);

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
        <p>Setup {formatMinutes(venue.setupMinutes)} · Turnaround {formatMinutes(venue.turnaroundMinutes)}</p>
        <p>Updated {formatTimestamp(venue.updatedAt)}{venue.updatedBy?.name ? ` by ${venue.updatedBy.name}` : ""}</p>
      </div>
      <Link href={`/venues/${venue.venueId}`} className={buttonClasses("secondary")}>
        Manage<Icon name="arrow-forward" size={16} />
      </Link>
    </li>
  );
}

// Large-icon card. Venue photos are outside the baseline (Master 3.3, 6.4), so
// the picture area is a placeholder.
// The first gallery photo (T28), or the placeholder when there is none or it
// cannot be loaded. Decorative: the tile's heading names the venue.
function VenueTileCover({ venueId, photoId }: { venueId: number; photoId?: string | null }) {
  const source = useVenuePhoto(venueId, photoId);
  if (source?.status === "ready") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={source.url} alt="" data-testid="venue-tile-cover" className="aspect-[4/3] w-full object-cover" />;
  }
  if (source?.status === "loading") return <div aria-hidden="true" className="aspect-[4/3] animate-pulse bg-surface-container-low" />;
  return (
    <div aria-hidden="true" data-testid="venue-tile-placeholder" className="grid aspect-[4/3] place-items-center bg-primary-fixed text-primary">
      <Icon name="venue" size={20} />
    </div>
  );
}

function ManagedVenueTile({ venue }: { venue: ManagedVenue }) {
  const titleId = `venue-tile-${venue.venueId}`;
  return (
    <li>
      <Link
        href={`/venues/${venue.venueId}`}
        aria-labelledby={titleId}
        className="flex h-full flex-col overflow-hidden rounded-panel bg-surface-container-lowest shadow-elevation-1 transition-shadow duration-150 hover:shadow-elevation-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <VenueTileCover venueId={venue.venueId} photoId={venue.coverPhotoId} />
        <div className="grid gap-1 p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 id={titleId} className="line-clamp-2 text-sm font-semibold text-on-surface">{venue.name}</h3>
            <VenueStatusChip status={venue.status} />
          </div>
          <p className="line-clamp-1 text-xs text-on-surface-variant">{venue.address}</p>
          <p className="text-xs text-on-surface-variant"><span className="font-semibold text-on-surface">{venue.maxCapacity.toLocaleString()}</span> capacity</p>
          <p className="text-xs text-on-surface-variant">Updated {formatTimestamp(venue.updatedAt)}</p>
        </div>
      </Link>
    </li>
  );
}

type ViewMode = "list" | "icons";
const VIEW_STORAGE_KEY = "connectsphere:my-venues-view";

const readView = (): ViewMode => {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "icons" ? "icons" : "list";
  } catch {
    return "list";
  }
};

// "My Venues" for Venue Staff (SPM-73, SPM-181): every venue not deleted,
// searched by name and location as you type, filtered by status, sorted, and
// shown as a list or as large icons, with create and manage actions.
export function VenueManagementList() {
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<ManagedVenueSort>("name");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [view, setView] = useState<ViewMode>("list");
  const debouncedSearch = useDebouncedValue(search.trim());
  const debouncedLocation = useDebouncedValue(location.trim());
  const filters: ManagedVenueFilters = useMemo(
    () => ({ search: debouncedSearch, location: debouncedLocation, status, sort, order }),
    [debouncedSearch, debouncedLocation, status, sort, order],
  );
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "warning"; text: string } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const filtered = Boolean(filters.search || filters.location || filters.status);

  useEffect(() => {
    // The saved view is only readable in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(readView());
  }, []);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(true);
    listManagedVenues(filters)
      .then((result) => { if (alive) setState({ status: "ready", venues: result.venues, nextOffset: result.nextOffset, sortNotChecked: Boolean(result.sortNotChecked) }); })
      .catch((caught: unknown) => {
        if (alive) setState({ status: "error", message: caught instanceof Error ? caught.message : "Venues could not be loaded." });
      })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [filters, attempt]);

  const chooseView = (next: ViewMode) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // The choice simply is not remembered.
    }
  };
  const clear = () => {
    setSearch("");
    setLocation("");
    setStatus("");
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
      setState({ ...state, venues: [...state.venues, ...next.venues], nextOffset: next.nextOffset });
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

      <section
        aria-label="Search, sort and filter venues"
        className="grid gap-3 rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:grid-cols-2 xl:grid-cols-[2fr_2fr_1fr_1fr_1fr] xl:items-end"
      >
        <div>
          <FormLabel htmlFor="manage-search">Venue name</FormLabel>
          <input id="manage-search" type="search" className={fieldClasses} placeholder="Search by name" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div>
          <FormLabel htmlFor="manage-location">Location</FormLabel>
          <input id="manage-location" type="search" className={fieldClasses} placeholder="Search by address" value={location} onChange={(event) => setLocation(event.target.value)} />
        </div>
        <div>
          <FormLabel htmlFor="manage-status">Status</FormLabel>
          <select id="manage-status" className={fieldClasses} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(VENUE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <FormLabel htmlFor="manage-sort">Sort by</FormLabel>
          <select id="manage-sort" className={fieldClasses} value={sort} onChange={(event) => setSort(event.target.value as ManagedVenueSort)}>
            {MANAGED_VENUE_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <FormLabel htmlFor="manage-order">Order</FormLabel>
          <select id="manage-order" className={fieldClasses} value={order} onChange={(event) => setOrder(event.target.value as "asc" | "desc")}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2 xl:col-span-5">
          <p className="text-xs text-on-surface-variant">Results update as you type.</p>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Layout" className="flex gap-1">
              {([["list", "List"], ["icons", "Large icons"]] as const).map(([value, label]) => (
                <Button key={value} type="button" variant={view === value ? "primary" : "quiet"} aria-pressed={view === value} onClick={() => chooseView(value)}>
                  {label}
                </Button>
              ))}
            </div>
            <Button type="button" variant="quiet" disabled={!filtered && !search && !location} onClick={clear}>Clear</Button>
          </div>
        </div>
      </section>

      {state.status === "ready" && state.sortNotChecked ? (
        <AlertBanner tone="warning">Setup and turnaround times cannot be read right now, so venues are shown in name order.</AlertBanner>
      ) : null}
      {busy && state.status === "ready" ? <p className="text-xs text-on-surface-variant" aria-live="polite">Updating…</p> : null}

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
          action={filtered ? <Button variant="secondary" onClick={clear}>Clear filters</Button> : undefined}
        />
      ) : null}
      {state.status === "ready" && state.venues.length ? (
        <>
          {view === "list" ? (
            <ul className="grid gap-3" aria-label="Venues" aria-busy={busy}>
              {state.venues.map((venue) => <ManagedVenueRow key={venue.venueId} venue={venue} />)}
            </ul>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-label="Venues" aria-busy={busy}>
              {state.venues.map((venue) => <ManagedVenueTile key={venue.venueId} venue={venue} />)}
            </ul>
          )}
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
