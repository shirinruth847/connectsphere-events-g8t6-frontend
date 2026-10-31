"use client";

import { Icon } from "@/components/shared/icon";
import { formatEventWindow } from "@/lib/datetime";
import type { BookingAvailability, BookingChecks } from "@/lib/api/venue-bookings";

const AVAILABILITY: Record<BookingAvailability, { label: string; className: string }> = {
  AVAILABLE: { label: "Available", className: "bg-[#DCFCE7] text-[#166534]" },
  UNAVAILABLE: { label: "Unavailable", className: "bg-error-container text-on-error-container" },
  // Never shown as available when it could not be checked (SPM-186 AC11).
  NOT_CHECKED: { label: "Cannot be checked", className: "bg-surface-container-high text-on-surface-variant" },
};

export const hasBlockingProblem = (checks: BookingChecks | null | undefined) => Boolean(checks?.blocking.length);

// One booking's checks against its own venue and window (SPM-186): the
// availability of its occupied time, then blocking problems and warnings.
// Shared by the Venue Staff decision panel and the coordinator's request form.
export function BookingChecksPanel({ checks, pending = false, id }: { checks: BookingChecks | null | undefined; pending?: boolean; id?: string }) {
  if (!checks) {
    return pending ? <p id={id} className="text-xs text-on-surface-variant" aria-live="polite">Checking this venue…</p> : null;
  }
  const availability = AVAILABILITY[checks.availability];
  const clear = !checks.blocking.length && !checks.warnings.length;
  return (
    <section id={id} aria-label="Venue checks" aria-busy={pending} className="grid gap-2" data-testid="booking-checks">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-pill px-2.5 py-0.5 font-semibold ${availability.className}`}>{availability.label}</span>
        {checks.occupiedStart && checks.occupiedEnd ? (
          <span className="text-on-surface-variant">Occupies {formatEventWindow(checks.occupiedStart, checks.occupiedEnd)} with setup and turnaround</span>
        ) : null}
        {pending ? <span className="text-on-surface-variant">Checking…</span> : null}
      </div>
      {clear ? (
        <p className="flex items-center gap-1.5 text-sm text-[#166534]"><Icon name="check" size={16} />All checks passed.</p>
      ) : null}
      {checks.blocking.length ? (
        <ul aria-label="Blocking problems" className="grid gap-1">
          {checks.blocking.map((check) => (
            <li key={`${check.code}-${check.message}`} className="flex items-start gap-1.5 text-sm font-semibold text-error">
              <Icon name="close" size={16} /><span>{check.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {checks.warnings.length ? (
        <ul aria-label="Warnings" className="grid gap-1">
          {checks.warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-1.5 text-sm text-on-surface">
              <span className="text-[#B45309]"><Icon name="warning" size={16} /></span><span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
