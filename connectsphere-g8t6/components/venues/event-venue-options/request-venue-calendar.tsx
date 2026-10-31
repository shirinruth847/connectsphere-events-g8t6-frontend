"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarView, type CalendarViewMode } from "@/components/calendar/calendar-view";
import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import { Icon } from "@/components/shared/icon";
import { calendarDate } from "@/lib/coordinator-calendar";
import { getRequestVenueAvailability, type RequestVenueAvailability } from "@/lib/api/event-venues";
import { calendarRange, requestCalendar, resizeWithin } from "../availability-calendar-model";
import { useDebouncedValue } from "../use-debounced-value";

const DAY_MS = 24 * 60 * 60 * 1000;

type Window = { start: string; end: string };

interface RequestVenueCalendarProps {
  venueId: number;
  venueName: string;
  // The time the organiser wants this venue for, and the event it must stay inside.
  requested: Window;
  bounds: Window;
  onChange: (next: Window) => void;
  onCollapse: () => void;
  // The organiser's other chosen venues' times, drawn behind for reference.
  otherChoices: Window[];
}

// SPM-76: one chosen venue's calendar while the organiser fills in the
// request. Busy periods show only their kind; the requested time is the
// yellow block, red where its occupied time (with setup and turnaround)
// overlaps a busy period, grey outside opening hours. Its top and bottom
// edges drag in 15-minute steps within the event.
export function RequestVenueCalendar({ venueId, venueName, requested, bounds, onChange, onCollapse, otherChoices }: RequestVenueCalendarProps) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>(Date.parse(bounds.end) - Date.parse(bounds.start) > DAY_MS ? "week" : "day");
  const [currentDate, setCurrentDate] = useState(() => calendarDate(new Date(requested.start)));
  // Each result remembers what it was loaded for, so a newer request shows as loading.
  const [loaded, setLoaded] = useState<{ key: string; data: RequestVenueAvailability | null; error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Keyed on the text: the parent rebuilds the object on every render.
  const checkedKey = useDebouncedValue(`${requested.start}|${requested.end}`, 400);
  const checked = useMemo(() => {
    const [start, end] = checkedKey.split("|");
    return { start, end };
  }, [checkedKey]);
  const range = calendarRange(viewMode, currentDate);
  const loadKey = `${venueId}|${range.date}|${range.days}|${checkedKey}|${attempt}`;
  useEffect(() => {
    let alive = true;
    const from = new Date(`${range.date}T00:00:00+08:00`);
    getRequestVenueAvailability(venueId, { from: from.toISOString(), to: new Date(from.getTime() + range.days * DAY_MS).toISOString(), check: checked })
      .then((result) => { if (alive) setLoaded({ key: loadKey, data: result, error: "" }); })
      .catch((caught: unknown) => { if (alive) setLoaded({ key: loadKey, data: null, error: caught instanceof Error ? caught.message : "Availability could not be loaded." }); });
    return () => { alive = false; };
  }, [loadKey, venueId, range.date, range.days, checked]);
  // The previous calendar stays while a dragged time is checked again.
  const data = loaded?.data ?? null;
  const error = loaded?.error ?? "";
  const loading = loaded?.key !== loadKey;

  const calendar = useMemo(
    // A drag keeps the handler it started with; only the dragged edge moves
    // during it, so the other edge from the drag's start is still current.
    () => (data ? requestCalendar(data, range, {
      requested,
      otherChoices,
      resize: (edge, instant) => onChange(resizeWithin(requested, bounds, edge, instant)),
    }) : null),
    // range is rebuilt each render; its fields are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, range.date, range.days, requested, bounds, onChange, otherChoices],
  );

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-sm font-semibold text-on-surface">{venueName} calendar</h4>
      <Button type="button" variant="quiet" onClick={onCollapse}><Icon name="close" size={16} />Collapse calendar</Button>
    </div>
  );
  if (error) {
    return (
      <div className="grid gap-3">{header}<AlertBanner tone="error" title="Error checking availability">
        {error} No time is shown as available until availability loads.
        <div className="mt-3"><Button type="button" variant="secondary" onClick={() => setAttempt((value) => value + 1)}><Icon name="refresh" size={16} />Try again</Button></div>
      </AlertBanner></div>
    );
  }
  if (!data || !calendar) return <div className="grid gap-3">{header}<Skeleton className="h-96 w-full" /></div>;

  const check = data.venue.check;
  const current = check && Date.parse(check.start) === Date.parse(requested.start) && Date.parse(check.end) === Date.parse(requested.end) ? check : null;
  return (
    <div className="grid gap-3">
      {header}
      <p className="text-sm" aria-live="polite">
        {!current || loading ? <span className="text-on-surface-variant">Checking {venueName} for this time…</span> : current.conflicts.length ? (
          <span className="font-semibold text-error">Unavailable at this time: {current.availabilityLabel.toLowerCase()}. Drag the yellow block or choose another venue.</span>
        ) : (
          <span className="font-semibold text-success">{current.availabilityLabel}</span>
        )}
        {current?.operatingHoursWarning ? <span className="mt-1 block text-xs text-[#92400E]">{current.operatingHoursWarning.message}</span> : null}
      </p>
      <section aria-label={`${venueName} availability calendar`} className="coordinator-shell venue-calendar overflow-hidden rounded-panel shadow-elevation-1" style={{ minHeight: 0, background: "transparent" }}>
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
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm bg-[#4B5563]/40" />Venue unavailable (booked, held or blocked)</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm bg-[#DC2626]/35" />Clash</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm border border-dashed border-[#2563EB] bg-[#3B82F6]/20" />Your other venues&apos; times</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm bg-outline/25" />Closed</span>
      </p>
    </div>
  );
}
