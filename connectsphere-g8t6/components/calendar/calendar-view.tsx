"use client";

import {
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { calendarDate, calendarDayBounds, overlapsCalendarDay, shiftCalendarMonth, calendarLabelInstant, calendarHourInstant } from "@/lib/coordinator-calendar";
import styles from "./calendar-view.module.css";

export type CalendarViewMode = "year" | "month" | "week" | "day";

export type CalendarEvent = {
  eventId: number;
  title: string;
  purpose?: string;
  description?: string;
  accessibilityNeeds?: string;
  preferredLayoutType?: string;
  isRegistrationEnabled?: boolean;
  registrationCapacity?: number;
  startDatetime: string;
  endDatetime: string;
  coordinatorId?: number;
  coordinatorName?: string;
  isRequested?: boolean;
  status?: string;
  requestId?: string;
  expectedAttendance?: number;
  organisation?: string | null;
  venuePreferences?: number[];
  equipmentRequirements?: Array<{ equipmentId: number; quantity: number }>;
  createdAt?: string;
};

// What each lane (legend entry) is called. Defaults to coordinators; the venue
// availability calendar (SPM-181) shows venues.
export type CalendarEntityLabel = { singular: string; plural: string };
const COORDINATOR_LABEL: CalendarEntityLabel = { singular: "coordinator", plural: "coordinators" };

// A shaded period in the week and day views, drawn over the timeline rather
// than as an event (developer request of 24 October 2026): "request" is the
// period being checked (translucent yellow, with label in the block and detail
// in a hover window), "conflict" where it overlaps existing occupied time
// (red), "closed" outside operating hours (grey, beneath everything).
export type CalendarOverlay = {
  id: string;
  start: string;
  end: string;
  tone: "request" | "conflict" | "closed";
  label?: string;
  detail?: string;
  // A request whose start and end can be dragged (SPM-76): called with the
  // edge and the instant (ms) under the pointer, snapped to RESIZE_STEP_MS;
  // the owner keeps it inside its bounds.
  resize?: (edge: "start" | "end", instant: number) => void;
};

export const RESIZE_STEP_MS = 15 * 60 * 1000;
const snapToStep = (instant: number) => Math.round(instant / RESIZE_STEP_MS) * RESIZE_STEP_MS;

// The day column under the pointer carries its bounds, so a drag can cross days.
const instantAtPoint = (x: number, y: number) => {
  const column = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-day-start]");
  if (!column) return null;
  const start = Number(column.dataset.dayStart);
  const end = Number(column.dataset.dayEnd);
  const rect = column.getBoundingClientRect();
  const fraction = Math.min(1, Math.max(0, (y - rect.top) / rect.height));
  return snapToStep(start + fraction * (end - start));
};

function ResizeHandle({ edge, instant, resize }: { edge: "start" | "end"; instant: number; resize: NonNullable<CalendarOverlay["resize"]> }) {
  const label = edge === "start" ? "Requested start" : "Requested end";
  // Window listeners: the handle unmounts when its edge moves to another day.
  const startDrag = (pointerEvent: ReactPointerEvent) => {
    pointerEvent.preventDefault();
    pointerEvent.stopPropagation();
    const move = (moveEvent: PointerEvent) => {
      const next = instantAtPoint(moveEvent.clientX, moveEvent.clientY);
      if (next !== null) resize(edge, next);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };
  return (
    <span
      role="button"
      tabIndex={0}
      className={`cal-overlay-handle cal-overlay-handle--${edge}`}
      aria-label={`${label}: ${formatTime(new Date(instant))}. Drag, or press the up and down arrow keys, to change it by 15 minutes.`}
      title={`Drag to change the ${edge} time`}
      onPointerDown={startDrag}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key !== "ArrowUp" && keyEvent.key !== "ArrowDown") return;
        keyEvent.preventDefault();
        resize(edge, instant + (keyEvent.key === "ArrowUp" ? -RESIZE_STEP_MS : RESIZE_STEP_MS));
      }}
    />
  );
}

export type CalendarCoordinator = {
  coordinatorId: number;
  name: string;
  events: CalendarEvent[];
};

const SLOT_HEIGHT = 26;
const HOURS_IN_DAY = 24;
const CALENDAR_TIME_ZONE = "Asia/Singapore";

// No red: red marks a requested period that overlaps existing time.
const COORDINATOR_COLORS = [
  "#4F46E5",
  "#2563EB",
  "#0D9488",
  "#16A34A",
  "#CA8A04",
  "#0E7490",
  "#7C3AED",
  "#BE1882",
];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  AWAITING_CLARIFICATION: "Awaiting Clarification",
  PLANNING: "Planning",
  SAFETY_REVIEW: "Safety Review",
  PREPARATION: "Preparation",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

function getCoordinatorColor(id: number): string {
  return COORDINATOR_COLORS[id % COORDINATOR_COLORS.length];
}

function getTextColor(backgroundColor: string): string {
  const r = parseInt(backgroundColor.slice(1, 3), 16);
  const g = parseInt(backgroundColor.slice(3, 5), 16);
  const b = parseInt(backgroundColor.slice(5, 7), 16);

  function sRGB(c: number): number {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  const luminance = 0.2126 * sRGB(r) + 0.7152 * sRGB(g) + 0.0722 * sRGB(b);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkLuminance = 0.2126 * sRGB(32) + 0.7152 * sRGB(33) + 0.0722 * sRGB(36);
  const darkContrast = (luminance + 0.05) / (darkLuminance + 0.05);
  return darkContrast >= whiteContrast ? "#202124" : "#ffffff";
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

function addMonths(date: Date, months: number): Date {
  return shiftCalendarMonth(date, months);
}

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  const month = d.getMonth();
  d.setDate(1);
  d.setFullYear(d.getFullYear() + years);
  d.setDate(Math.min(date.getDate(), new Date(d.getFullYear(), month + 1, 0).getDate()));
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const timeFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});


const monthFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore",
  month: "long",
  year: "numeric",
});

const yearFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: CALENDAR_TIME_ZONE,
  year: "numeric",
});

const fullDateFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: CALENDAR_TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

const weekdayShortArr = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(date: Date): string {
  return timeFormat.format(date);
}

function formatMonthLabel(date: Date): string {
  return monthFormat.format(calendarLabelInstant(date));
}

function formatYearLabel(date: Date): string {
  return yearFormat.format(calendarLabelInstant(date));
}

function dateToMinutes(date: Date): number {
  const parts = timeFormat.formatToParts(date);
  const value = (type: "hour" | "minute") => Number(parts.find((part) => part.type === type)?.value);
  return value("hour") * 60 + value("minute");
}

type ParsedEvent = CalendarEvent & {
  startMin: number;
  endMin: number;
};

export type LayoutEvent = ParsedEvent & {
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
  color: string;
};

function layoutDayEvents(
  events: CalendarEvent[],
  day: Date,
  colorMap: Map<number, string>,
): LayoutEvent[] {
  const bounds = calendarDayBounds(day);

  const items: ParsedEvent[] = events
    .filter((event) => overlapsCalendarDay(event.startDatetime, event.endDatetime, day))
    .map((e) => {
      const startMs = new Date(e.startDatetime).getTime();
      const endMs = new Date(e.endDatetime).getTime();
      const startMin = (Math.max(startMs, bounds.start) - bounds.start) / 60_000;
      const endMin = (Math.min(endMs, bounds.end) - bounds.start) / 60_000;
      return { ...e, startMin, endMin };
    })
    .sort((a, b) => a.startMin - b.startMin);

  if (items.length === 0) return [];

  const clusters: ParsedEvent[][] = [];
  for (const item of items) {
    let placed = false;
    for (const cluster of clusters) {
      if (
        cluster.some(
          (c) => item.startMin < c.endMin && c.startMin < item.endMin,
        )
      ) {
        cluster.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([item]);
  }

  const results: LayoutEvent[] = [];
  let zIndexCounter = 0;

  for (const cluster of clusters) {
    const lanes: ParsedEvent[][] = [];

    for (const item of cluster) {
      let lane = -1;
      for (let i = 0; i < lanes.length; i++) {
        const conflicts = lanes[i].some(
          (c) => item.startMin < c.endMin && c.startMin < item.endMin,
        );
        if (!conflicts) {
          lane = i;
          break;
        }
      }
      if (lane === -1) {
        lane = lanes.length;
        lanes.push([]);
      }
      lanes[lane].push(item);
    }

    const laneCount = Math.max(lanes.length, 1);
    const totalMinutes = 24 * 60;

    for (const item of cluster) {
      const laneIdx = lanes.findIndex((l) => l.includes(item));
      const color = colorMap.get(item.coordinatorId ?? 0) ?? "#999";
      const top = (item.startMin / totalMinutes) * 100;
      const height = Math.max(
        ((item.endMin - item.startMin) / totalMinutes) * 100,
        1.5,
      );
      const width = 100 / laneCount;
      const left = laneIdx * width;

      results.push({
        ...item,
        top,
        height,
        left,
        width,
        zIndex: zIndexCounter++,
        color,
      });
    }
  }

  return results;
}

function CoordinatorLegend({
  coordinators,
  visibleIds,
  onToggle,
  onSetVisibleIds,
  colorMap,
  entityLabel = COORDINATOR_LABEL,
}: {
  coordinators: CalendarCoordinator[];
  visibleIds: Set<number>;
  onToggle: (id: number) => void;
  onSetVisibleIds: (ids: Set<number>) => void;
  colorMap: Map<number, string>;
  entityLabel?: CalendarEntityLabel;
}) {
  const { singular, plural } = entityLabel;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of coordinators) {
      counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
    }
    return counts;
  }, [coordinators]);

  const displayName = (c: CalendarCoordinator) => {
    const count = nameCounts.get(c.name) ?? 0;
    if (count > 1) return `${c.name} (#${c.coordinatorId})`;
    return c.name;
  };

  const allVisible = coordinators.length > 0 && coordinators.every((c) => visibleIds.has(c.coordinatorId));
  const noneVisible = coordinators.length > 0 && visibleIds.size === 0;

  const filtered = coordinators.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()),
  );

  if (coordinators.length === 0) {
    return null;
  }

  const selectedCoords = coordinators.filter((c) => visibleIds.has(c.coordinatorId));

  return (
    <div className="cal-legend" role="group" aria-label={`Filter by ${singular}`}>
      <button
        type="button"
        className="cal-legend-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="cal-legend-trigger-label">
          {selectedCoords.length === coordinators.length ? `All ${plural}`
            : selectedCoords.length === 0 ? `No ${plural}`
            : `${selectedCoords.length} ${selectedCoords.length === 1 ? singular : plural}`}</span>
        <span className="cal-legend-trigger-arrow">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="cal-legend-panel" role="listbox">
          <div className="cal-legend-panel-header">
            <span className="cal-legend-panel-title">Filter {plural}</span>
            <button
              type="button"
              className="cal-legend-close"
              onClick={() => setOpen(false)}
              aria-label="Close filter"
            >
              ×
            </button>
          </div>
          <input
            className="cal-legend-search"
            type="search"
            placeholder={`Search ${plural}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={`Search ${plural}`}
          />
          <div className="cal-legend-actions">
            <button
              type="button"
              className="cal-legend-toggle"
              onClick={() => { onSetVisibleIds(new Set(coordinators.map((c) => c.coordinatorId))); setOpen(false); }}
              disabled={allVisible}
            >
              All
            </button>
            <button
              type="button"
              className="cal-legend-toggle"
              onClick={() => { onSetVisibleIds(new Set()); setOpen(false); }}
              disabled={noneVisible}
            >
              None
            </button>
          </div>
          <div className="cal-legend-list">
            {filtered.length === 0 ? (
              <p className="cal-legend-empty">No {plural} match.</p>
            ) : (
              filtered.map((coordinator) => {
                const color = colorMap.get(coordinator.coordinatorId) ?? "#999";
                const visible = visibleIds.has(coordinator.coordinatorId);
                return (
                  <label
                    key={coordinator.coordinatorId}
                    className="cal-legend-item"
                  >
                    <input
                      type="checkbox"
                      className="cal-legend-checkbox"
                      checked={visible}
                      onChange={() => onToggle(coordinator.coordinatorId)}
                      aria-label={displayName(coordinator)}
                    />
                    <span
                      className="cal-legend-swatch"
                      style={{ backgroundColor: color, opacity: visible ? 1 : 0.3 }}
                    />
                    <span className="cal-legend-name">{displayName(coordinator)}</span>
                    <span className="cal-legend-count">{coordinator.events.length}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}


function EventBlock({
  event,
  color,
  onClick,
  onHover,
}: {
  event: LayoutEvent;
  color: string;
  onClick?: (event: LayoutEvent) => void;
  onHover?: (event: LayoutEvent | null, x?: number, y?: number) => void;
}) {
  const isTerminal =
    event.status && ["COMPLETED", "REJECTED", "CANCELLED"].includes(event.status);
  const heightPct = event.height;
  const statusLabel = STATUS_LABELS[event.status ?? ""] ?? event.status;

  const style: CSSProperties = {
    top: `${event.top}%`,
    height: `${event.height}%`,
    left: `${event.left}%`,
    width: `${event.width}%`,
    backgroundColor: `color-mix(in srgb, ${color} 16%, white)`,
    color: "#202124",
    borderLeftColor: color,
    borderColor: `color-mix(in srgb, ${color} 28%, white)`,
    opacity: 1,
  };

  return (
    <div
      className={`cal-event-block${isTerminal ? " terminal" : ""}`}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(event);
      }}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onHover?.(event, rect.left + 8, rect.top + 8);
      }}
      onMouseLeave={() => onHover?.(null)}
      aria-label={`${formatTime(new Date(event.startDatetime))}–${formatTime(new Date(event.endDatetime))}: ${event.title}; ${statusLabel}`}
    >
      <span className="cal-event-color-strip" style={{ backgroundColor: color }} />
      {heightPct > 10 && (
        <>
          <small className="cal-event-time">
            {formatTime(new Date(event.startDatetime))} –{" "}
            {formatTime(new Date(event.endDatetime))}
          </small>
          <strong className="cal-event-title" title={event.title}>
            {event.title}
          </strong>
          <span className="cal-event-meta">
            {statusLabel}{event.organisation ? ` · ${event.organisation}` : ""}
          </span>
        </>
      )}
      {heightPct > 4 && heightPct <= 10 && (
        <span
          className="cal-event-mini"
          title={`${event.title} · ${statusLabel} · ${formatTime(new Date(event.startDatetime))} – ${formatTime(new Date(event.endDatetime))}`}
        >
          {formatTime(new Date(event.startDatetime))} · {event.title}
        </span>
      )}
      {heightPct <= 4 && (
        <span className="cal-event-tiny" title={`${event.title} · ${statusLabel}`} />
      )}
    </div>
  );
}

// The overlays that fall on one day, placed like events: a percentage of the day.
function OverlayBlocks({ overlays, day }: { overlays: CalendarOverlay[]; day: Date }) {
  const bounds = calendarDayBounds(day);
  const total = bounds.end - bounds.start;
  return (
    <>
      {overlays
        .filter((overlay) => overlapsCalendarDay(overlay.start, overlay.end, day))
        .map((overlay) => {
          const start = Math.max(new Date(overlay.start).getTime(), bounds.start);
          const end = Math.min(new Date(overlay.end).getTime(), bounds.end);
          const top = ((start - bounds.start) / total) * 100;
          const height = ((end - start) / total) * 100;
          const style: CSSProperties = { top: `${top}%`, height: `${height}%` };
          if (overlay.tone !== "request") {
            return <div key={overlay.id} className={`cal-overlay cal-overlay--${overlay.tone}`} style={style} aria-hidden="true" />;
          }
          // Only the label and handles take the pointer, so events under the block stay clickable.
          const overlayStart = new Date(overlay.start).getTime();
          const overlayEnd = new Date(overlay.end).getTime();
          return (
            <div key={overlay.id} className={`cal-overlay cal-overlay--request${overlay.resize ? " cal-overlay--resizable" : ""}`} style={style}>
              {overlay.resize && overlayStart >= bounds.start ? <ResizeHandle edge="start" instant={overlayStart} resize={overlay.resize} /> : null}
              {overlay.resize && overlayEnd <= bounds.end ? <ResizeHandle edge="end" instant={overlayEnd} resize={overlay.resize} /> : null}
              {overlay.label ? (
                <span className="cal-overlay-label" tabIndex={0} aria-label={[overlay.label, overlay.detail].filter(Boolean).join(". ")}>
                  {overlay.label}
                  {overlay.detail ? <span className="cal-overlay-tip" aria-hidden="true">{overlay.detail}</span> : null}
                </span>
              ) : null}
            </div>
          );
        })}
    </>
  );
}

function TimeGrid({
  hours,
  now,
  showNowLine,
  children,
}: {
  hours: { hour: number; label: string }[];
  now: Date;
  showNowLine: boolean;
  children: ReactElement | ReactElement[];
}) {
  const nowMinutes = dateToMinutes(now);
  const nowTop = (nowMinutes / (HOURS_IN_DAY * 60)) * 100;

  return (
    <div className="cal-time-grid">
      <div
        className="cal-time-gutter"
        style={{ height: `${hours.length * SLOT_HEIGHT}px` }}
      >
        {hours.map((slot) => (
          <div key={slot.hour} className="cal-time-row">
            <span className="cal-time-label">{slot.label}</span>
          </div>
        ))}
      </div>
      <div
        className="cal-day-columns"
        style={{ height: `${hours.length * SLOT_HEIGHT}px` }}
      >
        {children}
      </div>
      {showNowLine && (
        <div
          className="cal-now-line"
          style={{ top: `${nowTop}%` }}
          aria-label={`Current time: ${formatTime(now)}`}
        >
          <span className="cal-now-label">{formatTime(now)}</span>
        </div>
      )}
    </div>
  );
}

function WeekView({
  coordinators,
  currentDate,
  colorMap,
  visibleIds,
  onEventClick,
  onEventHover,
  onDayClick,
  selectedEvent,
  overlays = [],
}: {
  coordinators: CalendarCoordinator[];
  currentDate: Date;
  colorMap: Map<number, string>;
  visibleIds: Set<number>;
   onEventClick?: (event: LayoutEvent) => void;
  onEventHover?: (event: LayoutEvent | null, x?: number, y?: number) => void;
  onDayClick?: (date: Date) => void;
  selectedEvent?: CalendarEvent;
  overlays?: CalendarOverlay[];
}) {
  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = calendarDate(new Date());

  const hours = Array.from({ length: HOURS_IN_DAY }, (_, h) => {
    const slotDate = calendarHourInstant(h);
    return { hour: h, label: formatTime(slotDate) };
  });

  const visibleCoordinators = coordinators.filter((c) => visibleIds.has(c.coordinatorId));
  const allEvents = visibleCoordinators.flatMap((c) => c.events);
  const now = new Date();
  const showNowLine = days.some((d) => isSameDay(d, calendarDate(now)));

  return (
    <div className="cal-week-view">
      <div className="cal-week-header-row">
        <div className="cal-time-gutter-spacer" />
        {days.map((day) => {
          const isToday = isSameDay(day, today);
          const dayName = weekdayShortArr[day.getDay()];
          return (
            <button
              type="button"
              key={day.getTime()}
              className={`cal-week-day-header ${isToday ? "today" : ""}`}
              onClick={() => onDayClick?.(day)}
            >
              <span className="cal-week-day-name">{dayName}</span>
              {isToday ? (
                <span className="cal-week-day-num--today">{day.getDate()}</span>
              ) : (
                <span className="cal-week-day-num">{day.getDate()}</span>
              )}
            </button>
          );
        })}
      </div>

      <div
        className="cal-week-time-grid-wrap"
        ref={(el) => {
          if (el) {
            const firstEvent = allEvents
              .map((e) => new Date(e.startDatetime).getTime())
              .sort((a, b) => a - b)[0];
            const nowMs = now.getTime();
            const targetTime = firstEvent !== undefined ? firstEvent : nowMs;
            const targetTop = (dateToMinutes(new Date(targetTime)) / (HOURS_IN_DAY * 60)) * 100;
            const scrollToPx = (targetTop / 100) * el.scrollHeight - 60;
            if (scrollToPx > 0) el.scrollTop = scrollToPx;
          }
        }}
      >
        <TimeGrid
          hours={hours}
          now={now}
          showNowLine={showNowLine}
        >
          {days.map((day) => {
            const layouted = layoutDayEvents(allEvents, day, colorMap);
            const selectedLayouted =
              selectedEvent && overlapsCalendarDay(selectedEvent.startDatetime, selectedEvent.endDatetime, day)
                ? layoutDayEvents([selectedEvent], day, colorMap)
                : [];

            return (
              <div key={day.getTime()} className="cal-day-column" data-day-start={calendarDayBounds(day).start} data-day-end={calendarDayBounds(day).end}>
                <OverlayBlocks overlays={overlays} day={day} />
                {layouted.map((event) => (
                  <EventBlock
                    key={event.eventId}
                    event={event}
                    color={event.color}
                    onClick={onEventClick}
                    onHover={onEventHover}
                  />
                ))}
                {selectedLayouted.map((event, i) => (
                  <div
                    key={`selected-${i}`}
                    className="cal-event-phantom"
                    style={{
                      top: `${event.top}%`,
                      height: `${event.height}%`,
                      backgroundColor: "#DC2626",
                      opacity: 0.25,
                    }}
                    aria-label={`Unassigned: ${event.title}`}
                  />
                ))}
              </div>
            );
          })}
        </TimeGrid>
      </div>
    </div>
  );
}

function DayView({
  coordinators,
  currentDate,
  colorMap,
  visibleIds,
  onEventClick,
  onEventHover,
  selectedEvent,
  overlays = [],
}: {
  coordinators: CalendarCoordinator[];
  currentDate: Date;
  colorMap: Map<number, string>;
  visibleIds: Set<number>;
  onEventClick?: (event: LayoutEvent) => void;
  onEventHover?: (event: LayoutEvent | null, x?: number, y?: number) => void;
  selectedEvent?: CalendarEvent;
  overlays?: CalendarOverlay[];
}) {
  const today = calendarDate(new Date());
  const isToday = isSameDay(currentDate, today);

  const hours = Array.from({ length: HOURS_IN_DAY }, (_, h) => {
    const slotDate = calendarHourInstant(h);
    return { hour: h, label: formatTime(slotDate) };
  });

  const visibleCoordinators = coordinators.filter((c) => visibleIds.has(c.coordinatorId));
  const allEvents = visibleCoordinators.flatMap((c) => c.events);
  const now = new Date();

  return (
    <div className="cal-day-view">
      <div className="cal-day-header-row">
        <div className="cal-time-gutter-spacer" />
        <div className="cal-day-title">
          <span className="cal-day-name">
            {weekdayShortArr[currentDate.getDay()]}
          </span>
          <span className={`cal-day-num ${isToday ? "today" : ""}`}>
            {currentDate.getDate()}
          </span>
        </div>
      </div>

      <div
        className="cal-day-time-grid-wrap"
        ref={(el) => {
          if (el) {
            const firstEvent = allEvents
              .map((e) => new Date(e.startDatetime).getTime())
              .sort((a, b) => a - b)[0];
            const nowMs = now.getTime();
            const targetTime = firstEvent !== undefined ? firstEvent : nowMs;
            const targetTop = (dateToMinutes(new Date(targetTime)) / (HOURS_IN_DAY * 60)) * 100;
            const scrollToPx = (targetTop / 100) * el.scrollHeight - 60;
            if (scrollToPx > 0) el.scrollTop = scrollToPx;
          }
        }}
      >
        <TimeGrid
          hours={hours}
          now={now}
          showNowLine={isToday}
        >
          <div className="cal-day-column" data-day-start={calendarDayBounds(currentDate).start} data-day-end={calendarDayBounds(currentDate).end}>
            <OverlayBlocks overlays={overlays} day={currentDate} />
            {layoutDayEvents(allEvents, currentDate, colorMap).map((event) => (
              <EventBlock
                key={event.eventId}
                event={event}
                color={event.color}
                onClick={onEventClick}
                onHover={onEventHover}
              />
            ))}
            {selectedEvent &&
              overlapsCalendarDay(selectedEvent.startDatetime, selectedEvent.endDatetime, currentDate) && (
                <div
                  className="cal-event-phantom"
                  style={{
                    top: `${layoutDayEvents([selectedEvent], currentDate, colorMap)[0]?.top ?? 0}%`,
                    height: `${layoutDayEvents([selectedEvent], currentDate, colorMap)[0]?.height ?? 0}%`,
                    backgroundColor: "#DC2626",
                    opacity: 0.25,
                  }}
                  aria-label={`Unassigned: ${selectedEvent.title}`}
                />
              )}
          </div>
        </TimeGrid>
      </div>
    </div>
  );
}

// Month "bars" (developer request of 25 October 2026, after Google Calendar's
// month view): each entry is a labelled bar across its days, kept in the same
// lane through a week so a multi-day bar reads as one. The checked request is
// a yellow bar, red where it overlaps existing time.
type MonthItem = {
  key: string;
  start: string;
  end: string;
  label: string;
  color?: string;
  event?: CalendarEvent;
  tone?: "request" | "conflict";
};
const MONTH_LANES = 3;

function weekLanes(items: MonthItem[], week: Date[]) {
  const placed: { item: MonthItem; from: number; to: number; lane: number }[] = [];
  const spans = items
    .map((item) => {
      const days = week.map((day, index) => (overlapsCalendarDay(item.start, item.end, day) ? index : -1)).filter((index) => index >= 0);
      return days.length ? { item, from: days[0], to: days[days.length - 1] } : null;
    })
    .filter((span): span is { item: MonthItem; from: number; to: number } => span !== null)
    .sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from));
  for (const span of spans) {
    let lane = 0;
    while (placed.some((other) => other.lane === lane && other.from <= span.to && span.from <= other.to)) lane += 1;
    placed.push({ ...span, lane });
  }
  return placed;
}

function MonthView({
  coordinators,
  currentDate,
  colorMap,
  onDayClick,
  bars = false,
  overlays = [],
  onEventClick,
}: {
  coordinators: CalendarCoordinator[];
  currentDate: Date;
  colorMap: Map<number, string>;
  onDayClick?: (date: Date) => void;
  bars?: boolean;
  overlays?: CalendarOverlay[];
  onEventClick?: (event: CalendarEvent) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const firstDayOfMonth = monthStart.getDay();
  const daysInMonth = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0,
  ).getDate();
  const daysInPrevMonth = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    0,
  ).getDate();
  const today = calendarDate(new Date());

  const weeks: Date[][] = [];
  let day = 1 - firstDayOfMonth;
  for (let w = 0; w < 6; w++) {
    const weekDays: Date[] = [];
    for (let d = 0; d < 7; d++) {
      let date: Date;
      if (day < 1) {
        date = new Date(
          monthStart.getFullYear(),
          monthStart.getMonth() - 1,
          daysInPrevMonth + day,
        );
      } else if (day > daysInMonth) {
        date = new Date(
          monthStart.getFullYear(),
          monthStart.getMonth() + 1,
          day - daysInMonth,
        );
      } else {
        date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
      }
      weekDays.push(date);
      day++;
    }
    weeks.push(weekDays);
    if (day > daysInMonth && w > 2) break;
  }

  return (
    <div className="cal-month-view">
      <div className="cal-month-header">
        {weekdayShortArr.map((d, i) => (
          <div key={i} className="cal-month-dow">
            {d}
          </div>
        ))}
      </div>
      <div className="cal-month-grid">
        {bars ? weeks.map((week, wi) => {
          const items: MonthItem[] = [
            ...overlays.filter((overlay) => overlay.tone === "request").map((overlay) => ({
              key: overlay.id, start: overlay.start, end: overlay.end, label: overlay.label ?? "Requested period", tone: "request" as const,
            })),
            ...coordinators.flatMap((coordinator) => coordinator.events.map((event) => ({
              key: `event-${event.eventId}`, start: event.startDatetime, end: event.endDatetime,
              label: `${formatTime(new Date(event.startDatetime))} ${event.title}`, color: colorMap.get(coordinator.coordinatorId), event,
            }))),
          ];
          const conflicts = overlays.filter((overlay) => overlay.tone === "conflict");
          const lanes = weekLanes(items, week);
          return (
            <div key={wi} className="cal-month-week">
              {week.map((date, dayIndex) => {
                const here = lanes.filter((entry) => entry.from <= dayIndex && dayIndex <= entry.to);
                const hidden = here.filter((entry) => entry.lane >= MONTH_LANES).length;
                return (
                  <div key={date.getTime()} className={`cal-month-day cal-month-day--bars ${date.getMonth() !== monthStart.getMonth() ? "other-month" : ""} ${isSameDay(date, today) ? "today" : ""}`}>
                    <button type="button" className="cal-month-day-number" aria-label={`Open ${fullDateFormat.format(calendarLabelInstant(date))}`} onClick={() => onDayClick?.(date)}>
                      {date.getDate()}
                    </button>
                    {Array.from({ length: MONTH_LANES }, (_, lane) => {
                      const entry = here.find((candidate) => candidate.lane === lane);
                      if (!entry) return <span key={lane} className="cal-month-bar-spacer" aria-hidden="true" />;
                      const first = dayIndex === entry.from;
                      const shape = `${first ? " is-start" : ""}${dayIndex === entry.to ? " is-end" : ""}`;
                      if (entry.item.tone === "request") {
                        const clash = conflicts.some((overlay) => overlapsCalendarDay(overlay.start, overlay.end, date));
                        return (
                          <span key={lane} className={`cal-month-bar cal-month-bar--request${clash ? " has-conflict" : ""}${shape}`} title={entry.item.label}>
                            {first ? entry.item.label : <span className="sr-only">{entry.item.label}</span>}
                          </span>
                        );
                      }
                      const color = entry.item.color ?? "#4F46E5";
                      return (
                        <button
                          key={lane}
                          type="button"
                          className={`cal-month-bar${shape}`}
                          style={{ backgroundColor: color, color: getTextColor(color) }}
                          title={entry.item.label}
                          aria-label={entry.item.label}
                          onClick={() => entry.item.event && onEventClick?.(entry.item.event)}
                        >
                          {first ? entry.item.label : null}
                        </button>
                      );
                    })}
                    {hidden ? <span className="cal-month-dot-more">+{hidden} more</span> : null}
                  </div>
                );
              })}
            </div>
          );
        }) : weeks.map((week, wi) => (
          <div key={wi} className="cal-month-week">
            {week.map((date) => {
              const isOtherMonth = date.getMonth() !== monthStart.getMonth();
              const isToday = isSameDay(date, today);
              const dots = getCoordinatorDots(coordinators, colorMap, date);

              return (
                <button
                  type="button"
                  key={date.getTime()}
                  className={`cal-month-day ${
                    isOtherMonth ? "other-month" : ""
                  } ${isToday ? "today" : ""}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onDayClick?.(date);
                  }}
                >
                  <span className="cal-month-day-number">{date.getDate()}</span>
                  {dots.length > 0 && (
                    <div className="cal-month-dots">
                      {dots.slice(0, 3).map((dot) => (
                        <span
                          key={dot.coordinatorId}
                          className="cal-month-dot"
                          style={{ backgroundColor: dot.color }}
                          title={`${dot.name} has an event`}
                        />
                      ))}
                      {dots.length > 3 && (
                        <span className="cal-month-dot-more">
                          +{dots.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function YearView({
  coordinators,
  currentDate,
  colorMap,
  onMonthClick,
  bars = false,
  overlays = [],
}: {
  coordinators: CalendarCoordinator[];
  currentDate: Date;
  colorMap: Map<number, string>;
  onMonthClick?: (date: Date) => void;
  bars?: boolean;
  overlays?: CalendarOverlay[];
}) {
  const yearStart = startOfYear(currentDate);
  const months = Array.from({ length: 12 }, (_, i) =>
    addMonths(yearStart, i),
  );

  return (
    <div className="cal-year-view">
      <div className="cal-year-grid">
        {months.map((monthStart) => (
          <div key={monthStart.getTime()} className="cal-year-month">
            <button
              type="button"
              className="cal-year-month-header"
              onClick={() => onMonthClick?.(monthStart)}
            >
              {formatMonthLabel(monthStart)}
            </button>
            <div className="cal-year-month-days">
              {(() => {
                const daysInMonth = new Date(
                  monthStart.getFullYear(),
                  monthStart.getMonth() + 1,
                  0,
                ).getDate();
                const firstDay = monthStart.getDay();
                const cells: ReactElement[] = [];
                for (let i = 0; i < firstDay; i++) {
                  cells.push(
                    <div key={`empty-${i}`} className="cal-year-day empty" />,
                  );
                }
                for (let d = 1; d <= daysInMonth; d++) {
                  const date = new Date(
                    monthStart.getFullYear(),
                    monthStart.getMonth(),
                    d,
                  );
                  const dots = getCoordinatorDots(
                    coordinators,
                    colorMap,
                    date,
                  );
                  // With bars on, a busy day is tinted in its venue's colour and
                  // the requested days are yellow (red where they clash).
                  const requested = bars && overlays.some((overlay) => overlay.tone === "request" && overlapsCalendarDay(overlay.start, overlay.end, date));
                  const clash = requested && overlays.some((overlay) => overlay.tone === "conflict" && overlapsCalendarDay(overlay.start, overlay.end, date));
                  const tint = bars && dots.length ? { backgroundColor: `color-mix(in srgb, ${dots[0].color} 22%, white)` } : undefined;
                  cells.push(
                    <div
                      key={d}
                      className={`cal-year-day ${
                        dots.length > 0 ? "has-events" : ""
                      }${requested ? " is-requested" : ""}${clash ? " has-conflict" : ""}`}
                      style={tint}
                      title={bars && dots.length ? dots.map((dot) => dot.name).join(", ") : undefined}
                    >
                      <span className="cal-year-day-number">{d}</span>
                      {dots.length > 0 && (
                        <div className="cal-year-dots">
                          {dots.slice(0, 3).map((dot) => (
                            <span
                              key={dot.coordinatorId}
                              className="cal-year-dot"
                              style={{ backgroundColor: dot.color }}
                              title={`${dot.name} has an event`}
                            />
                          ))}
                        </div>
                      )}
                    </div>,
                  );
                }
                return cells;
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type CoordinatorDot = {
  coordinatorId: number;
  color: string;
  name: string;
};

function getCoordinatorDots(
  coordinators: CalendarCoordinator[],
  colorMap: Map<number, string>,
  date: Date,
): CoordinatorDot[] {
  const seen = new Map<number, CoordinatorDot>();
  for (const coordinator of coordinators) {
    const hasEvent = coordinator.events.some((event) =>
      overlapsCalendarDay(event.startDatetime, event.endDatetime, date),
    );
    if (hasEvent && !seen.has(coordinator.coordinatorId)) {
      seen.set(coordinator.coordinatorId, {
        coordinatorId: coordinator.coordinatorId,
        color: colorMap.get(coordinator.coordinatorId) ?? "#999",
        name: coordinator.name,
      });
    }
  }
  return Array.from(seen.values());
}

function CalendarTooltip({
  event,
  coordinators,
  x,
  y,
}: {
  event: LayoutEvent;
  coordinators: CalendarCoordinator[];
  x: number;
  y: number;
}) {
  const coord = coordinators.find((c) => c.coordinatorId === event.coordinatorId);
  const color = event.color;
  const statusLabel = STATUS_LABELS[event.status ?? ""] ?? event.status ?? "Unknown";

  return (
    <div
      className="cal-tooltip"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      <div className="cal-tooltip-title">{event.title}</div>
      {event.purpose && (
        <div className="cal-tooltip-purpose">{event.purpose}</div>
      )}
      <div className="cal-tooltip-row">
        <span
          className="cal-tooltip-dot"
          style={{ backgroundColor: color }}
        />
        <span>{coord?.name ?? "Unknown coordinator"}</span>
      </div>
      <div className="cal-tooltip-time">
        {formatTime(new Date(event.startDatetime))}{" – "}
        {formatTime(new Date(event.endDatetime))}
      </div>
      {event.preferredLayoutType && event.preferredLayoutType !== "NO_PREFERENCE" && (
        <div className="cal-tooltip-row">
          <span className="cal-tooltip-dot" style={{ backgroundColor: "#64748b" }} />
          <span>Layout: {event.preferredLayoutType}</span>
        </div>
      )}
      {event.isRegistrationEnabled && (
        <div className="cal-tooltip-row">
          <span className="cal-tooltip-dot" style={{ backgroundColor: "#16A34A" }} />
          <span>
            Registration: {event.registrationCapacity ? `${event.registrationCapacity} seats` : "Open"}
          </span>
        </div>
      )}
      {event.status && (
          <span className="cal-tag" title={statusLabel}>
            {statusLabel}
          </span>
      )}
    </div>
  );
}

function EventPopover({
  event,
  coordinators,
  onClose,
  selectedCoordinatorId,
  onSelectCoordinator,
}: {
  event: LayoutEvent;
  coordinators: CalendarCoordinator[];
  onClose: () => void;
  selectedCoordinatorId?: number | null;
  onSelectCoordinator?: (id: number) => void;
}) {
  const coord = coordinators.find((c) => c.coordinatorId === event.coordinatorId);
  const color = event.color;
  const textColor = getTextColor(color);
  const statusLabel = STATUS_LABELS[event.status ?? ""] ?? event.status ?? "Unknown";
  const [showDetails, setShowDetails] = useState(false);

  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of coordinators) {
      counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
    }
    return counts;
  }, [coordinators]);

  const displayName = coord
    ? nameCounts.get(coord.name) && nameCounts.get(coord.name)! > 1
      ? `${coord.name} (#${coord.coordinatorId})`
      : coord.name
    : "Unassigned";

  const formatDateRange = () => {
    const start = new Date(event.startDatetime);
    const end = new Date(event.endDatetime);
    const dateStr = start.toLocaleDateString("en-SG", {
      timeZone: "Asia/Singapore",
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const startStr = start.toLocaleTimeString("en-SG", {
      timeZone: "Asia/Singapore",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const endStr = end.toLocaleTimeString("en-SG", {
      timeZone: "Asia/Singapore",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    return { dateStr, startStr, endStr };
  };

  const { dateStr, startStr, endStr } = formatDateRange();

  return (
    <div className="cal-popover-backdrop" onClick={onClose}>
      <div
        className="cal-popover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cal-popover-header">
          <span
            className="cal-popover-swatch"
            style={{ backgroundColor: color, color: textColor }}
          />
          <h3 className="cal-popover-title">{event.title}</h3>
          <button
            type="button"
            className="cal-popover-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="cal-popover-body">
          <div className="cal-popover-summary">
            <div className="cal-popover-time">
              <span className="cal-popover-time-date">{dateStr}</span>
              <span className="cal-popover-time-range">{startStr} – {endStr}</span>
            </div>

            <div className="cal-popover-coordinator">
              <span className="cal-popover-coord-dot" style={{ backgroundColor: color }} />
              <span className="cal-popover-coord-name">{displayName}</span>
            </div>

            <span className="cal-tag">
              {statusLabel}
            </span>
          </div>

          <div className="cal-popover-divider" />

          <button
            type="button"
            className="cal-popover-details-toggle"
            onClick={() => setShowDetails(!showDetails)}
            aria-expanded={showDetails}
          >
            <span>Event details</span>
            <span className={`cal-popover-chevron ${showDetails ? "open" : ""}`}>▼</span>
          </button>

          {showDetails && (
            <div className="cal-popover-details-grid">
              {event.purpose && (
                <div>
                  <div className="cal-popover-meta-label">Purpose</div>
                  <div className="cal-popover-meta-value">{event.purpose}</div>
                </div>
              )}
              {event.description && (
                <div>
                  <div className="cal-popover-meta-label">Description</div>
                  <div className="cal-popover-meta-value">{event.description}</div>
                </div>
              )}
              {event.expectedAttendance && (
                <div>
                  <div className="cal-popover-meta-label">Attendance</div>
                  <div className="cal-popover-meta-value">{event.expectedAttendance} people</div>
                </div>
              )}
              {event.organisation && (
                <div>
                  <div className="cal-popover-meta-label">Organisation</div>
                  <div className="cal-popover-meta-value">{event.organisation}</div>
                </div>
              )}
              {event.requestId && (
                <div>
                  <div className="cal-popover-meta-label">Request ID</div>
                  <div className="cal-popover-meta-value">{event.requestId}</div>
                </div>
              )}
              {event.createdAt && (
                <div>
                  <div className="cal-popover-meta-label">Created</div>
                  <div className="cal-popover-meta-value">
                    {new Date(event.createdAt).toLocaleDateString("en-SG", {
                      timeZone: "Asia/Singapore",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
              )}
              {event.preferredLayoutType && event.preferredLayoutType !== "NO_PREFERENCE" && (
                <div>
                  <div className="cal-popover-meta-label">Layout</div>
                  <div className="cal-popover-meta-value">{event.preferredLayoutType}</div>
                </div>
              )}
              {event.accessibilityNeeds && (
                <div>
                  <div className="cal-popover-meta-label">Accessibility</div>
                  <div className="cal-popover-meta-value">{event.accessibilityNeeds}</div>
                </div>
              )}
              {event.isRegistrationEnabled && (
                <div>
                  <div className="cal-popover-meta-label">Registration</div>
                  <div className="cal-popover-meta-value">
                    {event.registrationCapacity ? `${event.registrationCapacity} seats` : "Open"}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedCoordinatorId !== undefined && onSelectCoordinator && (
            <div className="cal-popover-actions">
              <label className="cal-popover-label">
                <span>Assign to</span>
                <select
                  className="cal-popover-select"
                  value={selectedCoordinatorId ?? ""}
                  onChange={(e) => onSelectCoordinator?.(Number(e.target.value))}
                >
                  {coordinators.map((c) => (
                    <option key={c.coordinatorId} value={c.coordinatorId}>
                      {nameCounts.get(c.name) && nameCounts.get(c.name)! > 1
                        ? `${c.name} (#${c.coordinatorId})`
                        : c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export type CalendarViewProps = {
  coordinators: CalendarCoordinator[];
  selectedCoordinatorId?: number | null;
  onSelectCoordinator?: (id: number) => void;
  selectedEvent?: CalendarEvent;
  onEventClick?: (event: CalendarEvent) => void;
  defaultView?: CalendarViewMode;
  viewMode?: CalendarViewMode;
  onViewModeChange?: (mode: CalendarViewMode) => void;
  currentDate?: Date;
  onCurrentDateChange?: (date: Date) => void;
  entityLabel?: CalendarEntityLabel;
  overlays?: CalendarOverlay[];
  // Month view as labelled bars (and tinted days in the year view) instead of dots.
  monthBars?: boolean;
  // The "All <plural>" filter above the grid; off where the page already picks
  // the lanes, as the venue calendar does (SPM-186).
  laneFilter?: boolean;
};

export function CalendarView({
  coordinators,
  selectedCoordinatorId,
  onSelectCoordinator,
  selectedEvent,
  onEventClick,
  defaultView = "month",
  viewMode: controlledViewMode,
  onViewModeChange,
  currentDate: controlledDate,
  onCurrentDateChange,
  entityLabel = COORDINATOR_LABEL,
  overlays,
  monthBars = false,
  laneFilter = true,
}: CalendarViewProps) {
  const [internalViewMode, setInternalViewMode] = useState<CalendarViewMode>(
    defaultView,
  );
  const [internalCurrentDate, setInternalCurrentDate] = useState(() => calendarDate(new Date()));
  const [manualVisibleIds, setManualVisibleIds] = useState<Set<number> | null>(null);

  const visibleIds = useMemo(() => {
    if (manualVisibleIds === null) {
      return new Set(coordinators.map((c) => c.coordinatorId));
    }
    return manualVisibleIds;
  }, [manualVisibleIds, coordinators]);

  const [popoverEvent, setPopoverEvent] = useState<LayoutEvent | null>(null);
  const [tooltipEvent, setTooltipEvent] = useState<{
    event: LayoutEvent;
    x: number;
    y: number;
  } | null>(null);

  const effectiveViewMode = controlledViewMode ?? internalViewMode;
  const effectiveCurrentDate = controlledDate ?? internalCurrentDate;

  const colorMap = useMemo(() => {
    const map = new Map<number, string>();
    coordinators.forEach((c) =>
      map.set(c.coordinatorId, getCoordinatorColor(c.coordinatorId)),
    );
    return map;
  }, [coordinators]);

  const visibleCoordinators = coordinators.filter((c) =>
    visibleIds.has(c.coordinatorId),
  );

  const handleViewModeChange = (mode: CalendarViewMode) => {
    onViewModeChange?.(mode);
    setInternalViewMode(mode);
  };

  const handleCurrentDateChange = (date: Date) => {
    onCurrentDateChange?.(date);
    setInternalCurrentDate(date);
  };

   const handleDayClick = (date: Date) => {
     setInternalCurrentDate(date);
     onCurrentDateChange?.(date);
     setInternalViewMode("day");
     onViewModeChange?.("day");
   };

   const handleMonthClick = (date: Date) => {
     setInternalCurrentDate(date);
     onCurrentDateChange?.(date);
     setInternalViewMode("month");
     onViewModeChange?.("month");
   };

  const toggleCoordinator = (id: number) => {
    setManualVisibleIds((prev) => {
      const next = new Set(prev ?? coordinators.map((coordinator) => coordinator.coordinatorId));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePrev = () => {
    switch (effectiveViewMode) {
      case "year":
        handleCurrentDateChange(addYears(effectiveCurrentDate, -1));
        break;
      case "month":
        handleCurrentDateChange(addMonths(effectiveCurrentDate, -1));
        break;
      case "week":
        handleCurrentDateChange(addWeeks(effectiveCurrentDate, -1));
        break;
      case "day":
        handleCurrentDateChange(addDays(effectiveCurrentDate, -1));
        break;
    }
  };

  const handleNext = () => {
    switch (effectiveViewMode) {
      case "year":
        handleCurrentDateChange(addYears(effectiveCurrentDate, 1));
        break;
      case "month":
        handleCurrentDateChange(addMonths(effectiveCurrentDate, 1));
        break;
      case "week":
        handleCurrentDateChange(addWeeks(effectiveCurrentDate, 1));
        break;
      case "day":
        handleCurrentDateChange(addDays(effectiveCurrentDate, 1));
        break;
    }
  };

  const handleToday = () => {
    handleCurrentDateChange(calendarDate(new Date()));
  };

  const title = (() => {
    switch (effectiveViewMode) {
      case "year":
        return formatYearLabel(effectiveCurrentDate);
      case "month":
        return formatMonthLabel(effectiveCurrentDate);
      case "week": {
        const ws = startOfWeek(effectiveCurrentDate);
        const we = addDays(ws, 6);
        const wsStr = weekdayShortArr[ws.getDay()];
        const weStr = weekdayShortArr[we.getDay()];
        return `${wsStr} ${ws.getDate()}, ${formatMonthLabel(ws).split(",")[0]} – ${weStr} ${we.getDate()}`;
      }
      case "day": {
        const d = weekdayShortArr[effectiveCurrentDate.getDay()];
        return `${d}, ${fullDateFormat.format(calendarLabelInstant(effectiveCurrentDate))}`;
      }
    }
  })();

  if (coordinators.length === 0) {
    return (
      <div className={styles.scope}>
        <div className="calendar-view">
          <div className="calendar-empty">
            <p>No {entityLabel.plural} with events to display.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.scope}>
      <div className="calendar-view" onClick={() => setPopoverEvent(null)}>
        <div className="calendar-toolbar">
          <div className="calendar-nav">
            <button
              className="cal-btn"
              onClick={handlePrev}
              aria-label="Previous"
            >
              ‹
            </button>
            <button
              className="cal-btn cal-btn--today"
              onClick={handleToday}
            >
              Today
            </button>
            <button className="cal-btn" onClick={handleNext} aria-label="Next">
              ›
            </button>
          </div>
          <div className="calendar-title">{title}</div>
          <div
            className="calendar-views"
            role="group"
            aria-label="Calendar views"
          >
            {(["year", "month", "week", "day"] as CalendarViewMode[]).map(
              (mode) => (
                <button
                  key={mode}
                  className={`cal-view-btn ${
                    effectiveViewMode === mode ? "active" : ""
                  }`}
                  onClick={() => handleViewModeChange(mode)}
                  aria-pressed={effectiveViewMode === mode}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ),
            )}
          </div>
        </div>


      {laneFilter ? (
          <CoordinatorLegend
            coordinators={coordinators}
            visibleIds={visibleIds}
            onToggle={toggleCoordinator}
            onSetVisibleIds={setManualVisibleIds}
            colorMap={colorMap}
            entityLabel={entityLabel}
          />
      ) : null}

        <div className="calendar-grid-wrapper">
          {visibleCoordinators.length === 0 ? (
            <div className="calendar-empty">
              <p>
                No {entityLabel.plural} selected. Click a name in the legend above to
                show their events.
              </p>
            </div>
          ) : (
            <>
              {effectiveViewMode === "year" && (
                <YearView
                  coordinators={visibleCoordinators}
                  currentDate={effectiveCurrentDate}
                  colorMap={colorMap}
                  onMonthClick={handleMonthClick}
                  bars={monthBars}
                  overlays={overlays}
                />
              )}
              {effectiveViewMode === "month" && (
                <MonthView
                  coordinators={visibleCoordinators}
                  currentDate={effectiveCurrentDate}
                  colorMap={colorMap}
                  onDayClick={handleDayClick}
                  bars={monthBars}
                  overlays={overlays}
                  onEventClick={onEventClick}
                />
              )}
              {effectiveViewMode === "week" && (
                <WeekView
                  coordinators={visibleCoordinators}
                  currentDate={effectiveCurrentDate}
                  colorMap={colorMap}
                  visibleIds={visibleIds}
                  onEventClick={(e) => {
                    if (onEventClick) {
                      onEventClick(e);
                    } else {
                      setPopoverEvent(e);
                    }
                  }}
                  onEventHover={(e, x, y) => {
                    if (e) setTooltipEvent({ event: e, x: x ?? 0, y: y ?? 0 });
                    else setTooltipEvent(null);
                  }}
                  selectedEvent={selectedEvent}
                  overlays={overlays}
                />
              )}
              {effectiveViewMode === "day" && (
                <DayView
                  coordinators={visibleCoordinators}
                  currentDate={effectiveCurrentDate}
                  colorMap={colorMap}
                  visibleIds={visibleIds}
                  onEventClick={(e) => {
                    if (onEventClick) {
                      onEventClick(e);
                    } else {
                      setPopoverEvent(e);
                    }
                  }}
                  onEventHover={(e, x, y) => {
                    if (e) setTooltipEvent({ event: e, x: x ?? 0, y: y ?? 0 });
                    else setTooltipEvent(null);
                  }}
                  selectedEvent={selectedEvent}
                  overlays={overlays}
                />
              )}
            </>
          )}
        </div>

        {tooltipEvent && (
          <CalendarTooltip
            event={tooltipEvent.event}
            coordinators={coordinators}
            x={tooltipEvent.x}
            y={tooltipEvent.y}
          />
        )}

        {popoverEvent && (
          <EventPopover
            event={popoverEvent}
            coordinators={coordinators}
            onClose={() => setPopoverEvent(null)}
            selectedCoordinatorId={selectedCoordinatorId}
            onSelectCoordinator={onSelectCoordinator}
          />
        )}
      </div>
    </div>
  );
}
