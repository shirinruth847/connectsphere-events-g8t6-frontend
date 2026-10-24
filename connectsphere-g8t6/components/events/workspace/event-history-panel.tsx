"use client";

import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { PermissionPill } from "@/components/shared/permission-pill";
import { statusPresentation } from "@/lib/events";
import { SectionHeading } from "@/components/shared/section-heading";
import type { EventHistoryEntry, EventView } from "@/lib/api/event-workspace";
import { formatTimestamp } from "@/lib/datetime";
import { fieldLabel } from "./event-detail-rows";
import { useEventHistory } from "./use-event-history";

const ACTION_LABELS: Record<string, string> = {
  DRAFT_CREATED: "Draft created",
  DRAFT_UPDATED: "Draft saved",
  EVENT_SUBMITTED: "Request submitted",
  EVENT_DETAILS_UPDATED: "Event details updated",
  COORDINATOR_ASSIGNED: "Coordinator assigned",
  COORDINATOR_REASSIGNED: "Coordinator reassigned",
  SAFETY_REVIEW_SUBMITTED: "Submitted for safety review",
  EVENT_CONFIRMED: "Event confirmed",
  PREPARATION_STARTED: "Preparation started",
  EVENT_COMPLETED: "Event completed",
  VENUE_SUGGESTED: "Venue suggested",
};

const ROLE_LABELS: Record<string, string> = {
  ORGANISER: "Organiser",
  COORDINATOR: "Event Coordinator",
  COORDINATOR_LEAD: "Coordinator Lead",
  VENUE_STAFF: "Venue Staff",
  TECH_SUPPORT: "Technical Support",
  ATTENDEE: "Attendee",
  SYSTEM: "System",
};

const actionLabel = (entry: EventHistoryEntry) =>
  ACTION_LABELS[entry.action] ?? entry.summary ?? entry.action;

const formatValue = (field: string, value: unknown) => {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "status" && typeof value === "string") return statusPresentation(value).label;
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

function describeHistory(event: EventView) {
  if (event.permissions.canViewDraftHistory) return "Includes your draft saves, which only you can see.";
  if (event.permissions.canViewStaffHistory) return "Includes staff-only assignment records.";
  return "Changes made since the request was submitted.";
}

// A suggestion is not an edit of the request (SPM-72 AC8): it reads as the
// venue suggested, and which suggestion it replaces, rather than From/To.
function ChangeValue({ change }: { change: EventHistoryEntry["changes"][number] }) {
  if (change.field === "suggestedVenue") {
    return (
      <dd className="mt-1 grid gap-0.5 text-on-surface">
        <span className="line-clamp-3">{formatValue(change.field, change.after)}</span>
        {change.before ? <span className="line-clamp-3 text-on-surface-variant">Replaces {formatValue(change.field, change.before)}</span> : null}
      </dd>
    );
  }
  return (
    <dd className="mt-1 grid gap-0.5 text-on-surface">
      <span className="line-clamp-3 text-on-surface-variant"><span className="font-semibold">From:</span> {formatValue(change.field, change.before)}</span>
      <span className="line-clamp-3"><span className="font-semibold">To:</span> {formatValue(change.field, change.after)}</span>
    </dd>
  );
}

const historyIcon = (action: string) =>
  action.startsWith("COORDINATOR_") ? "person" : action === "EVENT_SUBMITTED" ? "check" : action === "VENUE_SUGGESTED" ? "venue" : "edit";

function HistoryItem({ entry }: { entry: EventHistoryEntry }) {
  return (
    <li className="relative pl-7">
      <span aria-hidden="true" className="absolute left-0 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-primary-fixed text-primary">
        <Icon name={historyIcon(entry.action)} size={16} />
      </span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-sm font-semibold text-on-surface">{actionLabel(entry)}</p>
        {entry.audience === "STAFF_ONLY" ? <PermissionPill tone="staff">Staff only</PermissionPill> : null}
        {entry.audience === "OWNER_ONLY" ? <PermissionPill tone="read-only">Only you</PermissionPill> : null}
      </div>
      <p className="mt-0.5 text-xs text-on-surface-variant">
        {entry.actor.name ?? "System"}
        {entry.actor.role ? ` · ${ROLE_LABELS[entry.actor.role] ?? entry.actor.role}` : ""}
        {" · "}
        <time dateTime={entry.occurredAt}>{formatTimestamp(entry.occurredAt)}</time>
      </p>
      {entry.changes.length ? (
        <dl className="mt-2 grid gap-2 rounded-control bg-surface-container-low p-3">
          {entry.changes.map((change) => (
            <div key={change.field} className="text-xs">
              <dt className="font-semibold uppercase tracking-[0.05em] text-on-surface-variant">{fieldLabel(change.field)}</dt>
              <ChangeValue change={change} />
            </div>
          ))}
        </dl>
      ) : null}
    </li>
  );
}

export function EventHistoryPanel({ event, refreshKey }: { event: EventView; refreshKey: number }) {
  const { state, retry, loadMore, loadingMore, moreError } = useEventHistory(event.eventId, refreshKey);
  const headingId = `event-${event.eventId}-history`;

  return (
    <section aria-labelledby={headingId} className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
      <SectionHeading id={headingId} title="Change history" description={describeHistory(event)} />
      <div className="mt-4">
        {state.status === "loading" ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading change history">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : state.status === "error" ? (
          <AlertBanner tone="error" title="Change history unavailable">
            {state.message}
            <div className="mt-3"><Button variant="secondary" onClick={retry}><Icon name="refresh" size={16} />Try again</Button></div>
          </AlertBanner>
        ) : state.entries.length === 0 ? (
          <p className="rounded-control bg-surface-container-low p-4 text-sm text-on-surface-variant">No changes have been recorded for this event yet.</p>
        ) : (
          <>
            <ol className="relative grid gap-5 before:absolute before:bottom-2 before:left-2.5 before:top-2 before:w-px before:bg-outline-variant">
              {state.entries.map((entry) => <HistoryItem key={entry.historyId} entry={entry} />)}
            </ol>
            {moreError ? <p className="mt-3 text-xs font-semibold text-error" role="alert">{moreError}</p> : null}
            {state.nextCursor ? (
              <Button variant="secondary" fullWidth className="mt-4" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? "Loading older changes…" : "Show older changes"}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
