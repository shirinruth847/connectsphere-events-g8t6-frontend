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
  ...overrides,
});

export async function installConnectSphereMocks(page, { authenticated = true, draft = null } = {}) {
  const state = {
    events: draft ? [draft] : [],
    draft,
    draftCreateRequests: [],
    draftUpdateRequests: [],
    submitDraftRequests: [],
    createEventRequests: [],
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
    const json = (body, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (pathname === "/api/auth/me") {
      return json({ user: { name: "Test Organiser", email: "organiser@example.com", role: "ORGANISER" } });
    }

    if (pathname === "/api/events/mine" && method === "GET") {
      return json({ events: state.events, nextCursor: null });
    }

    if (pathname === "/api/events/drafts" && method === "POST") {
      const payload = request.postDataJSON();
      state.draftCreateRequests.push(payload);
      state.draft = makeDraft({ ...payload, eventId: 501, requestId: "REQ-000501" });
      state.events = [state.draft, ...state.events.filter((event) => event.eventId !== state.draft.eventId)];
      return json({ message: "Draft saved successfully.", event: state.draft, savedAt: FIXED_SAVED_AT }, 201);
    }

    const eventMatch = pathname.match(/^\/api\/events\/(\d+)$/);
    if (eventMatch && method === "GET") {
      if (state.draft && Number(eventMatch[1]) === state.draft.eventId) return json({ event: state.draft });
      return json({ error: "Event not found." }, 404);
    }

    const draftMatch = pathname.match(/^\/api\/events\/(\d+)\/draft$/);
    if (draftMatch && method === "PUT") {
      const payload = request.postDataJSON();
      state.draftUpdateRequests.push(payload);
      if (!state.draft || Number(draftMatch[1]) !== state.draft.eventId) return json({ error: "Draft not found." }, 404);
      const fields = { ...payload };
      delete fields.isAutoSave;
      state.draft = makeDraft({ ...state.draft, ...fields, updatedAt: FIXED_SAVED_AT });
      state.events = state.events.map((event) => event.eventId === state.draft.eventId ? state.draft : event);
      return json({ message: payload.isAutoSave ? "Draft auto-saved." : "Draft saved successfully.", event: state.draft, savedAt: FIXED_SAVED_AT });
    }

    const submitMatch = pathname.match(/^\/api\/events\/(\d+)\/submit$/);
    if (submitMatch && method === "PUT") {
      const payload = request.postDataJSON();
      state.submitDraftRequests.push(payload);
      const missingAttendance = !payload.expectedAttendance;
      if (missingAttendance) {
        return json({ error: "Please fix the highlighted fields.", fields: { expectedAttendance: "Expected Attendance is required for submission." } }, 400);
      }
      state.draft = makeDraft({ ...state.draft, ...payload, status: "SUBMITTED", statusLabel: "Pending Approval" });
      state.events = state.events.map((event) => event.eventId === state.draft.eventId ? state.draft : event);
      return json({ message: "Your event request has been submitted successfully.", event: state.draft });
    }

    if (pathname === "/api/events" && method === "POST") {
      const payload = request.postDataJSON();
      state.createEventRequests.push({ payload, headers: request.headers() });
      const event = makeDraft({ ...payload, eventId: 600, requestId: "REQ-000600", status: "SUBMITTED", statusLabel: "Pending Approval" });
      state.events = [event, ...state.events];
      return json({ message: "Your event request has been submitted successfully.", event }, 201);
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

export { expect };
