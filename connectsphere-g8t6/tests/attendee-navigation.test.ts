import { describe, expect, it } from "vitest";
import { activeNavigationId } from "@/lib/navigation";

describe("[SPM-44] attendee navigation", () => {
  it("keeps Event Discovery active on the event list and event details", () => {
    expect(activeNavigationId("ATTENDEE", "/events")).toBe("discovery");
    expect(activeNavigationId("ATTENDEE", "/events/42")).toBe("discovery");
    expect(activeNavigationId("ATTENDEE", "/events/abc")).toBe("discovery");
    expect(activeNavigationId("ATTENDEE", "/my-registrations")).toBe("home");
  });
});
