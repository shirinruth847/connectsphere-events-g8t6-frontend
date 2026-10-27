import { test, expect } from "@playwright/test";
import { attachScreenshot, installConnectSphereMocks } from "./support.mjs";

// SPM-52 equipment catalogue for Technical Support, with the shapes the backend returns.
const item = (equipmentId, name, overrides = {}) => ({
  equipmentId,
  name,
  category: "Visual",
  storageLocation: "Store Room B",
  totalQuantity: 5,
  unavailableNow: 0,
  isActive: true,
  status: "ACTIVE",
  statusLabel: "Active",
  detailStatus: "CURRENT",
  detailNotice: null,
  version: 1,
  createdAt: "2026-10-24T01:00:00.000Z",
  updatedAt: "2026-10-24T01:00:00.000Z",
  createdBy: { userId: 11, name: "Synthetic Technical Support" },
  updatedBy: { userId: 11, name: "Synthetic Technical Support" },
  ...overrides,
});

// GET /api/equipment/options: the labels come from the backend.
const EQUIPMENT_OPTIONS = {
  categories: ["Audio", "Visual"],
  statuses: [
    { value: "ACTIVE", label: "Active" },
    { value: "INACTIVE", label: "Inactive" },
    { value: "DETAILS_PENDING", label: "Details pending" },
  ],
  unavailabilityReasons: [
    { value: "DAMAGED", label: "Damaged or faulty" },
    { value: "MAINTENANCE", label: "Maintenance" },
    { value: "OTHER", label: "Other" },
  ],
};

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const equipmentState = () => ({
  requests: [],
  items: [
    item(7, "Laser Projector"),
    item(8, "Wireless Microphone", { category: "Audio", unavailableNow: 2, detailStatus: "OUT_OF_DATE", detailNotice: "Details may be out of date" }),
    item(9, "Mic Stand", { category: "Audio", isActive: false, status: "INACTIVE", statusLabel: "Inactive" }),
  ],
  details: { specifications: "4K, 5000 lm", technicalNotes: null, handlingNotes: null, pgVersion: 1, updatedAt: "2026-10-24T01:00:00.000Z" },
  unavailability: [],
  staleVersion: false,
});

async function routeEquipment(page, state) {
  await page.route("**/api/equipment**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const body = method === "GET" ? null : request.postDataJSON();
    state.requests.push({ method, path: url.pathname, query: Object.fromEntries(url.searchParams), body });
    const [, , , id, sub, recordId, action] = url.pathname.split("/");
    if (url.pathname === "/api/equipment/options") return json(route, EQUIPMENT_OPTIONS);
    if (url.pathname === "/api/equipment" && method === "GET") {
      const search = (url.searchParams.get("search") ?? "").toLowerCase();
      const category = url.searchParams.get("category");
      const status = url.searchParams.get("status");
      const equipment = state.items.filter((entry) => (!search || entry.name.toLowerCase().includes(search))
        && (!category || entry.category === category) && (!status || entry.status === status));
      return json(route, { equipment, nextOffset: null });
    }
    if (url.pathname === "/api/equipment" && method === "POST") {
      if (state.items.some((entry) => entry.name.toLowerCase() === body.name.toLowerCase())) {
        return json(route, { error: "Equipment with this name already exists", code: "EQUIPMENT_NAME_TAKEN", fields: { name: "Equipment with this name already exists" } }, 409);
      }
      const created = item(900, body.name, { category: body.category, storageLocation: body.storageLocation, totalQuantity: Number(body.totalQuantity) });
      state.items.push(created);
      return json(route, { message: "Equipment created.", equipment: created }, 201);
    }
    const current = state.items.find((entry) => String(entry.equipmentId) === id);
    if (!current) return json(route, { error: "Equipment not found.", code: "EQUIPMENT_NOT_FOUND" }, 404);
    if (!sub && method === "GET") return json(route, { equipment: current, details: state.details, detailsRead: "OK", unavailability: state.unavailability });
    if (!sub && method === "PUT") {
      if (state.staleVersion) {
        const fresh = { ...current, storageLocation: "Store Room Z", version: current.version + 1 };
        const currentDetails = { specifications: "4K, 6000 lm", technicalNotes: null, handlingNotes: "Two people to lift" };
        return json(route, { error: "This equipment was changed after you loaded it.", code: "EQUIPMENT_VERSION_CONFLICT", current: fresh, currentDetails }, 409);
      }
      if (body.totalQuantity !== undefined && Number(body.totalQuantity) < 3 && state.unavailability.length) {
        const message = "3 units are unavailable during Mon, 6 Jan 2031 · 17:00–18:00 SGT, so the total cannot be lower than 3.";
        return json(route, { error: message, code: "EQUIPMENT_QUANTITY_COMMITTED", committedQuantity: 3, fields: { totalQuantity: message } }, 409);
      }
      Object.assign(current, body.totalQuantity !== undefined ? { ...body, totalQuantity: Number(body.totalQuantity) } : body, { version: current.version + 1 });
      for (const key of ["specifications", "technicalNotes", "handlingNotes"]) {
        if (Object.hasOwn(body, key)) state.details[key] = body[key];
        delete current[key];
      }
      state.details.pgVersion = current.version;
      return json(route, { message: "Equipment updated.", equipment: current, changed: true });
    }
    if (sub === "status") {
      if (!body.active && !body.confirmUpcomingRequests) {
        return json(route, {
          error: "This equipment is requested by 1 upcoming event. Confirm to deactivate it; existing requests are kept.",
          code: "EQUIPMENT_HAS_UPCOMING_REQUESTS",
          upcomingCount: 1,
          upcomingEvents: [{ eventId: 436, requestId: "REQ-000436", title: "Product launch", startDatetime: "2026-11-08T02:00:00+00:00" }],
        }, 409);
      }
      Object.assign(current, body.active
        ? { isActive: true, status: "ACTIVE", statusLabel: "Active" }
        : { isActive: false, status: "INACTIVE", statusLabel: "Inactive" }, { version: current.version + 1 });
      return json(route, { message: body.active ? "Equipment reactivated." : "Equipment deactivated.", equipment: current, changed: true, upcomingRequests: body.active ? 0 : 1 });
    }
    if (sub === "unavailability" && method === "POST" && !recordId) {
      if (Number(body.quantity) > 5) {
        const message = "Only 5 units are left to mark unavailable during Mon, 6 Jan 2031 · 17:00–18:00 SGT. Unavailable stock cannot exceed the total.";
        return json(route, { error: message, code: "EQUIPMENT_STOCK_EXCEEDED", availableQuantity: 5, fields: { quantity: message } }, 409);
      }
      const record = {
        unavailabilityId: 31, equipmentId: current.equipmentId, quantity: Number(body.quantity), reason: body.reason, reasonLabel: "Damaged or faulty",
        startsAt: body.startsAt, endsAt: body.endsAt, note: body.note, status: "ACTIVE", version: 1,
        createdAt: "2026-10-24T02:00:00.000Z", updatedAt: "2026-10-24T02:00:00.000Z", createdBy: null, updatedBy: null,
      };
      state.unavailability = [record];
      return json(route, { message: "Unavailable stock recorded.", unavailability: record, equipment: current, changed: true }, 201);
    }
    if (sub === "unavailability" && action === "end") {
      const record = { ...state.unavailability[0], status: "CANCELLED", version: 2 };
      state.unavailability = [];
      return json(route, { message: "Unavailable stock cancelled.", unavailability: record, equipment: current, changed: true });
    }
    return route.fallback();
  });
}

test("[SPM-52 TC-01][TC-02][TC-04][TC-16][TC-17] Technical Support lists, filters and adds equipment from the Equipment tab", async ({ page }, testInfo) => {
  const state = equipmentState();
  await installConnectSphereMocks(page, { role: "TECH_SUPPORT" });
  await routeEquipment(page, state);
  await page.goto("/dashboard");

  await page.getByRole("link", { name: "Equipment", exact: true }).first().click();
  await expect(page).toHaveURL(/\/equipment$/);
  await expect(page.getByRole("heading", { level: 1, name: "Equipment" })).toBeVisible();
  await expect(page.locator('a[aria-current="page"]').first()).toHaveText(/Equipment/);
  const rows = page.getByRole("list", { name: "Equipment" }).getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText("2 / 5");
  await expect(rows.nth(1)).toContainText("Details may be out of date");

  await page.getByRole("button", { name: "Inactive", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Mic Stand");
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await page.locator("#equipment-search").fill("mic");
  await expect(rows).toHaveCount(2);
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(rows).toHaveCount(3);

  await page.getByRole("button", { name: "Add equipment" }).first().click();
  await page.getByRole("button", { name: "Save equipment" }).click();
  await expect(page.getByText("Name is required")).toBeVisible();
  await expect(page.getByText("Total quantity is required")).toBeVisible();
  expect(state.requests.filter((entry) => entry.method === "POST")).toHaveLength(0);

  await page.locator("#create-equipment-name").fill("Draft item");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Discard this equipment?")).toBeVisible();
  await page.getByRole("button", { name: "Discard and close" }).click();
  await expect(page.locator("#create-equipment-form")).toBeHidden();

  await page.getByRole("button", { name: "Add equipment" }).first().click();
  await page.locator("#create-equipment-name").fill("wireless microphone");
  await page.locator("#create-equipment-category").fill("Audio");
  await page.locator("#create-equipment-storageLocation").fill("Store Room A");
  await page.locator("#create-equipment-totalQuantity").fill("4");
  await page.getByRole("button", { name: "Save equipment" }).click();
  await expect(page.locator("#create-equipment-name-error")).toHaveText("Equipment with this name already exists");
  await expect(page.locator("#create-equipment-totalQuantity")).toHaveValue("4");

  await page.locator("#create-equipment-name").fill("Shotgun Mic");
  await page.getByRole("button", { name: "Save equipment" }).click();
  await expect(page.getByText("“Shotgun Mic” was created")).toBeVisible();
  expect(state.requests.find((entry) => entry.method === "POST" && entry.body.name === "Shotgun Mic").body).toMatchObject({
    name: "Shotgun Mic", category: "Audio", storageLocation: "Store Room A", totalQuantity: "4", specifications: null,
  });
  await attachScreenshot(testInfo, page, "equipment-list-desktop");
});

test("[SPM-52 AC6][AC12] saved details and same-version reloads display the refreshed values", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "TECH_SUPPORT" });
  const state = equipmentState();
  await routeEquipment(page, state);
  await page.goto("/equipment/7");
  const specifications = page.locator("#edit-equipment-specifications");
  await expect(specifications).toHaveValue("4K, 5000 lm");
  await specifications.fill("4K, 6000 lm");
  const refreshed = page.waitForResponse((response) => response.url().endsWith("/api/equipment/7") && response.request().method() === "GET");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await refreshed;
  await expect(page.getByText("Equipment updated.", { exact: true })).toBeVisible();
  await expect(specifications).toHaveValue("4K, 6000 lm");

  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByText("No changes to save.", { exact: true })).toBeVisible();
  expect(state.requests.filter((request) => request.method === "PUT")).toHaveLength(1);

  // An outbox application can refresh details without changing the equipment version.
  state.details.specifications = "Refreshed detail snapshot";
  await page.getByRole("button", { name: "Reload equipment", exact: true }).click();
  await expect(specifications).toHaveValue("Refreshed detail snapshot");
});

test("[SPM-52 TC-07][TC-08][TC-10][TC-11] Technical Support manages one item: conflicts, stock limits, unavailable stock and deactivation", async ({ page }, testInfo) => {
  const state = equipmentState();
  await installConnectSphereMocks(page, { role: "TECH_SUPPORT" });
  await routeEquipment(page, state);
  await page.goto("/equipment/7");
  await expect(page.getByRole("heading", { level: 1, name: "Laser Projector" })).toBeVisible();

  state.staleVersion = true;
  await page.locator("#edit-equipment-storageLocation").fill("Store Room C");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByText("This equipment was changed after you loaded it")).toBeVisible();
  await expect(page.getByText("Store Room Z", { exact: false })).toBeVisible();
  await page.locator("#edit-equipment-specifications").fill("4K, 5500 lm");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Handling and setup notes: Two people to lift")).toBeVisible();
  await expect(page.getByText("Specifications: 4K, 6000 lm")).toBeVisible();
  state.staleVersion = false;
  await page.getByRole("button", { name: "Reset" }).first().click();
  await page.getByRole("button", { name: "Reset" }).nth(1).click();

  await page.getByRole("button", { name: "Record unavailable stock" }).click();
  await page.locator("#record-unavailable-quantity").fill("6");
  await page.locator("#record-unavailable-startsAt").fill("2031-01-06T17:00");
  await page.locator("#record-unavailable-endsAt").fill("2031-01-06T18:00");
  await page.locator("#record-unavailable-reason").selectOption("DAMAGED");
  await page.locator("#record-unavailable-note").fill("Cracked lens");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("#record-unavailable-quantity-error")).toContainText("Only 5 units are left to mark unavailable during Mon, 6 Jan 2031 · 17:00–18:00 SGT");
  await page.locator("#record-unavailable-quantity").fill("3");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Unavailable stock recorded.")).toBeVisible();
  const recorded = state.requests.filter((entry) => entry.method === "POST" && entry.path === "/api/equipment/7/unavailability").at(-1);
  expect(recorded.body).toMatchObject({ quantity: "3", startsAt: "2031-01-06T17:00:00+08:00", endsAt: "2031-01-06T18:00:00+08:00" });
  await expect(page.getByText("Damaged or faulty")).toBeVisible();

  await page.locator("#edit-equipment-totalQuantity").fill("2");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.locator("#edit-equipment-totalQuantity-error")).toContainText("3 units are unavailable during Mon, 6 Jan 2031 · 17:00–18:00 SGT");

  await page.getByRole("button", { name: "Reset" }).first().click();
  await page.getByRole("button", { name: "Deactivate equipment" }).click();
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(page.getByText("Requested by 1 upcoming event")).toBeVisible();
  await expect(page.getByText("REQ-000436")).toBeVisible();
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(page.getByText("Equipment deactivated. 1 upcoming request(s) were kept.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reactivate equipment" })).toBeVisible();
  expect(state.requests.filter((entry) => entry.path.endsWith("/status")).map((entry) => entry.body.confirmUpcomingRequests)).toEqual([false, true]);

  await page.getByRole("button", { name: /^Cancel unavailable stock from/ }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("No unavailable stock")).toBeVisible();
  await attachScreenshot(testInfo, page, "equipment-detail-desktop");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { level: 1, name: "Laser Projector" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await attachScreenshot(testInfo, page, "equipment-detail-mobile");
});

for (const role of ["ORGANISER", "COORDINATOR_LEAD", "COORDINATOR", "VENUE_STAFF", "SAFETY_OFFICER", "ATTENDEE"]) {
  test(`[SPM-52 AC1][TC-05] ${role} gets no Equipment tab and cannot open the pages`, async ({ page }) => {
    const state = equipmentState();
    await installConnectSphereMocks(page, { role });
    await routeEquipment(page, state);
    await page.goto("/dashboard");
    await expect(page.getByRole("navigation").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Equipment", exact: true })).toHaveCount(0);
    for (const path of ["/equipment", "/equipment/7"]) {
      await page.goto(path);
      await expect(page.getByText("Access denied")).toBeVisible();
      await expect(page.locator("#equipment-search")).toHaveCount(0);
    }
    expect(state.requests).toHaveLength(0);
  });
}
