import { expect } from "@playwright/test";

const FIXED_SAVED_AT = "2026-10-13T12:00:00.000Z";

export const makeDraft = (overrides = {}) => ({
  eventId: 43,
  requestId: "REQ-000043",
  status: "DRAFT",
  statusLabel: "Draft",
  title: "SMU Alumni Gala 2026",
  purpose: "Reconnect alumni",
  description: "An evening for SMU alumni.",
  startDatetime: "2026-10-20T09:00:00.000Z",
  endDatetime: "2026-10-20T11:00:00.000Z",
  expectedAttendance: 200,
  preferredLayoutType: "NO_PREFERENCE",
  accessibilityNeeds: [],
  isRegistrationEnabled: false,
  registrationCapacity: null,
  venuePreferences: [],
  equipmentRequirements: [],
  updatedAt: FIXED_SAVED_AT,
  submittedAt: null,
  coordinatorName: null,
  isAssignedToCoordinator: false,
  isOwner: true,
  viewerRelationship: "OWNER",
  permissions: { canEdit: true, editableFields: [], canViewDraftHistory: true, canViewStaffHistory: false },
  ...overrides,
});

// Organiser responses carry statusLabel but not the stored status (backend
// SPM-173 AC6); only the assigned coordinator's event view keeps it. The mock
// state keeps status so the routes below can decide like the backend does.
export const organiserView = (event) => {
  if (!event || event.viewerRelationship === "ASSIGNED_COORDINATOR") return event;
  const view = { ...event };
  delete view.status;
  return view;
};

export async function installConnectSphereMocks(page, { authenticated = true, draft = null, role = "ORGANISER" } = {}) {
  const state = {
    events: draft ? [draft] : [],
    draft,
    draftCreateRequests: [],
    draftUpdateRequests: [],
    submitDraftRequests: [],
    createEventRequests: [],
    role,
    revoked: false,
    failure: null,
    delay: 0,
    requestLog: [],
    assignments: [],
    queueEvents: null,
    coordinatorChanges: [],
    coordinators: [{ coordinatorId: 21, name: "Test Coordinator", events: [{ eventId: 72, requestId: "REQ-000072", status: "CONFIRMED", title: "Coordinator availability event", startDatetime: "2026-10-20T12:00:00.000Z", endDatetime: "2026-10-20T13:00:00.000Z", expectedAttendance: 80, organisation: { organisationId: 7, name: "Test Organisation" }, createdAt: "2026-10-02T09:00:00.000Z" }] }],
  };

  if (authenticated) {
    await page.addInitScript(() => {
      localStorage.setItem("sb-test-project-auth-token", JSON.stringify({
        access_token: "e2e-access-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "e2e-refresh-token",
        user: {
          id: "e2e-organiser-id",
          aud: "authenticated",
          role: "authenticated",
          email: "organiser@example.com",
          app_metadata: { provider: "email", providers: ["email"] },
          user_metadata: { full_name: "Test Organiser" },
          created_at: "2026-01-01T00:00:00.000Z",
        },
      }));
    });
  }

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();
    state.requestLog.push({ pathname, method });
    const json = (body, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" } });
    if (state.failure && state.failure.path === pathname) return json(state.failure.body, state.failure.status);
    if (pathname === "/api/auth/me") return state.revoked ? json({ error: "Please log in to continue." }, 401) : json({ user: { user_id: 11, name: "Test User", email: "user@example.com", role: state.role } });
    if (pathname === "/api/auth/logout") { state.revoked = true; return route.fulfill({ status: 204 }); }
    if (pathname === "/api/venues/bookings") return json(state.venueBookings ?? { bookings: [], hasMore: false, pendingCount: 0 });
    if (pathname === "/api/venues/manage/options") return json({ venues: state.venueOptions ?? [] });
    if (pathname === "/api/events/assigned") return json({ events: [{ eventId: 42, title: "Assigned coordinator event", status: "UNDER_REVIEW" }] });
    if (pathname === "/api/events/unassigned") {
      if (state.queueEvents === null) state.queueEvents = { events: [{ eventId: 71, requestId: "REQ-000071", status: "SUBMITTED", title: "Unassigned lead queue event", purpose: "Community outreach", startDatetime: "2026-10-20T09:00:00.000Z", endDatetime: "2026-10-20T11:00:00.000Z", expectedAttendance: 120, venuePreferences: [1], equipmentRequirements: [{ equipmentId: 4, quantity: 2 }], organisation: { organisationId: 7, name: "Test Organisation" }, createdAt: "2026-10-01T09:00:00.000Z", submittedAt: "2026-10-20T08:30:00.000Z" }] }.events;
      return json({ events: state.queueEvents });
    }
    if (pathname === "/api/events/assignments") return json({ assignments: state.assignments });
    const coordinatorChange = pathname.match(/^\/api\/events\/(\d+)\/coordinator$/);
    if (coordinatorChange && method === "PATCH") {
      const payload = request.postDataJSON();
      state.coordinatorChanges.push(payload);
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      const id = Number(coordinatorChange[1]);
      const reassign = payload.expectedCoordinatorId !== undefined;
      const event = (reassign ? state.assignments : state.queueEvents || []).find(event => event.eventId === id);
      if (!event) return json({ error: "Event not found.", code: "EVENT_NOT_FOUND" }, 404);
      if (reassign && event.coordinatorId !== payload.expectedCoordinatorId) return json({ error: "Assignment changed. Refresh and try again.", code: "ASSIGNMENT_CHANGED" }, 409);
      const target = state.coordinators.find(coordinator => coordinator.coordinatorId === payload.coordinatorId);
      if (!target) return json({ error: "Invalid coordinator.", code: "INVALID_COORDINATOR" }, 409);
      for (const coordinator of state.coordinators) coordinator.events = coordinator.events.filter(other => other.eventId !== id);
      const assigned = { ...event, status: reassign ? event.status : "UNDER_REVIEW", coordinatorId: target.coordinatorId, coordinatorName: target.name, supervisingLeadId: 11, hasScheduleConflict: false };
      state.assignments = [...state.assignments.filter(other => other.eventId !== id), assigned];
      state.queueEvents = (state.queueEvents || []).filter(other => other.eventId !== id);
      target.events.push(assigned);
      return json({ event: assigned, coordinator: { coordinatorId: target.coordinatorId, name: target.name } });
    }
    if (pathname === "/api/events/coordinator-availability") return json({ coordinators: state.coordinators });
    if (pathname === "/api/registrations/mine") return json({ registrations: [{ registration_id: 1, registration_status: "REGISTERED", event: { title: "Registered attendee event", attendee_status: "CONFIRMED", description: "Public event description", venue: null } }], page: { next_offset: null } });
    if (pathname === "/api/events/request-options") return json({ venues: [{venueId: 1, name: "Main Hall"}], layouts: ["NO_PREFERENCE", "THEATRE"] });

    if (pathname === "/api/events/mine" && method === "GET") {
      return json({ events: state.events.map(organiserView), nextCursor: null });
    }

    if (pathname === "/api/events/drafts" && method === "POST") {
      const payload = request.postDataJSON();
      state.draftCreateRequests.push(payload);
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      state.draft = makeDraft({ ...payload, eventId: 501, requestId: "REQ-000501" });
      state.events = [state.draft, ...state.events.filter((event) => event.eventId !== state.draft.eventId)];
      return json({ message: "Draft saved successfully.", event: organiserView(state.draft), savedAt: FIXED_SAVED_AT }, 201);
    }

    if (/^\/api\/events\/\d+\/history$/.test(pathname) && method === "GET") return json({ history: [], nextCursor: null });
    const eventMatch = pathname.match(/^\/api\/events\/(\d+)$/);
    if (eventMatch && method === "GET") {
      const event = state.events.find(event => event.eventId === Number(eventMatch[1]));
      if (event) return json({ event: organiserView(event) });
      return json({ error: "Event not found." }, 404);
    }

    const draftMatch = pathname.match(/^\/api\/events\/(\d+)\/draft$/);
    if (draftMatch && method === "PUT") {
      const payload = request.postDataJSON();
      state.draftUpdateRequests.push(payload);
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      if (!state.draft || Number(draftMatch[1]) !== state.draft.eventId) return json({ error: "Draft not found." }, 404);
      const fields = { ...payload };
      delete fields.isAutoSave;
      state.draft = makeDraft({ ...state.draft, ...fields, updatedAt: FIXED_SAVED_AT });
      state.events = state.events.map((event) => event.eventId === state.draft.eventId ? state.draft : event);
      return json({ message: payload.isAutoSave ? "Draft auto-saved." : "Draft saved successfully.", event: organiserView(state.draft), savedAt: FIXED_SAVED_AT });
    }

    const submitMatch = pathname.match(/^\/api\/events\/(\d+)\/submit$/);
    if (submitMatch && method === "PUT") {
      const payload = request.postDataJSON();
      state.submitDraftRequests.push(payload);
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      if (state.draft?.status !== "DRAFT") return json({ error: "Only draft requests can be changed or submitted.", code: "EVENT_NOT_DRAFT" }, 409);
      const missingAttendance = !payload.expectedAttendance;
      if (missingAttendance) {
        return json({ error: "Please fix the highlighted fields.", fields: { expectedAttendance: "Expected Attendance is required for submission." } }, 400);
      }
      state.draft = makeDraft({ ...state.draft, ...payload, status: "SUBMITTED", statusLabel: "Submitted", submittedAt: FIXED_SAVED_AT, permissions: { ...state.draft?.permissions, canEdit: false } });
      state.events = state.events.map((event) => event.eventId === state.draft.eventId ? state.draft : event);
      return json({ message: "Your event request has been submitted successfully.", event: organiserView(state.draft) });
    }

    if (pathname === "/api/events" && method === "POST") {
      const payload = request.postDataJSON();
      state.createEventRequests.push({ payload, headers: request.headers() });
      const event = makeDraft({ ...payload, eventId: 600, requestId: "REQ-000600", status: "SUBMITTED", statusLabel: "Submitted", submittedAt: FIXED_SAVED_AT, permissions: { ...state.draft?.permissions, canEdit: false } });
      state.events = [event, ...state.events];
      return json({ message: "Your event request has been submitted successfully.", event: organiserView(event) }, 201);
    }

    return json({ error: `Unmocked API request: ${method} ${pathname}` }, 501);
  });

  return state;
}

export const localDateTimeInput = (date) => {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export async function enterCompleteRequestThroughSubmit(page, { startHours = 168, attendance = "150" } = {}) {
  const next = () => page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Event Title").fill("Tech Conference 2026");
  await page.getByLabel("Event Purpose").fill("Annual industry conference");
  await page.getByLabel("Executive Abstract & Event Scope").fill("Talks and networking for tech professionals.");
  await next();
  await expect(page.getByRole("heading", { name: "Scheduling & Attendance Estimates" })).toBeVisible();

  const start = new Date(await page.evaluate(() => Date.now()) + startHours * 60 * 60 * 1000);
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  await page.getByLabel("Primary Proposed Date").fill(localDateTimeInput(start));
  await page.getByLabel("Event End Date & Time").fill(localDateTimeInput(end));
  if (attendance !== null) await page.getByLabel("Targeted In-Person Headcount").fill(attendance);
  await next();
  await expect(page.getByRole("heading", { name: "Venue & Layout Requirements" })).toBeVisible();
  await next();
  await expect(page.getByRole("heading", { name: "Accessibility & Special Needs" })).toBeVisible();
  await next();
  await expect(page.getByRole("heading", { name: "Technical & Equipment Requirements" })).toBeVisible();
  await next();
  await expect(page.getByRole("heading", { name: "Registration & Ticketing Needs" })).toBeVisible();
}

export async function attachScreenshot(testInfo, page, name = "result") {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

export async function installLoginMock(page, { role = "ORGANISER", invalid = false, authenticated = false } = {}) {
  const state = await installConnectSphereMocks(page, { authenticated, role });
  await page.route("**/auth/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/token") && invalid) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({error: "invalid_grant", error_description: "Invalid login credentials"}) });
    const user = {id:"e2e-organiser-id", aud:"authenticated", role:"authenticated", email:"user@example.com", app_metadata:{provider:"email"}, user_metadata:{}, created_at:"2026-01-01T00:00:00Z"};
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(path.endsWith("/user") ? user : { access_token:"e2e-access-token", token_type:"bearer", expires_in:3600, refresh_token:"e2e-refresh-token", user }) });
  });
  return state;
}
export { expect };

// SPM-72/74: one venue option as the venue-options routes return it.
export const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005050201a5d9ad9c0000000049454e44ae426082", "hex");

export const requirement = (key, label, status, detail) => ({ key, label, status, detail });
export const venueOption = (overrides = {}) => ({
  venueId: 45,
  name: "Synthetic Grand Hall",
  address: "1 Harbourfront Walk",
  maxCapacity: 300,
  operatingHours: "08:00-22:00",
  accessibilityFeatures: ["Wheelchair accessible entrance"],
  setupMinutes: 30,
  turnaroundMinutes: 45,
  rooms: [{ roomId: 1, layoutType: "THEATRE", capacity: 300 }],
  detailStatus: "CURRENT",
  description: "Main hall with a stage.",
  facilities: ["Projector", "Stage"],
  supportedLayouts: ["THEATRE"],
  emergencyAccess: "Two exits on the north side",
  knownRestrictions: ["No open flames"],
  relatedVenues: [],
  coverPhotoId: "6716f0c2a1b2c3d4e5f60718",
  availability: { status: "AVAILABLE", label: "Available", occupiedStart: "2026-11-20T01:30:00.000Z", occupiedEnd: "2026-11-20T04:45:00.000Z", conflicts: [], operatingHoursWarning: null },
  requirements: [
    requirement("capacity", "Capacity", "MET", "Holds 300; 150 expected"),
    requirement("availability", "Availability", "MET", "Available"),
    requirement("layout", "Layout", "MET", "THEATRE layout"),
    requirement("accessibility-0", "Accessibility", "MET", "Wheelchair access"),
  ],
  unmetCount: 0,
  allRequirementsMet: true,
  ...overrides,
});

// Read-only photos for everyone choosing a venue (GET /api/venues/options/:id/photos).
export async function routeVenuePhotos(page) {
  await page.route(/\/api\/venues\/options\/\d+\/photos(\/\w+)?$/, (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    if (/\/photos$/.test(new URL(route.request().url()).pathname)) {
      return route.fulfill({ json: { photos: [{ photoId: "6716f0c2a1b2c3d4e5f60718", position: 0, caption: "Front entrance", contentType: "image/png", size: PNG.length, uploadedAt: "2026-10-20T00:00:00.000Z", updatedAt: null, version: 1 }] } });
    }
    return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
  });
}
