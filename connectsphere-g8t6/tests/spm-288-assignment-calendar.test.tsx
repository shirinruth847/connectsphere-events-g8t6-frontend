import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CoordinatorAvailabilityCalendar } from "@/components/calendar/coordinator-availability-calendar";

afterEach(cleanup);

const coordinators = [{ coordinatorId: 7, name: "Test Coordinator", events: [] }];

const selectedEvent = (eventId: number, startDatetime: string) => ({
  eventId, title: `Request ${eventId}`, startDatetime,
  endDatetime: new Date(Date.parse(startDatetime) + 60 * 60 * 1000).toISOString(),
});

describe("SPM-288 assignment calendar", () => {
  it("opens the selected event week in Singapore time and follows a different selected event", () => {
    const { container, rerender } = render(
      <CoordinatorAvailabilityCalendar coordinators={coordinators} selectedEvent={selectedEvent(1, "2030-03-10T17:00:00Z")} />,
    );
    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".calendar-title")).toHaveTextContent("March 2030");

    rerender(<CoordinatorAvailabilityCalendar coordinators={coordinators} selectedEvent={selectedEvent(2, "2031-11-10T17:00:00Z")} />);
    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".calendar-title")).toHaveTextContent("November 2031");
  });

  it("keeps the standalone calendar on its normal month view", () => {
    render(<CoordinatorAvailabilityCalendar coordinators={coordinators} />);
    expect(screen.getByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "true");
  });
});
