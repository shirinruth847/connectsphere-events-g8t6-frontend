import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CoordinatorLegend } from "@/components/calendar/calendar-view";

const coordinators = [
  { coordinatorId: 1, name: "Alice Chen", events: [{ eventId: 1, title: "Event A", startDatetime: "2026-01-01T09:00:00Z", endDatetime: "2026-01-01T10:00:00Z", status: "SUBMITTED", requestId: "REQ-001", expectedAttendance: 50, createdAt: "2026-01-01T08:00:00Z" }] },
  { coordinatorId: 2, name: "Bob Lim", events: [] },
  { coordinatorId: 3, name: "Carol Tan", events: [{ eventId: 2, title: "Event B", startDatetime: "2026-01-01T11:00:00Z", endDatetime: "2026-01-01T12:00:00Z", status: "CONFIRMED", requestId: "REQ-002", expectedAttendance: 30, createdAt: "2026-01-01T08:00:00Z" }] },
];

const colorMap = new Map([
  [1, "#4F46E5"],
  [2, "#2563EB"],
  [3, "#0D9488"],
]);

function renderLegend(visibleIds: Set<number>) {
  const onToggle = vi.fn();
  return {
    ...render(
      <CoordinatorLegend
        coordinators={coordinators}
        visibleIds={visibleIds}
        onToggle={onToggle}
        colorMap={colorMap}
      />
    ),
    onToggle,
  };
}

describe("CoordinatorLegend filter", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders nothing when coordinator list is empty", () => {
    const { container } = render(
      <CoordinatorLegend
        coordinators={[]}
        visibleIds={new Set()}
        onToggle={vi.fn()}
        colorMap={new Map()}
      />
    );
    expect(container.querySelector(".cal-legend")).not.toBeInTheDocument();
  });

  it("shows 'All coordinators' when all selected by default", () => {
    const all = new Set(coordinators.map((c) => c.coordinatorId));
    renderLegend(all);
    expect(screen.getByText("All coordinators")).toBeInTheDocument();
  });

  it("shows 'No coordinators' when none selected", () => {
    renderLegend(new Set());
    expect(screen.getByText("No coordinators")).toBeInTheDocument();
  });

  it("shows count when partially selected", () => {
    renderLegend(new Set([1]));
    expect(screen.getByText("1 coordinator")).toBeInTheDocument();
  });

  it("opens the dropdown panel when trigger clicked", () => {
    const all = new Set(coordinators.map((c) => c.coordinatorId));
    renderLegend(all);
    const trigger = screen.getByText("All coordinators").closest("button")!;
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search coordinators…")).toBeInTheDocument();
    expect(screen.getByText("Alice Chen")).toBeInTheDocument();
    expect(screen.getByText("Bob Lim")).toBeInTheDocument();
    expect(screen.getByText("Carol Tan")).toBeInTheDocument();
  });

  it("toggles a coordinator when clicking its row in the panel", () => {
    const all = new Set(coordinators.map((c) => c.coordinatorId));
    const { onToggle } = renderLegend(all);
    const trigger = screen.getByText("All coordinators").closest("button")!;
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText("Bob Lim"));
    expect(onToggle).toHaveBeenCalledWith(2);
  });

  it("selects all when 'All' button clicked", () => {
    const none = new Set<number>();
    const { onToggle } = renderLegend(none);
    const trigger = screen.getByText("No coordinators").closest("button")!;
    fireEvent.click(trigger);
    fireEvent.click(screen.getAllByText("All")[0]);
    expect(onToggle).toHaveBeenCalledTimes(coordinators.length);
  });

  it("deselects all when 'None' button clicked", () => {
    const all = new Set(coordinators.map((c) => c.coordinatorId));
    const { onToggle } = renderLegend(all);
    const trigger = screen.getByText("All coordinators").closest("button")!;
    fireEvent.click(trigger);
    fireEvent.click(screen.getByText("None"));
    expect(onToggle).toHaveBeenCalledTimes(coordinators.length);
  });

  it("filters coordinators by search text", () => {
    const all = new Set(coordinators.map((c) => c.coordinatorId));
    renderLegend(all);
    const trigger = screen.getByText("All coordinators").closest("button")!;
    fireEvent.click(trigger);
    const search = screen.getByPlaceholderText("Search coordinators…");
    fireEvent.change(search, { target: { value: "Alice" } });
    expect(screen.getByText("Alice Chen")).toBeInTheDocument();
    expect(screen.queryByText("Bob Lim")).not.toBeInTheDocument();
    expect(screen.queryByText("Carol Tan")).not.toBeInTheDocument();
  });

  it("shows empty message when no matches found", () => {
    const all = new Set(coordinators.map((c) => c.coordinatorId));
    renderLegend(all);
    const trigger = screen.getByText("All coordinators").closest("button")!;
    fireEvent.click(trigger);
    const search = screen.getByPlaceholderText("Search coordinators…");
    fireEvent.change(search, { target: { value: "Zzz" } });
    expect(screen.getByText("No coordinators match.")).toBeInTheDocument();
  });

  it("disables 'All' when all coordinators already visible", () => {
    const all = new Set(coordinators.map((c) => c.coordinatorId));
    renderLegend(all);
    const trigger = screen.getByText("All coordinators").closest("button")!;
    fireEvent.click(trigger);
    expect(screen.getAllByText("All")[0]).toBeDisabled();
  });

  it("disables 'None' when no coordinators visible", () => {
    renderLegend(new Set());
    const trigger = screen.getByText("No coordinators").closest("button")!;
    fireEvent.click(trigger);
    expect(screen.getAllByText("None")[0]).toBeDisabled();
  });
});
