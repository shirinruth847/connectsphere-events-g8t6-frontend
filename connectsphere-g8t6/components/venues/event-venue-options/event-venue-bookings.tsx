"use client";

import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { BookingStatusChip, BOOKING_BORDERS } from "@/components/venue-staff/booking-requests/booking-status-chip";
import { formatEventWindow } from "@/lib/datetime";
import type { EventVenueBookingList } from "@/lib/api/event-venues";
import { BookingIncidentCard } from "@/components/venues/booking-incident";
import { VenueBadge } from "./venue-option-card";

export type BookingListState =
  | { status: "loading" }
  | { status: "ready"; data: EventVenueBookingList }
  | { status: "error"; message: string };

interface EventVenueBookingsProps {
  state: BookingListState;
  isCoordinator: boolean;
  // From the backend's canRequestVenueBookings, once the venue list has loaded.
  canRequest: boolean;
  onRequest: () => void;
  onRetry: () => void;
}

// The event's venue bookings in its venue section (SPM-179 AC1, AC12): each
// booking's venue, label, times, attendance, status (the backend's label) and
// the primary venue. The request button shows only when the backend allows a
// request now; the supervising Lead reads the list without it. A booking a
// venue block affects shows its incident card (SPM-195 AC7).
export function EventVenueBookings({ state, isCoordinator, canRequest, onRequest, onRetry }: EventVenueBookingsProps) {
  const allowed = state.status === "ready" && state.data.canRequestVenueBookings;

  return (
    <section aria-labelledby="event-venue-bookings-heading" className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="event-venue-bookings-heading" className="text-sm font-semibold text-on-surface">Venue bookings</h3>
        {canRequest ? (
          <Button type="button" onClick={onRequest} aria-haspopup="dialog">
            <Icon name="add" size={16} />Request venue bookings
          </Button>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <div className="grid gap-2" aria-busy="true" aria-label="Loading venue bookings">
          <Skeleton className="h-16 w-full" />
        </div>
      ) : state.status === "error" ? (
        <AlertBanner tone="error" title="Unable to load venue bookings">
          {state.message}
          <div className="mt-3">
            <Button type="button" variant="secondary" onClick={onRetry}><Icon name="refresh" size={16} />Retry</Button>
          </div>
        </AlertBanner>
      ) : (
        <>
          {state.data.bookings.length === 0 ? (
            <p className="rounded-control bg-surface-container-low p-4 text-sm text-on-surface-variant">No venue bookings have been requested yet.</p>
          ) : (
            <ul className="grid gap-3">
              {state.data.bookings.map((booking) => (
                <li
                  key={booking.bookingId}
                  className={`grid min-w-0 gap-2 rounded-panel border-t-4 bg-surface-container-low p-4 ${BOOKING_BORDERS[booking.status] ?? "border-t-outline-variant"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-on-surface [overflow-wrap:anywhere]">
                        {booking.venueName ?? `Venue ${booking.venueId}`}
                        {booking.label && booking.label !== booking.venueName ? ` · ${booking.label}` : ""}
                      </h4>
                      <p className="font-mono text-xs text-on-surface-variant">Booking #{booking.bookingId}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {booking.isPrimary ? <VenueBadge>Primary venue</VenueBadge> : null}
                      <BookingStatusChip status={booking.status} label={booking.statusLabel} />
                    </div>
                  </div>
                  <p className="text-sm text-on-surface-variant">
                    {formatEventWindow(booking.start, booking.end)}
                    {booking.expectedAttendance ? ` · ${booking.expectedAttendance.toLocaleString()} people` : ""}
                    {booking.layout ? ` · ${booking.layout}` : ""}
                  </p>
                  {booking.occupiedStart && booking.occupiedEnd ? (
                    <p className="text-xs text-on-surface-variant">Venue occupied {formatEventWindow(booking.occupiedStart, booking.occupiedEnd)}, including setup and turnaround.</p>
                  ) : null}
                  {booking.status === "REJECTED" && booking.rejectionReason ? (
                    <p className="text-xs text-on-surface"><span className="font-semibold">Reason:</span> {booking.rejectionReason}</p>
                  ) : null}
                  {booking.incident ? <BookingIncidentCard incident={booking.incident} audience={isCoordinator ? "coordinator" : "read-only"} /> : null}
                </li>
              ))}
            </ul>
          )}
          {!allowed ? (
            <p className="flex items-center gap-1.5 text-sm text-on-surface-variant">
              <Icon name="lock" size={16} />
              {isCoordinator ? "Venue bookings can be requested while the event is in planning." : "Read-only: only the assigned coordinator can request venue bookings."}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
