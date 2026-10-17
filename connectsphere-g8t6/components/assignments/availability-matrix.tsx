"use client";

import { useMemo } from "react";

export const TERMINAL_STATES = new Set(["COMPLETED", "REJECTED", "CANCELLED"]);

const SLOT_MS = 60 * 60 * 1000;
const CONTEXT_SLOTS = 2;
const MAX_SLOTS = 48;

const timeFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dayFormat = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore",
  weekday: "short",
  day: "numeric",
  month: "short",
});

export type MatrixEvent = {
  eventId: number;
  status: string;
  title: string;
  startDatetime: string;
  endDatetime: string;
};

export type MatrixCoordinator = {
  coordinatorId: number;
  name: string;
  events: MatrixEvent[];
};

export function overlaps(first: MatrixEvent, second: MatrixEvent) {
  const firstStart = Date.parse(first.startDatetime);
  const firstEnd = Date.parse(first.endDatetime);
  const secondStart = Date.parse(second.startDatetime);
  const secondEnd = Date.parse(second.endDatetime);
  return (
    Number.isFinite(firstStart) &&
    Number.isFinite(firstEnd) &&
    Number.isFinite(secondStart) &&
    Number.isFinite(secondEnd) &&
    firstStart < secondEnd &&
    secondStart < firstEnd
  );
}

type TimeSlot = {
  key: string;
  timeLabel: string;
  dayLabel: string;
  startMs: number;
  endMs: number;
};

function buildTimeSlots(
  requested: MatrixEvent,
  candidates: MatrixCoordinator[],
): TimeSlot[] {
  const requestedStart = Date.parse(requested.startDatetime);
  const requestedEnd = Date.parse(requested.endDatetime);
  if (!Number.isFinite(requestedStart) || !Number.isFinite(requestedEnd)) return [];

  let from = requestedStart - CONTEXT_SLOTS * SLOT_MS;
  let to = requestedEnd + CONTEXT_SLOTS * SLOT_MS;

  for (const coordinator of candidates) {
    for (const event of coordinator.events) {
      if (event.eventId === requested.eventId || TERMINAL_STATES.has(event.status)) {
        continue;
      }
      const start = Date.parse(event.startDatetime);
      const end = Date.parse(event.endDatetime);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      if (start < requestedEnd && requestedStart < end) {
        from = Math.min(from, start - SLOT_MS);
        to = Math.max(to, end + SLOT_MS);
      }
    }
  }

  const alignedFrom = Math.floor(from / SLOT_MS) * SLOT_MS;
  const alignedTo = Math.min(
    Math.ceil(to / SLOT_MS) * SLOT_MS,
    alignedFrom + MAX_SLOTS * SLOT_MS,
  );

  const slots: TimeSlot[] = [];
  for (let start = alignedFrom; start < alignedTo; start += SLOT_MS) {
    const end = start + SLOT_MS;
    const startDate = new Date(start);
    const endDate = new Date(end);
    slots.push({
      key: String(start),
      timeLabel: `${timeFormat.format(startDate)} – ${timeFormat.format(endDate)}`,
      dayLabel: dayFormat.format(startDate),
      startMs: start,
      endMs: end,
    });
  }
  return slots;
}

export type AvailabilityMatrixProps = {
  coordinators: MatrixCoordinator[];
  requested: MatrixEvent;
  excludeCoordinatorId?: number;
  selectedCoordinatorId: number | null;
  onSelect: (coordinatorId: number) => void;
};

export function AvailabilityMatrix({
  coordinators,
  requested,
  excludeCoordinatorId,
  selectedCoordinatorId,
  onSelect,
}: AvailabilityMatrixProps) {
  const candidates = useMemo(() => {
    return coordinators.filter(
      ({ coordinatorId }) =>
        excludeCoordinatorId === undefined || coordinatorId !== excludeCoordinatorId,
    );
  }, [coordinators, excludeCoordinatorId]);

  const slots = useMemo(() => {
    return buildTimeSlots(requested, candidates);
  }, [requested, candidates]);

  const requestedStart = Date.parse(requested.startDatetime);
  const requestedEnd = Date.parse(requested.endDatetime);

  // Pre-calculate clashes per coordinator
  const clashesMap = useMemo(() => {
    const map = new Map<number, MatrixEvent>();
    for (const coordinator of candidates) {
      const busyEvents = coordinator.events.filter(
        (e) => e.eventId !== requested.eventId && !TERMINAL_STATES.has(e.status),
      );
      const clash = busyEvents.find((e) => overlaps(e, requested));
      if (clash) {
        map.set(coordinator.coordinatorId, clash);
      }
    }
    return map;
  }, [candidates, requested]);

  if (candidates.length === 0) {
    return (
      <div className="matrix-empty-notice">
        <p>There are no other active Coordinators available to assign.</p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="matrix-empty-notice">
        <p>This request has no usable schedule to display.</p>
      </div>
    );
  }

  return (
    <div className="availability-matrix-container">
      <div className="matrix-top-bar">
        <div className="matrix-legend">
          <span className="legend-chip legend-chip--requested">
            <span className="legend-swatch legend-swatch--requested" />
            Requested event hours
          </span>
          <span className="legend-chip legend-chip--available">
            <span className="legend-swatch legend-swatch--available" />
            Available
          </span>
          <span className="legend-chip legend-chip--conflict">
            <span className="legend-swatch legend-swatch--conflict" />
            Schedule clash (blocked)
          </span>
          <span className="legend-chip legend-chip--busy">
            <span className="legend-swatch legend-swatch--busy" />
            Other event
          </span>
        </div>
      </div>

      <div className="matrix-scroll-wrapper">
        <table className="matrix-table" aria-label="Coordinator availability schedule">
          <caption className="sr-only">
            Horizontal columns display coordinator names and selection. Vertical rows display time slots in Singapore time.
          </caption>
          <thead>
            <tr>
              <th className="matrix-corner-cell" scope="col">
                <span className="corner-label-time">Time (SGT) ↓</span>
                <span className="corner-label-name">Coordinators →</span>
              </th>
              {candidates.map((coordinator) => {
                const clash = clashesMap.get(coordinator.coordinatorId);
                const hasClash = Boolean(clash);
                const isSelected = selectedCoordinatorId === coordinator.coordinatorId;

                return (
                  <th
                    key={coordinator.coordinatorId}
                    className={`matrix-coordinator-col-header ${isSelected ? "selected" : ""} ${hasClash ? "has-clash" : ""}`}
                    scope="col"
                  >
                    <label
                      className={`coordinator-header-card ${isSelected ? "selected" : ""} ${hasClash ? "has-clash" : ""}`}
                    >
                      <div className="coordinator-header-row">
                        <input
                          type="radio"
                          name="matrixCoordinatorSelect"
                          value={coordinator.coordinatorId}
                          checked={isSelected}
                          disabled={hasClash}
                          onChange={() => onSelect(coordinator.coordinatorId)}
                          aria-label={`Select coordinator ${coordinator.name}`}
                        />
                        <div className="coordinator-info">
                          <strong className="coordinator-name" title={coordinator.name}>
                            {coordinator.name}
                          </strong>
                          <span className="coordinator-workload">
                            {coordinator.events.length} {coordinator.events.length === 1 ? "event" : "events"}
                          </span>
                        </div>
                      </div>

                      {hasClash ? (
                        <div className="coordinator-clash-banner">
                          <span className="clash-icon" aria-hidden="true">⚠</span>
                          <span className="clash-text" title={`Clashes with: ${clash?.title}`}>
                            Clashes with: {clash?.title}
                          </span>
                        </div>
                      ) : isSelected ? (
                        <div className="coordinator-selected-badge">
                          <span>✓ Selected</span>
                        </div>
                      ) : (
                        <div className="coordinator-select-action">
                          <span>Click to select</span>
                        </div>
                      )}
                    </label>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => {
              const isRequestedSlot = slot.startMs < requestedEnd && requestedStart < slot.endMs;
              return (
                <tr
                  key={slot.key}
                  className={`matrix-time-row ${isRequestedSlot ? "matrix-time-row--requested" : ""}`}
                >
                  <th
                    className={`matrix-time-header-cell ${isRequestedSlot ? "is-requested" : ""}`}
                    scope="row"
                  >
                    <div className="time-header-content">
                      <span className="slot-hours">{slot.timeLabel}</span>
                      <span className="slot-date">{slot.dayLabel}</span>
                      {isRequestedSlot && (
                        <span className="slot-requested-tag" title="Event occurs during this time slot">
                          Event Slot
                        </span>
                      )}
                    </div>
                  </th>

                  {candidates.map((coordinator) => {
                    const busyEvents = coordinator.events.filter(
                      (event) => event.eventId !== requested.eventId && !TERMINAL_STATES.has(event.status),
                    );
                    const busy = busyEvents.find((event) => {
                      const start = Date.parse(event.startDatetime);
                      const end = Date.parse(event.endDatetime);
                      return (
                        Number.isFinite(start) &&
                        Number.isFinite(end) &&
                        slot.startMs < end &&
                        start < slot.endMs
                      );
                    });

                    const isClash = isRequestedSlot && Boolean(busy);
                    const isSelected = selectedCoordinatorId === coordinator.coordinatorId;

                    let cellModifier = "";
                    if (isClash) {
                      cellModifier = "matrix-cell--clash";
                    } else if (busy) {
                      cellModifier = "matrix-cell--busy";
                    } else if (isRequestedSlot) {
                      cellModifier = "matrix-cell--available";
                    } else {
                      cellModifier = "matrix-cell--neutral-free";
                    }

                    if (isSelected) {
                      cellModifier += " matrix-cell--col-selected";
                    }

                    const busyTimeStr = busy
                      ? `${timeFormat.format(Date.parse(busy.startDatetime))}–${timeFormat.format(Date.parse(busy.endDatetime))}`
                      : "";

                    return (
                      <td
                        key={coordinator.coordinatorId}
                        className={`matrix-data-cell ${cellModifier}`}
                      >
                        {isClash ? (
                          <div className="cell-clash-content">
                            <span className="cell-badge cell-badge--clash">⚠ Clash</span>
                            <strong className="cell-event-title" title={busy?.title}>
                              {busy?.title}
                            </strong>
                            <span className="cell-event-time">{busyTimeStr}</span>
                          </div>
                        ) : busy ? (
                          <div className="cell-busy-content">
                            <span className="cell-badge cell-badge--busy">Busy</span>
                            <strong className="cell-event-title" title={busy.title}>
                              {busy.title}
                            </strong>
                            <span className="cell-event-time">{busyTimeStr}</span>
                          </div>
                        ) : isRequestedSlot ? (
                          <div className="cell-available-content">
                            <span className="available-icon" aria-hidden="true">✓</span>
                            <span className="available-text">Available</span>
                          </div>
                        ) : (
                          <span className="cell-free-mark" aria-hidden="true">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
