"use client";

import Link from "next/link";
import { useSessionUser } from "@/components/auth/auth-gate";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, EmptyState, SectionCard, Skeleton, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { SectionHeading } from "@/components/shared/section-heading";
import { IncidentChip, RestoreIncidentButton, RestoreStatus } from "@/components/venues/booking-incident";
import { sgtInputToIso, toSgtInput } from "@/components/venues/event-venue-options/venue-booking-form-model";
import { ApiError } from "@/lib/api";
import { formatEventWindow } from "@/lib/datetime";
import { keepsIdempotencyKey } from "@/lib/lifecycle-actions";
import {
  BLOCK_REASON_OPTIONS,
  createVenueBlock,
  liftVenueBlock,
  listVenueBlocks,
  shortenVenueBlock,
  type BlockReason,
  type VenueBlockInput,
  type VenueBlockList,
  type VenueBlockWithIncidents,
} from "@/lib/api/venue-blocks";
import { Field, type FieldErrors } from "./venue-fields";
import { BLOCK_NOTE_LIMIT as NOTE_LIMIT, validateBlockForm, validateShortenForm } from "./venue-block-rules";

// SPM-195: Venue Staff record, shorten and lift operational blocks (Master
// 5.4.4, T4). The backend finds the affected bookings and holds, keeps them and
// tells their coordinators; Venue Staff then restore each one once it is free.

type ListState = { status: "loading" } | { status: "ready"; data: VenueBlockList } | { status: "error"; message: string };
type Notice = { tone: "success" | "error"; text: string } | null;

// A block reads as "blocked" (error tones) while active; a lifted one is neutral.
const BLOCK_CHIPS: Record<string, string> = {
  ACTIVE: "bg-error-container text-on-error-container",
  LIFTED: "bg-surface-container-high text-on-surface-variant",
};

function BlockChip({ block }: { block: VenueBlockWithIncidents }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-chip px-2 py-1 text-[11px] font-semibold uppercase tracking-label ${BLOCK_CHIPS[block.status] ?? "bg-surface-container-high text-on-surface-variant"}`}>
      {block.statusLabel}
    </span>
  );
}

const errorText = (caught: unknown, fallback: string) => (caught instanceof Error ? caught.message : fallback);

// The block changed or went away since it was loaded: retrying the same request
// cannot succeed, so the list is reloaded instead (never retried automatically).
const STALE_BLOCK_CODES = new Set(["BLOCK_VERSION_CONFLICT", "BLOCK_NOT_ACTIVE", "BLOCK_NOT_FOUND"]);
const isStaleBlock = (caught: unknown) => caught instanceof ApiError && STALE_BLOCK_CODES.has(caught.code);
const describedBy = (id: string, error?: string, hint?: string) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

interface BlockFormValues {
  reason: BlockReason | "";
  start: string;
  end: string;
  note: string;
}

const EMPTY_BLOCK_FORM: BlockFormValues = { reason: "", start: "", end: "", note: "" };

type TimeKey = "start" | "end";

// The start and end inputs (Singapore time) of the record and shorten forms.
function BlockTimeFields({ idPrefix, values, errors, disabled, endHint, onChange }: {
  idPrefix: string;
  values: Record<TimeKey, string>;
  errors: FieldErrors;
  disabled: boolean;
  endHint?: string;
  onChange: (key: TimeKey, value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(["start", "end"] as const).map((key) => {
        const fieldId = `${idPrefix}-${key}`;
        const hint = key === "end" ? endHint : undefined;
        return (
          <Field key={key} id={fieldId} label={key === "start" ? "Start (SGT)" : "End (SGT)"} required error={errors[key]} hint={hint}>
            <input
              id={fieldId}
              type="datetime-local"
              className={fieldClasses}
              value={values[key]}
              disabled={disabled}
              aria-invalid={Boolean(errors[key])}
              aria-describedby={describedBy(fieldId, errors[key], hint)}
              onChange={(event) => onChange(key, event.target.value)}
            />
          </Field>
        );
      })}
    </div>
  );
}

type PendingBlock = { key: string; input: VenueBlockInput };
function readPendingBlock(slot: string): PendingBlock | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(slot) || "null");
    const input = value?.input;
    return typeof value?.key === "string" && /^[0-9a-f-]{36}$/.test(value.key)
      && input && BLOCK_REASON_OPTIONS.some(option => option.value === input.reason)
      && typeof input.start === "string" && Number.isFinite(Date.parse(input.start))
      && typeof input.end === "string" && Date.parse(input.end) > Date.parse(input.start)
      && typeof input.note === "string" && input.note.trim().length > 0 && input.note.length <= NOTE_LIMIT
      ? value : null;
  } catch { return null; }
}

function RecordBlockDialog({ venueId, venueName, onClose, onSaved }: {
  venueId: number;
  venueName: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const user = useSessionUser();
  const slot = `connectsphere:recovery:spm195:block:${user?.user_id}:${venueId}`;
  const [command, setCommand] = useState<PendingBlock | null>(() => readPendingBlock(slot));
  const [values, setValues] = useState<BlockFormValues>(() => command ? {
    reason: command.input.reason, start: toSgtInput(command.input.start), end: toSgtInput(command.input.end), note: command.input.note,
  } : EMPTY_BLOCK_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  // The same request keeps its key, so a retry cannot record a second block (AC13).
  const pending = useRef<PendingBlock | null>(command);
  const sending = useRef(false);
  const remember = (value: PendingBlock | null) => {
    pending.current = value;
    setCommand(value);
    try { if (value) sessionStorage.setItem(slot, JSON.stringify(value)); else sessionStorage.removeItem(slot); } catch { /* In-memory retry remains available. */ }
  };
  const close = () => { if (!sending.current) onClose(); };
  const locked = saving || command !== null;

  const change = (key: keyof BlockFormValues, value: string) => {
    if (locked) return;
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending.current) return;
    let current = pending.current;
    if (!current) {
      const start = sgtInputToIso(values.start);
      const end = sgtInputToIso(values.end);
      const found = validateBlockForm({ ...values, start, end });
      setErrors(found);
      setFormError("");
      if (Object.keys(found).length) return;
      current = { key: crypto.randomUUID(), input: {
        reason: values.reason as BlockReason, start: start as string, end: end as string, note: values.note.trim(),
      } };
      remember(current);
    }
    sending.current = true;
    setSaving(true);
    try {
      const result = await createVenueBlock(venueId, current.input, current.key);
      remember(null);
      onSaved(result.message);
    } catch (caught) {
      if (!keepsIdempotencyKey(caught instanceof ApiError ? caught : null) && !(caught instanceof ApiError && caught.status === 401)) remember(null);
      if (caught instanceof ApiError && Object.keys(caught.fields).length) setErrors(caught.fields);
      setFormError(errorText(caught, "The block could not be recorded."));
    } finally {
      sending.current = false;
      setSaving(false);
    }
  };

  const id = "record-block";
  return (
    <Dialog
      open
      onClose={close}
      title={`Block ${venueName}`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="quiet" disabled={saving} onClick={close}>Cancel</Button>
          <Button type="submit" form={`${id}-form`} disabled={saving}>{saving ? "Recording…" : "Record block"}</Button>
        </div>
      }
    >
      <form id={`${id}-form`} noValidate onSubmit={submit} className="grid gap-4">
        {formError ? <AlertBanner tone="error">{formError}</AlertBanner> : null}
        {command ? <p className="text-sm">This request needs confirmation. Retry the same request to avoid recording a duplicate block.</p> : null}
        <AlertBanner tone="info" live={false}>
          A block is never refused because of bookings. Bookings and holds whose time, including setup and turnaround, overlaps it are kept and marked affected; their coordinators are told.
        </AlertBanner>
        <Field id={`${id}-reason`} label="Reason" required error={errors.reason}>
          <select
            id={`${id}-reason`}
            className={fieldClasses}
            value={values.reason}
            disabled={locked}
            aria-invalid={Boolean(errors.reason)}
            aria-describedby={describedBy(`${id}-reason`, errors.reason)}
            onChange={(event) => change("reason", event.target.value)}
          >
            <option value="">Choose a reason</option>
            {BLOCK_REASON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        <BlockTimeFields
          idPrefix={id}
          values={values}
          errors={errors}
          disabled={locked}
          endHint="After the start and in the future. A block has no setup or turnaround time."
          onChange={change}
        />
        <Field id={`${id}-note`} label="Note" required error={errors.note} hint={`Shown to the coordinators of affected events. Up to ${NOTE_LIMIT} characters.`}>
          <textarea
            id={`${id}-note`}
            rows={3}
            maxLength={NOTE_LIMIT}
            className={fieldClasses}
            value={values.note}
            disabled={locked}
            aria-invalid={Boolean(errors.note)}
            aria-describedby={describedBy(`${id}-note`, errors.note, "hint")}
            onChange={(event) => change("note", event.target.value)}
          />
        </Field>
      </form>
    </Dialog>
  );
}

function ShortenBlockDialog({ venueId, block, onClose, onSaved, onStale }: {
  venueId: number;
  block: VenueBlockWithIncidents;
  onClose: () => void;
  onSaved: (message: string) => void;
  onStale: (message: string) => void;
}) {
  const [values, setValues] = useState({ start: toSgtInput(block.start), end: toSgtInput(block.end) });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const id = `shorten-block-${block.blockId}`;

  const change = (key: TimeKey, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const start = sgtInputToIso(values.start);
    const end = sgtInputToIso(values.end);
    const found = validateShortenForm(block, { start, end });
    setErrors(found);
    setFormError("");
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const result = await shortenVenueBlock(venueId, block.blockId, {
        start: start as string,
        end: end as string,
        version: block.version,
      });
      onSaved(result.message);
    } catch (caught) {
      if (isStaleBlock(caught)) {
        onStale(errorText(caught, "This block was changed. Reload it, then try again."));
        return;
      }
      if (caught instanceof ApiError && Object.keys(caught.fields).length) setErrors(caught.fields);
      setFormError(errorText(caught, "The block could not be shortened."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Shorten this block"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="quiet" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={`${id}-form`} disabled={saving}>{saving ? "Saving…" : "Shorten block"}</Button>
        </div>
      }
    >
      <form id={`${id}-form`} noValidate onSubmit={submit} className="grid gap-4">
        {formError ? <AlertBanner tone="error">{formError}</AlertBanner> : null}
        <p className="text-sm text-on-surface">
          Currently blocked {formatEventWindow(block.start, block.end)}. Move the start later or the end earlier; for more time, record a new block.
        </p>
        <BlockTimeFields idPrefix={id} values={values} errors={errors} disabled={saving} onChange={change} />
        <p className="text-xs text-on-surface-variant">Affected bookings stay open: restore each one once its whole time is free.</p>
      </form>
    </Dialog>
  );
}

function BlockIncidents({ block, onRestored, onRefused }: {
  block: VenueBlockWithIncidents;
  onRestored: (message: string) => void;
  onRefused: () => void;
}) {
  if (!block.incidents.length) {
    return <p className="text-xs text-on-surface-variant">No bookings or holds were affected.</p>;
  }
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-label text-on-surface-variant">Affected bookings and holds</h4>
      <ul className="grid gap-2">
        {block.incidents.map((incident) => (
          <li key={incident.incidentId} className="grid gap-2 rounded-control bg-surface-container-lowest p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="grid min-w-0 gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <IncidentChip incident={incident} />
                <span className="font-mono text-xs text-on-surface-variant">{incident.requestId}</span>
                <span className="text-sm font-semibold text-on-surface [overflow-wrap:anywhere]">
                  {incident.eventTitle ?? "Untitled request"}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant">
                {incident.bookingId ? `Booking #${incident.bookingId}` : "Tentative hold"}
                {incident.occupiedStart && incident.occupiedEnd ? ` · occupied ${formatEventWindow(incident.occupiedStart, incident.occupiedEnd)}` : ""}
              </p>
              <RestoreStatus incident={incident} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {incident.bookingId ? (
                <Link
                  href={`/events/${incident.eventId}?booking=${incident.bookingId}`}
                  className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-primary hover:underline"
                >
                  Open booking<Icon name="chevron-right" size={16} />
                </Link>
              ) : null}
              <RestoreIncidentButton incident={incident} onRestored={onRestored} onRefused={onRefused} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VenueBlocksSection({ venueId, venueName }: { venueId: number; venueName: string }) {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const [recording, setRecording] = useState(false);
  const [shortening, setShortening] = useState<VenueBlockWithIncidents | null>(null);
  const [lifting, setLifting] = useState<VenueBlockWithIncidents | null>(null);
  const [liftError, setLiftError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    listVenueBlocks(venueId)
      .then((data) => { if (alive) setState({ status: "ready", data }); })
      .catch((caught: unknown) => { if (alive) setState({ status: "error", message: errorText(caught, "The blocks could not be loaded.") }); });
    return () => { alive = false; };
  }, [venueId, attempt]);

  // Every change is shown only after the backend commits it, then the list reloads.
  const reloadWith = (next: Notice) => {
    setRecording(false);
    setShortening(null);
    setLifting(null);
    setNotice(next);
    setAttempt((value) => value + 1);
  };
  const saved = (message: string) => reloadWith({ tone: "success", text: message });
  // A refusal that means the list is out of date: say so and show the current blocks.
  const stale = (message: string) => reloadWith({ tone: "error", text: `${message} The blocks have been reloaded.` });
  // A refused restore leaves the dialog open with its reason; the list is reloaded behind it.
  const refresh = () => setAttempt((value) => value + 1);

  const lift = async (block: VenueBlockWithIncidents) => {
    setSaving(true);
    setLiftError("");
    try {
      const result = await liftVenueBlock(venueId, block.blockId, block.version);
      saved(result.message);
    } catch (caught) {
      if (isStaleBlock(caught)) stale(errorText(caught, "This block was changed."));
      else setLiftError(errorText(caught, "The block could not be lifted."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard className="grid gap-4">
      <SectionHeading
        step={4}
        title="Operational blocks"
        description="Periods when this venue cannot be used. Overlapping bookings and holds are kept and marked affected; restore each one once it is free."
        action={<Button variant="secondary" onClick={() => { setNotice(null); setRecording(true); }} aria-haspopup="dialog"><Icon name="add" size={16} />Record a block</Button>}
      />
      <div aria-live="polite">
        {notice ? <AlertBanner tone={notice.tone} live={false}>{notice.text}</AlertBanner> : null}
      </div>

      {state.status === "loading" ? (
        <div className="grid gap-2" aria-busy="true" aria-label="Loading blocks"><Skeleton className="h-20 w-full" /></div>
      ) : state.status === "error" ? (
        <AlertBanner tone="error" title="The blocks could not be loaded">
          {state.message}
          <div className="mt-3">
            <Button variant="secondary" onClick={() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }}>
              <Icon name="refresh" size={16} />Try again
            </Button>
          </div>
        </AlertBanner>
      ) : state.data.blocks.length ? (
        <>
          <ul className="grid gap-3" aria-label="Current and upcoming blocks">
            {state.data.blocks.map((block) => (
              <li key={block.blockId} className="grid gap-3 rounded-control bg-surface-container-low p-3 sm:p-4">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <BlockChip block={block} />
                      <span className="text-sm font-semibold text-on-surface">{block.reasonLabel}</span>
                    </div>
                    <p className="mt-1 text-sm text-on-surface">{formatEventWindow(block.start, block.end)}</p>
                    <p className="mt-1 text-xs text-on-surface-variant [overflow-wrap:anywhere]">{block.note}</p>
                  </div>
                  {block.status === "ACTIVE" ? (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => { setNotice(null); setShortening(block); }} aria-label={`Shorten the block from ${formatEventWindow(block.start, block.end)}`}>Shorten</Button>
                      <Button variant="quiet" onClick={() => { setNotice(null); setLiftError(""); setLifting(block); }} aria-label={`Lift the block from ${formatEventWindow(block.start, block.end)}`}>Lift block</Button>
                    </div>
                  ) : null}
                </div>
                <BlockIncidents block={block} onRestored={saved} onRefused={refresh} />
              </li>
            ))}
          </ul>
          {/* Outside the list, so it is not counted as a block. */}
          {state.data.hasMore ? (
            <p className="text-xs text-on-surface-variant">Later blocks are not shown. Lift or wait out the earlier ones to see them.</p>
          ) : null}
        </>
      ) : (
        <EmptyState title="No current or upcoming blocks" description="The venue is not blocked. Record a block when it cannot be used for a period, for example for maintenance or a safety issue." />
      )}

      {recording ? <RecordBlockDialog venueId={venueId} venueName={venueName} onClose={() => setRecording(false)} onSaved={saved} /> : null}
      {shortening ? (
        <ShortenBlockDialog key={`${shortening.blockId}-${shortening.version}`} venueId={venueId} block={shortening} onClose={() => setShortening(null)} onSaved={saved} onStale={stale} />
      ) : null}
      <Dialog
        open={lifting !== null}
        onClose={() => setLifting(null)}
        title="Lift this block?"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="quiet" onClick={() => setLifting(null)}>Keep block</Button>
            <Button disabled={saving || !lifting} onClick={() => lifting && void lift(lifting)}>{saving ? "Lifting…" : "Lift block"}</Button>
          </div>
        }
      >
        <div className="grid gap-3">
          {liftError ? <AlertBanner tone="error">{liftError}</AlertBanner> : null}
          <p className="text-sm text-on-surface">
            The venue becomes available for {lifting ? formatEventWindow(lifting.start, lifting.end) : "this period"}. Affected bookings stay open until you restore each one; their coordinators are told the block was lifted.
          </p>
        </div>
      </Dialog>
    </SectionCard>
  );
}
