import { describe, expect, it } from "vitest";
import { activeNavigationId, navigationForRole } from "@/lib/navigation";

describe("[SPM-193] coordinator navigation", () => {
  it("adds a Notifications tab linked to the inbox and marks it active there", () => {
    const items = navigationForRole("COORDINATOR")[0].items;
    expect(items.map((item) => item.id)).toEqual(["home", "notifications"]);
    expect(items.find((item) => item.id === "notifications")?.href).toBe("/notifications");
    expect(activeNavigationId("COORDINATOR", "/notifications", null)).toBe("notifications");
    expect(activeNavigationId("COORDINATOR", "/dashboard", null)).toBe("home");
    expect(activeNavigationId("COORDINATOR", "/events/81", null)).toBe("home");
  });

  it("leaves the Coordinator Lead without a Notifications tab", () => {
    const items = navigationForRole("COORDINATOR_LEAD")[0].items;
    expect(items.some((item) => item.id === "notifications")).toBe(false);
  });
});
