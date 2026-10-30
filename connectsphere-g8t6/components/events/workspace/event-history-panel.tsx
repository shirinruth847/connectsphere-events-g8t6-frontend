"use client";

import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { PermissionPill } from "@/components/shared/permission-pill";
import { statusPresentation } from "@/lib/events";
import { SectionHeading } from "@/components/shared/section-heading";
import type { EventHistoryEntry, EventView } from "@/lib/api/event-workspace";
import { formatTimestamp } from "@/lib/datetime";
import { isNewHistoryEntry } from "@/lib/event-history";
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
  EVENT_REJECTED: "Request rejected",
  FEASIBILITY_ACCEPTED: "Request approved for planning",
  CLARIFICATION_REQUESTED: "Clarification requested",
  CLARIFICATION_AMENDED: "Request amended during clarification",
  CLARIFICATION_COMPLETED: "Clarification marked complete",
  EVENT_RESUBMITTED: "Request resubmitted",
  // SPM-243 safety review rounds.
  SAFETY_REVIEW_CLAIMED: "Safety review claimed",
  SAFETY_REVIEW_HANDED_BACK: "Safety review handed back",
  SAFETY_REVIEW_APPROVED: "Safety review approved",
  SAFETY_CHANGES_REQUESTED: "Safety review requested changes",
  SAFETY_VENUES_REJECTED: "Safety review rejected venue bookings",
  SAFETY_REVIEW_SUPERSEDED: "Safety review closed after an arrangement change",
  VENUE_SUGGESTED: "Venue suggested",
  VENUE_BOOKINGS_REQUESTED: "Venue bookings requested",
};

const ROLE_LABELS: Record<string, string> = {
  ORGANISER: "Organiser",
  COORDINATOR: "Event Coordinator",
  COORDINATOR_LEAD: "Coordinator Lead",
  VENUE_STAFF: "Venue Staff",
  TECH_SUPPORT: "Technical Support",
  SAFETY_OFFICER: "Safety Officer",
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
  if (event.viewerRelationship === "SAFETY_OFFICER") {
    return "Changes to attendance, timing, venues, layout, access and equipment, and every safety review record.";
  }
  if (event.permissions.canViewDraftHistory) return "Includes your draft saves, which only you can see.";
  if (event.permissions.canViewStaffHistory) return "Includes staff-only assignment records.";
  return "Changes made since the request was submitted.";
}

// An unseen entry draws its part of the timeline in the warning colour, from its
// icon down to the next entry (SPM-41 v2, "new since your last visit").
const UNSEEN_LINE =
  "before:absolute before:left-2.5 before:top-5 before:-bottom-5 before:w-0.5 before:-translate-x-1/4 before:bg-warning last:before:bottom-0";

// A suggestion is not an edit of the request (SPM-72 AC8): it reads as the
// venue suggested, and which suggestion it replaces, rather than From/To.
// Organiser labels come from Express, using the same mapping as the event header.
const historyStatus = (change: EventHistoryEntry["changes"][number], side: "before" | "after", organiserView: boolean) =>
  organiserView ? change[side === "before" ? "beforeLabel" : "afterLabel"] ?? "Status updated" : formatValue("status", change[side]);

function ChangeValue({ change, organiserView }: { change: EventHistoryEntry["changes"][number]; organiserView: boolean }) {
  // SPM-179: the bookings a request added, one per line; there is no "before".
  if (change.field === "venueBookings" && Array.isArray(change.after)) {
    return (
      <dd className="mt-1 text-on-surface">
        <ul className="grid gap-0.5">
          {change.after.map((booking) => <li key={String(booking)} className="[overflow-wrap:anywhere]">{String(booking)}</li>)}
        </ul>
      </dd>
    );
  }
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
      <span className="line-clamp-3 text-on-surface-variant"><span className="font-semibold">From:</span> {change.field === "status" ? historyStatus(change, "before", organiserView) : formatValue(change.field, change.before)}</span>
      <span className="line-clamp-3"><span className="font-semibold">To:</span> {change.field === "status" ? historyStatus(change, "after", organiserView) : formatValue(change.field, change.after)}</span>
    </dd>
  );
}

function HistoryItem({ entry, isNew, organiserView }: { entry: EventHistoryEntry; isNew: boolean; organiserView: boolean }) {
  const statusChange = entry.changes.find((change) => change.field === "status");
  return (
    <li className={`relative pl-7 ${isNew ? UNSEEN_LINE : ""}`} data-unseen={isNew ? "true" : undefined}>
      <span aria-hidden="true" className="absolute left-0 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-primary-fixed text-primary">
        <Icon name={entry.action.startsWith("COORDINATOR_") ? "person" : entry.action.startsWith("CLARIFICATION_") ? "forum" : entry.action.startsWith("SAFETY_") ? "shield" : entry.action === "EVENT_SUBMITTED" ? "check" : "edit"} size={16} />
      </span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-sm font-semibold text-on-surface">{actionLabel(entry)}</p>
        {isNew ? <span className="rounded-pill bg-primary px-2 py-0.5 text-[11px] font-semibold text-on-primary">New</span> : null}
        {entry.audience === "STAFF_ONLY" ? <PermissionPill tone="staff">Staff only</PermissionPill> : null}
        {entry.audience === "OWNER_ONLY" ? <PermissionPill tone="read-only">Only you</PermissionPill> : null}
      </div>
      <p className="mt-0.5 text-xs text-on-surface-variant">
        {entry.actor.name ?? "System"}
        {entry.actor.role ? ` · ${ROLE_LABELS[entry.actor.role] ?? entry.actor.role}` : ""}
        {" · "}
        <time dateTime={entry.occurredAt}>{formatTimestamp(entry.occurredAt)}</time>
      </p>
      {statusChange ? (
        <p className="mt-1 text-xs text-on-surface-variant">Request status: {historyStatus(statusChange, "before", organiserView)} → {historyStatus(statusChange, "after", organiserView)}</p>
      ) : entry.action === "EVENT_SUBMITTED" ? (
        <p className="mt-1 text-xs text-on-surface-variant">Request status: Submitted</p>
      ) : null}
      {entry.action === "EVENT_REJECTED" && entry.summary ? (
        <div className="mt-2 rounded-control bg-error-container p-3 text-sm text-on-error-container">
          <p className="font-semibold">Rejection reason</p>
          <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.summary}</p>
        </div>
      ) : null}
      {entry.changes.length ? (
        <dl className="mt-2 grid gap-2 rounded-control bg-surface-container-low p-3">
          {entry.changes.map((change) => (
            <div key={change.field} className="text-xs">
              <dt className="font-semibold uppercase tracking-[0.05em] text-on-surface-variant">{fieldLabel(change.field)}</dt>
              <ChangeValue change={change} organiserView={organiserView} />
            </div>
          ))}
        </dl>
      ) : null}
    </li>
  );
}

export function EventHistoryPanel({ event, refreshKey }: { event: EventView; refreshKey: number }) {
  const { state, baseline, retry, loadMore, loadingMore, moreError } = useEventHistory(event.eventId, refreshKey);
  const headingId = `event-${event.eventId}-history`;
  const newCount = state.status === "ready" ? state.entries.filter((entry) => isNewHistoryEntry(entry, baseline)).length : 0;

  return (
    <section aria-labelledby={headingId} className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
      <SectionHeading
        id={headingId}
        title="Change history"
        description={newCount ? `${describeHistory(event)} ${newCount} new since your last visit.` : describeHistory(event)}
      />
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
              {state.entries.map((entry) => <HistoryItem key={entry.historyId} entry={entry} isNew={isNewHistoryEntry(entry, baseline)} organiserView={["OWNER", "ORGANISATION_MEMBER"].includes(event.viewerRelationship)} />)}
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
