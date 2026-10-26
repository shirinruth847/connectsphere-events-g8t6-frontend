import { test, expect } from "@playwright/test";
import { installConnectSphereMocks, makeDraft } from "./support.mjs";

// Every role's dashboard (the Lead's: the unassigned queue) shows its request cards three to a row on a laptop
// screen, two on a tablet and one on a phone (developer request of 24 October 2026).

const eventWindow = { startDatetime: "2026-11-20T02:00:00.000Z", endDatetime: "2026-11-20T04:00:00.000Z" };
const forum = { eventId: 442, requestId: "REQ-000442", title: "Synthetic planning forum", status: "PLANNING", eventType: "SEMINAR", eventTypeLabel: "Seminar" };

const dashboards = {
  ORGANISER: {
    cards: "main article",
    setup: (state) => { state.events = Array.from({ length: 4 }, (_, index) => makeDraft({ eventId: 50 + index, requestId: `REQ-00005${index}`, title: `Synthetic draft ${index}` })); },
  },
  COORDINATOR: {
    cards: "main li article",
    setup: async (_state, page) => page.route((url) => url.pathname === "/api/events/assigned", (route) => route.fulfill({
      json: { events: Array.from({ length: 4 }, (_, index) => ({ eventId: 40 + index, requestId: `REQ-0000${40 + index}`, title: `Synthetic assigned ${index}`, status: "UNDER_REVIEW", expectedAttendance: 100, ...eventWindow })) },
    })),
  },
  COORDINATOR_LEAD: {
    path: "/events",
    cards: ".request-card",
    setup: (state) => {
      state.queueEvents = Array.from({ length: 4 }, (_, index) => ({ eventId: 71 + index, requestId: `REQ-0000${71 + index}`, status: "SUBMITTED", title: `Synthetic queued ${index}`, purpose: "Outreach", expectedAttendance: 120, venuePreferences: [1], equipmentRequirements: [{ equipmentId: 4, quantity: 2 }], organisation: { organisationId: 7, name: "Synthetic Org" }, createdAt: "2026-10-01T09:00:00.000Z", submittedAt: "2026-10-20T08:30:00.000Z", ...eventWindow }));
    },
  },
  VENUE_STAFF: {
    cards: "main article",
    setup: (state) => {
      state.venueBookings = { bookings: Array.from({ length: 4 }, (_, index) => ({ bookingId: 110 + index, label: null, status: "PENDING", statusLabel: "Pending", venueId: 45, venueName: `Synthetic Hall ${index}`, expectedAttendance: 120, submittedAt: "2026-10-07T13:32:08.000Z", updatedAt: "2026-10-08T02:00:00.000Z", event: forum, ...eventWindow })), hasMore: false, pendingCount: 4 };
    },
  },
};

const perRow = (page, selector) => page.locator(selector).evaluateAll((cards) => {
  const top = Math.round(cards[0].getBoundingClientRect().top);
  return cards.filter((card) => Math.round(card.getBoundingClientRect().top) === top).length;
});

for (const [role, { path = "/dashboard", cards, setup }] of Object.entries(dashboards)) {
  test(`${role} dashboard cards: three a row on a laptop, two on a tablet, one on a phone`, async ({ page }) => {
    const state = await installConnectSphereMocks(page, { role });
    await setup(state, page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(path);
    await expect(page.locator(cards)).toHaveCount(4);
    expect(await perRow(page, cards)).toBe(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1366);

    await page.setViewportSize({ width: 820, height: 1000 });
    await expect.poll(() => perRow(page, cards)).toBe(2);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => perRow(page, cards)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
}
