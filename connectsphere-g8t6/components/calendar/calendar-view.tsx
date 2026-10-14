"use client";

import {
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";

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

export type CalendarCoordinator = {
  coordinatorId: number;
  name: string;
  events: CalendarEvent[];
};

const SLOT_HEIGHT = 26;
const HOURS_IN_DAY = 24;

const COORDINATOR_COLORS = [
  "#4F46E5",
  "#2563EB",
  "#0D9488",
  "#16A34A",
  "#CA8A04",
  "#DC2626",
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
  return luminance > 0.5 ? "#1b1b21" : "#ffffff";
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
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
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
  timeZone: "Asia/Singapore",
  year: "numeric",
});

const weekdayShortArr = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(date: Date): string {
  return timeFormat.format(date);
}

function formatMonthLabel(date: Date): string {
  return monthFormat.format(date);
}

function formatYearLabel(date: Date): string {
  return yearFormat.format(date);
}

function dateToMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
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
  const dayStart = startOfDay(day);

  const items: ParsedEvent[] = events
    .filter((e) => {
      const start = new Date(e.startDatetime);
      return (
        start.getFullYear() === dayStart.getFullYear() &&
        start.getMonth() === dayStart.getMonth() &&
        start.getDate() === dayStart.getDate()
      );
    })
    .map((e) => {
      const startMs = new Date(e.startDatetime).getTime();
      const endMs = new Date(e.endDatetime).getTime();
      const startMin = Math.max((startMs - dayStart.getTime()) / 60000, 0);
      const endMin = Math.min((endMs - dayStart.getTime()) / 60000, 24 * 60);
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
  colorMap,
}: {
  coordinators: CalendarCoordinator[];
  visibleIds: Set<number>;
  onToggle: (id: number) => void;
  colorMap: Map<number, string>;
}) {
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

  const allVisible = coordinators.every((c) => visibleIds.has(c.coordinatorId));

  return (
    <div className="cal-legend" role="group" aria-label="Filter by coordinator">
      <button
        type="button"
        className="cal-legend-toggle"
        onClick={() => {
          if (allVisible) {
            coordinators.forEach((c) => onToggle(c.coordinatorId));
          } else {
            coordinators.forEach((c) => {
              if (!visibleIds.has(c.coordinatorId)) onToggle(c.coordinatorId);
            });
          }
        }}
      >
        {allVisible ? "Hide all" : "Show all"}
      </button>
      <div className="cal-legend-list">
        {coordinators.map((coordinator) => {
          const color = colorMap.get(coordinator.coordinatorId) ?? "#999";
          const visible = visibleIds.has(coordinator.coordinatorId);
          return (
            <button
              key={coordinator.coordinatorId}
              type="button"
              className={`cal-legend-item ${visible ? "on" : "off"}`}
              aria-pressed={visible}
              onClick={() => onToggle(coordinator.coordinatorId)}
            >
              <span
                className="cal-legend-swatch"
                style={{ backgroundColor: color, opacity: visible ? 1 : 0.3 }}
              />
              <span className="cal-legend-name">{displayName(coordinator)}</span>
              <span className="cal-legend-count">{coordinator.events.length}</span>
            </button>
          );
        })}
      </div>
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
  const textColor = getTextColor(color);
  const isTerminal =
    event.status && ["COMPLETED", "REJECTED", "CANCELLED"].includes(event.status);
  const heightPct = event.height;
  const statusLabel = STATUS_LABELS[event.status ?? ""] ?? event.status;

  const style: CSSProperties = {
    top: `${event.top}%`,
    height: `${event.height}%`,
    left: `${event.left}%`,
    width: `${event.width}%`,
    backgroundColor: color,
    color: textColor,
    borderLeftColor: color,
    opacity: isTerminal ? 0.7 : 1,
    textDecoration: isTerminal ? "line-through" : "none",
  };

  return (
    <div
      className="cal-event-block"
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
      aria-label={event.title}
    >
      <span className="cal-event-color-strip" style={{ backgroundColor: color }} />
      <strong className="cal-event-title" title={event.title}>
        {event.title}
      </strong>
      {heightPct > 10 && (
        <>
      <span className="cal-tag" title={statusLabel}>
        {statusLabel}
      </span>
          <small className="cal-event-time">
            {formatTime(new Date(event.startDatetime))} –{" "}
            {formatTime(new Date(event.endDatetime))}
          </small>
        </>
      )}
      {heightPct > 4 && heightPct <= 10 && (
        <span
          className="cal-event-mini"
          title={`${event.title} · ${statusLabel} · ${formatTime(new Date(event.startDatetime))} – ${formatTime(new Date(event.endDatetime))}`}
        >
          {event.title} · {statusLabel} · {formatTime(new Date(event.startDatetime))} – {formatTime(new Date(event.endDatetime))}
        </span>
      )}
      {heightPct <= 4 && (
        <span className="cal-event-tiny" title={`${event.title} · ${statusLabel}`} />
      )}
    </div>
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
}: {
  coordinators: CalendarCoordinator[];
  currentDate: Date;
  colorMap: Map<number, string>;
  visibleIds: Set<number>;
   onEventClick?: (event: LayoutEvent) => void;
  onEventHover?: (event: LayoutEvent | null, x?: number, y?: number) => void;
  onDayClick?: (date: Date) => void;
  selectedEvent?: CalendarEvent;
}) {
  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const hours = Array.from({ length: HOURS_IN_DAY }, (_, h) => {
    const slotDate = new Date();
    slotDate.setHours(h, 0, 0, 0);
    return { hour: h, label: formatTime(slotDate) };
  });

  const visibleCoordinators = coordinators.filter((c) => visibleIds.has(c.coordinatorId));
  const allEvents = visibleCoordinators.flatMap((c) => c.events);
  const now = new Date();
  const showNowLine = days.some((d) => isSameDay(d, now));

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
              selectedEvent && isSameDay(day, new Date(selectedEvent.startDatetime))
                ? layoutDayEvents([selectedEvent], day, colorMap)
                : [];

            return (
              <div key={day.getTime()} className="cal-day-column">
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
}: {
  coordinators: CalendarCoordinator[];
  currentDate: Date;
  colorMap: Map<number, string>;
  visibleIds: Set<number>;
  onEventClick?: (event: LayoutEvent) => void;
  onEventHover?: (event: LayoutEvent | null, x?: number, y?: number) => void;
  selectedEvent?: CalendarEvent;
}) {
  const today = new Date();
  const isToday = isSameDay(currentDate, today);

  const hours = Array.from({ length: HOURS_IN_DAY }, (_, h) => {
    const slotDate = new Date();
    slotDate.setHours(h, 0, 0, 0);
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
          <div className="cal-day-column">
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
              isSameDay(currentDate, new Date(selectedEvent.startDatetime)) && (
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

function MonthView({
  coordinators,
  currentDate,
  colorMap,
  onDayClick,
}: {
  coordinators: CalendarCoordinator[];
  currentDate: Date;
  colorMap: Map<number, string>;
  onDayClick?: (date: Date) => void;
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
  const today = new Date();

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
        {weeks.map((week, wi) => (
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
}: {
  coordinators: CalendarCoordinator[];
  currentDate: Date;
  colorMap: Map<number, string>;
  onMonthClick?: (date: Date) => void;
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
                  cells.push(
                    <div
                      key={d}
                      className={`cal-year-day ${
                        dots.length > 0 ? "has-events" : ""
                      }`}
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
    const hasEvent = coordinator.events.some((e) =>
      isSameDay(new Date(e.startDatetime), date),
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
}: CalendarViewProps) {
  const [internalViewMode, setInternalViewMode] = useState<CalendarViewMode>(
    defaultView,
  );
  const [internalCurrentDate, setInternalCurrentDate] = useState(new Date());
  const [visibleIds, setVisibleIds] = useState<Set<number>>(
    () => new Set(coordinators.map((c) => c.coordinatorId)),
  );
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
    setVisibleIds((prev) => {
      const next = new Set(prev);
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
    handleCurrentDateChange(new Date());
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
        return `${d}, ${effectiveCurrentDate.toLocaleDateString("en-SG", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Asia/Singapore",
        })}`;
      }
    }
  })();

  if (coordinators.length === 0) {
    return (
      <div className="calendar-view">
        <div className="calendar-empty">
          <p>No coordinators with events to display.</p>
        </div>
      </div>
    );
  }

  return (
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

      <CoordinatorLegend
        coordinators={coordinators}
        visibleIds={visibleIds}
        onToggle={toggleCoordinator}
        colorMap={colorMap}
      />

      <div className="calendar-grid-wrapper">
        {visibleCoordinators.length === 0 ? (
          <div className="calendar-empty">
            <p>
              No coordinators selected. Click a name in the legend above to
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
              />
            )}
            {effectiveViewMode === "month" && (
              <MonthView
                coordinators={visibleCoordinators}
                currentDate={effectiveCurrentDate}
                colorMap={colorMap}
                onDayClick={handleDayClick}
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
  );
}
