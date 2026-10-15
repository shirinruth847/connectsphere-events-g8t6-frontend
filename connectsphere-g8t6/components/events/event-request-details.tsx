"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AlertBanner, PageHeader, ReferenceIdTag, Skeleton, StatusChip } from "@/components/shared/primitives";
import { apiRequest } from "@/lib/api";
import { displayEventStatus, EventRequest, formatDateRange } from "@/lib/events";

type InfoIconName = "calendar" | "venue" | "approval" | "organisation" | "coordinator" | "attendees" | "registration" | "info";

function InfoIcon({ name }: { name: InfoIconName }) {
  const paths: Record<InfoIconName, ReactNode> = {
    calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M16 3v4M8 3v4M4 10h16" /></>,
    venue: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
    approval: <><path d="m8 12 2.5 2.5L16 9" /><circle cx="12" cy="12" r="9" /></>,
    organisation: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4" /></>,
    coordinator: <><circle cx="12" cy="8" r="3" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    attendees: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2" /></>,
    registration: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h4" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  };
  return <svg aria-hidden="true" className="h-[17px] w-[17px] shrink-0 text-[#4F46E5]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function InfoRow({ icon, label, value }: { icon: InfoIconName; label: string; value: ReactNode }) {
  return <div className="flex min-h-7 items-start justify-between gap-4 text-[13px] leading-snug">
    <span className="flex min-w-0 items-center gap-2 text-[#4B5563]"><InfoIcon name={icon} /><span>{label}</span></span>
    <span className="max-w-[58%] text-right font-semibold text-[#374151]">{value}</span>
  </div>;
}

export function EventRequestDetails() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<EventRequest | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await apiRequest<{ event: EventRequest }>(`/events/${encodeURIComponent(id)}`);
        if (alive) setEvent(response.event);
      } catch (caught) {
        if (alive) setError(caught instanceof Error ? caught.message : "Could not load this event request.");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => { alive = false; };
  }, [id]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-52 w-full" /></div>;
  if (error || !event) return <div className="space-y-5"><Link href="/dashboard" className="text-sm font-semibold text-primary hover:underline">← Back to My Events</Link><AlertBanner tone="error" title="Event request unavailable">{error || "This event request could not be found."}</AlertBanner></div>;

  const accessibility = Array.isArray(event.accessibilityNeeds)
    ? event.accessibilityNeeds
    : typeof event.accessibilityNeeds === "string" && event.accessibilityNeeds.trim()
      ? [event.accessibilityNeeds]
      : [];
  const displayStatus = displayEventStatus(event.status, event.isAssignedToCoordinator);
  const attendance = event.expectedAttendance ?? 0;
  const capacity = event.isRegistrationEnabled ? event.registrationCapacity ?? 0 : 0;
  const capacityPercent = capacity > 0 && attendance > 0 ? Math.round((attendance / capacity) * 100) : 0;
  const venueSummary = event.venuePreferences?.length
    ? event.venuePreferences.map((venueId) => `Preference #${venueId}`).join(", ")
    : "No preference";

  return <div className="space-y-5">
    <Link href="/dashboard" className="inline-flex text-sm font-semibold text-primary hover:underline">← Back to My Events</Link>
    <PageHeader eyebrow="Event request" title={event.title || "Untitled draft"} description={event.description || "Review the details and current status of this event request."} action={<StatusChip status={displayStatus} />} />
    <div className="flex flex-wrap items-center gap-3"><ReferenceIdTag value={event.requestId} /><span className="text-sm text-on-surface-variant">{formatDateRange(event.startDatetime, event.endDatetime)}</span></div>
    <div className="grid items-stretch gap-4 lg:grid-cols-2">
      <section className="rounded-[14px] bg-[#F0EFFF] p-5 sm:p-6" aria-labelledby="event-planning-heading">
        <h2 id="event-planning-heading" className="mb-5 text-sm font-bold text-[#3730A3]">Event planning</h2>
        <div className="space-y-4">
          <InfoRow icon="calendar" label="Date" value={formatDateRange(event.startDatetime, event.endDatetime)} />
          <InfoRow icon="venue" label="Venue" value={venueSummary} />
          <InfoRow icon="approval" label="Approval stage" value={<StatusChip status={displayStatus} />} />
        </div>
        <div className="mt-6 flex gap-2.5 rounded-lg bg-[#E1EAFE] p-3.5 text-xs leading-relaxed text-[#4B5563]">
          <InfoIcon name="info" />
          <p>{event.status === "DRAFT" ? "You can continue editing this draft until you submit it." : "This request is assigned to your event team. Its current stage is shown above."}</p>
        </div>
      </section>

      <section className="rounded-[14px] bg-[#F0EFFF] p-5 sm:p-6" aria-labelledby="event-coordination-heading">
        <h2 id="event-coordination-heading" className="mb-5 text-sm font-bold text-[#3730A3]">Event coordination</h2>
        <div className="space-y-4">
          <InfoRow icon="calendar" label="Date" value={formatDateRange(event.startDatetime, event.endDatetime)} />
          <InfoRow icon="organisation" label="Organisation" value={event.organisation?.name || "Not provided"} />
          <InfoRow icon="coordinator" label="Coordinator" value={event.isAssignedToCoordinator ? "Assigned" : "Not assigned"} />
          <InfoRow icon="attendees" label="Expected attendance" value={attendance ? `${attendance.toLocaleString()} people` : "Not provided"} />
          <InfoRow icon="registration" label="Registration" value={event.isRegistrationEnabled ? `Enabled${capacity ? ` · capacity ${capacity.toLocaleString()}` : ""}` : "Disabled"} />
        </div>
        {capacity > 0 && attendance > 0 ? <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-[#4B5563]">
            <span>Attendance estimate / capacity</span>
            <span>{attendance.toLocaleString()} / {capacity.toLocaleString()} ({capacityPercent}%)</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#D7D9E8]" role="progressbar" aria-label="Estimated attendance compared with registration capacity" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(capacityPercent, 100)}>
            <div className="h-full rounded-full bg-[#047857]" style={{ width: `${Math.min(capacityPercent, 100)}%` }} />
          </div>
        </div> : null}
      </section>
    </div>

    <section className="grid gap-4 rounded-[14px] bg-white p-5 shadow-elevation-1 sm:grid-cols-2 sm:p-6" aria-label="Additional event requirements">
      <div><h2 className="text-sm font-bold text-[#3730A3]">Accessibility needs</h2>{accessibility.length ? <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-[#4B5563]">{accessibility.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-[#6B7280]">None provided</p>}</div>
      <div><h2 className="text-sm font-bold text-[#3730A3]">Equipment</h2>{event.equipmentRequirements?.length ? <ul className="mt-3 space-y-1.5 text-sm text-[#4B5563]">{event.equipmentRequirements.map((item) => <li key={item.equipmentId}>Equipment #{item.equipmentId} · {item.quantity}</li>)}</ul> : <p className="mt-2 text-sm text-[#6B7280]">None selected</p>}</div>
    </section>
  </div>;
}
