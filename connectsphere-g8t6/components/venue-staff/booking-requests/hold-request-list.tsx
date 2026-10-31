"use client";

import { useSessionUser } from "@/components/auth/auth-gate";
import { keepsIdempotencyKey } from "@/lib/lifecycle-actions";
import { readHoldCommand, saveHoldCommand } from "@/components/venues/hold-command-recovery";
import { useHoldExpiryRefresh, useMinuteClock } from "@/components/venues/use-hold-expiry-refresh";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, FormLabel, fieldClasses } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { BookingChecksPanel, hasBlockingProblem } from "@/components/venues/booking-checks";
import { HoldSummary, holdChipStatus, holdChipLabel } from "@/components/venues/event-venue-options/event-venue-holds";
import { ApiError } from "@/lib/api";
import { formatTimestamp } from "@/lib/datetime";
import {
  HOLD_LIMITS,
  MAX_HOLD_EXTENSION_DAYS,
  declineHoldRequest,
  extendVenueHold,
  isActiveHold,
  listHoldRequests,
  placeVenueHold,
  releaseVenueHold,
  type VenueHoldRequest,
} from "@/lib/api/venue-holds";
import { BookingStatusChip } from "./booking-status-chip";

type Notice = { tone: "success" | "error"; text: string } | null;

const EXTENSION_DAYS = Array.from({ length: MAX_HOLD_EXTENSION_DAYS }, (_, index) => index + 1);

// Which kind of request a card on My Requests is (developer request of 31
// October 2026: one list for booking and hold requests).
export function RequestTypeTag({ children }: { children: ReactNode }) {
  return <span className="mr-2 inline-flex rounded-chip bg-surface-container-high px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-label text-on-surface">{children}</span>;
}

function HoldRequestCard({ request, now, busy, recovering, onPlace, onDecline, onExtend, onRelease, onRetry }: {
  request: VenueHoldRequest;
  now: number;
  busy: boolean;
  recovering: boolean;
  onPlace: () => void;
  onDecline: () => void;
  onExtend: (days: number) => void;
  onRelease: () => void;
  onRetry: () => void;
}) {
  const [days, setDays] = useState(1);
  const titleId = `hold-request-${request.holdRequestId}-title`;
  const preview = request.preview ?? null;
  const blocked = hasBlockingProblem(preview) || (request.status === "PENDING" && !preview?.expiresAt);
  return (
    <article aria-labelledby={titleId} data-hold-request-id={request.holdRequestId} className="grid content-start gap-3 rounded-panel border-t-4 border-t-[#B45309] bg-surface-container-lowest p-4 shadow-elevation-1">
      <div className="flex items-start justify-between gap-3">
        <h3 id={titleId} className="line-clamp-2 text-base font-bold leading-snug text-on-surface">{request.eventTitle ?? request.requestId}</h3>
        <BookingStatusChip status={holdChipStatus(request, now)} label={holdChipLabel(request, now)} />
      </div>
      <p className="-mt-2 text-xs text-on-surface-variant">
        <RequestTypeTag>Hold request</RequestTypeTag>
        {request.venueName ?? `Venue ${request.venueId}`}{request.label ? ` · ${request.label}` : ""} ·{" "}
        <Link className="font-mono underline" href={`/events/${request.eventId}`}>{request.requestId}</Link>
      </p>
      <HoldSummary request={request} now={now} bookingLink onRetry={onRetry} />
      <p className="text-xs text-on-surface-variant">
        Requested {formatTimestamp(request.requestedAt)}{request.requestedByName ? ` by ${request.requestedByName}` : ""}
        {request.decidedAt ? ` · Actioned ${formatTimestamp(request.decidedAt)}${request.decidedByName ? ` by ${request.decidedByName}` : ""}` : ""}
      </p>

      {request.status === "PENDING" ? (
        <>
          <BookingChecksPanel checks={preview} />
          {preview?.expiresAt ? (
            <p className="text-sm text-on-surface">If placed now, held until <span className="font-semibold">{formatTimestamp(preview.expiresAt)}</span>.</p>
          ) : null}
          {recovering ? <p className="text-sm text-on-surface-variant">The previous placement is unconfirmed. Retry with the saved request; availability will be checked again.</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy || (blocked && !recovering)} onClick={onPlace}><Icon name="check" size={16} />Place hold</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={onDecline} aria-haspopup="dialog">Decline</Button>
          </div>
        </>
      ) : null}

      {isActiveHold(request, now) ? (
        <div className="flex flex-wrap items-end gap-2">
          {!request.hold?.extended ? (
            <>
              <div className="grid gap-1">
                <label htmlFor={`extend-${request.holdRequestId}`} className="text-xs font-semibold text-on-surface-variant">Extend by</label>
                <select id={`extend-${request.holdRequestId}`} className={fieldClasses.replace("w-full", "w-[7rem]")} value={days} disabled={busy} onChange={(change) => setDays(Number(change.target.value))}>
                  {EXTENSION_DAYS.map((value) => <option key={value} value={value}>{value} {value === 1 ? "day" : "days"}</option>)}
                </select>
              </div>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => onExtend(days)}>Extend</Button>
            </>
          ) : null}
          <Button type="button" variant="quiet" disabled={busy} onClick={onRelease}>Release hold</Button>
        </div>
      ) : null}
    </article>
  );
}

export type HoldRequestsState =
  | { status: "loading" }
  | { status: "ready"; requests: VenueHoldRequest[]; pendingCount: number }
  | { status: "error"; message: string };

// Venue Staff's hold requests (SPM-190), shown with the booking requests in
// one list on My Requests: every hold request, each with the same per-window
// checks as a booking and when the hold would expire. Place hold or Decline
// (with a reason); a placed hold can be extended once by 1–7 days or released.
// The caller places each card and the decline dialog.
export function useHoldRequests(): {
  state: HoldRequestsState;
  notice: Notice;
  reload: () => void;
  card: (request: VenueHoldRequest) => ReactNode;
  dialog: ReactNode;
} {
  const user = useSessionUser();
  const [state, setState] = useState<{ status: "loading" } | { status: "ready"; requests: VenueHoldRequest[]; pendingCount: number } | { status: "error"; message: string }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [declining, setDeclining] = useState<VenueHoldRequest | null>(null);
  const [reason, setReason] = useState("");
  const [declineError, setDeclineError] = useState<string | null>(null);
  // A retry of the same placement reuses its key, so it cannot place twice.
  const placeKeys = useRef(new Map<number, string>());
  const [recoveringIds, setRecoveringIds] = useState<number[]>([]);
  const actorId = user?.user_id;

  useEffect(() => {
    let alive = true;
    listHoldRequests()
      .then((result) => {
        if (!alive) return;
        setRecoveringIds(result.requests.filter((request) => {
          const saved = readHoldCommand(`connectsphere:recovery:spm190:place:${actorId}:${request.holdRequestId}`);
          return request.status === "PENDING" && (placeKeys.current.has(request.holdRequestId)
            || saved?.body === String(request.holdRequestId));
        }).map((request) => request.holdRequestId));
        setState({ status: "ready", ...result });
      })
      .catch((caught: unknown) => {
        if (alive) setState({ status: "error", message: caught instanceof Error ? caught.message : "Hold requests could not be loaded." });
      });
    return () => { alive = false; };
  }, [attempt, actorId]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const refreshedAt = useHoldExpiryRefresh(state.status === "ready" ? state.requests : [], reload);
  // One minute timer for every card's countdown (SPM-188 AC8).
  const clock = useMinuteClock();
  const now = Math.max(refreshedAt, clock);
  const run = async (request: VenueHoldRequest, work: () => Promise<{ message: string }>) => {
    setBusyId(request.holdRequestId);
    setNotice(null);
    try {
      const answer = await work();
      setNotice({ tone: "success", text: answer.message });
      return true;
    } catch (caught) {
      setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "The hold could not be changed." });
      return false;
    } finally {
      setBusyId(null);
      reload();
    }
  };
  const place = (request: VenueHoldRequest) => {
    const slot = `connectsphere:recovery:spm190:place:${user?.user_id}:${request.holdRequestId}`;
    const saved = readHoldCommand(slot);
    const key = placeKeys.current.get(request.holdRequestId) ?? (saved?.body === String(request.holdRequestId) ? saved.key : undefined) ?? crypto.randomUUID();
    saveHoldCommand(slot, { body: String(request.holdRequestId), key });
    placeKeys.current.set(request.holdRequestId, key);
    setRecoveringIds((ids) => [...new Set([...ids, request.holdRequestId])]);
    void run(request, () => placeVenueHold(request.holdRequestId, key).then((answer) => {
      setRecoveringIds((ids) => ids.filter((id) => id !== request.holdRequestId));
      placeKeys.current.delete(request.holdRequestId);
      saveHoldCommand(slot, null);
      return answer;
    }).catch((caught: unknown) => {
      if (!keepsIdempotencyKey(caught instanceof ApiError ? caught : null) && !(caught instanceof ApiError && caught.status === 401)) {
        setRecoveringIds((ids) => ids.filter((id) => id !== request.holdRequestId));
        placeKeys.current.delete(request.holdRequestId);
        saveHoldCommand(slot, null);
      }
      throw caught;
    }));
  };
  const decline = async () => {
    if (!declining) return;
    const text = reason.trim();
    if (!text) {
      setDeclineError("Enter a reason for the coordinator.");
      return;
    }
    setBusyId(declining.holdRequestId);
    try {
      const answer = await declineHoldRequest(declining.holdRequestId, text);
      setNotice({ tone: "success", text: answer.message });
      setDeclining(null);
      reload();
    } catch (caught) {
      setDeclineError(caught instanceof Error ? caught.message : "The request could not be declined.");
    } finally {
      setBusyId(null);
    }
  };

  const card = (request: VenueHoldRequest) => (
    <HoldRequestCard
      key={`hold-${request.holdRequestId}`}
      request={request}
      now={now}
      busy={busyId === request.holdRequestId}
      recovering={recoveringIds.includes(request.holdRequestId)}
      onPlace={() => place(request)}
      onDecline={() => { setDeclining(request); setReason(""); setDeclineError(null); }}
      onExtend={(days) => void run(request, () => extendVenueHold(request.hold?.holdId ?? "", days))}
      onRelease={() => void run(request, () => releaseVenueHold(request.hold?.holdId ?? ""))}
              onRetry={reload}
    />
  );
  const dialog = (
    <Dialog
      open={declining !== null}
      onClose={() => { if (busyId === null) setDeclining(null); }}
      title="Decline hold request?"
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="quiet" disabled={busyId !== null} onClick={() => setDeclining(null)}>Cancel</Button>
          <Button type="button" variant="danger" disabled={busyId !== null} onClick={() => void decline()}>Decline request</Button>
        </div>
      )}
    >
      {declining ? (
        <div className="grid gap-3 text-sm">
          <p>{declining.venueName ?? `Venue ${declining.venueId}`} for {declining.eventTitle ?? declining.requestId}. The coordinator sees your reason.</p>
          <div>
            <FormLabel htmlFor="hold-decline-reason" required>Reason</FormLabel>
            <textarea id="hold-decline-reason" rows={3} className={fieldClasses} maxLength={HOLD_LIMITS.reason} value={reason} onChange={(change) => setReason(change.target.value)} />
          </div>
          {declineError ? <AlertBanner tone="error">{declineError}</AlertBanner> : null}
        </div>
      ) : null}
    </Dialog>
  );
  return { state, notice, reload, card, dialog };
}
