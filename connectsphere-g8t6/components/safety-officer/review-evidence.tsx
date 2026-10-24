"use client";

import { AlertBanner, Button, EmptyState } from "@/components/shared/primitives";
import { CapacityBar } from "@/components/shared/capacity-bar";
import { Icon } from "@/components/shared/icon";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { layoutLabel, RequirementList } from "@/components/events/workspace/event-detail-rows";
import type { PanelBooking, SafetyPanel, VenueSafetyDetail } from "@/lib/api/safety-reviews";
import { formatDuration, formatEventWindow } from "@/lib/datetime";

const people = (count: number | null | undefined) => (count || count === 0 ? `${count.toLocaleString()} people` : "Not provided");

// The largest capacity among the active bookings: the most the event can hold at once.
export const largestBookedCapacity = (bookings: PanelBooking[]) =>
  bookings.reduce((largest, booking) => Math.max(largest, booking.venue?.capacity ?? 0), 0);

const BOOKING_STATUS_TONES: Record<string, string> = {
  APPROVED: "bg-success-container text-success",
  PENDING: "bg-primary-fixed text-primary",
};

function BookingStatus({ status }: { status: string }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-chip px-2 py-1 text-[11px] font-semibold uppercase tracking-label ${BOOKING_STATUS_TONES[status] ?? "bg-surface-container-high text-on-surface-variant"}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function SubHeading({ children }: { children: string }) {
  return <h3 className="text-sm font-semibold text-on-surface">{children}</h3>;
}

// Step 1: attendance, registrations and timing. Counts only (SPM-243 AC2).
export function AttendanceEvidence({ panel }: { panel: SafetyPanel }) {
  const { event, bookings } = panel;
  const capacity = largestBookedCapacity(bookings);
  const duration = formatDuration(event.startDatetime, event.endDatetime);
  return (
    <div className="grid gap-4">
      <KeyValuePanel
        rows={[
          { icon: "calendar", label: "Event window", value: formatEventWindow(event.startDatetime, event.endDatetime) },
          ...(duration ? [{ icon: "schedule" as const, label: "Duration", value: duration }] : []),
          { icon: "attendees", label: "Expected attendance", value: people(event.expectedAttendance) },
          { icon: "registration", label: "Registered", value: people(event.registeredCount) },
          { icon: "venue", label: "Largest booked venue", value: capacity ? people(capacity) : "No capacity recorded" },
          { icon: "layout", label: "Preferred layout", value: layoutLabel(event.preferredLayoutType) },
        ]}
      />
      {capacity && event.expectedAttendance ? (
        <CapacityBar label="Expected attendance against the largest booked venue" value={event.expectedAttendance} total={capacity} unit="people" />
      ) : null}
      <p className="flex items-start gap-2 text-xs text-on-surface-variant">
        <Icon name="lock" size={16} />Safety Officers see attendance counts only; participant details are not shown.
      </p>
    </div>
  );
}

function VenueSafety({ detail, available }: { detail: VenueSafetyDetail | undefined; available: boolean }) {
  if (!available) return <p className="text-xs font-semibold text-on-surface-variant">Venue safety details unavailable. Retry above.</p>;
  if (!detail?.found) {
    return (
      <p className="flex items-start gap-2 rounded-control bg-tertiary-fixed p-2 text-xs font-semibold text-on-tertiary-fixed">
        <Icon name="info" size={16} />No venue safety record exists for this venue.
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">Emergency access</p>
        <p className="text-sm text-on-surface [overflow-wrap:anywhere]">{detail.emergencyAccess || "Not recorded"}</p>
      </div>
      <div className="grid gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">Known restrictions</p>
        {detail.knownRestrictions.length ? (
          <ul className="grid list-disc gap-0.5 pl-4 text-sm text-on-surface">
            {detail.knownRestrictions.map((restriction, index) => <li key={index} className="[overflow-wrap:anywhere]">{restriction}</li>)}
          </ul>
        ) : (
          <p className="text-sm text-on-surface">None recorded</p>
        )}
      </div>
    </div>
  );
}

export const bookingTitle = (booking: PanelBooking) =>
  `${booking.venue?.name ?? "Unknown venue"}${booking.label ? ` · ${booking.label}` : ""}`;

// Step 2: each active booking with its venue's safety record from venue_details.
export function VenueEvidence({ panel, onRetry }: { panel: SafetyPanel; onRetry: () => void }) {
  const details = new Map(panel.venueDetails.map((detail) => [detail.venueId, detail]));
  return (
    <div className="grid gap-4">
      {!panel.venueDetailsAvailable ? (
        <AlertBanner tone="warning" title="Venue safety details unavailable">
          Emergency access and known restrictions could not be loaded, so this review cannot be decided until they can.
          <div className="mt-3"><Button variant="secondary" onClick={onRetry}><Icon name="refresh" size={16} />Retry</Button></div>
        </AlertBanner>
      ) : null}
      {panel.bookings.length === 0 ? (
        <EmptyState title="No active venue booking" description="The event has no approved or pending venue booking to review." />
      ) : (
        <ul className="grid gap-4">
          {panel.bookings.map((booking) => (
            <li key={booking.bookingId} className="grid gap-3 rounded-control bg-surface-container-low p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <SubHeading>{bookingTitle(booking)}</SubHeading>
                  <p className="text-xs text-on-surface-variant">{booking.venue?.address ?? "Address not recorded"}</p>
                </div>
                <BookingStatus status={booking.status} />
              </div>
              <KeyValuePanel
                className="bg-surface-container-lowest"
                rows={[
                  { icon: "calendar", label: "Booking window", value: formatEventWindow(booking.startDatetime, booking.endDatetime) },
                  { icon: "layout", label: "Layout", value: layoutLabel(booking.layoutType) },
                  { icon: "attendees", label: "Capacity", value: booking.venue?.capacity ? people(booking.venue.capacity) : "Not recorded" },
                  ...(booking.expectedAttendance ? [{ icon: "attendees" as const, label: "Booked for", value: people(booking.expectedAttendance) }] : []),
                ]}
              />
              <VenueSafety detail={booking.venue ? details.get(booking.venue.venueId) : undefined} available={panel.venueDetailsAvailable} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Step 3: accessibility needs and where requested equipment will be placed.
export function AccessEvidence({ panel }: { panel: SafetyPanel }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <SubHeading>Accessibility needs</SubHeading>
        <RequirementList items={panel.event.accessibilityNeeds} empty="No accessibility needs were requested." />
      </div>
      <div className="grid gap-2">
        <SubHeading>Equipment and placement</SubHeading>
        {panel.equipment.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No equipment was requested.</p>
        ) : (
          <ul className="grid gap-3">
            {panel.equipment.map((item) => (
              <li key={item.requestId} className="grid gap-2 rounded-control bg-surface-container-low p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-on-surface">
                    {item.name ?? "Equipment"} <span className="font-mono text-xs text-on-surface-variant">× {item.quantity}</span>
                  </p>
                  <BookingStatus status={item.status} />
                </div>
                <p className="text-xs text-on-surface-variant">
                  {item.category ? `${item.category} · ` : ""}{formatEventWindow(item.startDatetime, item.endDatetime)}
                </p>
                <p className="text-sm text-on-surface [overflow-wrap:anywhere]">
                  <span className="font-semibold">Placement: </span>{item.placement || "No placement notes"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
