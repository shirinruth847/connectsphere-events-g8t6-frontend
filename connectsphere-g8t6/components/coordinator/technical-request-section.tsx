"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { BookingStatusChip, BOOKING_BORDERS } from "@/components/venue-staff/booking-requests/booking-status-chip";
import { EquipmentRequirementsEditor } from "@/components/events/equipment/equipment-requirements-editor";
import { useEquipmentAvailability } from "@/components/events/equipment/use-equipment-availability";
import { ApiError } from "@/lib/api";
import { formatEventWindow } from "@/lib/datetime";
import type { EventView } from "@/lib/api/event-workspace";
import { getOrganiserArrangements, type OrganiserArrangements } from "@/lib/api/organiser-arrangements";
import { sendTechnicalRequest, type SentTechnicalRequest } from "@/lib/api/technical-requests";
import {
  itemFieldErrors,
  itemsSummary,
  lineQuantityProblems,
  technicalStatusLabel,
  type EquipmentLine,
} from "@/lib/technical-requests";

type TechnicalSection = Extract<OrganiserArrangements["technical"], { status: "READY" }>;
type RequestsState =
  | { status: "loading" }
  | { status: "ready"; data: TechnicalSection }
  | { status: "error"; message: string };

const ACTIVE = new Set(["PENDING", "APPROVED"]);

interface TechnicalRequestSectionProps {
  event: EventView;
  // Called after a request is sent, e.g. to refresh the history and event.
  onSent?: (result: SentTechnicalRequest) => void;
  // Called when the event left Planning or is no longer assigned (409/404).
  onStale?: () => void;
}

// The event's technical requests in its Technical & equipment section
// (SPM-286 AC5-AC7), laid out like the venue bookings above it: the requests
// sent so far with their status, and, in Planning, "Send technical request",
// which opens the organiser's equipment lines for the coordinator to adjust
// against what is free for the event's time before sending.
export function TechnicalRequestSection({ event, onSent, onStale }: TechnicalRequestSectionProps) {
  const isCoordinator = event.viewerRelationship === "ASSIGNED_COORDINATOR";
  const [requests, setRequests] = useState<RequestsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<EquipmentLine[]>([]);
  const [lineErrors, setLineErrors] = useState<Record<number, string>>({});
  const [error, setError] = useState<{ message: string; stale?: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "warning"; title: string; message: string } | null>(null);
  const pendingKey = useRef<{ body: string; key: string } | null>(null);
  const availability = useEquipmentAvailability(event.startDatetime, event.endDatetime, open);

  useEffect(() => {
    let alive = true;
    getOrganiserArrangements(event.eventId)
      .then(({ arrangements }) => {
        if (!alive) return;
        const technical = arrangements.technical;
        setRequests(technical.status === "READY"
          ? { status: "ready", data: technical }
          : { status: "error", message: "Technical arrangements are temporarily unavailable." });
      })
      .catch((caught: unknown) => {
        if (alive) setRequests({ status: "error", message: caught instanceof Error ? caught.message : "Technical requests could not be loaded." });
      });
    return () => { alive = false; };
  }, [event.eventId, event.arrangementVersion, attempt]);

  const sent = requests.status === "ready" ? requests.data.requests : [];
  const active = sent.find((request) => ACTIVE.has(request.status));
  const hasDates = Boolean(event.startDatetime && event.endDatetime);
  const canSend = isCoordinator && event.status === "PLANNING" && hasDates && requests.status !== "loading" && !active;
  const blocker = !isCoordinator
    ? "Read-only: only the assigned coordinator can send a technical request."
    : event.status !== "PLANNING"
      ? "Technical requests can be sent while the event is in planning."
      : !hasDates
        ? "Set the event's date and time before sending a technical request."
        : active
          ? `This event already has a ${technicalStatusLabel(active.status).toLowerCase()} technical request.`
          : null;

  const reload = () => { setRequests({ status: "loading" }); setAttempt((value) => value + 1); };

  const start = () => {
    setLines(event.equipmentRequirements.map((line) => ({ ...line })));
    setLineErrors({});
    setError(null);
    setNotice(null);
    setOpen(true);
  };
  const close = () => { if (!sending) setOpen(false); };

  const send = async () => {
    const problems = availability.state.status === "ready" ? lineQuantityProblems(lines, availability.state.data) : {};
    const invalid = Object.fromEntries(lines.flatMap((line, index) =>
      Number.isInteger(line.quantity) && line.quantity >= 1 ? [] : [[index, "Quantity must be a whole number of 1 or more."]]));
    const errors = { ...problems, ...invalid };
    setLineErrors(errors);
    if (!lines.length) { setError({ message: "Add at least one equipment item to send." }); return; }
    if (Object.keys(errors).length) { setError({ message: "Reduce the highlighted quantities to what is available, then send." }); return; }

    // A retry of the same lines reuses its key, so Technical Support are notified once.
    const body = JSON.stringify(lines);
    const attemptKey = pendingKey.current?.body === body ? pendingKey.current : { body, key: crypto.randomUUID() };
    pendingKey.current = attemptKey;
    setSending(true);
    setError(null);
    try {
      const result = await sendTechnicalRequest(event.eventId, lines, attemptKey.key);
      pendingKey.current = null;
      setOpen(false);
      setNotice({
        tone: "success",
        title: "Technical request sent",
        message: `${result.requestId} · ${itemsSummary(result.items)}. Technical Support have been notified and will approve or reject the whole request.`,
      });
      reload();
      onSent?.(result);
    } catch (caught) {
      if (!(caught instanceof ApiError)) {
        setError({ message: "The request could not be sent. Your lines are kept; try again." });
        return;
      }
      if (caught.code !== "NETWORK_ERROR" && caught.code !== "IDEMPOTENCY_IN_PROGRESS") pendingKey.current = null;
      switch (caught.code) {
        case "VALIDATION_FAILED":
          setLineErrors(itemFieldErrors(caught.fields));
          setError({ message: caught.fields.items ?? caught.message });
          return;
        case "EQUIPMENT_NOT_AVAILABLE":
          // Someone else took the stock: show what is left now.
          availability.retry();
          setError({ message: caught.message });
          return;
        case "TECHNICAL_REQUEST_EXISTS":
          setOpen(false);
          setNotice({ tone: "warning", title: "Already sent", message: caught.message });
          reload();
          return;
        case "EVENT_NOT_IN_PLANNING":
        case "EVENT_NOT_FOUND":
          setError({ message: caught.message, stale: true });
          return;
        default:
          setError({ message: caught.message });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-labelledby="technical-requests-heading" className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="technical-requests-heading" className="text-sm font-semibold text-on-surface">Technical requests</h3>
        {canSend ? (
          <Button type="button" onClick={start} aria-haspopup="dialog"><Icon name="add" size={16} />Send technical request</Button>
        ) : null}
      </div>

      <div aria-live="polite" role="status">
        {notice ? <AlertBanner tone={notice.tone} title={notice.title} live={false}>{notice.message}</AlertBanner> : null}
      </div>

      {requests.status === "loading" ? (
        <div aria-busy="true" aria-label="Loading technical requests"><Skeleton className="h-16 w-full" /></div>
      ) : requests.status === "error" ? (
        <AlertBanner tone="error" title="Unable to load technical requests">
          {requests.message}
          <div className="mt-3"><Button type="button" variant="secondary" onClick={reload}><Icon name="refresh" size={16} />Retry</Button></div>
        </AlertBanner>
      ) : sent.length === 0 ? (
        <p className="rounded-control bg-surface-container-low p-4 text-sm text-on-surface-variant">No technical request has been sent yet.</p>
      ) : (
        <ul className="grid gap-3">
          {sent.map((request) => (
            <li key={request.requestId} className={`grid min-w-0 gap-1 rounded-panel border-t-4 bg-surface-container-low p-4 ${BOOKING_BORDERS[request.status] ?? "border-t-outline-variant"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h4 className="font-mono text-xs text-on-surface-variant">Technical request #{request.requestId}</h4>
                <BookingStatusChip status={request.status} label={technicalStatusLabel(request.status)} />
              </div>
              <p className="text-sm text-on-surface [overflow-wrap:anywhere]">{itemsSummary(request.equipment)}</p>
            </li>
          ))}
        </ul>
      )}

      {blocker && requests.status !== "loading" ? (
        <p className="flex items-center gap-1.5 text-sm text-on-surface-variant"><Icon name="lock" size={16} />{blocker}</p>
      ) : null}

      <Dialog
        open={open}
        onClose={close}
        title="Send technical request"
        footer={(
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="quiet" disabled={sending} onClick={close}>Cancel</Button>
            {error?.stale && onStale ? (
              <Button type="button" variant="secondary" onClick={() => { setOpen(false); onStale(); }}>Reload event</Button>
            ) : null}
            <Button type="button" disabled={sending || Boolean(error?.stale)} onClick={() => void send()}>{sending ? "Sending…" : "Send request"}</Button>
          </div>
        )}
      >
        {open ? (
          <div className="grid gap-3 text-sm text-on-surface">
            <p>
              Starts from the organiser&apos;s equipment for <span className="font-semibold">{formatEventWindow(event.startDatetime, event.endDatetime)}</span>.
              Adjust the lines if needed. Technical Support approve or reject the whole request.
            </p>
            <EquipmentRequirementsEditor
              idPrefix={`event-${event.eventId}-technical`}
              lines={lines}
              onChange={(next) => { setLines(next); setLineErrors({}); setError(null); }}
              availability={availability.state}
              onRetry={availability.retry}
              lineErrors={lineErrors}
              maxLines={50}
              emptyText="The organiser did not request equipment. Add the items to send."
            />
            {error ? <AlertBanner tone="error">{error.message}</AlertBanner> : null}
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
