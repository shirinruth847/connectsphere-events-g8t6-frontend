"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AlertBanner, Button, buttonClasses, EmptyState, PageHeader, ReferenceIdTag, SectionCard, Skeleton, StatusChip } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { PermissionPill } from "@/components/shared/permission-pill";
import { SectionHeading } from "@/components/shared/section-heading";
import { RequirementList, layoutLabel } from "@/components/events/workspace/event-detail-rows";
import { ApiError } from "@/lib/api";
import { formatDuration, formatEventWindow, formatTimestamp } from "@/lib/datetime";
import { getEventVenueBookings, type EventVenueBookings, type VenueBookingDetail } from "@/lib/api/venue-bookings";
import { formatBookingId } from "./booking-filters";
import { BookingStatusChip } from "./booking-status-chip";
import { Collapse } from "./collapse";
import { useOpenedBookings } from "./use-opened-bookings";
import { BookingIncidentCard, IncidentChip } from "@/components/venues/booking-incident";

type ViewState =
  | { status: "loading" }
  | { status: "ready"; data: EventVenueBookings }
  | { status: "not-found" }
  | { status: "error"; message: string };

const readOnly = <PermissionPill tone="read-only">Read-only</PermissionPill>;

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

const people = (value: number | null) => (value ? `${value.toLocaleString()} people` : "Not provided");

function BookingRequirements({ booking, onRestored }: { booking: VenueBookingDetail; onRestored: (message: string) => void }) {
  const overCapacity = booking.expectedAttendance != null && booking.expectedAttendance > booking.venue.roomCapacity;
  return (
    <div className="grid gap-4">
      {/* SPM-195 AC9/AC10: an affected booking shows its block and, once free, Restore. */}
      {booking.incident ? <BookingIncidentCard incident={booking.incident} audience="venue-staff" onRestored={onRestored} /> : null}
      <KeyValuePanel
        rows={[
          { icon: "venue", label: "Requested venue", value: `${booking.venue.name} · ${booking.venue.address}` },
          { icon: "calendar", label: "Booking window", value: formatEventWindow(booking.startDatetime, booking.endDatetime) },
          { icon: "attendees", label: "Venue attendance", value: people(booking.expectedAttendance) },
          { icon: "layout", label: "Layout", value: layoutLabel(booking.layoutType) },
          { icon: "organisation", label: "Room capacity", value: `${booking.venue.roomCapacity.toLocaleString()} (${booking.venue.roomLayoutType})` },
          { icon: "schedule", label: "Operating hours", value: booking.venue.operatingHours ?? "Not recorded" },
          {
            icon: "schedule",
            label: "Setup & turnaround",
            value: booking.venue.setupTurnaroundMinutes != null ? `${booking.venue.setupTurnaroundMinutes} min` : "Not recorded",
          },
          { icon: "history", label: "Submitted", value: formatTimestamp(booking.submittedAt) },
        ]}
      />
      {overCapacity ? (
        <AlertBanner tone="warning" live={false}>
          Venue attendance ({booking.expectedAttendance?.toLocaleString()}) is above the room capacity ({booking.venue.roomCapacity.toLocaleString()}).
        </AlertBanner>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.05em] text-on-surface-variant">Required facilities</h4>
          <RequirementList items={booking.requiredFacilities} empty="No facilities were requested." />
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.05em] text-on-surface-variant">Accessibility requirements</h4>
          <RequirementList items={booking.accessibilityRequirements} empty="No accessibility requirements were requested." />
        </div>
      </div>
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.05em] text-on-surface-variant">Special requirements</h4>
        <p className="text-sm text-on-surface">{booking.specialRequirements || "None."}</p>
      </div>
      {booking.rejectionReason ? (
        <AlertBanner tone="error" live={false} title="Rejection reason">{booking.rejectionReason}</AlertBanner>
      ) : null}
    </div>
  );
}

function VenueBookingsSection({ bookings, selectedId, onSelect, onRestored }: {
  bookings: VenueBookingDetail[];
  selectedId: number | null;
  onSelect: (bookingId: number | null) => void;
  onRestored: (message: string) => void;
}) {
  return (
    <ReviewSection
      step={3}
      title="Venue bookings"
      description={`${bookings.length} venue ${bookings.length === 1 ? "booking" : "bookings"} under this event, each with its own status. Select one to review its requirements.`}
      action={<PermissionPill tone="edit">Venue Staff review</PermissionPill>}
    >
      <ul className="grid gap-3">
        {bookings.map((booking) => {
          const selected = booking.bookingId === selectedId;
          const panelId = `booking-panel-${booking.bookingId}`;
          return (
            <li key={booking.bookingId} className={`rounded-control border ${selected ? "border-primary bg-primary-fixed/30" : "border-outline-variant bg-surface-container-lowest"}`}>
              <button
                type="button"
                className="flex min-h-11 w-full flex-wrap items-center justify-between gap-3 p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                aria-expanded={selected}
                aria-controls={panelId}
                onClick={() => onSelect(selected ? null : booking.bookingId)}
              >
                <span className="grid gap-1">
                  <span className="text-sm font-bold text-on-surface">
                    {booking.venueName}{booking.label ? ` · ${booking.label}` : ""}
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    <span className="font-mono">{formatBookingId(booking.bookingId)}</span> · {formatEventWindow(booking.startDatetime, booking.endDatetime)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {booking.incident?.status === "OPEN" ? <IncidentChip incident={booking.incident} /> : null}
                  <BookingStatusChip status={booking.status} label={booking.statusLabel} />
                  <span className={`inline-flex transition-transform duration-200 ease-out ${selected ? "rotate-90" : ""}`}>
                    <Icon name="arrow-forward" size={16} />
                  </span>
                </span>
              </button>
              <Collapse open={selected} id={panelId}>
                <div className="border-t border-outline-variant p-3 sm:p-4">
                  <BookingRequirements booking={booking} onRestored={onRestored} />
                </div>
              </Collapse>
            </li>
          );
        })}
      </ul>
    </ReviewSection>
  );
}

function LoadedView({ data, selectedId, onSelect, onRestored }: {
  data: EventVenueBookings;
  selectedId: number | null;
  onSelect: (bookingId: number | null) => void;
  onRestored: (message: string) => void;
}) {
  const { event, bookings } = data;
  const duration = formatDuration(event.startDatetime, event.endDatetime);
  const selected = bookings.find((booking) => booking.bookingId === selectedId) ?? null;
  const others = selected ? bookings.filter((booking) => booking.bookingId !== selected.bookingId) : bookings;

  return (
    <div className="grid gap-5">
      <Link href="/dashboard" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <Icon name="arrow-back" size={16} />My Requests
      </Link>

      <PageHeader
        eyebrow={selected ? "Venue booking review" : "Event venue bookings"}
        title={event.title || "Untitled request"}
        description={`Coordinated by ${event.coordinatorName ?? "an unassigned coordinator"}${event.organisationName ? ` · ${event.organisationName}` : ""}`}
        action={<StatusChip status={event.status} />}
      />

      <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ReferenceIdTag value={event.requestId} />
        {selected ? <ReferenceIdTag value={formatBookingId(selected.bookingId)} /> : null}
        <span className="text-sm text-on-surface-variant">{formatEventWindow(event.startDatetime, event.endDatetime)}</span>
        <PermissionPill tone="read-only">Venue Staff • Event details read-only</PermissionPill>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-12">
        <div className="grid gap-5 xl:col-span-8">
          <ReviewSection step={1} title="Event identity & purpose" description="The organiser's request as reviewed by the coordinator." action={readOnly}>
            <KeyValuePanel
              rows={[
                { icon: "registration", label: "Event type", value: event.eventTypeLabel ?? "Not specified" },
                { icon: "info", label: "Purpose", value: event.purpose || "Not provided" },
              ]}
            />
            <p className="whitespace-pre-line text-sm leading-relaxed text-on-surface">{event.description || "No description provided."}</p>
          </ReviewSection>

          <ReviewSection step={2} title="Schedule & attendance" action={readOnly}>
            <KeyValuePanel
              rows={[
                { icon: "calendar", label: "Date & time", value: formatEventWindow(event.startDatetime, event.endDatetime) },
                ...(duration ? [{ icon: "schedule" as const, label: "Duration", value: duration }] : []),
                { icon: "attendees", label: "Expected attendance", value: people(event.expectedAttendance) },
                { icon: "layout", label: "Preferred layout", value: layoutLabel(event.preferredLayoutType) },
              ]}
            />
          </ReviewSection>

          <VenueBookingsSection bookings={bookings} selectedId={selected?.bookingId ?? null} onSelect={onSelect} onRestored={onRestored} />

          <div className="grid gap-5 md:grid-cols-2">
            <ReviewSection step={4} title="Accessibility" action={readOnly}>
              <RequirementList items={event.accessibilityNeeds} empty="No accessibility needs were requested." />
            </ReviewSection>
            <ReviewSection step={5} title="Technical & equipment" action={readOnly}>
              <p className="text-sm text-on-surface-variant">Technical arrangements are reviewed by Technical Support.</p>
            </ReviewSection>
          </div>
        </div>

        <aside className="grid gap-5 xl:col-span-4" aria-label="Coordination and related bookings">
          <section aria-labelledby="coordination-heading" className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
            <SectionHeading id="coordination-heading" title="Coordination" />
            <KeyValuePanel
              className="mt-4"
              rows={[
                { icon: "person", label: "Coordinator", value: event.coordinatorName ?? "Unassigned" },
                { icon: "organisation", label: "Organisation", value: event.organisationName ?? "Not provided" },
                { icon: "history", label: "Event submitted", value: event.submittedAt ? formatTimestamp(event.submittedAt) : "Not recorded" },
              ]}
            />
          </section>

          <section aria-labelledby="related-heading" className="rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
            <SectionHeading
              id="related-heading"
              title={selected ? "Other bookings for this event" : "Bookings for this event"}
            />
            {others.length ? (
              <ul className="mt-4 grid gap-2">
                {others.map((booking) => (
                  <li key={booking.bookingId}>
                    <button
                      type="button"
                      onClick={() => onSelect(booking.bookingId)}
                      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-control bg-surface-container-low px-3 py-2 text-left text-sm hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <span className="grid">
                        <span className="font-semibold text-on-surface">{booking.venueName}</span>
                        <span className="font-mono text-xs text-on-surface-variant">{formatBookingId(booking.bookingId)}</span>
                      </span>
                      <BookingStatusChip status={booking.status} label={booking.statusLabel} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-on-surface-variant">This event has no other venue bookings.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

// /events/[eventId] for Venue Staff (SPM-181): the coordinator's layout with
// every event section read-only; only the venue bookings are interactive.
// ?booking=<id> opens that booking; without it the page is the event view
// listing all bookings under the event.
export function VenueStaffEventView({ eventId }: { eventId: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const rawBooking = searchParams.get("booking");
  const selectedId = rawBooking && /^[1-9]\d{0,9}$/.test(rawBooking) ? Number(rawBooking) : null;
  const { markOpened } = useOpenedBookings();

  // Opening a booking here, from My Requests or the sibling list, counts for
  // the "Last opened" sort.
  useEffect(() => {
    if (selectedId) markOpened(selectedId);
  }, [selectedId, markOpened]);

  useEffect(() => {
    let alive = true;
    getEventVenueBookings(eventId)
      .then((data) => {
        if (alive) setState({ status: "ready", data });
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        if (caught instanceof ApiError && caught.status === 404) setState({ status: "not-found" });
        else setState({ status: "error", message: caught instanceof Error ? caught.message : "Could not load this event." });
      });
    return () => {
      alive = false;
    };
  }, [eventId, attempt]);

  const select = (bookingId: number | null) => {
    router.replace(bookingId ? `${pathname}?booking=${bookingId}` : pathname, { scroll: false });
  };

  if (state.status === "loading") {
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Loading venue bookings">
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 xl:grid-cols-12">
          <Skeleton className="h-72 xl:col-span-8" />
          <Skeleton className="h-72 xl:col-span-4" />
        </div>
      </div>
    );
  }
  if (state.status === "not-found") {
    return (
      <EmptyState
        title="Event not available"
        description="This event has no venue booking requests, or it does not exist."
        action={<Link href="/dashboard" className={buttonClasses("secondary")}><Icon name="arrow-back" size={16} />Back to My Requests</Link>}
      />
    );
  }
  if (state.status === "error") {
    return (
      <AlertBanner tone="error" title="Could not load this event">
        {state.message}
        <div className="mt-3">
          <Button variant="secondary" onClick={() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }}>
            <Icon name="refresh" size={16} />Try again
          </Button>
        </div>
      </AlertBanner>
    );
  }
  const bookingMissing = selectedId !== null && !state.data.bookings.some((booking) => booking.bookingId === selectedId);
  // The page reloads the bookings once the backend has committed the restore.
  const restored = (message: string) => {
    setNotice(message);
    setAttempt((value) => value + 1);
  };
  return (
    <>
      {bookingMissing ? (
        <div className="mb-4"><AlertBanner tone="warning">That booking is not part of this event. Showing every booking under the event instead.</AlertBanner></div>
      ) : null}
      <div aria-live="polite">
        {notice ? <div className="mb-4"><AlertBanner tone="success" live={false}>{notice}</AlertBanner></div> : null}
      </div>
      <LoadedView data={state.data} selectedId={selectedId} onSelect={select} onRestored={restored} />
    </>
  );
}
