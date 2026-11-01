"use client";

import { useMemo, useState } from "react";
import { CalendarView, type CalendarViewMode } from "@/components/calendar/calendar-view";
import { Button } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { calendarDate } from "@/lib/coordinator-calendar";
import { calendarRange, requestCalendar, resizeWithin } from "../availability-calendar-model";

const DAY_MS = 24 * 60 * 60 * 1000;

type Window = { start: string; end: string };

// The choice's availability over its requested time, from the venue step's check.
export type RequestTimeCheck = { status: "checking" } | { status: "error" } | { status: "ready"; label: string; unavailable: boolean };

interface RequestVenueCalendarProps {
  venueId: number;
  venueName: string;
  operatingHours: string | null;
  // The time the organiser wants this venue for, and the event it must stay inside.
  requested: Window;
  bounds: Window;
  check: RequestTimeCheck;
  onChange: (next: Window) => void;
  onCollapse: () => void;
  // The organiser's other chosen venues' times, drawn behind for reference.
  otherChoices: Window[];
}

// SPM-76: one chosen venue's calendar while the organiser fills in the
// request. It shows only the organiser's own times (requestCalendar): the
// requested time is the yellow block, red when the venue is unavailable then,
// and grey outside opening hours. Its top and bottom edges drag in 15-minute
// steps within the event.
export function RequestVenueCalendar({ venueId, venueName, operatingHours, requested, bounds, check, onChange, onCollapse, otherChoices }: RequestVenueCalendarProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>(Date.parse(bounds.end) - Date.parse(bounds.start) > DAY_MS ? "week" : "day");
  const [currentDate, setCurrentDate] = useState(() => calendarDate(new Date(requested.start)));
  const range = calendarRange(viewMode, currentDate);
  const unavailable = check.status === "ready" && check.unavailable;

  const calendar = useMemo(
    // A drag keeps the handler it started with; only the dragged edge moves
    // during it, so the other edge from the drag's start is still current.
    () => requestCalendar({ venueId, name: venueName, operatingHours }, range, {
      requested,
      otherChoices,
      unavailable,
      resize: (edge, instant) => onChange(resizeWithin(requested, bounds, edge, instant)),
    }),
    // range is rebuilt each render; its fields are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [venueId, venueName, operatingHours, range.date, range.days, requested, bounds, onChange, otherChoices, unavailable],
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-on-surface">{venueName} calendar</h4>
        <Button type="button" variant="quiet" onClick={onCollapse}><Icon name="close" size={16} />Collapse calendar</Button>
      </div>
      <p className="text-sm" aria-live="polite">
        {check.status === "checking" ? <span className="text-on-surface-variant">Checking {venueName} for this time…</span> : null}
        {check.status === "error" ? <span className="font-semibold text-on-surface-variant">Error checking availability</span> : null}
        {check.status === "ready" ? (check.unavailable
          ? <span className="font-semibold text-error">Unavailable at this time ({check.label.replace(/^Unavailable – /, "")}). Drag the yellow block or choose another venue.</span>
          : <span className="font-semibold text-success">{check.label}</span>) : null}
      </p>
      <section aria-label={`${venueName} calendar`} className="coordinator-shell venue-calendar overflow-hidden rounded-panel shadow-elevation-1" style={{ minHeight: 0, background: "transparent" }}>
        <CalendarView
          overlays={calendar.overlays}
          monthBars
          coordinators={calendar.lanes}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          currentDate={currentDate}
          onCurrentDateChange={setCurrentDate}
          entityLabel={{ singular: "venue", plural: "venues" }}
          laneFilter={false}
        />
      </section>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant" aria-label="Calendar key">
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm border-2 border-[#CA8A04] bg-[#FACC15]/30" />Time for {venueName} (drag its top or bottom edge)</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm bg-[#DC2626]/35" />Venue unavailable at this time</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm border border-dashed border-[#2563EB] bg-[#3B82F6]/20" />Your other venues&apos; times</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm bg-outline/25" />Closed</span>
      </p>
    </div>
  );
}
