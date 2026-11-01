import { describe, expect, it } from "vitest";
import { activeNavigationId, navigationForRole } from "@/lib/navigation";

describe("Venue Staff navigation", () => {
  it("marks Availability Calendar current on its own page, and My Venues on the venue pages", () => {
    expect(navigationForRole("VENUE_STAFF")[0].items.find((item) => item.id === "availability")?.href).toBe("/venues/availability");
    expect(activeNavigationId("VENUE_STAFF", "/venues/availability")).toBe("availability");
    expect(activeNavigationId("VENUE_STAFF", "/venues")).toBe("venues");
    expect(activeNavigationId("VENUE_STAFF", "/venues/4")).toBe("venues");
    expect(activeNavigationId("VENUE_STAFF", "/dashboard")).toBe("home");
  });

  it("shows no Contact Support or Settings for any role", () => {
    for (const role of ["ORGANISER", "COORDINATOR", "COORDINATOR_LEAD", "VENUE_STAFF", "TECH_SUPPORT", "SAFETY_OFFICER", "ATTENDEE"] as const) {
      const ids = navigationForRole(role).flatMap((group) => group.items.map((item) => item.id));
      expect(ids).not.toContain("support");
      expect(ids).not.toContain("settings");
    }
  });
});
