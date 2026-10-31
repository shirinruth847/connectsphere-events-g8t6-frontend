"use client";

import { useRef, useState } from "react";
import { useSessionUser } from "@/components/auth/auth-gate";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, fieldClasses, FormLabel, SectionCard } from "@/components/shared/primitives";
import { ApiError, apiRequest } from "@/lib/api";
import { parseEventView, type EventView } from "@/lib/api/event-workspace";
import { rejectionReasonError } from "@/lib/event-rejection";
import { keepsIdempotencyKey } from "@/lib/lifecycle-actions";

type Pending = { key: string; version: number; reason: string };
function readRecovery(slot: string): Pending | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(slot) || "null");
    return value && typeof value.key === "string" && /^[0-9a-f-]{36}$/.test(value.key)
      && Number.isInteger(value.version) && value.version > 0 && typeof value.reason === "string"
      && !rejectionReasonError(value.reason) ? value : null;
  } catch { return null; }
}

// Uses the existing guarded event workspace and trusted session profile.
export function RejectionPanel({ event, editing = false, onEventChange, onAccessChanged }: {
  event: EventView;
  editing?: boolean;
  onEventChange: (event: EventView, message?: string) => void;
  onAccessChanged: () => void;
}) {
  const user = useSessionUser();
  const slot = `connectsphere:recovery:spm40:${user?.user_id}:${event.eventId}`;
  const [recovery, setRecovery] = useState(() => readRecovery(slot));
  const [reason, setReason] = useState(recovery?.reason ?? "");
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const sending = useRef(false);
  const pending = useRef<Pending | null>(recovery);
  const eligible = event.status === "UNDER_REVIEW" && event.viewerRelationship === "ASSIGNED_COORDINATOR";
  const storePending = (value: Pending | null) => {
    pending.current = value;
    setRecovery(value);
    try { if (value) sessionStorage.setItem(slot, JSON.stringify(value)); else sessionStorage.removeItem(slot); } catch { /* In-memory retry still works. */ }
  };
  const close = () => {
    if (sending.current) return;
    setOpen(false);
    setError("");
    setFieldError("");
    if (!pending.current) setReason("");
  };
  const submit = async () => {
    if (sending.current || editing || !eligible) return;
    const validation = rejectionReasonError(reason);
    setFieldError(validation ?? "");
    if (validation) return;
    const command = pending.current ?? { key: crypto.randomUUID(), version: event.version, reason: reason.trim() };
    storePending(command);
    sending.current = true;
    setRunning(true);
    setError("");
    try {
      const result = await apiRequest<{ event: unknown; message: string }>(`/events/${event.eventId}/reject`, {
        method: "POST", headers: { "Idempotency-Key": command.key },
        body: JSON.stringify({ version: command.version, reason: command.reason }),
      });
      const updated = parseEventView(result.event);
      if (!updated) throw new Error("The response could not be read. Retry to confirm the outcome.");
      storePending(null);
      setOpen(false);
      setReason("");
      onEventChange(updated, result.message);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      if (!keepsIdempotencyKey(apiError) && apiError?.status !== 401) storePending(null);
      setError(caught instanceof Error ? caught.message : "Rejection could not be completed. Try again.");
      if (apiError?.fields.reason) setFieldError(apiError.fields.reason);
      if (apiError?.code === "EVENT_VERSION_CONFLICT") {
        const latest = parseEventView(apiError.details.event);
        if (latest) onEventChange(latest);
      }
      if (apiError?.status === 404 || apiError?.code === "TRANSITION_NOT_ALLOWED") {
        setOpen(false);
        onAccessChanged();
      }
    } finally {
      sending.current = false;
      setRunning(false);
    }
  };

  // Keep a refusal visible if a refresh moved the request to a terminal state.
  if (!eligible && !error) return null;
  return (
    <SectionCard>
      <h2 className="text-base font-bold text-on-surface">Reject request</h2>
      <p className="mt-2 text-sm text-on-surface-variant">Provide a reason for the organiser. Rejection ends review of this request.</p>
      {error && !open ? <div className="mt-3"><AlertBanner tone="error">{error}</AlertBanner></div> : null}
      {eligible ? <Button variant="danger" className="mt-4" disabled={editing || running} onClick={() => setOpen(true)}>Reject request</Button> : null}
      {editing ? <p className="mt-2 text-xs text-on-surface-variant">Save or cancel your event details before rejecting.</p> : null}
      <Dialog open={open} onClose={close} title="Reject event request?" footer={<>
        <Button variant="secondary" disabled={running} onClick={close}>Cancel</Button>
        <Button variant="danger" disabled={running || editing || !eligible} onClick={() => void submit()}>{running ? "Rejecting…" : "Confirm rejection"}</Button>
      </>}>
        <p className="mb-4 text-sm">Reject “{event.title}”? The organiser will receive your notes. This action changes the request to Rejected.</p>
        <FormLabel htmlFor="rejection-reason" required>Rejection notes</FormLabel>
        <textarea id="rejection-reason" className={fieldClasses} rows={5} value={reason}
          readOnly={running || recovery !== null} aria-invalid={Boolean(fieldError)} aria-describedby="rejection-guidance rejection-error"
          onChange={e => { setReason(e.target.value); setFieldError(""); }} />
        <p id="rejection-guidance" className="mt-2 text-xs text-on-surface-variant">10–2,000 characters. {Array.from(reason.trim()).length.toLocaleString()} characters entered.</p>
        <p id="rejection-error" className="mt-2 text-sm text-error" role={fieldError ? "alert" : undefined}>{fieldError}</p>
        {recovery ? <p className="mt-3 text-sm text-on-surface-variant">A previous attempt needs confirmation. Retry with the same notes to avoid a duplicate action.</p> : null}
        {error ? <div className="mt-3"><AlertBanner tone="error">{error}</AlertBanner></div> : null}
      </Dialog>
    </SectionCard>
  );
}
