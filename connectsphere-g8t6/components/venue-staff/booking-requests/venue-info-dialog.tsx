"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/shared/dialog";
import { AlertBanner, Button, buttonClasses, Skeleton } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { VenuePhotoCarousel } from "@/components/venues/event-venue-options/venue-photo-carousel";
import { VenueAvailabilityCalendar } from "@/components/venues/venue-availability";
import { VenueStatusChip } from "@/components/venue-staff/venue-management/venue-fields";
import { ApiError } from "@/lib/api";
import { calendarDate } from "@/lib/coordinator-calendar";
import { getManagedVenue, type DetailStatus, type ManagedVenue, type VenueDetails } from "@/lib/api/venues";
import type { VenueBookingDetail } from "@/lib/api/venue-bookings";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; venue: ManagedVenue; details: VenueDetails | null; detailStatus: DetailStatus }
  | { status: "error"; message: string };

const subheading = "text-xs font-semibold uppercase tracking-[0.05em] text-on-surface-variant";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control border border-outline-variant px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-on-surface [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function Chips({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="grid gap-1.5">
      <h4 className={subheading}>{title}</h4>
      {items.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => <li key={item} className="rounded-pill bg-primary-fixed/50 px-3 py-1 text-xs font-medium text-on-surface">{item}</li>)}
        </ul>
      ) : <p className="text-sm text-on-surface-variant">None recorded.</p>}
    </div>
  );
}

// A venue's details for Venue Staff reviewing a booking (SPM-186), read-only:
// photos, status, capacity, hours, setup/turnaround, contact, layouts,
// facilities and accessibility, and the venue's calendar with this booking's
// window in yellow and any overlap in red. Editing stays on the venue page.
export function VenueInfoDialog({ open, onClose, booking, requestId }: {
  open: boolean;
  onClose: () => void;
  booking: VenueBookingDetail;
  requestId: string;
}) {
  const venueId = booking.venue.venueId;
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [showCalendar, setShowCalendar] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    getManagedVenue(venueId)
      .then((data) => { if (alive) setState({ status: "ready", ...data }); })
      .catch((caught: unknown) => {
        if (!alive) return;
        const message = caught instanceof ApiError && caught.status === 404
          ? "This venue no longer exists."
          : caught instanceof Error ? caught.message : "The venue could not be loaded.";
        setState({ status: "error", message });
      });
    return () => { alive = false; };
  }, [open, venueId, attempt]);

  const buffers = (details: VenueDetails | null) => {
    if (!details) return "Unavailable";
    if (details.setupMinutes == null || details.turnaroundMinutes == null) return "Not recorded";
    return `${details.setupMinutes} / ${details.turnaroundMinutes} min`;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="wide"
      title={booking.venue.name}
      footer={(
        <>
          <Link href={`/venues/${venueId}`} className={buttonClasses("quiet")}>Open venue page<Icon name="arrow-forward" size={16} /></Link>
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
        </>
      )}
    >
      {state.status === "loading" ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Loading venue"><Skeleton className="aspect-video w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : null}
      {state.status === "error" ? (
        <AlertBanner tone="error" title="The venue could not be loaded">
          {state.message}
          <div className="mt-3"><Button variant="secondary" onClick={() => { setState({ status: "loading" }); setAttempt((value) => value + 1); }}><Icon name="refresh" size={16} />Try again</Button></div>
        </AlertBanner>
      ) : null}
      {state.status === "ready" ? (
        <div className="grid gap-5">
          <VenuePhotoCarousel venueId={venueId} venueName={state.venue.name} source="staff" />
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-on-surface-variant">{state.venue.address}</p>
              <VenueStatusChip status={state.venue.status} />
            </div>
            {state.venue.statusReason ? <p className="text-sm text-on-surface">Reason: {state.venue.statusReason}</p> : null}
          </div>
          {state.detailStatus !== "CURRENT" ? (
            <AlertBanner tone="warning" live={false}>
              {state.details ? "Some details may be out of date." : "Facilities, layouts and setup/turnaround times cannot be read right now."}
            </AlertBanner>
          ) : null}
          <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Fact label="Capacity" value={`${state.venue.maxCapacity.toLocaleString()} people`} />
            <Fact label="Operating hours" value={booking.venue.operatingHours ?? "Not recorded"} />
            <Fact label="Setup / turnaround" value={buffers(state.details)} />
            <Fact label="Contact" value={[state.venue.contactPerson, state.venue.contactNumber, state.venue.contactEmail].filter(Boolean).join(" · ") || "Not recorded"} />
          </dl>
          {state.details?.description ? <p className="text-sm text-on-surface">{state.details.description}</p> : null}
          <div className="grid gap-4 md:grid-cols-3">
            <Chips title="Layouts" items={state.details?.supportedLayouts ?? []} />
            <Chips title="Facilities" items={state.details?.facilities ?? []} />
            <Chips title="Accessibility" items={state.details?.accessibilityFeatures ?? []} />
          </div>
          {state.details?.knownRestrictions.length ? <Chips title="Known restrictions" items={state.details.knownRestrictions} /> : null}

          <div className="grid gap-3">
            <div>
              <Button type="button" variant="secondary" aria-expanded={showCalendar} onClick={() => setShowCalendar((value) => !value)}>
                <Icon name="calendar" size={16} />{showCalendar ? "Hide availability calendar" : "Show availability calendar"}
              </Button>
            </div>
            {showCalendar ? (
              <VenueAvailabilityCalendar
                fixed={{
                  bookingId: booking.bookingId,
                  venueIds: [venueId],
                  date: calendarDate(new Date(booking.startDatetime)),
                  check: null,
                  label: requestId,
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
