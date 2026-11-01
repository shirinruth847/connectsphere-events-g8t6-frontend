"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, EmptyState, PageHeader, ReferenceIdTag, SectionCard, Skeleton, buttonClasses, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { BackButton } from "@/components/shared/back-button";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { SectionHeading } from "@/components/shared/section-heading";
import { ApiError } from "@/lib/api";
import { formatTimestamp } from "@/lib/datetime";
import {
  VENUE_STATUS_LABELS,
  changeVenueStatus,
  getManagedVenue,
  getVenueHistory,
  updateVenue,
  updateVenueDetails,
  type AffectedEvent,
  type DetailStatus,
  type ManagedVenue,
  type VenueDetails,
  type VenueStatus,
} from "@/lib/api/venues";
import { BufferFields, Field, VenueCoreFields, VenueStatusChip, type FieldErrors } from "./venue-fields";
import { VenueGallery } from "./venue-gallery";
import { VenueBlocksSection } from "./venue-blocks";
import { HistoryPanel } from "@/components/events/workspace/event-history-panel";
import { useHistory, type HistoryLoader } from "@/components/events/workspace/use-event-history";
import { EMPTY_VENUE_FORM, formatList, parseList, validateVenueForm, type VenueFormValues } from "./venue-form-rules";

type Loaded = { venue: ManagedVenue; details: VenueDetails | null; detailStatus: DetailStatus };
type PageState = { status: "loading" } | { status: "ready"; data: Loaded } | { status: "not-found" } | { status: "error"; message: string };
type Notice = { tone: "success" | "error" | "warning"; text: string } | null;

const toForm = (venue: ManagedVenue): VenueFormValues => ({
  ...EMPTY_VENUE_FORM,
  name: venue.name,
  address: venue.address,
  maxCapacity: String(venue.maxCapacity),
  contactPerson: venue.contactPerson ?? "",
  contactEmail: venue.contactEmail ?? "",
  contactNumber: venue.contactNumber ?? "",
  status: venue.status,
});

const CORE_KEYS = ["name", "address", "maxCapacity", "contactPerson", "contactEmail", "contactNumber"] as const;

function RecordSection({ venue, onSaved }: { venue: ManagedVenue; onSaved: (venue: ManagedVenue, message: string) => void }) {
  const [values, setValues] = useState(() => toForm(venue));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const original = toForm(venue);
    // Venues older than SPM-73 may lack contact details; an edit only has to
    // satisfy the fields it touches or that already hold a value.
    const applies = (key: keyof VenueFormValues) => values[key].trim() !== original[key] || original[key] !== "";
    // The "number or email" message sits on contactNumber but covers both fields.
    const found = Object.fromEntries(
      Object.entries(validateVenueForm(values, { includeStatus: false }))
        .filter(([key]) => applies(key as keyof VenueFormValues) || (key === "contactNumber" && applies("contactEmail"))),
    );
    setErrors(found);
    setMessage(null);
    if (Object.keys(found).length) return;
    const changes = Object.fromEntries(CORE_KEYS.filter((key) => values[key].trim() !== original[key]).map((key) => [key, values[key]]));
    if (!Object.keys(changes).length) {
      setMessage({ tone: "warning", text: "No changes to save." });
      return;
    }
    setSaving(true);
    try {
      const result = await updateVenue(venue.venueId, { ...changes, version: venue.version });
      onSaved(result.venue, result.message);
    } catch (caught) {
      if (caught instanceof ApiError && Object.keys(caught.fields).length) setErrors(caught.fields);
      setMessage({ tone: "error", text: caught instanceof Error ? caught.message : "The venue could not be saved." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard className="grid gap-4">
      <SectionHeading step={1} title="Venue record" description="Name, location, capacity and contact details. Existing bookings stay linked to the venue." />
      <form noValidate onSubmit={submit} className="grid gap-4">
        {message ? <AlertBanner tone={message.tone}>{message.text}</AlertBanner> : null}
        <VenueCoreFields idPrefix="edit-venue" values={values} errors={errors} disabled={saving} onChange={(key, value) => { setValues({ ...values, [key]: value }); setErrors({ ...errors, [key]: undefined }); }} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save venue record"}</Button>
          <Button type="button" variant="quiet" disabled={saving} onClick={() => { setValues(toForm(venue)); setErrors({}); setMessage(null); }}>Reset</Button>
        </div>
      </form>
    </SectionCard>
  );
}

function StatusSection({ venue, onSaved }: { venue: ManagedVenue; onSaved: (venue: ManagedVenue, message: string) => void }) {
  const [status, setStatus] = useState<VenueStatus>(venue.status);
  const [reason, setReason] = useState(venue.statusReason ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ upcoming: number | null; firstStart?: string | null; affectedEvents?: AffectedEvent[] } | null>(null);

  const send = async (confirmUpcomingBookings: boolean) => {
    setSaving(true);
    setError("");
    try {
      const result = await changeVenueStatus(venue.venueId, {
        version: venue.version,
        status,
        ...(status === "ACTIVE" ? {} : { reason }),
        confirmUpcomingBookings,
      });
      setConfirm(null);
      const notified = result.affectedEvents?.length
        ? ` The coordinators and organisers of ${result.affectedEvents.length} affected event${result.affectedEvents.length === 1 ? "" : "s"} were notified.`
        : "";
      onSaved(result.venue, result.upcomingBookings ? `${result.message} ${result.upcomingBookings} upcoming booking(s) were kept.${notified}` : result.message);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "VENUE_HAS_UPCOMING_BOOKINGS") {
        setConfirm({
          upcoming: (caught.details.upcomingBookings as number) ?? null,
          firstStart: caught.details.firstStart as string | null,
          affectedEvents: Array.isArray(caught.details.affectedEvents) ? (caught.details.affectedEvents as AffectedEvent[]) : [],
        });
      } else {
        setConfirm(null);
        setError(caught instanceof ApiError && caught.fields.reason ? caught.fields.reason : caught instanceof Error ? caught.message : "The status could not be changed.");
      }
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (status === "UNDER_MAINTENANCE" && !reason.trim()) {
      setError("Enter a reason for putting the venue under maintenance");
      return;
    }
    // Deactivation always asks first (SPM-73 AC); the backend adds the upcoming-booking warning.
    if (status === "INACTIVE" && venue.status !== "INACTIVE") setConfirm({ upcoming: null });
    else void send(false);
  };

  return (
    <SectionCard className="grid gap-4">
      <SectionHeading step={2} title="Venue status" description="Inactive and under-maintenance venues cannot be selected for new bookings. Existing bookings are never removed." action={<VenueStatusChip status={venue.status} />} />
      <form noValidate onSubmit={submit} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
        <Field id="venue-status" label="Status">
          <select id="venue-status" className={fieldClasses} value={status} onChange={(event) => { setStatus(event.target.value as VenueStatus); setError(""); }} disabled={saving}>
            {Object.entries(VENUE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field id="venue-status-reason" label="Reason" required={status === "UNDER_MAINTENANCE"} error={error || undefined}>
          <input id="venue-status-reason" className={fieldClasses} value={reason} onChange={(event) => { setReason(event.target.value); setError(""); }} disabled={saving || status === "ACTIVE"} />
        </Field>
        <Button type="submit" disabled={saving || (status === venue.status && (reason.trim() || null) === (venue.statusReason ?? null))}>
          {status === "INACTIVE" && venue.status !== "INACTIVE" ? "Deactivate venue" : "Change status"}
        </Button>
      </form>
      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={status === "INACTIVE" ? "Deactivate this venue?" : `Change status to ${VENUE_STATUS_LABELS[status]}?`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="quiet" onClick={() => setConfirm(null)}>Keep current status</Button>
            <Button variant="danger" disabled={saving} onClick={() => void send(confirm?.upcoming !== null)}>
              {confirm?.upcoming ? "Proceed and notify" : "Confirm"}
            </Button>
          </div>
        }
      >
        {confirm?.upcoming ? (
          <div className="grid gap-3">
            <AlertBanner tone="warning" title="This venue has upcoming bookings">
              {confirm.upcoming} upcoming booking{confirm.upcoming === 1 ? "" : "s"}
              {confirm.firstStart ? `, the first on ${formatTimestamp(confirm.firstStart)}` : ""}. The bookings and events are kept, not cancelled, but the venue cannot be selected for new bookings.
              If you continue, each event&apos;s coordinator and organiser are notified so the coordinator can arrange another venue with the organiser.
            </AlertBanner>
            {confirm.affectedEvents?.length ? (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.05em] text-on-surface-variant">Affected events</h3>
                <ul className="grid max-h-60 gap-2 overflow-y-auto">
                  {confirm.affectedEvents.map((item) => (
                    <li key={item.eventId} className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-container-low px-3 py-2 text-sm">
                      <span className="grid min-w-0">
                        <span className="truncate font-semibold text-on-surface">{item.title}</span>
                        <span className="text-xs text-on-surface-variant">
                          {formatTimestamp(item.firstStart)} · {item.bookings} booking{item.bookings === 1 ? "" : "s"}
                        </span>
                      </span>
                      <ReferenceIdTag value={item.requestId} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-on-surface">The venue will not be available for new bookings. It stays in historical records and can be reactivated later.</p>
        )}
      </Dialog>
    </SectionCard>
  );
}

const DETAIL_LISTS = [
  ["facilities", "Facilities"],
  ["accessibilityFeatures", "Accessibility features"],
  ["supportedLayouts", "Supported layouts"],
  ["knownRestrictions", "Known restrictions"],
] as const;

function DetailsSection({ venueId, details, detailStatus, onSaved }: {
  venueId: number;
  details: VenueDetails | null;
  detailStatus: DetailStatus;
  onSaved: (details: VenueDetails, message: string) => void;
}) {
  const initial = () => ({
    description: details?.description ?? "",
    emergencyAccess: details?.emergencyAccess ?? "",
    setupMinutes: details?.setupMinutes == null ? "" : String(details.setupMinutes),
    turnaroundMinutes: details?.turnaroundMinutes == null ? "" : String(details.turnaroundMinutes),
    facilities: formatList(details?.facilities),
    accessibilityFeatures: formatList(details?.accessibilityFeatures),
    supportedLayouts: formatList(details?.supportedLayouts),
    knownRestrictions: formatList(details?.knownRestrictions),
  });
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);

  if (detailStatus === "NOT_CHECKED" || !details) {
    return (
      <SectionCard className="grid gap-4">
        <SectionHeading step={3} title="Details, setup & turnaround" />
        <AlertBanner tone="warning">Venue details cannot be read right now, so they cannot be edited. Reload the page to try again.</AlertBanner>
      </SectionCard>
    );
  }

  // A recorded time (0 included) is final (Master 5.4.1).
  const locked = { setupMinutes: details.setupMinutes != null, turnaroundMinutes: details.turnaroundMinutes != null };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const found: FieldErrors = {};
    const payload: Record<string, unknown> = { version: details.version };
    for (const key of ["setupMinutes", "turnaroundMinutes"] as const) {
      const text = values[key].trim();
      if (!text || locked[key]) continue;
      if (!/^\d+$/.test(text) || Number(text) > 1440) found[key] = "Enter whole minutes from 0 to 1440";
      else if (Number(text) !== details[key]) payload[key] = Number(text);
    }
    for (const key of ["description", "emergencyAccess"] as const) {
      if ((values[key].trim() || null) !== (details[key] ?? null)) payload[key] = values[key].trim() || null;
    }
    for (const [key] of DETAIL_LISTS) {
      const list = parseList(values[key]);
      if (JSON.stringify(list) !== JSON.stringify(details[key])) payload[key] = list;
    }
    setErrors(found);
    if (Object.keys(found).length) return;
    if (Object.keys(payload).length === 1) {
      setMessage({ tone: "warning", text: "No changes to save." });
      return;
    }
    setSaving(true);
    try {
      const result = await updateVenueDetails(venueId, payload as { version: number });
      onSaved(result.details, result.message);
    } catch (caught) {
      if (caught instanceof ApiError && Object.keys(caught.fields).length) setErrors(caught.fields);
      // A time was recorded elsewhere after this page loaded (SPM-185 AC5):
      // the whole save is refused, so say so and point to the recorded value.
      const locked = caught instanceof ApiError && caught.code === "VENUE_BUFFERS_LOCKED";
      setMessage({
        tone: "error",
        text: locked
          ? `${caught.message} Nothing was saved. Reload the venue to see the recorded times.`
          : caught instanceof Error ? caught.message : "The details could not be saved.",
      });
    } finally {
      setSaving(false);
    }
  };

  const change = (key: keyof typeof values, value: string) => {
    setValues({ ...values, [key]: value });
    setErrors({ ...errors, [key]: undefined });
  };

  return (
    <SectionCard className="grid gap-4">
      <SectionHeading
        step={3}
        title="Details, setup & turnaround"
        description="Descriptive details and the setup/turnaround minutes used for every booking's occupied time. Each time can be set only once."
      />
      <form noValidate onSubmit={submit} className="grid gap-4">
        {message ? <AlertBanner tone={message.tone}>{message.text}</AlertBanner> : null}
        {detailStatus === "NOT_AVAILABLE" ? (
          <AlertBanner tone="info" live={false}>No details are recorded for this venue yet. Setup and turnaround times are needed before it can receive holds or bookings.</AlertBanner>
        ) : null}
        <BufferFields idPrefix="details" values={values} errors={errors} onChange={change} disabled={saving} locked={locked} />
        <Field id="details-description" label="Description" error={errors.description}>
          <textarea id="details-description" rows={3} className={fieldClasses} value={values.description} onChange={(event) => change("description", event.target.value)} disabled={saving} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {DETAIL_LISTS.map(([key, label]) => (
            <Field key={key} id={`details-${key}`} label={label} error={errors[key]} hint="Separate entries with commas.">
              <input id={`details-${key}`} className={fieldClasses} value={values[key]} onChange={(event) => change(key, event.target.value)} disabled={saving} />
            </Field>
          ))}
        </div>
        <Field id="details-emergency" label="Emergency access" error={errors.emergencyAccess}>
          <input id="details-emergency" className={fieldClasses} value={values.emergencyAccess} onChange={(event) => change("emergencyAccess", event.target.value)} disabled={saving} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save details"}</Button>
          <Button type="button" variant="quiet" disabled={saving} onClick={() => { setValues(initial()); setErrors({}); setMessage(null); }}>Reset</Button>
        </div>
      </form>
    </SectionCard>
  );
}

// /venues/[venueId] for Venue Staff (SPM-73): edit the record, change status
// with confirmation, and edit the MongoDB details including setup/turnaround.
// The venue's own change history (SPM-186): edits, status, details, photos and
// blocks, newest first; `refreshKey` changes after each save here.
function VenueHistory({ venueId, refreshKey }: { venueId: number; refreshKey: string }) {
  const load = useCallback<HistoryLoader>((options) => getVenueHistory(venueId, options), [venueId]);
  const [key, setKey] = useState(0);
  const [lastRefresh, setLastRefresh] = useState(refreshKey);
  // Photo changes are saved in the gallery, so the panel also reloads on focus.
  if (lastRefresh !== refreshKey) {
    setLastRefresh(refreshKey);
    setKey((value) => value + 1);
  }
  useEffect(() => {
    const onFocus = () => setKey((value) => value + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  const history = useHistory(load, key);
  return (
    <HistoryPanel
      id={`venue-${venueId}-history`}
      description="Every change to this venue, its status, details and photos. Staff only."
      emptyText="No changes have been recorded for this venue yet."
      history={history}
      statusLabels={VENUE_STATUS_LABELS}
    />
  );
}

export function VenueDetailManager({ venueId }: { venueId: number | null }) {
  const [state, setState] = useState<PageState>(venueId ? { status: "loading" } : { status: "not-found" });
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!venueId) return;
    let alive = true;
    getManagedVenue(venueId)
      .then((data) => { if (alive) setState({ status: "ready", data }); })
      .catch((caught: unknown) => {
        if (!alive) return;
        if (caught instanceof ApiError && caught.status === 404) setState({ status: "not-found" });
        else setState({ status: "error", message: caught instanceof Error ? caught.message : "The venue could not be loaded." });
      });
    return () => { alive = false; };
  }, [venueId, attempt]);

  const reload = () => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  };

  if (state.status === "loading") {
    return <div className="grid gap-4" aria-busy="true" aria-label="Loading venue"><Skeleton className="h-28 w-full" /><Skeleton className="h-72 w-full" /></div>;
  }
  if (state.status === "not-found") {
    return (
      <EmptyState
        title="Venue not found"
        description="This venue does not exist or has been deleted."
        action={<Link href="/venues" className={buttonClasses("secondary")}><Icon name="arrow-back" size={16} />Back to My Venues</Link>}
      />
    );
  }
  if (state.status === "error") {
    return (
      <AlertBanner tone="error" title="The venue could not be loaded">
        {state.message}
        <div className="mt-3"><Button variant="secondary" onClick={reload}><Icon name="refresh" size={16} />Try again</Button></div>
      </AlertBanner>
    );
  }

  const { venue, details, detailStatus } = state.data;
  // A stale save asks for a reload rather than overwriting someone else's change.
  const saved = (message: string) => {
    setNotice({ tone: "success", text: message });
    setRevision((value) => value + 1);
  };
  return (
    <div className="grid gap-5">
      <BackButton fallback="/venues" />
      <VenueGallery venueId={venue.venueId} venueName={venue.name} />
      <PageHeader
        eyebrow="Venue management"
        title={venue.name}
        description={venue.address}
        action={<VenueStatusChip status={venue.status} />}
      />
      <div className="-mt-2 flex flex-wrap items-center gap-3">
        <ReferenceIdTag value={`VENUE-${venue.venueId}`} />
        <Link href={`/venues?view=availability&venueId=${venue.venueId}&from=venue`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <Icon name="calendar" size={16} />View availability
        </Link>
        <Button variant="quiet" onClick={reload}><Icon name="refresh" size={16} />Reload venue</Button>
      </div>
      <div aria-live="polite">
        {notice ? <AlertBanner tone={notice.tone} live={false}>{notice.text}</AlertBanner> : null}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-12">
        <div className="grid gap-5 xl:col-span-8">
          <RecordSection
            key={`record-${venue.version}-${revision}`}
            venue={venue}
            onSaved={(updated, message) => { setState({ status: "ready", data: { ...state.data, venue: updated } }); saved(message); }}
          />
          <StatusSection
            key={`status-${venue.version}-${revision}`}
            venue={venue}
            onSaved={(updated, message) => { setState({ status: "ready", data: { ...state.data, venue: updated } }); saved(message); }}
          />
          <DetailsSection
            key={`details-${details?.version ?? "none"}-${revision}`}
            venueId={venue.venueId}
            details={details}
            detailStatus={detailStatus}
            onSaved={(updated, message) => { setState({ status: "ready", data: { ...state.data, details: updated, detailStatus: "CURRENT" } }); saved(message); }}
          />
          <VenueBlocksSection venueId={venue.venueId} venueName={venue.name} />
        </div>
        <aside className="grid content-start gap-5 xl:col-span-4" aria-label="Record history">
          <section className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
            <SectionHeading title="Record history" />
            <KeyValuePanel
              className="mt-4"
              rows={[
                { icon: "history", label: "Created", value: `${formatTimestamp(venue.createdAt)}${venue.createdBy?.name ? ` by ${venue.createdBy.name}` : ""}` },
                { icon: "history", label: "Last updated", value: `${formatTimestamp(venue.updatedAt)}${venue.updatedBy?.name ? ` by ${venue.updatedBy.name}` : ""}` },
                { icon: "history", label: "Details updated", value: details?.updatedAt ? formatTimestamp(details.updatedAt) : "Not recorded" },
              ]}
            />
          </section>
          <VenueHistory venueId={venue.venueId} refreshKey={`${venue.version}-${details?.version ?? "none"}-${revision}`} />
        </aside>
      </div>
    </div>
  );
}
