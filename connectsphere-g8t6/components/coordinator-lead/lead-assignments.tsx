"use client";

import { useCallback, useEffect, useState } from "react";
import { getCoordinatorAvailability, getLeadAssignments, type CoordinatorAvailability, type LeadAssignment } from "@/lib/api/events";
import { formatEventWindow } from "@/lib/datetime";
import { PageContent } from "@/components/layout/page-content";
import { AlertBanner, Button, EmptyState, ReferenceIdTag, SectionCard, Skeleton, StatusChip } from "@/components/shared/primitives";
import { CoordinatorAssignmentAction } from "./coordinator-assignment-action";

export function LeadAssignments() {
  const [assignments, setAssignments] = useState<LeadAssignment[]>([]);
  const [coordinators, setCoordinators] = useState<CoordinatorAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const load = useCallback(async () => {
    try {
      const [result, availability] = await Promise.all([getLeadAssignments(), getCoordinatorAvailability()]);
      setError("");
      setAssignments(result.assignments);
      setCoordinators(availability.coordinators);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assignments could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);
  const refresh = async () => { setLoading(true); setError(""); await load(); };
  useEffect(() => {
    let active = true;
    void Promise.all([getLeadAssignments(), getCoordinatorAvailability()]).then(([result, availability]) => {
      if (!active) return;
      setAssignments(result.assignments);
      setCoordinators(availability.coordinators);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Assignments could not be loaded.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const conflicts = assignments.filter((event) => event.hasScheduleConflict).length;
  const visible = conflictsOnly ? assignments.filter((event) => event.hasScheduleConflict) : assignments;
  return <PageContent title="Assignments" eyebrow="Event Coordinator Lead" description="Review events you supervise and legacy unsupervised events. Choose an available coordinator to resolve a scheduling conflict." action={<Button variant="secondary" disabled={loading} onClick={() => void refresh()}>Refresh assignments</Button>}>
    {notice && <AlertBanner tone="success">{notice}</AlertBanner>}
    {error && <AlertBanner tone="error">{error} Refresh before making another assignment.</AlertBanner>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={conflictsOnly} onChange={(e) => setConflictsOnly(e.target.checked)} />Show scheduling conflicts only ({conflicts})</label>
    {loading ? <Skeleton className="h-48" /> : error ? null : visible.length === 0 ? <EmptyState title={conflictsOnly ? "No scheduling conflicts" : "No active assignments"} description="Submitted unassigned requests remain in the Unassigned Queue." /> : visible.map((event) => <article key={event.eventId} aria-label={event.title}>
      <SectionCard>
        <div className="mb-4 flex flex-wrap items-center gap-3"><ReferenceIdTag value={event.requestId} /><StatusChip status={event.status} />{event.supervisingLeadId === null && <span className="text-sm text-on-surface-variant">Unsupervised</span>}</div>
        <h2 className="text-lg font-semibold">{event.title}</h2>
        <p className="mt-2 text-sm">{formatEventWindow(event.startDatetime, event.endDatetime)}</p>
        <p className="mb-4 mt-2 text-sm">Current coordinator: <strong>{event.coordinatorName}</strong></p>
        {event.hasScheduleConflict && <div className="mb-4"><AlertBanner tone="warning">The current coordinator has an overlapping active event. The Lead must choose which assignment to change.</AlertBanner></div>}
        <CoordinatorAssignmentAction key={`${event.eventId}-${event.coordinatorId}`} event={event} currentCoordinatorId={event.coordinatorId} coordinators={coordinators} onRefresh={refresh} onSaved={async () => { setNotice(`Coordinator updated for ${event.requestId}.`); await refresh(); }} />
      </SectionCard>
    </article>)}
  </PageContent>;
}
