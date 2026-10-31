import { describe, expect, it } from "vitest";
import { activeNavigationId, navigationForRole } from "@/lib/navigation";

describe("[SPM-287] Technical Support navigation", () => {
  it("adds a Notifications tab linked to the inbox and keeps Dashboard current on a request", () => {
    const items = navigationForRole("TECH_SUPPORT")[0].items;
    expect(items.map((item) => item.id)).toEqual(["home", "equipment", "schedule", "notifications"]);
    expect(items.find((item) => item.id === "schedule")?.href).toBe("/equipment/schedule");
    expect(activeNavigationId("TECH_SUPPORT", "/equipment/schedule", null)).toBe("schedule");
    expect(items.find((item) => item.id === "notifications")?.href).toBe("/notifications");
    expect(activeNavigationId("TECH_SUPPORT", "/notifications", null)).toBe("notifications");
    expect(activeNavigationId("TECH_SUPPORT", "/technical-requests/7", null)).toBe("home");
    expect(activeNavigationId("TECH_SUPPORT", "/equipment/7", null)).toBe("equipment");
  });
});
