import { test, expect } from "@playwright/test";
import { installConnectSphereMocks, attachScreenshot, routeVenuePhotos, venueOption as venue } from "./support.mjs";

// SPM-179: the assigned coordinator requests venue bookings from the event's
// venue section. The mocks return the shapes of GET/POST
// /api/events/:id/venue-bookings (backend branch feature/SPM-179-venue-booking-request);
// every rule is the backend's, these journeys check the form and its states.

// E1 runs 09:00–17:00 SGT on Sunday 10 March 2030.
const START = "2030-03-10T01:00:00.000Z";
const END = "2030-03-10T09:00:00.000Z";

const eventView = (overrides = {}) => ({
  eventId: 42,
  requestId: "REQ-000042",
  status: "PLANNING",
  statusLabel: "Approved & Planning",
  statusNote: null,
  title: "Synthetic Planning Forum",
  purpose: "Annual planning forum",
  description: "Talks and workshops.",
  startDatetime: START,
  endDatetime: END,
  expectedAttendance: 150,
  preferredLayoutType: "THEATRE",
  accessibilityNeeds: ["Wheelchair accessible entrance"],
  venuePreferences: [45, 46],
  equipmentRequirements: [],
  isRegistrationEnabled: false,
  registrationCapacity: null,
  createdAt: "2026-10-10T09:00:00.000Z",
  updatedAt: "2026-10-12T09:00:00.000Z",
  version: 3,
  organisation: { organisationId: 1, name: "Synthetic Org A" },
  isAssignedToCoordinator: true,
  isOwner: false,
  viewerRelationship: "ASSIGNED_COORDINATOR",
  permissions: { canEdit: true, editableFields: ["title", "purpose", "description"], canViewDraftHistory: false, canViewStaffHistory: true, canSuggestVenue: true },
  coordinatorId: 11,
  coordinatorName: "Synthetic Coordinator",
  organiser: { userId: 5, name: "Synthetic Organiser" },
  venueSuggestion: null,
  ...overrides,
});

const hall = venue();
const annex = venue({ venueId: 46, name: "Synthetic Annex", maxCapacity: 80, coverPhotoId: null, supportedLayouts: ["CLASSROOM"], rooms: [{ roomId: 2, layoutType: "CLASSROOM", capacity: 80 }] });
const terrace = venue({ venueId: 47, name: "Synthetic Terrace", maxCapacity: 120, coverPhotoId: null });
// Venue Staff have not set its setup/turnaround times, so it takes no bookings (TC-14).
const workshop = venue({ venueId: 48, name: "Synthetic Workshop", maxCapacity: 60, coverPhotoId: null, setupMinutes: null, turnaroundMinutes: null });

const options = () => ({
  event: { eventId: 42, requestId: "REQ-000042", startDatetime: START, endDatetime: END, expectedAttendance: 150, preferredLayoutType: "THEATRE", accessibilityNeeds: ["Wheelchair accessible entrance"] },
  venues: [hall, annex, terrace, workshop],
  preferredVenues: [
    { rank: 1, venueId: 45, name: hall.name, option: hall },
    { rank: 2, venueId: 46, name: annex.name, option: annex },
  ],
  detailsAvailable: true,
  availabilityChecked: true,
  filtersNotChecked: [],
  canSuggestVenue: true,
});

const booking = (overrides = {}) => ({
  bookingId: 900,
  venueId: 47,
  venueName: "Synthetic Terrace",
  label: "Reception",
  status: "APPROVED",
  statusLabel: "Approved",
  isPrimary: true,
  start: "2030-03-10T07:00:00.000Z",
  end: "2030-03-10T09:00:00.000Z",
  occupiedStart: "2030-03-10T06:30:00.000Z",
  occupiedEnd: "2030-03-10T09:45:00.000Z",
  expectedAttendance: 100,
  layout: "Cocktail",
  requiredFacilities: [],
  accessibilityNeeds: [],
  specialRequirements: null,
  rejectionReason: null,
  requestedAt: "2026-10-20T00:00:00.000Z",
  ...overrides,
});

const list = (overrides = {}) => ({
  eventId: 42,
  requestId: "REQ-000042",
  eventType: "CONFERENCE",
  eventTypeLabel: "Conference",
  canRequestVenueBookings: true,
  bookings: [],
  ...overrides,
});

const periodCheck = (venueId, { canRequest = true, hours = null } = {}) => ({
  start: START,
  end: END,
  occupiedStart: "2030-03-10T00:30:00.000Z",
  occupiedEnd: "2030-03-10T09:45:00.000Z",
  availability: canRequest ? (hours ? "AVAILABLE_WITH_WARNING" : "AVAILABLE") : "UNAVAILABLE_BOOKING",
  availabilityLabel: canRequest ? (hours ? "Potentially suitable – operating-hours warning" : "Available") : "Unavailable – booking",
  canRequest,
  conflicts: canRequest ? [] : [{ entryId: "booking-5", type: "BOOKING", occupiedStart: "2030-03-10T02:30:00.000Z", occupiedEnd: "2030-03-10T05:45:00.000Z" }],
  operatingHoursWarning: hours ? { message: hours } : null,
  venueId,
});

// As the backend answers: with no primary yet, a lone booking becomes primary;
// otherwise the marked one does, and an event with a primary keeps it.
const saved = (items, eventHasPrimary = false) => ({
  message: items.length === 1 ? "Venue booking requested. Venue Staff will review it." : `${items.length} venue bookings requested. Venue Staff will review them.`,
  eventId: 42,
  requestId: "REQ-000042",
  arrangementVersion: 4,
  bookings: items.map((item, index) => ({
    index,
    bookingId: 901 + index,
    venueId: item.venueId,
    venueName: [hall, annex, terrace].find((option) => option.venueId === item.venueId)?.name ?? null,
    label: item.label,
    start: item.start,
    end: item.end,
    occupiedStart: item.start,
    occupiedEnd: item.end,
    expectedAttendance: item.expectedAttendance,
    layout: item.layout,
    requiredFacilities: item.requiredFacilities,
    accessibilityNeeds: item.accessibilityNeeds,
    specialRequirements: item.specialRequirements,
    isPrimary: !eventHasPrimary && (items.length === 1 || item.isPrimary),
    status: "PENDING",
    statusLabel: "Pending",
  })),
  warnings: [],
  replayed: false,
});

// Routes the event page and its venue section; `respond` answers the POST.
// Returns what the page sent.
async function routeBookingSection(page, { event = eventView(), bookingList = list(), respond = null, availability = {}, history = [] } = {}) {
  const sent = { requests: [], availability: [], eventLoads: 0, readinessLoads: 0 };
  let current = bookingList;
  await page.route(/\/api\/events\/42(\/.*)?(\?.*)?$/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fallback();
    if (url.pathname === "/api/events/42") {
      sent.eventLoads += 1;
      return route.fulfill({ json: { event } });
    }
    if (url.pathname === "/api/events/42/readiness") {
      sent.readinessLoads += 1;
      return route.fulfill({ json: { ready: false, failures: [{ code: "BOOKING_NOT_APPROVED", message: "Every venue booking must be approved; holds and pending requests do not count." }], status: event.status, version: event.version, arrangementVersion: 3 } });
    }
    if (url.pathname === "/api/events/42/history") return route.fulfill({ json: { history, nextCursor: null } });
    if (url.pathname === "/api/events/42/venue-options") return route.fulfill({ json: options() });
    if (url.pathname === "/api/events/42/venue-availability") {
      const venueId = Number(url.searchParams.get("venueId"));
      sent.availability.push(Object.fromEntries(url.searchParams));
      const setting = availability[venueId] ?? {};
      if (setting.status) return route.fulfill({ status: setting.status, json: { error: "Availability could not be checked." } });
      return route.fulfill({ json: { from: url.searchParams.get("from"), to: url.searchParams.get("to"), venues: [{ venueId, name: "x", address: "", status: "ACTIVE", operatingHours: "08:00-22:00", setupMinutes: 30, turnaroundMinutes: 45, buffersRecorded: true, entries: [], overlaps: [], freePeriods: [], summary: "AVAILABLE", summaryLabel: "Available", check: periodCheck(venueId, setting) }] } });
    }
    if (url.pathname === "/api/events/42/venue-bookings" && request.method() === "GET") return route.fulfill({ json: current });
    if (url.pathname === "/api/events/42/venue-bookings" && request.method() === "POST") {
      const body = request.postDataJSON();
      sent.requests.push({ body, key: request.headers()["idempotency-key"] });
      const hasPrimary = current.bookings.some((item) => item.isPrimary && ["PENDING", "APPROVED"].includes(item.status));
      const answer = respond ? respond(body, sent.requests.length) : { status: 201, json: saved(body.bookings, hasPrimary) };
      if (answer.status < 300) {
        current = { ...current, bookings: [...current.bookings, ...answer.json.bookings.map((item) => booking({ ...item, rejectionReason: null, requestedAt: "2026-10-28T00:00:00.000Z" }))] };
      }
      return route.fulfill(answer);
    }
    return route.fulfill({ status: 501, json: { error: `Unmocked ${url.pathname}` } });
  });
  await routeVenuePhotos(page);
  return sent;
}

const bookingsRegion = (page) => page.getByRole("region", { name: "Venue bookings" });
const form = (page) => page.getByRole("dialog", { name: "Request venue bookings" });
const section = (page, number) => form(page).getByRole("group", { name: new RegExp(`^Venue section ${number}:`) });
const openForm = async (page) => {
  await bookingsRegion(page).getByRole("button", { name: "Request venue bookings" }).click();
  await expect(form(page)).toBeVisible();
};

test("[SPM-179 TC-01][AC2][AC11][AC12] the coordinator requests one venue and sees it pending", async ({ page }, testInfo) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const sent = await routeBookingSection(page);
  await page.goto("/events/42");

  await expect(bookingsRegion(page).getByText("No venue bookings have been requested yet.")).toBeVisible();
  await openForm(page);

  // AC2: event details read-only; the first section starts from the organiser's first choice.
  const details = form(page).getByRole("complementary", { name: "Event details" });
  await expect(details.getByText("REQ-000042")).toBeVisible();
  await expect(details.getByText("Synthetic Planning Forum")).toBeVisible();
  await expect(details.getByText("Conference")).toBeVisible();
  await expect(details.getByText(/Sun, 10 Mar 2030 · 09:00–17:00 SGT/)).toBeVisible();
  const first = section(page, 1);
  await expect(first.getByRole("combobox", { name: "Venue (required)", exact: true })).toHaveValue("45");
  await expect(first.getByRole("textbox", { name: "Label (required)", exact: true })).toHaveValue("Synthetic Grand Hall");
  await expect(first.getByLabel("Start (SGT)")).toHaveValue("2030-03-10T09:00");
  await expect(first.getByLabel("End (SGT)")).toHaveValue("2030-03-10T17:00");
  await expect(first.getByLabel("Expected attendance at this venue")).toHaveValue("150");
  await expect(first.getByRole("combobox", { name: "Layout (required)", exact: true })).toHaveValue("Theatre");
  // A single venue becomes primary by itself, so there is no primary choice.
  await expect(form(page).getByRole("radio", { name: "Primary venue" })).toHaveCount(0);
  // Advisory availability from the calendar's period check.
  await expect(first.getByText("Available", { exact: true })).toBeVisible();

  await first.getByLabel("Start (SGT)").fill("2030-03-10T10:00");
  await first.getByLabel("End (SGT)").fill("2030-03-10T12:00");
  await first.getByLabel("Special requirements").fill("Coffee for 150 at 10:30");
  await attachScreenshot(testInfo, page, "request-form");
  await form(page).getByRole("button", { name: "Send booking request" }).click();

  await expect(form(page)).toBeHidden();
  expect(sent.requests).toHaveLength(1);
  expect(sent.requests[0].key).toMatch(/^[0-9a-f-]{36}$/);
  expect(sent.requests[0].body).toEqual({
    bookings: [{
      venueId: 45,
      label: "Synthetic Grand Hall",
      start: "2030-03-10T02:00:00.000Z",
      end: "2030-03-10T04:00:00.000Z",
      expectedAttendance: 150,
      layout: "Theatre",
      requiredFacilities: [],
      accessibilityNeeds: ["Wheelchair accessible entrance"],
      specialRequirements: "Coffee for 150 at 10:30",
      isPrimary: false,
    }],
  });

  // AC12: confirmation with the event reference and booking ID; the list shows Pending.
  const confirmation = page.getByRole("status").filter({ hasText: "Booking request sent" });
  await expect(confirmation).toContainText("REQ-000042");
  await expect(confirmation).toContainText("Booking #901 (Synthetic Grand Hall)");
  const row = bookingsRegion(page).getByRole("listitem").filter({ hasText: "Synthetic Grand Hall" });
  await expect(row.getByText("Pending", { exact: true })).toBeVisible();
  await expect(row.getByText("Primary venue")).toBeVisible();
  await attachScreenshot(testInfo, page, "pending-booking");
});

test("[SPM-179 AC11] after a request the event, readiness and history are loaded again", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const sent = await routeBookingSection(page);
  await page.goto("/events/42");
  await expect(bookingsRegion(page).getByText("No venue bookings have been requested yet.")).toBeVisible();
  await expect.poll(() => sent.readinessLoads).toBeGreaterThan(0);
  const before = { event: sent.eventLoads, readiness: sent.readinessLoads };

  await openForm(page);
  await form(page).getByRole("button", { name: "Send booking request" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Booking request sent" })).toBeVisible();
  // The request moves arrangement_version, not the event version.
  await expect.poll(() => sent.eventLoads).toBeGreaterThan(before.event);
  await expect.poll(() => sent.readinessLoads).toBeGreaterThan(before.readiness);
});

test("[SPM-179 AC11] the history entry lists each requested booking, without empty From/To rows", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeBookingSection(page, {
    history: [{
      historyId: 1,
      action: "VENUE_BOOKINGS_REQUESTED",
      actor: { userId: 11, name: "Synthetic Coordinator", role: "COORDINATOR" },
      occurredAt: "2026-10-29T04:00:00.000Z",
      summary: "Venue booking requested: Synthetic Grand Hall, Synthetic Seminar Room.",
      changes: [{ field: "venueBookings", before: null, after: ["Synthetic Grand Hall (Booking #501, primary)", "Synthetic Seminar Room (Booking #502)"] }],
      audience: "STAFF_ONLY",
    }],
  });
  await page.goto("/events/42");

  const history = page.getByRole("region", { name: "Change history" });
  await expect(history.getByText("Venue bookings requested")).toBeVisible();
  await expect(history.getByText("Venue bookings", { exact: true })).toBeVisible();
  await expect(history.getByText("Synthetic Grand Hall (Booking #501, primary)", { exact: true })).toBeVisible();
  await expect(history.getByText("Synthetic Seminar Room (Booking #502)")).toBeVisible();
  await expect(history.getByText("From:")).toHaveCount(0);
  await expect(history.getByText("venueBookings")).toHaveCount(0);
});

test("[SPM-179 TC-14][AC7] a venue without setup and turnaround times is listed but cannot be chosen", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeBookingSection(page);
  await page.goto("/events/42");
  await openForm(page);
  const choice = section(page, 1).getByRole("option", { name: /Synthetic Workshop .*setup and turnaround times not set/ });
  await expect(choice).toBeDisabled();
});

test("[SPM-179 TC-02][TC-03][AC4][AC5][AC10] several venues need valid sections and one primary", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const sent = await routeBookingSection(page);
  await page.goto("/events/42");
  await openForm(page);

  await form(page).getByRole("button", { name: "Add another venue" }).click();
  await form(page).getByRole("button", { name: "Add another venue" }).click();
  await expect(form(page).getByText("3 of 10 venues")).toBeVisible();
  // Remove deletes only that section.
  await section(page, 3).getByRole("button", { name: "Remove venue section 3" }).click();
  await expect(form(page).getByText("2 of 10 venues")).toBeVisible();
  await expect(section(page, 1).getByRole("combobox", { name: "Venue (required)", exact: true })).toHaveValue("45");

  // A venue chosen in another section cannot be picked again.
  const second = section(page, 2);
  await expect(second.getByRole("option", { name: /Synthetic Grand Hall .*in another section/ })).toBeDisabled();

  // TC-03: empty fields are reported inline in section 2, and nothing is sent.
  await second.getByLabel("Expected attendance at this venue").fill("");
  await form(page).getByRole("button", { name: "Send booking request" }).click();
  await expect(form(page).getByText("Nothing was sent. Correct the highlighted fields.")).toBeVisible();
  await expect(second.getByText("Venue is required.")).toBeVisible();
  await expect(second.getByText("Label is required.")).toBeVisible();
  await expect(second.getByText("Expected attendance is required.")).toBeVisible();
  await expect(section(page, 1).getByText("Venue is required.")).toHaveCount(0);
  await expect(form(page).getByText("Choose one primary venue.")).toBeVisible();
  await expect(second.getByRole("combobox", { name: "Venue (required)", exact: true })).toHaveAttribute("aria-invalid", "true");
  expect(sent.requests).toHaveLength(0);

  // AC6 before sending: attendance above the venue's capacity, on that venue only.
  await second.getByRole("combobox", { name: "Venue (required)", exact: true }).selectOption("46");
  await expect(second.getByRole("textbox", { name: "Label (required)", exact: true })).toHaveValue("Synthetic Annex");
  await second.getByLabel("Expected attendance at this venue").fill("81");
  await section(page, 1).getByRole("radio", { name: "Primary venue" }).check();
  await form(page).getByRole("button", { name: "Send booking request" }).click();
  await expect(second.getByText("Expected attendance (81) exceeds this venue's capacity (80).")).toBeVisible();
  expect(sent.requests).toHaveLength(0);

  await second.getByLabel("Expected attendance at this venue").fill("60");
  // AC8: an unsupported layout is a warning only.
  await expect(second.getByText("Synthetic Annex does not list the Theatre layout.")).toBeVisible();
  await form(page).getByRole("button", { name: "Send booking request" }).click();
  await expect(form(page)).toBeHidden();
  expect(sent.requests[0].body.bookings.map((item) => [item.venueId, item.isPrimary, item.expectedAttendance])).toEqual([[45, true, 150], [46, false, 60]]);
  await expect(page.getByRole("status").filter({ hasText: "Booking request sent" })).toContainText("Booking #901 (Synthetic Grand Hall), Booking #902 (Synthetic Annex)");
});

test("[SPM-179 TC-09][TC-22][AC7][AC13][AC16] a refused request keeps every value and retries with the same key", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const conflictText = "This venue is unavailable from 10 Mar, 10:30 to 10 Mar, 13:45 (another booking), including setup and turnaround time.";
  const sent = await routeBookingSection(page, {
    availability: { 46: { canRequest: false } },
    respond: (body, attempt) => {
      if (attempt === 1) return { status: 409, json: { error: conflictText, code: "BOOKING_CONFLICT", bookingIndex: 1, venueId: 46, fields: { "bookings.1.start": conflictText }, conflicts: [{ index: 1, type: "BOOKING", occupiedStart: "2030-03-10T02:30:00.000Z", occupiedEnd: "2030-03-10T05:45:00.000Z" }] } };
      if (attempt === 2) return { status: 503, json: { error: "Availability could not be checked. Try again later.", code: "AVAILABILITY_UNAVAILABLE" } };
      return { status: 201, json: saved(body.bookings) };
    },
  });
  await page.goto("/events/42");
  await openForm(page);
  await form(page).getByRole("button", { name: "Add another venue" }).click();
  const second = section(page, 2);
  await second.getByRole("combobox", { name: "Venue (required)", exact: true }).selectOption("46");
  await second.getByLabel("Expected attendance at this venue").fill("60");
  await second.getByRole("combobox", { name: "Layout (required)", exact: true }).fill("Classroom");
  await section(page, 1).getByRole("radio", { name: "Primary venue" }).check();

  // The calendar already shows the clash before sending (advisory).
  await expect(second.getByText("Unavailable – booking")).toBeVisible();
  await expect(second.getByText(/Taken 10:30–13:45 SGT by another booking/)).toBeVisible();

  await form(page).getByRole("button", { name: "Send booking request" }).click();
  await expect(second.getByText(conflictText)).toBeVisible();
  await expect(section(page, 1).getByText(conflictText)).toHaveCount(0);
  await expect(form(page).getByText("Nothing was saved. Correct the highlighted fields and send the request again.")).toBeVisible();
  // AC16: values kept.
  await expect(second.getByLabel("Expected attendance at this venue")).toHaveValue("60");
  await expect(second.getByRole("combobox", { name: "Layout (required)", exact: true })).toHaveValue("Classroom");

  // A system failure: banner, values kept; resending the same body reuses its key (AC13).
  await form(page).getByRole("button", { name: "Send booking request" }).click();
  await expect(form(page).getByText("Availability could not be checked. Try again later.")).toBeVisible();
  await expect(second.getByRole("combobox", { name: "Venue (required)", exact: true })).toHaveValue("46");
  expect(sent.requests[1].key).toBe(sent.requests[0].key);

  await form(page).getByRole("button", { name: "Send booking request" }).click();
  await expect(form(page)).toBeHidden();
  expect(sent.requests[2].key).toBe(sent.requests[0].key);
});

test("[SPM-179 AC1][AC10][TC-15] an event with a primary venue adds venues as additional ones; booked venues are not offered", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const sent = await routeBookingSection(page, { bookingList: list({ bookings: [booking({ venueId: 45, venueName: "Synthetic Grand Hall", label: "Main hall" })] }) });
  await page.goto("/events/42");

  const row = bookingsRegion(page).getByRole("listitem").filter({ hasText: "Synthetic Grand Hall" });
  await expect(row.getByText("Approved", { exact: true })).toBeVisible();
  await expect(row.getByText("Primary venue")).toBeVisible();
  await expect(row.getByText("Booking #900")).toBeVisible();

  // The booked venue's card has no Request booking; another choice's card starts the form with it.
  const choices = page.getByRole("region", { name: "Organiser's venue choices" });
  await expect(choices.getByRole("article", { name: "Synthetic Grand Hall", exact: true }).getByRole("button", { name: "Request booking" })).toHaveCount(0);
  await choices.getByRole("article", { name: "Synthetic Annex", exact: true }).getByRole("button", { name: "Request booking" }).click();
  await expect(form(page)).toBeVisible();
  await expect(section(page, 1).getByRole("combobox", { name: "Venue (required)", exact: true })).toHaveValue("46");
  await expect(form(page).getByText("Synthetic Grand Hall is this event's primary venue. New venues are added as additional venues.")).toBeVisible();
  await expect(section(page, 1).getByRole("option", { name: /Synthetic Grand Hall .*already booked for this event/ })).toBeDisabled();

  await form(page).getByRole("button", { name: "Add another venue" }).click();
  await expect(form(page).getByRole("radio", { name: "Primary venue" })).toHaveCount(0);
  await section(page, 2).getByRole("combobox", { name: "Venue (required)", exact: true }).selectOption("47");
  await section(page, 1).getByLabel("Expected attendance at this venue").fill("60");
  await section(page, 2).getByLabel("Expected attendance at this venue").fill("100");
  await form(page).getByRole("button", { name: "Send booking request" }).click();
  await expect(form(page)).toBeHidden();
  expect(sent.requests[0].body.bookings.map((item) => item.isPrimary)).toEqual([false, false]);
});

test("[SPM-179 AC1][TC-19] the supervising Lead reads the bookings without a request button", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR_LEAD" });
  await routeBookingSection(page, {
    event: eventView({ viewerRelationship: "SUPERVISING_LEAD", permissions: { canEdit: false, editableFields: [], canViewDraftHistory: false, canViewStaffHistory: false, canSuggestVenue: false } }),
    bookingList: list({ canRequestVenueBookings: false, bookings: [booking({ status: "PENDING", statusLabel: "Pending" })] }),
  });
  await page.goto("/events/42");
  await expect(bookingsRegion(page).getByText("Synthetic Terrace · Reception")).toBeVisible();
  await expect(bookingsRegion(page).getByText("Read-only: only the assigned coordinator can request venue bookings.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Request venue bookings" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Request booking" })).toHaveCount(0);
});

test("[SPM-179 AC1] outside planning the coordinator sees the bookings but cannot request", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeBookingSection(page, {
    event: eventView({ status: "SAFETY_REVIEW", statusLabel: "Approved & Planning" }),
    bookingList: list({ canRequestVenueBookings: false, bookings: [booking({ status: "REJECTED", statusLabel: "Rejected", isPrimary: false, rejectionReason: "Closed for repairs that week." })] }),
  });
  await page.goto("/events/42");
  await expect(bookingsRegion(page).getByText("Venue bookings can be requested while the event is in planning.")).toBeVisible();
  await expect(bookingsRegion(page).getByText("Closed for repairs that week.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Request venue bookings" })).toHaveCount(0);
});

test("[SPM-179 AC16] closing a changed form asks before discarding it", async ({ page }) => {
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  const sent = await routeBookingSection(page);
  await page.goto("/events/42");

  // An untouched form closes straight away.
  await openForm(page);
  await form(page).getByRole("button", { name: "Cancel" }).click();
  await expect(form(page)).toBeHidden();

  await openForm(page);
  await section(page, 1).getByRole("textbox", { name: "Label (required)", exact: true }).fill("Plenary");
  await page.keyboard.press("Escape");
  const discard = page.getByRole("dialog", { name: "Discard this booking request?" });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "Keep editing" }).click();
  await expect(discard).toBeHidden();
  await expect(section(page, 1).getByRole("textbox", { name: "Label (required)", exact: true })).toHaveValue("Plenary");

  await form(page).getByRole("button", { name: "Close dialog" }).click();
  await discard.getByRole("button", { name: "Discard" }).click();
  await expect(form(page)).toBeHidden();
  await expect(bookingsRegion(page).getByRole("button", { name: "Request venue bookings" })).toBeFocused();
  // A new opening starts fresh.
  await openForm(page);
  await expect(section(page, 1).getByRole("textbox", { name: "Label (required)", exact: true })).toHaveValue("Synthetic Grand Hall");
  expect(sent.requests).toHaveLength(0);
});

test("[SPM-179] the request form works at phone width", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installConnectSphereMocks(page, { role: "COORDINATOR" });
  await routeBookingSection(page, { availability: { 45: { hours: "Occupied time 22:00–23:15 is outside operating hours (08:00-22:00)." } } });
  await page.goto("/events/42");
  await openForm(page);
  await expect(section(page, 1).getByText("Occupied time 22:00–23:15 is outside operating hours (08:00-22:00).")).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await attachScreenshot(testInfo, page, "request-form-mobile");
});
