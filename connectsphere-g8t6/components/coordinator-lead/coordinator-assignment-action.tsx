"use client";

import { useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { assignCoordinator, reassignCoordinator, type ApiEvent, type CoordinatorAvailability } from "@/lib/api/events";
import { coordinatorConflicts } from "@/lib/coordinator-availability";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, FormLabel, fieldClasses } from "@/components/shared/primitives";

export function CoordinatorAssignmentAction({ event, coordinators, currentCoordinatorId, onSaved, onRefresh }: {
  event: ApiEvent;
  coordinators: CoordinatorAvailability[];
  currentCoordinatorId?: number;
  onSaved: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [selected, setSelected] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const choices = coordinators.map((coordinator) => ({
    ...coordinator,
    conflicts: coordinatorConflicts(event, coordinator),
  }));
  const chosen = choices.find((coordinator) => coordinator.coordinatorId === Number(selected));
  const available = choices.filter((coordinator) => coordinator.coordinatorId !== currentCoordinatorId && coordinator.conflicts.length === 0);
  const validDates = Number.isFinite(Date.parse(event.startDatetime)) && Date.parse(event.startDatetime) < Date.parse(event.endDatetime);
  const canConfirm = !needsRefresh && validDates && chosen && chosen.coordinatorId !== currentCoordinatorId && chosen.conflicts.length === 0;
  const action = currentCoordinatorId === undefined ? "Assign" : "Reassign";

  async function save() {
    if (!canConfirm || !chosen || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      if (currentCoordinatorId === undefined) await assignCoordinator(event.eventId, chosen.coordinatorId);
      else await reassignCoordinator(event.eventId, chosen.coordinatorId, currentCoordinatorId);
      setConfirm(false);
      setSelected("");
      // Only backend-confirmed outcomes reach the success handler.
      await onSaved();
    } catch (cause) {
      setConfirm(false);
      setError(cause instanceof ApiError && cause.status === 0
        ? "The result could not be confirmed. Refresh assignments before trying again."
        : cause instanceof Error ? cause.message : "The coordinator could not be updated.");
      setNeedsRefresh(true);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return <div className="space-y-3">
    <div>
      <FormLabel htmlFor={`coordinator-${event.eventId}`}>Coordinator for {event.requestId}</FormLabel>
      <select id={`coordinator-${event.eventId}`} className={fieldClasses} value={selected} disabled={pending} onChange={(e) => { setSelected(e.target.value); setError(""); }}>
        <option value="">Choose an available coordinator</option>
        {choices.map((coordinator) => <option key={coordinator.coordinatorId} value={coordinator.coordinatorId} disabled={coordinator.coordinatorId === currentCoordinatorId || coordinator.conflicts.length > 0}>
          {coordinator.name}{coordinator.coordinatorId === currentCoordinatorId ? " — currently assigned" : coordinator.conflicts.length ? " — schedule conflict" : " — available"}
        </option>)}
      </select>
    </div>
    {available.length === 0 && <p className="text-sm text-on-surface-variant">No alternative coordinator is currently available. The Lead must resolve staffing before this event can be assigned.</p>}
    {!validDates && <AlertBanner tone="warning">This event needs valid start and end times before assignment.</AlertBanner>}
    {error && <AlertBanner tone="error">{error}</AlertBanner>}
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
