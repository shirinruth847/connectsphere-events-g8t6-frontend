"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertBanner, buttonClasses, PageHeader, ReferenceIdTag, StatusChip } from "@/components/shared/primitives";
import { CapacityBar } from "@/components/shared/capacity-bar";
import { Icon } from "@/components/shared/icon";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { PermissionPill } from "@/components/shared/permission-pill";
import { SectionHeading } from "@/components/shared/section-heading";
import { EventHistoryPanel } from "@/components/events/workspace/event-history-panel";
import { EventArrangements } from "@/components/organiser/event-arrangements";
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
// same organisation, who sees submitted requests read-only.
export function EventRequestDetails({ event }: { event: EventView }) {
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

      <AccessNotice event={event} />

      <div className="grid items-start gap-5 xl:grid-cols-12">
        <div className="grid gap-5 xl:col-span-8">
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
          {!isDraftEvent(event) ? <EventArrangements key={event.eventId} eventId={event.eventId} /> : null}
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
          <EventHistoryPanel event={event} refreshKey={0} />
        </aside>
      </div>
    </div>
  );
}
