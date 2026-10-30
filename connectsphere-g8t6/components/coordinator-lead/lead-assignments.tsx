"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCoordinatorAvailability, getLeadAssignments, getUnassignedEvents, type ApiEvent, type CoordinatorAvailability, type LeadAssignment } from "@/lib/api/events";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import { PageContent } from "@/components/layout/page-content";
import { SectionHeading } from "@/components/shared/section-heading";
import { AlertBanner, Button, EmptyState, ReferenceIdTag, SectionCard, Skeleton, StatusChip } from "@/components/shared/primitives";
import { CoordinatorAssignmentAction } from "./coordinator-assignment-action";

type SectionState<T> = { rows: T[]; loading: boolean; error: string };

const loadingSection = <T,>(): SectionState<T> => ({ rows: [], loading: true, error: "" });
const failureDetail = (cause: unknown) => (cause instanceof Error && cause.message ? cause.message : "Try again in a moment.");

// SPM-182: the two sections load independently, so one failing endpoint never
// hides the other section's data (AC8). A failed load clears its rows.
export function LeadAssignments() {
  const mounted = useRef(true);
  const supervisedRevision = useRef(0);
  const unassignedRevision = useRef(0);
  const [supervised, setSupervised] = useState<SectionState<LeadAssignment>>(loadingSection);
  const [unassigned, setUnassigned] = useState<SectionState<ApiEvent>>(loadingSection);
  const [coordinators, setCoordinators] = useState<CoordinatorAvailability[]>([]);
  const [notice, setNotice] = useState("");
  const [conflictsOnly, setConflictsOnly] = useState(false);

  // Fetchers only set state after the request settles, so the mount effect
  // can call them; reloads mark the section as loading first.
  const fetchSupervised = useCallback(() => {
    const revision = ++supervisedRevision.current;
    const isLatest = () => mounted.current && revision === supervisedRevision.current;
    return Promise.all([getLeadAssignments(), getCoordinatorAvailability()]).then(([result, availability]) => {
      if (!isLatest()) return;
      setCoordinators(availability.coordinators);
      setSupervised({ rows: result.assignments, loading: false, error: "" });
    }, (cause: unknown) => {
      if (!isLatest()) return;
      setCoordinators([]);
      setSupervised({ rows: [], loading: false, error: failureDetail(cause) });
    });
  }, []);

  const fetchUnassigned = useCallback(() => {
    const revision = ++unassignedRevision.current;
    const isLatest = () => mounted.current && revision === unassignedRevision.current;
    return getUnassignedEvents().then((result) => {
      if (!isLatest()) return;
      setUnassigned({ rows: Array.isArray(result.events) ? result.events : [], loading: false, error: "" });
    }, (cause: unknown) => {
      if (!isLatest()) return;
      setUnassigned({ rows: [], loading: false, error: failureDetail(cause) });
    });
  }, []);

  const loadSupervised = async () => {
    setSupervised((current) => ({ ...current, loading: true, error: "" }));
    await fetchSupervised();
  };
  const loadUnassigned = async () => {
    setUnassigned((current) => ({ ...current, loading: true, error: "" }));
    await fetchUnassigned();
  };
  const refreshAll = async () => {
    await Promise.all([loadSupervised(), loadUnassigned()]);
  };

  useEffect(() => {
    mounted.current = true;
    void Promise.all([fetchSupervised(), fetchUnassigned()]);
    return () => { mounted.current = false; };
  }, [fetchSupervised, fetchUnassigned]);

  const conflicts = supervised.rows.filter((event) => event.hasScheduleConflict).length;
  const visible = conflictsOnly ? supervised.rows.filter((event) => event.hasScheduleConflict) : supervised.rows;
  const busy = supervised.loading || unassigned.loading;
  const countOf = (section: SectionState<unknown>, count: number) => (section.loading ? "…" : section.error ? "—" : String(count));

  return <PageContent title="Assignments" eyebrow="Event Coordinator Lead" description="See who coordinates each event you supervise and which submitted events are still waiting for a coordinator." action={<Button variant="secondary" disabled={busy} onClick={() => void refreshAll()}>Refresh assignments</Button>}>
    {notice && <AlertBanner tone="success">{notice}</AlertBanner>}

    <dl aria-label="Assignment summary" className="grid grid-cols-3 gap-3">
      {[
        ["Supervised", countOf(supervised, supervised.rows.length)],
        ["Unassigned", countOf(unassigned, unassigned.rows.length)],
        ["Scheduling conflicts", countOf(supervised, conflicts)],
      ].map(([label, value]) => <div key={label} className="rounded-panel bg-surface-container-low p-3 sm:p-4">
        <dt className="text-xs font-semibold uppercase tracking-label text-on-surface-variant">{label}</dt>
        <dd className="mt-1 text-2xl font-semibold text-on-surface">{value}</dd>
      </div>)}
    </dl>

    <section aria-labelledby="unassigned-heading" className="grid gap-4">
      <SectionHeading
        id="unassigned-heading"
        title={`Unassigned (${countOf(unassigned, unassigned.rows.length)})`}
        description="Submitted events waiting in the shared queue, oldest submission first."
        action={<Link href="/events" className="inline-flex min-h-11 items-center rounded-control bg-surface-container-low px-4 py-2.5 text-sm font-semibold text-primary hover:underline">Assign in queue</Link>}
      />
      {unassigned.loading ? <Skeleton className="h-24" /> : unassigned.error ? <AlertBanner tone="error" title="Unassigned events could not be loaded.">
        {unassigned.error} <Button variant="quiet" className="ml-1" onClick={() => void loadUnassigned()}>Retry</Button>
      </AlertBanner> : unassigned.rows.length === 0 ? <EmptyState title="No events are waiting for a coordinator." description="New submissions appear here until a Lead assigns them." /> : <ul aria-label="Unassigned events" className="grid gap-3">
        {unassigned.rows.map((event) => <li key={event.eventId}>
          <SectionCard status="SUBMITTED" className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <div className="flex flex-wrap items-center gap-3"><ReferenceIdTag value={event.requestId} /><StatusChip status="SUBMITTED" label="Unassigned" /></div>
              <h3 className="text-base font-semibold text-on-surface">{event.title}</h3>
              <p className="text-sm">{formatEventWindow(event.startDatetime, event.endDatetime)}</p>
            </div>
            <div className="grid gap-1 text-sm text-on-surface-variant sm:text-right">
              <span>{event.expectedAttendance} expected</span>
              <span>Submitted {formatTimestamp(event.submittedAt ?? event.createdAt)}</span>
            </div>
          </SectionCard>
        </li>)}
      </ul>}
    </section>

    <section aria-labelledby="supervised-heading" className="grid gap-4">
      <SectionHeading
        id="supervised-heading"
        title={`Supervised events (${countOf(supervised, supervised.rows.length)})`}
        description="Events you assigned, and events assigned before supervision was recorded. Choose an available coordinator to resolve a scheduling conflict."
      />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={conflictsOnly} onChange={(e) => setConflictsOnly(e.target.checked)} />Show scheduling conflicts only ({conflicts})</label>
      {supervised.loading ? <Skeleton className="h-48" /> : supervised.error ? <AlertBanner tone="error" title="Assignments could not be loaded.">
        {supervised.error} Refresh before making another assignment. <Button variant="quiet" className="ml-1" onClick={() => void loadSupervised()}>Retry</Button>
      </AlertBanner> : visible.length === 0 ? <EmptyState title={conflictsOnly ? "No scheduling conflicts" : "No active assignments"} description="Events you assign from the queue appear here with their coordinator." /> : visible.map((event) => <article key={event.eventId} aria-label={event.title}>
        <SectionCard>
          <div className="mb-4 flex flex-wrap items-center gap-3"><ReferenceIdTag value={event.requestId} /><StatusChip status={event.status} />{event.supervisingLeadId === null && <span className="text-sm text-on-surface-variant">Unsupervised</span>}</div>
          <h3 className="text-lg font-semibold"><Link href={`/events/${event.eventId}`} className="text-primary hover:underline">{event.title}</Link></h3>
          <p className="mt-2 text-sm">{formatEventWindow(event.startDatetime, event.endDatetime)}</p>
          <p className="mb-4 mt-2 text-sm">Current coordinator: <strong>{event.coordinatorName}</strong></p>
          {event.hasScheduleConflict && <div className="mb-4"><AlertBanner tone="warning">The current coordinator has an overlapping active event. The Lead must choose which assignment to change.</AlertBanner></div>}
          <CoordinatorAssignmentAction key={`${event.eventId}-${event.coordinatorId}`} event={event} currentCoordinatorId={event.coordinatorId} coordinators={coordinators} onRefresh={refreshAll} onSaved={async (replayed) => { setNotice(replayed ? `Previous reassignment confirmed for ${event.requestId}. Current assignments refreshed.` : `Coordinator updated for ${event.requestId}.`); await refreshAll(); }} />
        </SectionCard>
      </article>)}
    </section>
  </PageContent>;
}
