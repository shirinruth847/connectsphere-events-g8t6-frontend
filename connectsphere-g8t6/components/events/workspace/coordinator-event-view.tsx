"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AlertBanner, PageHeader, ReferenceIdTag, SectionCard, StatusChip } from "@/components/shared/primitives";
import { CapacityBar } from "@/components/shared/capacity-bar";
import { Icon } from "@/components/shared/icon";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { PermissionPill } from "@/components/shared/permission-pill";
import { SectionHeading } from "@/components/shared/section-heading";
import { eventDisplayStatus, statusPresentation } from "@/lib/events";
import { getEventView, type EventView } from "@/lib/api/event-workspace";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import { editableIdentityFields } from "@/lib/permissions/event-workspace";
import { ClarificationPanel } from "./clarification-panel";
import { useEventClarifications } from "./use-event-clarifications";
import {
  equipmentItems,
  registrationRows,
  RequirementList,
  scheduleRows,
  layoutRows,
} from "./event-detail-rows";
import { EventHistoryPanel } from "./event-history-panel";
import { EventIdentityEditor } from "./event-identity-editor";
import { LifecyclePanel } from "@/components/coordinator/lifecycle-panel";
import { EventVenueSection } from "@/components/venues/event-venue-options/event-venue-section";
import { SafetyReviewSection } from "./safety-review-section";
import { TechnicalRequestSection } from "@/components/coordinator/technical-request-section";

interface CoordinatorEventViewProps {
  event: EventView;
  onEventChange: (event: EventView) => void;
  onAccessChanged: () => void;
}

function ReviewSection({ step, title, description, action, children }: {
  step: number;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SectionCard className="grid gap-4">
      <SectionHeading step={step} title={title} description={description} action={action} />
      {children}
    </SectionCard>
  );
}

const significantPill = <PermissionPill tone="read-only">Change request only</PermissionPill>;

// The assigned coordinator's review of one event (Figma 50:2842, trimmed to SPM-33
// and SPM-41: the SLA clock, conflict matrix, overrides, sign-off matrix, other
// action-bar actions and internal staff notes belong to other tickets or are
// outside the baseline).
export function CoordinatorEventView({ event, onEventChange, onAccessChanged }: CoordinatorEventViewProps) {
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [statusNotice, setStatusNotice] = useState("");
  const [historyKey, setHistoryKey] = useState(0);
  const [clarificationKey, setClarificationKey] = useState(0);
  const clarifications = useEventClarifications(event.eventId, clarificationKey);
  const editable = editableIdentityFields(event.permissions);
  const status = eventDisplayStatus(event);
  const statusLabel = statusPresentation(status).label;
  const attendance = event.expectedAttendance ?? 0;
  const capacity = event.isRegistrationEnabled ? event.registrationCapacity ?? 0 : 0;
  const clarificationPanel = (
    <ClarificationPanel
      event={event}
      state={clarifications.state}
      onRetry={clarifications.retry}
      onThreadOpened={clarifications.refreshThread}
      onThreadRead={clarifications.markRead}
      onRoundUpdated={clarifications.replaceRound}
      onCompleted={(updated, message) => {
        onEventChange(updated);
        setHistoryKey((value) => value + 1);
        setClarificationKey((value) => value + 1);
        setStatusNotice("");
        setNotice({ title: "Clarification complete", message: `${message} The organiser has been notified.` });
      }}
      onEventReplaced={(latest) => {
        setNotice(null);
        onEventChange(latest);
        setHistoryKey((value) => value + 1);
      }}
      onAccessChanged={onAccessChanged}
      onRequested={(updated) => {
        onEventChange(updated);
        setHistoryKey((value) => value + 1);
        setClarificationKey((value) => value + 1);
        setNotice({ title: "Clarification requested", message: "The organiser has been notified and can reply and amend the request. It stays assigned to you until you mark the clarification complete." });
      }}
    />
  );

  return (
    <div className="grid gap-5">
      <Link href="/dashboard" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <Icon name="arrow-back" size={16} />My assigned events
      </Link>

      <PageHeader
        eyebrow="Event coordinator review"
        title={event.title || "Untitled request"}
        description={`Requested by ${event.organiser?.name ?? "the organiser"}${event.organisation ? ` · ${event.organisation.name}` : ""}`}
        action={<StatusChip status={status} />}
      />

      <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ReferenceIdTag value={event.requestId} />
        <span className="text-sm text-on-surface-variant">{formatEventWindow(event.startDatetime, event.endDatetime)}</span>
        {editable.length ? (
          <PermissionPill tone="edit">Assigned coordinator • Title, purpose &amp; description editable</PermissionPill>
        ) : (
          <PermissionPill tone="read-only">Read-only while {statusLabel.toLowerCase()}</PermissionPill>
        )}
      </div>

      <div aria-live="polite" role="status">
        {notice ? (
          <AlertBanner tone="success" title={notice.title} live={false}>{notice.message}</AlertBanner>
        ) : null}
        {statusNotice ? (
          <AlertBanner tone="success" title="Status updated" live={false}>{statusNotice}</AlertBanner>
        ) : null}
      </div>

      {!editable.length ? (
        <AlertBanner tone="info" title="Direct edits are closed for this status">
          You can edit the title, purpose and description while the event is under review, in planning, in safety review, confirmed or in preparation.
        </AlertBanner>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-12">
        {/* min-w-0: wide venue content scrolls inside its own box instead of
            widening a column. */}
        <div className="grid min-w-0 gap-5 xl:col-span-8">
          <ReviewSection
            step={1}
            title="Event identity & purpose"
            description="The organiser's request, including any edits you have made."
            action={editable.length ? <PermissionPill tone="edit">Editable</PermissionPill> : <PermissionPill tone="read-only">Read-only</PermissionPill>}
          >
            <EventIdentityEditor
              event={event}
              onSaved={(saved, message) => {
                onEventChange(saved);
                setHistoryKey((value) => value + 1);
                setNotice({ title: "Changes saved", message: `${message} The organiser is notified which fields changed.` });
              }}
              onEventReplaced={(latest) => {
                setNotice(null);
                onEventChange(latest);
                setHistoryKey((value) => value + 1);
              }}
              onAccessChanged={onAccessChanged}
            />
          </ReviewSection>

          <ReviewSection step={2} title="Schedule & attendance" description="Date, duration and attendance changes are significant and go through a change request." action={significantPill}>
            <KeyValuePanel rows={scheduleRows(event)} />
            {capacity > 0 && attendance > 0 ? (
              <CapacityBar label="Expected attendance vs registration capacity" value={attendance} total={capacity} unit="people" />
            ) : null}
          </ReviewSection>

          <ReviewSection step={3} title="Venue & layout" description="The event's venue bookings and the organiser's venue choices. Find another venue to search, compare and suggest one." action={significantPill}>
            <KeyValuePanel rows={layoutRows(event)} />
            <EventVenueSection
              key={event.venueSuggestion?.version ?? 0}
              event={event}
              onSuggested={() => setHistoryKey((value) => value + 1)}
              onStale={onAccessChanged}
              onBookingsRequested={() => {
                // New bookings change the arrangement version, history and
                // readiness. The bookings are saved either way, so a failed
                // re-fetch keeps the page as it is instead of showing an error.
                setHistoryKey((value) => value + 1);
                getEventView(event.eventId).then(({ event: latest }) => onEventChange(latest)).catch(() => {});
              }}
            />
          </ReviewSection>

          <ReviewSection step={4} title="Accessibility" action={significantPill}>
            <RequirementList items={event.accessibilityNeeds} empty="No accessibility needs were requested." />
          </ReviewSection>

          {/* Full width, like the venue section: the technical request (SPM-286) sits under the requirements. */}
          <ReviewSection step={5} title="Technical & equipment" description="The organiser's equipment and support needs. In planning, send them to Technical Support as one technical request." action={significantPill}>
            <div className="grid gap-4 md:grid-cols-2">
              <div><h3 className="mb-2 text-sm font-semibold text-on-surface">Equipment requirements</h3><RequirementList items={equipmentItems(event)} empty="No equipment was requested." /></div>
              <div><h3 className="mb-2 text-sm font-semibold text-on-surface">Technical support needs</h3><p className="whitespace-pre-wrap text-sm text-on-surface [overflow-wrap:anywhere]">{event.technicalSupportNeeds || "No technical support needs were provided."}</p></div>
            </div>
            <TechnicalRequestSection
              event={event}
              onSent={() => {
                // Sending changes the arrangement version and history; the request is
                // saved either way, so a failed re-fetch keeps the page as it is.
                setHistoryKey((value) => value + 1);
                getEventView(event.eventId).then(({ event: latest }) => onEventChange(latest)).catch(() => {});
              }}
              onStale={onAccessChanged}
            />
          </ReviewSection>

          <ReviewSection step={6} title="Registration" action={<PermissionPill tone="read-only">Read-only</PermissionPill>}>
            <KeyValuePanel rows={registrationRows(event)} />
          </ReviewSection>
        </div>

        <aside className="grid min-w-0 gap-5 xl:col-span-4" aria-label="Coordination and history">
          <LifecyclePanel
            event={event}
            onEventChange={(updated, message) => {
              onEventChange(updated);
              setHistoryKey((value) => value + 1);
              setNotice(null);
              setStatusNotice(message ?? "");
            }}
            onAccessChanged={onAccessChanged}
            refreshKey={historyKey}
          />
          {clarificationPanel}
          <SafetyReviewSection eventId={event.eventId} refreshKey={historyKey} />
          <section aria-labelledby="coordination-heading" className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
            <SectionHeading id="coordination-heading" title="Coordination" />
            <KeyValuePanel
              className="mt-4"
              rows={[
                { icon: "person", label: "Coordinator", value: "You" },
                { icon: "person", label: "Organiser", value: event.organiser?.name ?? "Not available" },
                ...(event.organiser?.email ? [{ label: "Organiser email", value: <a className="text-primary underline underline-offset-2 [overflow-wrap:anywhere]" href={`mailto:${event.organiser.email}`}>{event.organiser.email}</a> }] : []),
                { icon: "organisation", label: "Organisation", value: event.organisation?.name ?? "Not provided" },
                { icon: "history", label: "Last updated", value: formatTimestamp(event.updatedAt) },
              ]}
            />
          </section>
          <EventHistoryPanel event={event} refreshKey={historyKey} />
        </aside>
      </div>
    </div>
  );
}
