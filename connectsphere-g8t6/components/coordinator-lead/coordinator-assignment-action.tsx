"use client";

import { useEffect, useRef, useState } from "react";
import { useSessionUser } from "@/components/auth/auth-gate";
import { ApiError } from "@/lib/api";
import { assignCoordinator, reassignCoordinator, type ApiEvent, type CoordinatorAvailability } from "@/lib/api/events";
import { coordinatorConflicts } from "@/lib/coordinator-availability";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, FormLabel, fieldClasses } from "@/components/shared/primitives";

type ReassignmentCommand = { coordinatorId: number; expectedCoordinatorId: number; key: string };

// Keep uncertain commands across refresh, reload and session expiry. The key
// includes the verified application user, so another account never replays it.
function readCommand(storageKey: string | null): ReassignmentCommand | null {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    return value && Number.isSafeInteger(value.coordinatorId) && value.coordinatorId > 0
      && Number.isSafeInteger(value.expectedCoordinatorId) && value.expectedCoordinatorId > 0
      && typeof value.key === "string" && /^[A-Za-z0-9_.:-]{8,128}$/.test(value.key) ? value : null;
  } catch { return null; }
}

export function CoordinatorAssignmentAction({ event, coordinators, currentCoordinatorId, onSaved, onRefresh }: {
  event: ApiEvent;
  coordinators: CoordinatorAvailability[];
  currentCoordinatorId?: number;
  onSaved: (replayed?: boolean) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const user = useSessionUser();
  const storageKey = user ? `connectsphere:recovery:reassignment:${user.user_id}:${event.eventId}` : null;
  const [unconfirmed, setUnconfirmed] = useState<ReassignmentCommand | null>(() => readCommand(storageKey));
  const [selected, setSelected] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [error, setError] = useState("");
  const activeRequest = useRef<symbol | null>(null);
  useEffect(() => () => {
    // A fetch may finish after browser history or a refresh replaces this view.
    // Its result must not clear recovery data or update a later view.
    activeRequest.current = null;
  }, []);
  const choices = coordinators.map((coordinator) => ({
    ...coordinator,
    conflicts: coordinatorConflicts(event, coordinator),
  }));
  const chosen = choices.find((coordinator) => coordinator.coordinatorId === Number(selected));
  const available = choices.filter((coordinator) => coordinator.coordinatorId !== currentCoordinatorId && coordinator.conflicts.length === 0);
  const validDates = Number.isFinite(Date.parse(event.startDatetime)) && Date.parse(event.startDatetime) < Date.parse(event.endDatetime);
  const canConfirm = !unconfirmed && !needsRefresh && validDates && chosen && chosen.coordinatorId !== currentCoordinatorId && chosen.conflicts.length === 0;
  const action = currentCoordinatorId === undefined ? "Assign" : "Reassign";

  function forgetCommand(command: ReassignmentCommand) {
    const stored = readCommand(storageKey);
    if (stored && stored.key !== command.key) return false;
    if (storageKey && stored?.key === command.key) {
      try { sessionStorage.removeItem(storageKey); } catch { /* A retained key can only replay its confirmed result. */ }
    }
    setUnconfirmed((current) => current?.key === command.key ? null : current);
    return true;
  }

  async function save(retry?: ReassignmentCommand) {
    if (activeRequest.current || (!retry && (!canConfirm || !chosen))) return;
    const request = Symbol();
    activeRequest.current = request;
    const isCurrentRequest = () => activeRequest.current === request;
    setPending(true);
    setError("");
    let command = retry;
    try {
      let replayed = false;
      if (currentCoordinatorId === undefined && !retry) {
        await assignCoordinator(event.eventId, chosen!.coordinatorId);
        if (!isCurrentRequest()) return;
      } else {
        if (!command) {
          command = { coordinatorId: chosen!.coordinatorId, expectedCoordinatorId: currentCoordinatorId!, key: crypto.randomUUID() };
          // Persist before sending; otherwise a reload could lose the command
          // identity after the backend committed but its response was lost.
          if (!storageKey) throw new Error("Your account could not be verified. Reload before reassigning.");
          try {
            sessionStorage.setItem(storageKey, JSON.stringify(command));
          } catch {
            throw new ApiError("Enable browser session storage before reassigning. Nothing was sent.", 400, "RECOVERY_UNAVAILABLE");
          }
          setUnconfirmed(command);
        }
        const result = await reassignCoordinator(event.eventId, command.coordinatorId, command.expectedCoordinatorId, command.key);
        if (!isCurrentRequest()) return;
        replayed = result.replayed;
        if (!forgetCommand(command)) return;
      }
      setConfirm(false);
      setSelected("");
      // Only backend-confirmed outcomes reach the success handler.
      await onSaved(replayed);
    } catch (cause) {
      if (!isCurrentRequest()) return;
      setConfirm(false);
      // A 401 may arrive during replay after an uncertain earlier attempt;
      // preserve its identity for the same account after signing in again.
      const uncertain = !(cause instanceof ApiError && [400, 403, 404, 409, 422].includes(cause.status)
        && cause.code !== "IDEMPOTENCY_IN_PROGRESS");
      if (command && !uncertain && !forgetCommand(command)) return;
      setError(uncertain && command
        ? "The reassignment result is unconfirmed. Retry the previous reassignment before starting another."
        : cause instanceof ApiError && cause.status === 0
        ? "The result could not be confirmed. Refresh assignments before trying again."
        : cause instanceof Error ? cause.message : "The coordinator could not be updated.");
      setNeedsRefresh(true);
    } finally {
      if (isCurrentRequest()) {
        activeRequest.current = null;
        setPending(false);
      }
    }
  }

  return <div className="space-y-3">
    <div>
      <FormLabel htmlFor={`coordinator-${event.eventId}`}>Coordinator for {event.requestId}</FormLabel>
      <select id={`coordinator-${event.eventId}`} className={fieldClasses} value={selected} disabled={pending || Boolean(unconfirmed)} onChange={(e) => { setSelected(e.target.value); setError(""); }}>
        <option value="">Choose an available coordinator</option>
        {choices.map((coordinator) => <option key={coordinator.coordinatorId} value={coordinator.coordinatorId} disabled={coordinator.coordinatorId === currentCoordinatorId || coordinator.conflicts.length > 0}>
          {coordinator.name}{coordinator.coordinatorId === currentCoordinatorId ? " — currently assigned" : coordinator.conflicts.length ? " — schedule conflict" : " — available"}
        </option>)}
      </select>
    </div>
    {available.length === 0 && <p className="text-sm text-on-surface-variant">No alternative coordinator is currently available. The Lead must resolve staffing before this event can be assigned.</p>}
    {!validDates && <AlertBanner tone="warning">This event needs valid start and end times before assignment.</AlertBanner>}
    {error && <AlertBanner tone="error">{error}</AlertBanner>}
    {unconfirmed && <div className="space-y-2">
      <p className="text-sm text-on-surface-variant">A previous reassignment needs confirmation. Retrying checks its saved result and refreshes the current assignment.</p>
      <Button variant="secondary" disabled={pending} onClick={() => void save(unconfirmed)}>Retry previous reassignment</Button>
    </div>}
    {needsRefresh && <Button variant="secondary" onClick={() => void onRefresh()}>Refresh availability</Button>}
    <Button disabled={!canConfirm || pending} onClick={() => setConfirm(true)}>{pending ? "Saving…" : `${action} coordinator`}</Button>
    <Dialog open={confirm} onClose={() => { if (!pending) setConfirm(false); }} title={`${action} coordinator`} footer={<>
      <Button variant="secondary" disabled={pending} onClick={() => setConfirm(false)}>Cancel</Button>
      <Button disabled={pending || !canConfirm} onClick={() => void save()}>{pending ? "Saving…" : "Confirm assignment"}</Button>
    </>}>
      <p>Assign <strong>{event.title}</strong> to <strong>{chosen?.name}</strong>?</p>
      <p className="mt-3 text-sm text-on-surface-variant">Availability will be checked again when saving. The organiser and affected coordinators will be notified after the change is saved.</p>
    </Dialog>
  </div>;
}
