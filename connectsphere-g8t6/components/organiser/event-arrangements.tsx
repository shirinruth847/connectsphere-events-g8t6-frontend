"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertBanner, Button, Skeleton, StatusChip } from "@/components/shared/primitives";
import { SectionHeading } from "@/components/shared/section-heading";
import { Icon } from "@/components/shared/icon";
import { SafetyRoundCard } from "@/components/events/workspace/safety-review-section";
import { TechnicalRequestCards } from "@/components/events/equipment/technical-request-cards";
import { ApiError } from "@/lib/api";
import { getOrganiserArrangements, type EquipmentItem, type OrganiserArrangements, type VenueImpact } from "@/lib/api/organiser-arrangements";
import { formatEventWindow, formatTimestamp } from "@/lib/datetime";
import type { VenuePreferenceTime } from "@/lib/api/event-workspace";

// What the organiser asked for (SPM-76): each chosen venue, ranked, with the
// time they want it for. These are preferences for the coordinator, not bookings.
export interface VenueChoicesContext {
  choices: VenuePreferenceTime[];
  eventStart: string | null;
  eventEnd: string | null;
}

function VenueChoices({ context }: { context: VenueChoicesContext }) {
  return <>
    <h3 className="text-sm font-semibold text-on-surface">Venues you asked for</h3>
    {!context.choices.length ? <Empty>You did not choose a venue. Your coordinator will find one that suits the event.</Empty> : <ol className="grid gap-2">
      {context.choices.map((choice, index) => <li key={choice.venueId} className={panelClass}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="min-w-0 text-sm font-semibold text-on-surface">{index === 0 ? "Ideal venue" : `Choice ${index + 1}`}: {choice.venueName ?? `Venue #${choice.venueId}`}</span>
        </div>
        <p className="text-sm text-on-surface-variant">
          {choice.requestedStart && choice.requestedEnd
            ? formatEventWindow(choice.requestedStart, choice.requestedEnd)
            : `Whole event${context.eventStart ? ` · ${formatEventWindow(context.eventStart, context.eventEnd)}` : ""}`}
        </p>
      </li>)}
    </ol>}
    <p className="text-xs text-on-surface-variant">Your coordinator arranges holds and bookings from these choices; each booking appears below once it is requested.</p>
    <h3 className="text-sm font-semibold text-on-surface">Venue bookings</h3>
  </>;
}

const LABELS: Record<string, string> = {
  PENDING: "Pending approval", APPROVED: "Approved", REJECTED: "Rejected",
  CANCELLED: "Cancelled", RELEASED: "Released", SUPERSEDED: "Superseded",
  ACTIVE: "Tentative hold", EXPIRED: "Expired hold", CONVERTED: "Converted to booking request",
  NOT_REQUIRED: "Not required", OPEN: "Under safety review", CHANGES_REQUESTED: "Changes requested",
  PARTIALLY_FULFILLED: "Partially fulfilled — not approved",
};
const statusLabel = (status: string) => LABELS[status] ?? "Status unavailable";
// StatusChip's colour vocabulary is the event lifecycle. Resource labels stay
// explicit so an approved resource cannot be mistaken for a confirmed event.
const CHIP_STATES: Record<string, string> = {
  PENDING: "SUBMITTED", APPROVED: "CONFIRMED", REJECTED: "REJECTED", CANCELLED: "CANCELLED",
  RELEASED: "CANCELLED", SUPERSEDED: "CANCELLED", ACTIVE: "PLANNING", EXPIRED: "CANCELLED",
  CONVERTED: "SUBMITTED", NOT_REQUIRED: "COMPLETED", OPEN: "SAFETY_REVIEW", CHANGES_REQUESTED: "AWAITING_CLARIFICATION",
  PARTIALLY_FULFILLED: "AWAITING_CLARIFICATION",
};
function ArrangementStatus({ status }: { status: string }) {
  return <StatusChip status={CHIP_STATES[status] ?? "SUBMITTED"} label={statusLabel(status)} />;
}
const panelClass = "grid min-w-0 gap-3 rounded-control border border-outline-variant p-3 sm:p-4 [overflow-wrap:anywhere]";

function ArrangementSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return <section aria-labelledby={id} className="grid min-w-0 gap-4 rounded-panel bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5">
    <SectionHeading id={id} title={title} description={description} />
    {children}
  </section>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-on-surface-variant">{children}</p>;
}

function Unavailable({ children }: { children: ReactNode }) {
  return <AlertBanner tone="warning" title="Some arrangement information is unavailable">{children}</AlertBanner>;
}

function Impact({ impact }: { impact: VenueImpact }) {
  if (!impact.message) return null;
  return <AlertBanner tone={impact.status === "AFFECTED" ? "warning" : "info"} title={impact.message}>
    {impact.nextAction ? <p>{impact.nextAction}</p> : null}
  </AlertBanner>;
}

function Equipment({ items }: { items: EquipmentItem[] }) {
  return items.length ? <ul className="grid gap-1 text-sm text-on-surface">
    {items.map((item) => <li key={item.equipmentId}>{item.name} × {item.quantity}</li>)}
  </ul> : <Empty>No equipment items in this request.</Empty>;
}

function ArrangementDetails({ data, venueChoices }: { data: OrganiserArrangements; venueChoices?: VenueChoicesContext }) {
  const { venues, technical, safety } = data;
  return <>
    <ArrangementSection id="venue-arrangements-heading" title="Venue arrangements" description="The venues you asked for, and the bookings and tentative holds your coordinator has arranged.">
      {venueChoices ? <VenueChoices context={venueChoices} /> : null}
      {venues.status === "UNAVAILABLE" ? <Unavailable>Venue arrangements could not be loaded. Try refreshing arrangements.</Unavailable> : <>
        {!venues.bookings.length ? <Empty>No venue bookings have been arranged yet.</Empty> : <ul className="grid gap-3">
          {venues.bookings.map((booking) => <li key={booking.bookingId} className={panelClass}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 text-sm font-semibold text-on-surface">{booking.venueName}{booking.label ? ` · ${booking.label}` : ""}</h3>
              <ArrangementStatus status={booking.status} />
            </div>
            {booking.isPrimary ? <p className="text-xs font-semibold text-primary">Primary venue</p> : null}
            <p className="text-sm text-on-surface-variant">{formatEventWindow(booking.startDatetime, booking.endDatetime)}</p>
            <Impact impact={booking.impact} />
          </li>)}
        </ul>}
        {venues.bookings.length && venues.primaryVenueStatus === "NOT_DESIGNATED" ? <Empty>Primary venue has not been designated.</Empty> : null}
        <h3 className="text-sm font-semibold text-on-surface">Tentative holds</h3>
        {venues.holdsStatus === "UNAVAILABLE" ? <Unavailable>Tentative holds could not be checked. Try refreshing arrangements.</Unavailable> : !venues.holds.length ? <Empty>No tentative venue holds.</Empty> : <ul className="grid gap-3">
          {venues.holds.map((hold) => <li key={hold.holdId} className={panelClass}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h4 className="min-w-0 text-sm font-semibold text-on-surface">{hold.venueName}{hold.label ? ` · ${hold.label}` : ""}</h4>
              <ArrangementStatus status={hold.status} />
            </div>
            <p className="text-sm text-on-surface-variant">{formatEventWindow(hold.startDatetime, hold.endDatetime)}</p>
            <p className="text-xs text-on-surface-variant">Hold expiry: {formatTimestamp(hold.holdExpiresAt)}</p>
            <p className="text-xs text-on-surface-variant">{hold.status === "ACTIVE" ? "A tentative hold is not an approved booking." : "This hold is no longer active."}</p>
            <Impact impact={hold.impact} />
          </li>)}
        </ul>}
        {venues.availabilityStatus === "UNAVAILABLE" ? <Unavailable>Venue unavailability and next actions could not be fully verified. Contact your coordinator or try refreshing arrangements.</Unavailable> : null}
      </>}
    </ArrangementSection>

    <ArrangementSection id="technical-arrangements-heading" title="Equipment & technical arrangements" description="Your requested equipment and the arrangements reviewed by Technical Support.">
      {technical.status === "UNAVAILABLE" ? <Unavailable>Technical arrangements could not be loaded. Try refreshing arrangements.</Unavailable> : <>
        <h3 className="text-sm font-semibold text-on-surface">Requested equipment</h3>
        {technical.requirements.length ? <Equipment items={technical.requirements} /> : <Empty>No equipment requirements recorded.</Empty>}
        <h3 className="text-sm font-semibold text-on-surface">Arranged equipment & support</h3>
        {/* One card per technical request (SPM-286/287); the support-status notice is not shown. */}
        <TechnicalRequestCards requests={technical.requests} status={(request) => <ArrangementStatus status={request.status} />} empty="No technical arrangements have been recorded yet." />
      </>}
    </ArrangementSection>

    <ArrangementSection id="safety-arrangements-heading" title="Safety review" description="Safety outcomes relate to the arrangements reviewed. Your coordinator confirms the event separately.">
      {safety.status === "UNAVAILABLE" ? <Unavailable>Safety reviews could not be loaded. Try refreshing arrangements.</Unavailable> : !safety.reviews.length ? <Empty>No safety review has been submitted yet.</Empty> : <>
        {!safety.reviews.some((review) => review.isCurrent) ? <Empty>No safety review applies to the current arrangements.</Empty> : null}
        <ol className="grid gap-3">
          {safety.reviews.map((review) => <li key={review.reviewId} className={panelClass}>
            <h3 className="text-sm font-semibold text-on-surface">Round {review.round} · {review.isCurrent ? "Current arrangements" : "Previous arrangements"}</h3>
            <p className="text-xs text-on-surface-variant">Submitted: {formatTimestamp(review.submittedAt)}</p>
            <SafetyRoundCard round={{
              roundNumber: review.round, status: review.status, decidedAt: review.decidedAt,
              organiserComment: review.organiserComment,
            }} />
          </li>)}
        </ol>
      </>}
    </ArrangementSection>
  </>;
}

type State = { status: "loading" } | { status: "ready"; data: OrganiserArrangements } | { status: "error"; denied: boolean; changed: boolean };

export function EventArrangements({ eventId, venueChoices }: { eventId: number; venueChoices?: VenueChoicesContext }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    getOrganiserArrangements(eventId).then(({ arrangements }) => {
      if (alive) setState({ status: "ready", data: arrangements });
    }).catch((error: unknown) => {
      if (alive) setState({ status: "error", denied: error instanceof ApiError && [403, 404].includes(error.status),
        changed: error instanceof ApiError && error.code === "ARRANGEMENTS_CHANGED" });
    });
    return () => { alive = false; };
  }, [eventId, attempt]);

  // Refresh an active hold at expiry even when the page remains open; the
  // backend determines expiry from the clock rather than the expiry job.
  useEffect(() => {
    if (state.status !== "ready" || state.data.venues.status !== "READY") return;
    const expiries = state.data.venues.holds.filter((hold) => hold.status === "ACTIVE" && hold.holdExpiresAt)
      .map((hold) => new Date(hold.holdExpiresAt!).getTime()).filter(Number.isFinite);
    if (!expiries.length) return;
    const timer = setTimeout(() => { setState({ status: "loading" }); setAttempt((value) => value + 1); },
      Math.min(2_147_483_647, Math.max(1000, Math.min(...expiries) - Date.now() + 100)));
    return () => clearTimeout(timer);
  }, [state]);

  const refresh = () => { setState({ status: "loading" }); setAttempt((value) => value + 1); };
  // One header for the three arrangement sections, so Refresh says what it reloads.
  return <section className="grid min-w-0 gap-5" aria-labelledby="arrangements-heading">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id="arrangements-heading" className="text-lg font-semibold text-on-surface">Arrangements</h2>
        <p className="text-sm text-on-surface-variant">Venues, equipment and safety review for this event, as your coordinator arranges them.</p>
      </div>
      <Button variant="quiet" aria-label="Refresh arrangements" onClick={refresh} disabled={state.status === "loading"}><Icon name="refresh" size={16} />Refresh</Button>
    </div>
    {state.status === "loading" ? <div aria-busy="true" aria-label="Loading arrangements"><Skeleton className="h-48 w-full" /></div>
      : state.status === "error" ? <AlertBanner tone="error" title={state.denied ? "Arrangements not available" : state.changed ? "Arrangements changed while loading" : "Could not load arrangements"}>
        {state.denied ? "These arrangements are not shared with you, or the event is no longer available." : state.changed
          ? "Refresh arrangements to load the latest decisions. Reload this page to update the event overview too."
          : "Try refreshing arrangements. Your event details remain available above."}
      </AlertBanner> : <ArrangementDetails data={state.data} venueChoices={venueChoices} />}
  </section>;
}
