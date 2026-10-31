import { describe, expect, it } from "vitest";
import { activeNavigationId, navigationForRole } from "@/lib/navigation";

describe("[SPM-192] organiser navigation", () => {
  it("keeps dashboard views in the dashboard and removes support and settings groups", () => {
    const groups = navigationForRole("ORGANISER");
    expect(groups.map((group) => group.title)).toEqual(["Main Navigation"]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["home", "notifications"]);
  });

  it("links the Notifications tab to the inbox and marks it active there", () => {
    const tab = navigationForRole("ORGANISER")[0].items.find((item) => item.id === "notifications");
    expect(tab?.href).toBe("/notifications");
    expect(activeNavigationId("ORGANISER", "/notifications")).toBe("notifications");
    expect(activeNavigationId("ORGANISER", "/dashboard")).toBe("home");
    expect(activeNavigationId("ORGANISER", "/events/42")).toBe("home");
  });
});
