import { describe, expect, it } from "vitest";
import { activeNavigationId } from "@/lib/navigation";

describe("[SPM-44] attendee navigation", () => {
  it("keeps Event Discovery active on the event list and event details", () => {
    expect(activeNavigationId("ATTENDEE", "/events", null)).toBe("discovery");
    expect(activeNavigationId("ATTENDEE", "/events/42", null)).toBe("discovery");
    expect(activeNavigationId("ATTENDEE", "/events/abc", null)).toBe("discovery");
    expect(activeNavigationId("ATTENDEE", "/my-registrations", null)).toBe("home");
  });
});
