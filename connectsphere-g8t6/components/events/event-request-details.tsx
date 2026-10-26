"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AlertBanner, buttonClasses, PageHeader, ReferenceIdTag, StatusChip } from "@/components/shared/primitives";
import { CapacityBar } from "@/components/shared/capacity-bar";
import { Icon } from "@/components/shared/icon";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { PermissionPill } from "@/components/shared/permission-pill";
import { SectionHeading } from "@/components/shared/section-heading";
import { EventHistoryPanel } from "@/components/events/workspace/event-history-panel";
import { EventArrangements } from "@/components/organiser/event-arrangements";
import { ClarificationPanel } from "@/components/events/workspace/clarification-panel";
import { ClarificationAmendmentForm } from "@/components/events/workspace/clarification-amendment-form";
import { useEventClarifications } from "@/components/events/workspace/use-event-clarifications";
import {
  equipmentItems,
  registrationRows,
  RequirementList,
  scheduleRows,
  venueRows,
} from "@/components/events/workspace/event-detail-rows";
import type { EventView } from "@/lib/api/event-workspace";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import { eventDisplayStatus, eventStatusLabel, isDraftEvent } from "@/lib/events";
import { canPostClarificationMessage, canSaveAmendments } from "@/lib/permissions/event-workspace";

function Card({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  return (
    <section aria-labelledby={labelledBy} className="grid gap-4 rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
      {children}
    </section>
  );
}

function AccessNotice({ event }: { event: EventView }) {
  if (event.viewerRelationship === "ORGANISATION_MEMBER") {
    return (
      <AlertBanner tone="info" title="Viewing as a member of your organisation">
        You can see this request because it belongs to {event.organisation?.name ?? "your organisation"}. Only its owner can ask for changes.
      </AlertBanner>
    );
  }
  if (isDraftEvent(event)) {
    return (
      <AlertBanner tone="info" title="Only you can see this draft">
        Your organisation and coordinators see the request once you submit it.
        <div className="mt-3">
          <Link href={`/events/new?draft=${event.eventId}`} className={buttonClasses("primary")}>
            <Icon name="edit" size={16} />Continue editing draft
          </Link>
        </div>
      </AlertBanner>
    );
  }
  return (
    <AlertBanner tone="info" title="Submitted requests are not edited directly">
      To change any details, request a change; your coordinator reviews it. Your coordinator may also correct the title, purpose and description, and every change appears in the history.
    </AlertBanner>
  );
}

// The organiser's event view: the owner (draft or submitted) or a member of the
// same organisation, who sees submitted requests read-only. While the request is
// returned for clarification, the owner replies in the thread and amends the
// request here; the coordinator marks the clarification complete (SPM-41).
export function EventRequestDetails({ event, onEventChange, onAccessChanged }: {
  event: EventView;
  onEventChange?: (event: EventView) => void;
  onAccessChanged?: () => void;
}) {
  const [historyKey, setHistoryKey] = useState(0);
  const [clarificationKey, setClarificationKey] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  const clarifications = useEventClarifications(event.eventId, clarificationKey);
  // The owner of a returned request, who replies from the clarification list and amends here.
  const responding = canPostClarificationMessage(event.permissions);
  const clarificationPanel = (
    <ClarificationPanel
      event={event}
      state={clarifications.state}
      onRetry={clarifications.retry}
      onThreadOpened={clarifications.refreshThread}
      onThreadRead={clarifications.markRead}
      onRoundUpdated={clarifications.replaceRound}
      onCompleted={(updated) => {
        onEventChange?.(updated);
        setHistoryKey((value) => value + 1);
        setClarificationKey((value) => value + 1);
      }}
      onEventReplaced={(latest) => onEventChange?.(latest)}
      onAccessChanged={() => onAccessChanged?.()}
    />
  );
  const isMember = event.viewerRelationship === "ORGANISATION_MEMBER";
  const label = eventStatusLabel(event);
  const attendance = event.expectedAttendance ?? 0;
  const capacity = event.isRegistrationEnabled ? event.registrationCapacity ?? 0 : 0;

  return (
    <div className="grid gap-5">
      <Link href="/dashboard" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <Icon name="arrow-back" size={16} />Back to My Events
      </Link>

      <PageHeader
        eyebrow={isMember ? "Organisation event" : "My event request"}
        title={event.title || "Untitled draft"}
        description={event.purpose || event.description || "Review the details and current status of this event request."}
        action={<StatusChip status={eventDisplayStatus(event)} label={label} />}
      />

      <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ReferenceIdTag value={event.requestId} />
        <span className="text-sm text-on-surface-variant">{formatEventWindow(event.startDatetime, event.endDatetime)}</span>
        {event.statusNote ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
            <Icon name="schedule" size={16} />{event.statusNote}
          </span>
        ) : null}
        {isMember ? (
          <PermissionPill tone="read-only">Organisation-wide • Read-only</PermissionPill>
        ) : isDraftEvent(event) ? (
          <PermissionPill tone="edit">Owner • Editable while draft</PermissionPill>
        ) : (
          <PermissionPill tone="read-only">Owner • Changes by request</PermissionPill>
        )}
      </div>

      <div aria-live="polite" role="status">
        {saved ? (
          <AlertBanner tone="success" title="Amendments saved" live={false}>
            {saved} The request stays returned until your coordinator marks the clarification complete.
          </AlertBanner>
        ) : null}
      </div>

      {responding ? null : <AccessNotice event={event} />}

      <div className="grid items-start gap-5 xl:grid-cols-12">
        <div className="grid gap-5 xl:col-span-8">
          {responding ? (
            <AlertBanner tone="warning" title="Your coordinator needs more information">
              Open the request under Clarification requests to reply, and amend the request below if needed. Your coordinator marks the clarification complete when they have what they need.
            </AlertBanner>
          ) : null}
          {canSaveAmendments(event.permissions) ? (
            <ClarificationAmendmentForm
              event={event}
              onSaved={(updated, message) => {
                setSaved(message);
                onEventChange?.(updated);
                setHistoryKey((value) => value + 1);
              }}
              onEventReplaced={(latest) => onEventChange?.(latest)}
              onAccessChanged={() => onAccessChanged?.()}
            />
          ) : null}

          <Card labelledBy="about-heading">
            <SectionHeading id="about-heading" title="About this event" />
            <dl className="grid gap-3">
              {([["Purpose", event.purpose], ["Description", event.description]] as const).map(([term, value]) => (
                <div key={term} className="rounded-control bg-surface-container-low p-3 sm:p-4">
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">{term}</dt>
                  <dd className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-on-surface [overflow-wrap:anywhere]">
                    {value || <span className="text-on-surface-variant">Not provided</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card labelledBy="planning-heading">
            <SectionHeading id="planning-heading" title="Event planning" />
            <KeyValuePanel rows={[...scheduleRows(event), ...venueRows(event)]} />
            {capacity > 0 && attendance > 0 ? (
              <CapacityBar label="Expected attendance vs registration capacity" value={attendance} total={capacity} unit="people" />
            ) : null}
          </Card>

          <Card labelledBy="requirements-heading">
            <SectionHeading id="requirements-heading" title="Requirements" />
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-on-surface"><Icon name="accessibility" size={16} className="text-primary" />Accessibility needs</h3>
                <RequirementList items={event.accessibilityNeeds} empty="None provided" />
              </div>
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-on-surface"><Icon name="equipment" size={16} className="text-primary" />Requested equipment</h3>
                <RequirementList items={equipmentItems(event)} empty="None selected" />
              </div>
            </div>
          </Card>
          {!isDraftEvent(event) ? <EventArrangements key={`${event.eventId}:${event.version}`} eventId={event.eventId} /> : null}
        </div>

        <aside className="grid gap-5 xl:col-span-4" aria-label="Coordination and history">
          <Card labelledBy="coordination-heading">
            <SectionHeading id="coordination-heading" title="Coordination" />
            <KeyValuePanel
              rows={[
                { icon: "organisation", label: "Organisation", value: event.organisation?.name ?? "Not provided" },
                { icon: "person", label: "Coordinator", value: event.isAssignedToCoordinator ? event.coordinatorName || "Assigned" : "Unassigned" },
                ...(event.submittedAt ? [{ icon: "history" as const, label: "Submitted", value: formatTimestamp(event.submittedAt) }] : []),
                ...registrationRows(event),
                { icon: "history", label: "Last updated", value: formatTimestamp(event.updatedAt) },
              ]}
            />
          </Card>
          {event.status !== "DRAFT" ? clarificationPanel : null}
          <EventHistoryPanel event={event} refreshKey={historyKey} />
        </aside>
      </div>
    </div>
  );
}
