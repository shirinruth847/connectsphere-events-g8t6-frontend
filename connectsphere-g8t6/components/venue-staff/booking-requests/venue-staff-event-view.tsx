"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertBanner, Button, buttonClasses, EmptyState, PageHeader, ReferenceIdTag, SectionCard, Skeleton, StatusChip } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { KeyValuePanel } from "@/components/shared/key-value-panel";
import { PermissionPill } from "@/components/shared/permission-pill";
import { SectionHeading } from "@/components/shared/section-heading";
import { RequirementList, layoutLabel } from "@/components/events/workspace/event-detail-rows";
import { HistoryPanel } from "@/components/events/workspace/event-history-panel";
import { useHistory, type HistoryLoader } from "@/components/events/workspace/use-event-history";
import { ApiError } from "@/lib/api";
import { formatDuration, formatEventWindow, formatTimestamp } from "@/lib/datetime";
import { getEventBookingHistory, getEventVenueBookings, type EventVenueBookings, type VenueBookingDetail } from "@/lib/api/venue-bookings";
import { formatBookingId } from "./booking-filters";
import { BookingDecision, type DecisionNotice } from "./booking-decision";
import { BookingStatusChip } from "./booking-status-chip";
import { Collapse } from "./collapse";
import { useOpenedBookings } from "./use-opened-bookings";

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

const subheading = "text-xs font-semibold uppercase tracking-[0.05em] text-on-surface-variant";

function Fact({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-control border px-3 py-2 ${alert ? "border-error bg-error-container/40" : "border-outline-variant"}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">{label}</dt>
      <dd className={`mt-0.5 text-sm font-semibold ${alert ? "text-error" : "text-on-surface"}`}>{value}</dd>
    </div>
  );
}

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-on-surface-variant">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => <li key={item} className="rounded-pill bg-primary-fixed/50 px-3 py-1 text-xs font-medium text-on-surface">{item}</li>)}
    </ul>
  );
}

const buffers = (venue: VenueBookingDetail["venue"]) => {
  if (!venue.detailsAvailable) return "Unavailable";
  if (venue.setupMinutes == null || venue.turnaroundMinutes == null) return "Not recorded";
  return `${venue.setupMinutes} / ${venue.turnaroundMinutes} min`;
};

// What Venue Staff decide on (SPM-186): the venue and how the request fits it,
// then the requirements. The booking window is in the row header only.
function BookingRequirements({ booking }: { booking: VenueBookingDetail }) {
  const { venue } = booking;
  const overCapacity = booking.expectedAttendance != null && booking.expectedAttendance > venue.roomCapacity;
  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        <p className="flex items-start gap-2 text-sm text-on-surface">
          <Icon name="venue" size={16} />
          <span><span className="font-semibold">{venue.name}</span> · <span className="text-on-surface-variant">{venue.address}</span></span>
        </p>
        <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Fact
            label="Attendance / capacity"
            value={`${booking.expectedAttendance != null ? booking.expectedAttendance.toLocaleString() : "?"} / ${venue.roomCapacity.toLocaleString()}`}
            alert={overCapacity}
          />
          <Fact label="Layout" value={`${layoutLabel(booking.layoutType)}${venue.roomLayoutType ? ` (room: ${layoutLabel(venue.roomLayoutType)})` : ""}`} />
          <Fact label="Operating hours" value={venue.operatingHours ?? "Not recorded"} />
          <Fact label="Setup / turnaround" value={buffers(venue)} />
        </dl>
        {overCapacity ? <p className="text-xs font-semibold text-error">Attendance is above the room capacity.</p> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <h4 className={subheading}>Facilities</h4>
          <Chips items={booking.requiredFacilities} empty="None requested." />
        </div>
        <div className="grid gap-2">
          <h4 className={subheading}>Accessibility</h4>
          <Chips items={booking.accessibilityRequirements} empty="None requested." />
        </div>
      </div>
      {booking.specialRequirements ? (
        <div className="grid gap-1">
          <h4 className={subheading}>Special requirements</h4>
          <p className="text-sm text-on-surface">{booking.specialRequirements}</p>
        </div>
      ) : null}
      {booking.rejectionReason ? (
        <AlertBanner tone="error" live={false} title="Rejection reason">{booking.rejectionReason}</AlertBanner>
      ) : null}
    </div>
  );
}

function VenueBookingsSection({ bookings, selectedId, onSelect, onDecided }: {
  bookings: VenueBookingDetail[];
  selectedId: number | null;
  onSelect: (bookingId: number | null) => void;
  onDecided: (notice: DecisionNotice) => void;
}) {
  return (
    <ReviewSection
      step={3}
      title="Venue bookings"
      description={`${bookings.length} ${bookings.length === 1 ? "booking" : "bookings"}, each decided on its own.`}
      action={<PermissionPill tone="edit">Venue Staff review</PermissionPill>}
    >
      <ul className="grid gap-3">
        {bookings.map((booking) => {
          const selected = booking.bookingId === selectedId;
          const panelId = `booking-panel-${booking.bookingId}`;
          return (
            <li key={booking.bookingId} className={`rounded-control border bg-surface-container-lowest ${selected ? "border-primary shadow-elevation-1" : "border-outline-variant"}`}>
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
                  <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                    <Icon name="calendar" size={16} />{formatEventWindow(booking.startDatetime, booking.endDatetime)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <BookingStatusChip status={booking.status} label={booking.statusLabel} />
                  <span className={`inline-flex transition-transform duration-200 ease-out ${selected ? "rotate-90" : ""}`}>
                    <Icon name="arrow-forward" size={16} />
                  </span>
                </span>
              </button>
              <Collapse open={selected} id={panelId}>
                <div className="grid gap-5 border-t border-outline-variant p-4">
                  <BookingRequirements booking={booking} />
                  <BookingDecision booking={booking} onDecided={onDecided} />
                </div>
              </Collapse>
            </li>
          );
        })}
      </ul>
    </ReviewSection>
  );
}

// The venue-relevant part of the event's history (SPM-186, Master 4.2).
function BookingHistory({ eventId, refreshKey }: { eventId: number; refreshKey: number }) {
  const load = useCallback<HistoryLoader>((options) => getEventBookingHistory(eventId, options), [eventId]);
  const history = useHistory(load, refreshKey);
  return (
    <HistoryPanel
      id={`event-${eventId}-venue-history`}
      description="Venue bookings and decisions, and changes to the dates, attendance, layout and access they depend on."
      emptyText="No venue changes have been recorded for this event yet."
      history={history}
    />
  );
}

function LoadedView({ data, selectedId, onSelect, notice, onDecided, refreshKey }: {
  data: EventVenueBookings;
  selectedId: number | null;
  onSelect: (bookingId: number | null) => void;
  notice: DecisionNotice | null;
  onDecided: (notice: DecisionNotice) => void;
  refreshKey: number;
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
        <PermissionPill tone="read-only">Venue Staff • Event details read-only</PermissionPill>
      </div>

      {notice ? <AlertBanner tone={notice.tone}>{notice.text}</AlertBanner> : null}

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

          <VenueBookingsSection bookings={bookings} selectedId={selected?.bookingId ?? null} onSelect={onSelect} onDecided={onDecided} />

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

          <BookingHistory eventId={event.eventId} refreshKey={refreshKey} />
        </aside>
      </div>
    </div>
  );
}

// /events/[eventId] for Venue Staff (SPM-181): the coordinator's layout with
// every event section read-only; only the venue bookings are interactive, and
// each one is approved or rejected there (SPM-186, SPM-189).
// ?booking=<id> opens that booking; without it the page is the event view
// listing all bookings under the event.
export function VenueStaffEventView({ eventId }: { eventId: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<DecisionNotice | null>(null);
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
    setNotice(null);
    router.replace(bookingId ? `${pathname}?booking=${bookingId}` : pathname, { scroll: false });
  };

  // Reload in place after a decision, or after learning someone else decided first.
  const decided = (next: DecisionNotice) => {
    setNotice(next);
    setAttempt((value) => value + 1);
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
  return (
    <>
      {bookingMissing ? (
        <div className="mb-4"><AlertBanner tone="warning">That booking is not part of this event. Showing every booking under the event instead.</AlertBanner></div>
      ) : null}
      <LoadedView data={state.data} selectedId={selectedId} onSelect={select} notice={notice} onDecided={decided} refreshKey={attempt} />
    </>
  );
}
