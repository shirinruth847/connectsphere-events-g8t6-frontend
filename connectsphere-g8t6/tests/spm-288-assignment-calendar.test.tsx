import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CoordinatorAvailabilityCalendar } from "@/components/calendar/coordinator-availability-calendar";

afterEach(cleanup);

const coordinators = [{ coordinatorId: 7, name: "Test Coordinator", events: [] }];

const selectedEvent = (eventId: number, startDatetime: string) => ({
  eventId, title: `Request ${eventId}`, startDatetime,
  endDatetime: new Date(Date.parse(startDatetime) + 60 * 60 * 1000).toISOString(),
});

const title = (container: HTMLElement) => container.querySelector(".calendar-title")?.textContent;

describe("SPM-288 assignment calendar", () => {
  // Each start is Sunday 01:00 in Singapore but still Saturday in UTC, so
  // reading the UTC date would open the week before.
  it("opens the selected event week in Singapore time and follows a different selected event", () => {
    const { container, rerender } = render(
      <CoordinatorAvailabilityCalendar coordinators={coordinators} selectedEvent={selectedEvent(1, "2030-03-09T17:00:00Z")} />,
    );
    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
    expect(title(container)).toBe("Sun 10, March 2030 – Sat 16");

    rerender(<CoordinatorAvailabilityCalendar coordinators={coordinators} selectedEvent={selectedEvent(2, "2031-11-08T17:00:00Z")} />);
    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
    expect(title(container)).toBe("Sun 9, November 2031 – Sat 15");
  });

  it("keeps the standalone calendar on its normal month view", () => {
    render(<CoordinatorAvailabilityCalendar coordinators={coordinators} />);
    expect(screen.getByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "true");
  });
});
