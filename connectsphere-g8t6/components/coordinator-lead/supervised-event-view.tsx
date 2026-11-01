"use client";

import Link from "next/link";
import { PageHeader, ReferenceIdTag, SectionCard, StatusChip } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { PermissionPill } from "@/components/shared/permission-pill";
import { SectionHeading } from "@/components/shared/section-heading";
import { equipmentItems, RequirementList, scheduleRows, layoutRows } from "@/components/events/workspace/event-detail-rows";
import { EventVenueSection } from "@/components/venues/event-venue-options/event-venue-section";
import { eventDisplayStatus } from "@/lib/events";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import type { EventView } from "@/lib/api/event-workspace";

// The supervising Lead's read-only view of an event they assigned (Master 4.2,
// SPM-72/74): the request, its coordinator and the venue section to browse and
// compare venues. Only the assigned coordinator selects a venue.
export function SupervisedEventView({ event }: { event: EventView }) {
  return (
    <div className="grid gap-5">
      <Link href="/assignments" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <Icon name="arrow-back" size={16} />Assignments
      </Link>

      <PageHeader
        eyebrow="Supervised event"
        title={event.title || "Untitled request"}
        description={`Requested by ${event.organiser?.name ?? "the organiser"}${event.organisation ? ` · ${event.organisation.name}` : ""}`}
        action={<StatusChip status={eventDisplayStatus(event)} />}
      />

      <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ReferenceIdTag value={event.requestId} />
        <span className="text-sm text-on-surface-variant">{formatEventWindow(event.startDatetime, event.endDatetime)}</span>
        <PermissionPill tone="read-only">Supervising Lead • Read-only</PermissionPill>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-12">
        <div className="grid gap-5 xl:col-span-8">
          <SectionCard className="grid gap-4">
            <SectionHeading step={1} title="Schedule & attendance" />
            <KeyValuePanel rows={scheduleRows(event)} />
          </SectionCard>
          <SectionCard className="grid gap-4">
            <SectionHeading step={2} title="Venue & layout" description="The organiser's venue choices and the coordinator's venues for the organiser. Find another venue to search and compare." />
            <KeyValuePanel rows={layoutRows(event)} />
            <EventVenueSection key={(event.venueSuggestions ?? []).map((item) => item.venueId).join(",")} event={event} />
          </SectionCard>
          <div className="grid gap-5 md:grid-cols-2">
            <SectionCard className="grid gap-4">
              <SectionHeading step={3} title="Accessibility" />
              <RequirementList items={event.accessibilityNeeds} empty="No accessibility needs were requested." />
            </SectionCard>
            <SectionCard className="grid gap-4">
              <SectionHeading step={4} title="Technical & equipment" />
              <RequirementList items={equipmentItems(event)} empty="No equipment was requested." />
            </SectionCard>
          </div>
        </div>

        <aside className="grid gap-5 xl:col-span-4" aria-label="Coordination">
          <section aria-labelledby="supervision-heading" className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
            <SectionHeading id="supervision-heading" title="Coordination" />
            <KeyValuePanel
              className="mt-4"
              rows={[
                { icon: "person", label: "Coordinator", value: event.coordinatorName ?? "Unassigned" },
                { icon: "person", label: "Organiser", value: event.organiser?.name ?? "Not available" },
                { icon: "organisation", label: "Organisation", value: event.organisation?.name ?? "Not provided" },
                { icon: "history", label: "Last updated", value: formatTimestamp(event.updatedAt) },
              ]}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
