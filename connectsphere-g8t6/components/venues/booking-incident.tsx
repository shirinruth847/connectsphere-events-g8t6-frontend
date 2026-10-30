"use client";

import { useRef, useState } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { ApiError } from "@/lib/api";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import { keepsIdempotencyKey } from "@/lib/lifecycle-actions";
import { restoreVenueIncident, type VenueIncident } from "@/lib/api/venue-blocks";

// SPM-195: a booking made unavailable by an operational block. An open
// incident needs action (error tones); a restored one is shown with success
// tones; one closed because the booking or event ended is neutral. Labels are
// the backend's.
type IncidentOutcome = "open" | "restored" | "closed";
const incidentOutcome = (incident: VenueIncident): IncidentOutcome => {
  if (incident.status === "OPEN") return "open";
  return incident.resolution === "RESTORED" ? "restored" : "closed";
};

const KNOWN_STATUSES = new Set(["OPEN", "RESOLVED"]);
const NEUTRAL_CHIP = "bg-surface-container-high text-on-surface-variant";
const OUTCOME_CHIPS: Record<IncidentOutcome, string> = {
  open: "bg-error-container text-on-error-container",
  restored: "bg-success-container text-on-success-container",
  closed: NEUTRAL_CHIP,
};

export function IncidentChip({ incident }: { incident: VenueIncident }) {
  const label = incident.status === "RESOLVED" && incident.resolutionLabel ? incident.resolutionLabel : incident.statusLabel;
  const known = KNOWN_STATUSES.has(incident.status);
  return (
    <span
      className={`inline-flex w-fit items-center rounded-chip px-2 py-1 text-[11px] font-semibold uppercase tracking-label ${known ? OUTCOME_CHIPS[incidentOutcome(incident)] : NEUTRAL_CHIP}`}
      title={known ? undefined : `Incident status "${incident.status}" is not recognised`}
    >
      {label}
    </span>
  );
}

// Whether the venue is free again, in words and an icon, never colour alone.
export function RestoreStatus({ incident }: { incident: VenueIncident }) {
  if (incident.status !== "OPEN" || !incident.restoreLabel) return null;
  const free = incident.canBeRestored === true;
  return (
    <p className={`flex items-start gap-1.5 text-sm ${free ? "font-semibold text-success" : "text-on-surface-variant"}`}>
      <Icon name={free ? "check" : incident.canBeRestored === false ? "lock" : "info"} size={16} />
      {incident.restoreLabel}
    </p>
  );
}

const restoreError = (caught: unknown) => {
  if (!(caught instanceof ApiError)) return "The booking could not be restored. Try again.";
  const blocks = Array.isArray(caught.details.blocks) ? (caught.details.blocks as Array<{ start: string; end: string; reasonLabel: string }>) : [];
  return blocks.length
    ? `${caught.message} Still blocked: ${blocks.map((block) => `${formatEventWindow(block.start, block.end)} (${block.reasonLabel})`).join("; ")}.`
    : caught.message;
};

// Venue Staff confirm a restoration (Master 5.4.4 option 1, AC10). The backend
// re-checks the whole occupied range under the venue lock; a retry of the same
// confirmation reuses its key.
export function RestoreIncidentButton({ incident, onRestored, onRefused }: {
  incident: VenueIncident;
  onRestored: (message: string) => void;
  // A business refusal (404/409) means what is shown is out of date: the
  // caller reloads it while the dialog keeps the reason. Never a retry.
  onRefused?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pendingKey = useRef<string | null>(null);
  const subject = incident.bookingId ? `Booking #${incident.bookingId}` : "the tentative hold";

  if (incident.status !== "OPEN") return null;

  const restore = async () => {
    setSaving(true);
    setError("");
    pendingKey.current ??= crypto.randomUUID();
    try {
      const result = await restoreVenueIncident(incident.incidentId, pendingKey.current);
      pendingKey.current = null;
      setOpen(false);
      onRestored(result.message);
    } catch (caught) {
      if (!keepsIdempotencyKey(caught instanceof ApiError ? caught : null)) pendingKey.current = null;
      setError(restoreError(caught));
      if (caught instanceof ApiError && (caught.status === 404 || caught.status === 409)) onRefused?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        disabled={incident.canBeRestored !== true}
        onClick={() => { setError(""); setOpen(true); }}
        aria-haspopup="dialog"
        aria-describedby={incident.canBeRestored !== true ? `restore-reason-${incident.incidentId}` : undefined}
      >
        <Icon name="check" size={16} />Restore booking
      </Button>
      {incident.canBeRestored !== true ? (
        <span id={`restore-reason-${incident.incidentId}`} className="sr-only">
          {incident.canBeRestored === false ? "This booking cannot be restored now." : "Availability could not be checked."}
        </span>
      ) : null}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Restore this booking?"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="quiet" onClick={() => setOpen(false)}>Keep it affected</Button>
            <Button disabled={saving} onClick={() => void restore()}>{saving ? "Restoring…" : "Restore booking"}</Button>
          </div>
        }
      >
        <div className="grid gap-3">
          {error ? <AlertBanner tone="error">{error}</AlertBanner> : null}
          <p className="text-sm text-on-surface">
            {subject} for {incident.requestId}{incident.eventTitle ? ` "${incident.eventTitle}"` : ""} is restored as it was.
            The venue is checked again for the whole time, including setup and turnaround, and the coordinator and organiser are told it is available again.
          </p>
          {incident.occupiedStart && incident.occupiedEnd ? (
            <p className="text-xs text-on-surface-variant">Occupied {formatEventWindow(incident.occupiedStart, incident.occupiedEnd)}.</p>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}

// The block behind an incident: reason, period and note (AC7).
function BlockDetails({ incident }: { incident: VenueIncident }) {
  if (!incident.block) {
    return <p className="text-sm text-on-surface-variant">The block&apos;s details cannot be loaded right now.</p>;
  }
  return (
    <KeyValuePanel
      rows={[
        { icon: "warning", label: "Reason", value: incident.block.reasonLabel },
        { icon: "calendar", label: incident.block.status === "LIFTED" ? "Was blocked" : "Blocked", value: formatEventWindow(incident.block.start, incident.block.end) },
        { icon: "info", label: "Note", value: incident.block.note || "None" },
      ]}
    />
  );
}

// The card's heading per outcome: group name, title, icon and icon tones.
const OUTCOME_HEADINGS = {
  open: { group: "Venue unavailable", title: "Venue unavailable during this booking", icon: "warning", tones: "bg-error text-on-primary" },
  restored: { group: "Venue incident resolved", title: "Venue available again", icon: "check", tones: "bg-success-container text-on-success-container" },
  closed: { group: "Venue incident closed", title: "Venue incident closed", icon: "info", tones: NEUTRAL_CHIP },
} as const;

// The incident card under an affected booking. The coordinator sees the block
// and the options (restore waits for Venue Staff, replace is not available yet,
// cancel uses the event's cancel action); Venue Staff see the block and, once
// the venue is free, the restore action. The supervising Lead reads it
// without the options ("read-only").
export function BookingIncidentCard({ incident, audience, onRestored, onRefused }: {
  incident: VenueIncident;
  audience: "coordinator" | "venue-staff" | "read-only";
  onRestored?: (message: string) => void;
  onRefused?: () => void;
}) {
  const outcome = incidentOutcome(incident);
  const open = outcome === "open";
  const heading = OUTCOME_HEADINGS[outcome];
  const showsActions = open && audience === "coordinator" && Boolean(incident.actions?.length);
  return (
    <div
      className={`grid gap-3 rounded-control p-3 ${open ? "bg-error-container/50" : "bg-surface-container-lowest"}`}
      role="group"
      aria-label={heading.group}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-on-surface">
          <span aria-hidden="true" className={`grid h-7 w-7 place-items-center rounded-control ${heading.tones}`}>
            <Icon name={heading.icon} size={16} />
          </span>
          {heading.title}
        </p>
        <IncidentChip incident={incident} />
      </div>
      {open ? <BlockDetails incident={incident} /> : null}
      {!open && incident.resolvedAt ? (
        <p className="text-xs text-on-surface-variant">Resolved {formatTimestamp(incident.resolvedAt)}.</p>
      ) : null}
      {/* The coordinator reads the same status in the restore option below. */}
      {open && !showsActions ? <RestoreStatus incident={incident} /> : null}
      {showsActions && incident.actions ? (
        <div>
          <h5 className="mb-2 text-xs font-semibold uppercase tracking-label text-on-surface-variant">Next action</h5>
          <ul className="grid gap-1.5">
            {incident.actions.map((action) => (
              <li key={action.action} className="flex items-start gap-1.5 text-sm text-on-surface">
                <Icon name={action.available && action.action !== "CANCEL" ? "arrow-forward" : "lock"} size={16} />
                <span>
                  <span className="font-semibold">{ACTION_NAMES[action.action] ?? action.action}:</span> {action.action === "CANCEL" ? "Not available yet: the event cancellation workflow is not integrated." : action.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {open && audience === "venue-staff" && onRestored ? (
        <div className="flex flex-wrap gap-2">
          <RestoreIncidentButton incident={incident} onRestored={onRestored} onRefused={onRefused} />
        </div>
      ) : null}
    </div>
  );
}

const ACTION_NAMES: Record<IncidentActionName, string> = {
  RESTORE: "Restore booking",
  REPLACE: "Replace venue",
  CANCEL: "Cancel event",
};
type IncidentActionName = "RESTORE" | "REPLACE" | "CANCEL";
