import { describe, expect, it } from "vitest";
import { activeNavigationId, navigationForRole } from "@/lib/navigation";

describe("[SPM-192] organiser navigation", () => {
  it("links the Notifications tab to the inbox and marks it active there", () => {
    const tab = navigationForRole("ORGANISER")[0].items.find((item) => item.id === "notifications");
    expect(tab?.href).toBe("/notifications");
    expect(activeNavigationId("ORGANISER", "/notifications", null)).toBe("notifications");
    expect(activeNavigationId("ORGANISER", "/dashboard", null)).toBe("home");
    expect(activeNavigationId("ORGANISER", "/dashboard", null, "MINE")).toBe("requests");
  });
});
