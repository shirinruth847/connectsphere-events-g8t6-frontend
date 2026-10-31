# ConnectSphere frontend

The role-based Next.js App Router application for creating and tracking
campus event requests and accessing permitted workspaces.

## Requirements

- Node.js 22 or newer
- The ConnectSphere backend running locally, unless configured to use another
  API host
- A Supabase project with an active ConnectSphere profile

## Setup

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and provide the Supabase URL and
   publishable key. Set `NEXT_PUBLIC_BACKEND_URL` if the API is not at
   `http://localhost:8000`.
3. Start the app with `npm run dev` and open `http://localhost:3000`.

Do not commit `.env.local` or other files containing credentials.

The development command explicitly uses port 3000 so an occupied port fails
instead of silently starting on 3001. The backend's `FRONTEND_ORIGIN` defaults
to `http://localhost:3000`; an alternate port or hostname must match that
setting, or the browser blocks profile verification after Supabase login.
Stop the existing local frontend before starting another instance. For a
deliberate alternate port, use `npm run dev -- --port <port>` and update the
backend origin before restarting the backend.

If hydration reports an extra `data-scribe-recorder-ready` attribute on
`<html>`, disable the Scribe browser extension for localhost and reload, or
use a browser profile with extensions disabled. This attribute is not rendered
by the application. Do not suppress hydration diagnostics globally to hide it.

## Sign-up (SPM-123)

- `/signup` (`components/auth/signup-form.tsx`) lets visitors register as an
  Attendee or Event Organiser only (`SIGNUP_ACCOUNT_TYPES` in `lib/signup.ts`).
  Staff roles are never self-registered; the backend enforces the same rules.
- It sends `{ accountType, name, email, password }` to `POST /api/auth/signup`.
  The account is usable immediately, but no session is returned, so the form
  then signs in like `/login`: `signInWithPassword` on the shared client,
  `currentUser()` (`GET /api/auth/me`) and `postLoginPath`.
- If the account is created but automatic sign-in fails, the page says so and
  links to `/login`; it never submits the sign-up again.

## Authentication and access (SPM-32)

- `/login` (`components/auth/login-form.tsx`) signs in with Supabase Auth via
  the single client in `lib/supabase.ts`, then `currentUser()` in
  `lib/session.ts` calls `GET /api/auth/me` for the trusted role. `/` redirects
  to `/login`.
- `postLoginPath` in `lib/auth.ts` sends the user to a safe, permitted `?next=`
  path or to the role home. `safeNextPath` validates the normalised path, and
  `canViewPath` denies any route not listed for the role.
- Protected pages use `DashboardWorkspace`/`AuthGate`, which redirect to
  `/login?next=…` without a verified session and re-check on Back/Forward.
- Logout (`signOut` in `lib/session.ts`) calls `POST /api/auth/logout`, then
  clears this device's Supabase session.

## Checks

Team members: read [the shared UI workflow](docs/team-ui-workflow.md) before
adding a dashboard page, role navigation item or custom styling. It includes
the starter page, route/API agreement and PR checks.
For AI coding tools, attach [the agent task template](docs/agent-task-template.md)
and provide the ticket ID, Jira link and task.

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

Event request list and detail data comes from the backend API. The browser
authenticates directly with Supabase Auth; organiser role and profile checks
are performed by the backend.

See [COMMIT_MESSAGES.md](COMMIT_MESSAGES.md) for the repository's commit format.


## Repair baseline verification

This branch covers SPM-32, SPM-35 and SPM-37, with backend SPM-123 regression
checks. See `docs/main-repair-baseline.md` and the companion backend's report.
Validation used Node.js 24.9.0.

- `npm test` runs the pure auth/validation/payload tests.
- `npm run test:e2e` builds a separate test configuration, starts port 3100 and
  runs Chrome with deterministic Auth/API mocks. Install Chrome first. Reports
  and traces are under ignored `playwright-report/` and `test-results/`.
  Live-account browser checks may use `E2E_COORDINATOR_EMAIL`,
  `E2E_COORDINATOR_PASSWORD`, `E2E_ATTENDEE_EMAIL`, and
  `E2E_ATTENDEE_PASSWORD`; the event venue section tests do not require these
  variables because they mock authentication and venue responses.
- `npm run build` uses Webpack and performs TypeScript checks.
- `npm run test:live` requires both real applications already running at
  localhost:3000/8000, the sibling backend repository and its existing synthetic
  `dev-*` seed accounts with SEED_ACCOUNT_PASSWORD. It does not reset or create
  users. It removes only this run's event data; audit entries remain under the
  existing seed users. LIVE_FRONTEND_URL/LIVE_BACKEND_URL may override hosts;
  LIVE_ROLES may select a comma-separated subset for focused checks.
- The Technical Support run walks the SPM-52 equipment catalogue end to end:
  create (Details pending until the MongoDB detail is applied), search and
  filters, edit, a two-tab conflict, unavailable stock with its Singapore-time
  refusals, and deactivate/reactivate. Every other role is checked for no
  Equipment tab, "Access denied" on `/equipment` and `403` from the API. It
  needs MongoDB Atlas reachable from the backend and `TEST_DATABASE_URL` in
  the backend `.env`: the run's items are named with its run ID and removed
  afterwards (their `equipment_details` documents first, then unavailable
  stock, outbox entries and the items). Run only this part with
  `LIVE_ROLES=TECH_SUPPORT npm run test:live`.

- `npm run test:e2e:live` runs the maintained `@playwright/test` specs in
  `tests/live/` (configuration `playwright.live.config.mjs`) against the
  running applications at localhost:3000/8000, with no mocks and no server
  started for you. Specs create their own synthetic accounts through the
  backend's fixture modules (Auth Admin + trusted setup) and run-scoped events,
  record them in the backend fixture manifest and remove them afterwards;
  attendees that wrote registration history stay deactivated, as the backend
  cleanup documents. Needs the sibling backend repository and its private
  `.env` (CONNECTSPHERE_BACKEND_DIR and LIVE_FRONTEND_URL/LIVE_BACKEND_URL may
  override). SPM-134 registration: `npm run test:e2e:live -- --grep SPM-134`;
  SPM-163/147 waitlist and withdrawal:
  `npm run test:e2e:live -- spm-163-147-waitlist.live.spec.mjs`; SPM-141 My
  Events: `npm run test:e2e:live -- spm-141-my-events.live.spec.mjs`.

The live checker reads the backend's private environment only in its Node.js
process; no private key is bundled into the browser. Rebuild/restart the normal
frontend after mock browser tests before running live checks. NEXT_PUBLIC_BACKEND_URL
wins over the build-time BACKEND_URL fallback. Local .env files remain ignored.

For focused development-mode browser checks, use
`E2E_DEV=1 npm run test:e2e -- --grep 'title-only draft|protected create returns|ORGANISER login'`.
The development report is separate from the full production browser report.


## Event submission (SPM-36)

The existing organiser wizard submits a completed owned draft against its saved
request ID. Confirmation identifies the request and `Submitted` status, with
assignment left to the one Coordinator Lead. Event details remain read-only after
submission and show the first submission time and the Coordinator name when the
backend supplies them. Unassigned requests show `Unassigned`.

Submit is guarded while pending. A lost draft-submission response or an old tab's
`EVENT_NOT_DRAFT` response triggers a read of the current event, preserving a later
assignment/status. Uncertain new-event creation reuses its original idempotency
key and payload across retries, session expiry, reauthentication and reload.
Unresolved submissions retain that identity beyond the ordinary 30-minute form
recovery window. A returned event ID is saved before follow-up reads, allowing
recovery to read the same event without another create or submit operation.
Field errors stay next to their inputs and entered information is retained for
correction or retry.

Requires the SPM-36 backend migration and its additive `submittedAt` and
`coordinatorName` response fields. Inbox/unread indicators and notification
navigation remain under SPM-191–193. No new shared shell or authentication flow
was introduced. The existing organiser wizard/details are the design reference.

See [the frontend test plan](docs/test-plans/spm-36.md). Focused browser command:
`npm run test:e2e -- --grep SPM-36`; the full `npm run test:e2e` includes a
production build and type checks.

## Lead assignment workspace (SPM-174)

Leads see and assign submitted unassigned requests directly on `/dashboard`
and on `/events`, using the same queue component and backend scope. They reassign their
supervised or legacy unsupervised active events on `/assignments`. The shared
shell, trusted session profile and Express API helpers remain in use. Assignment
requires explicit confirmation; busy coordinators are disabled, the backend
checks availability again, and success is shown only after its response. Stale
or uncertain results require refreshing before another attempt. The calendar
uses half-open Singapore scheduling windows and clamps month-end navigation.

The backend must deploy `20261020075714_spm174_lead_assignment_conflict_guard.sql`
before this frontend. The paired `fix/lead-workflow-availability` backend change
retires the rollout environment switch; its Lead routes are always registered
and retain authentication and Lead-only authorization. Older backends still
require `ENABLE_COORDINATOR_WORKFLOWS=true` until upgraded.
Existing legacy overlaps are preserved for Lead-controlled reassignment; the
guard prevents new conflicts while the full exclusion constraint remains
deferred. See the backend's `docs/test-plans/spm-174.md` for deployment,
rollback and real hosted/browser verification commands.

The Dashboard home correction and its mocked browser regression coverage are
documented in `docs/test-plans/lead-dashboard.md`.

`npm run test:e2e -- --grep SPM-174` covers initial assignment, reassignment,
stale rejection, role restrictions, queue resilience and calendar boundaries
using mocked APIs. These journeys do not establish real backend/database
integration; the backend's opt-in `leadAssignment.browser.cjs` runner does.

## Attendee event viewing (SPM-44)

Attendees land on Event Discovery (`/events`) after login when no permitted
return URL is supplied. My Events remains at `/my-registrations`, and the
notifications inbox remains at `/notifications`.

Discovery cards open the shared details dialog. Direct `/events/<id>` URLs
render an attendee detail page using `GET /api/events/discovery/:id`; staff
continue to use their existing role-specific workspace at that URL. Discovery
uses `GET /api/events/discovery` with cursor pagination. Both reads go through
Express, which enforces publication, lifecycle and attendee-safe fields.
Published `CONFIRMED` and `PREPARATION` events are eligible under Master §5.3;
ended events are excluded by the current backend query.

Cards retain the labels **Registration Open**, **Full - Waitlist** and
**Registration Closed**, with **Not Yet Open** and **Unavailable** from
SPM-134. Each card, the details dialog and `/events/[eventId]` show one
registration state: Register Now (SPM-134), Join Waitlist for a full event
(SPM-163), the attendee's own place, or a disabled state. A detail
404 removes the discovery card and replaces the dialog's stale title with
**Event unavailable**. Session expiry, denied access and retryable failures
have distinct states.

See [the SPM-44 test plan](docs/test-plans/spm-44.md), including the outstanding
Jira wording reconciliation and the limits of mocked browser verification.

## Attendee notifications (SPM-155)

Attendees open their in-app inbox from the **Updates** button in the page
header of My Events (`/my-registrations`) and Event Discovery (`/events`),
following the Figma frames `282:664` (Updates button) and `282:1173`
(notification panel). The button shows the unread count in a red pill (a
deliberate departure from the design system's primary pill) and opens a panel
of the five latest notifications; **See more** and the attendee sidebar's
**Notifications** tab open the full inbox, read and unread, at
`/notifications`, which is also the login return target (TC-12).

- Data comes from the backend `/api/notifications` routes through
  `lib/api/notifications.ts`; display rules (Go to Event targets, SGT times,
  offer expiry, badge text, page merging) are in `lib/notifications.ts`.
- Components are role-agnostic in `components/notifications/`. A role gets
  the inbox by joining `NOTIFICATION_ROLES` in `lib/auth.ts` (used by
  `canViewPath` and the page's `DashboardWorkspace`), linking its sidebar tab
  and placing `NotificationsBell` on its pages. Organisers joined with SPM-192
  (Updates after the search box on `/dashboard`); coordinators with SPM-193
  (Updates in the Assigned Events header, Notifications sidebar tab). The
  Coordinator Lead and other staff roles have no inbox yet and get 403.
- A coordinator sees notifications only for events assigned to them now, plus
  the "Event assignment ended" notice (`ASSIGNMENT_ENDED`) after a
  reassignment; the backend decides. Go to Event on that notice opens
  `/events/<id>`, which shows "Event not available"; Go to Event on a notice
  hidden since the list loaded removes it with "This event is no longer
  assigned to you."
- Read state and the unread count change only after the backend confirms them.
  The count refreshes on window focus, on tab visibility and after each read
  action; nothing promises instant delivery. After an action that writes a
  notification (e.g. a future registration), call
  `announceNotificationsChanged()` without a count and the badge fetches it again.
- **Go to Event** marks the notification read, then opens
  `/my-registrations?eventId=<id>&from=notification` (attendees) or
  `/events/<id>` (the event workspace, for organisers and staff). On My Events that URL
  opens the event details dialog (frame `282:1271`) over the outlined card, labelled "Opened from your
  notification"; **View Event Details** on a card opens the same dialog
  without that label, and closing removes the parameters. A notification the
  backend no longer shows (404 `NOTIFICATION_NOT_FOUND`) is removed without
  navigating, with a role-worded reason (`notificationGoneText`), and a
  background refresh reads the current list and unread count and updates the
  Updates badge. It can drop other hidden notices and include new arrivals;
  the client does not estimate the count by subtracting one.
- Event Discovery and My Events share that dialog
  (`components/attendee/discovery/event-details-dialog.tsx`), and each reads
  its own endpoint through `useAttendeeEvent`. From Event Discovery it reads
  `GET /api/events/discovery/:id`, unchanged from SPM-34. From My Events, a
  notification or Go to Event it reads `GET /api/registrations/mine/:eventId`
  (`lib/api/my-events.ts`), which returns events the attendee is registered or
  waitlisted for in any status, with `attendeeStatus`, `detailsWithheld`,
  `lastConfirmedAt` and `myRegistration`. An event being reconfirmed or
  cancelled after a confirmation shows its last confirmed details (SPM-173's
  confirmation snapshot, Master 5.7) under a notice saying when they were
  confirmed (`LastConfirmedNotice`). Without such a confirmation, or when not
  published, it shows only its title, status and a short notice. Both notices
  state only what is known ("This event has been cancelled" or "This event's
  details are being confirmed"), without promising a notification. The attendee's own place reads
  "On the waitlist"; Event Discovery uses "Full - Waitlist" for an event
  at capacity. My Events and notification links continue to open this dialog using
  the registration endpoint. SPM-44 also supports direct `/events/<id>` URLs
  through the attendee discovery endpoint; those URLs remain the role-specific
  workspace for staff.
- Opened from My Events, the dialog's footer holds the actions on the
  attendee's own place (SPM-163, SPM-147; see below).

## Waitlist and withdrawal (SPM-163 / SPM-147)

- A full event (`FULL_WAITLIST`) offers **Join Waitlist** on its discovery
  card, in the details dialog and on `/events/[eventId]`, once the attendee's
  places (`GET /api/registrations/mine`) have loaded with none for the event;
  until then it shows the disabled **Registration Full**. The confirmation
  ("This event is full. Join the waitlist?", **Join Waitlist** / **Not Now**)
  carries SPM-134's two answers; they survive a session expiry and are
  restored for the attendee to confirm, never sent automatically.
- My Events (`/my-registrations`) and its details dialog hold the actions on
  the attendee's own place: **Accept Slot** / **Decline** for an open offer,
  with its deadline in SGT; **Leave Waitlist**; **Withdraw Registration**.
  Each asks first and sends one request with an `Idempotency-Key`
  (`lib/api/registration-actions.ts`).
- The backend decides queue positions, offers, deadlines and every refusal.
  The browser clock never hides an offer or Withdraw; a late answer is refused
  (`OFFER_EXPIRED`, `EVENT_STARTED`) and the place is read again.
- Each confirmed change sends `connectsphere:notifications-changed`, so the
  Updates badge is read again at once.
- Withdrawn places are not returned by the backend, so a withdrawn or left
  event leaves My Events; there is no history list. My Events orders events
  going ahead soonest first, then cancelled and completed ones.

Browser journeys: `npm run test:e2e -- spm-163-147.spec.mjs`; live:
`npm run test:e2e:live -- spm-163-147-waitlist.live.spec.mjs`.

## My Events (SPM-141)

- `/my-registrations` reads every page of `GET /api/registrations/mine`
  (following `next_offset`), then orders the places for display: events going
  ahead soonest first, then held-back dates, then cancelled and completed
  ones. The backend returns them newest registration first.
- Each card shows the attendee's place (**Registered**, or **On the waitlist**
  with the backend's position) and, as a separate row, the event's
  `attendee_status` (Confirmed, Event confirmation pending, Cancelled,
  Completed), so a cancelled event is not read as a withdrawal. Date and time
  use the shared SGT formatter; withheld values say "to be announced", and a
  cancelled event's withheld date and venue are left out.
- With no places: "You are not registered for any events yet." and an
  **Explore events** link to `/events`. A failed read shows only the error and
  Retry, never an empty list or the last list's actions.
- View Event Details, the offer, Leave Waitlist and Withdraw Registration are
  the existing SPM-155/163/147 pieces, unchanged.

Browser journeys: `npm run test:e2e -- spm-141.spec.mjs`; live:
`npm run test:e2e:live -- spm-141-my-events.live.spec.mjs`.

See [the frontend test plan](docs/test-plans/spm-155.md). Focused browser
command: `npm run test:e2e -- --grep SPM-155`.

SPM-193's user-approved staged delivery explicitly defers technical decision
notifications (AC6), hold warning/expiry notifications (AC8) and the
operational-block portion of AC5 until their owning workflows exist. Their
backend helpers alone do not complete those criteria. See
[the coordinator test plan](docs/test-plans/spm-193.md) for the scope and stale
Jira wording; existing venue status changes remain supported.

## Event venue search and calendar fixes (SPM-72 / SPM-75)

Applying unchanged filters refreshes the results. Rejected filter values retain
previous results and comparison choices, with errors beside the fields.
The coordinator's embedded calendar uses
`GET /api/events/:id/venue-availability` with the existing date/venue query.
The backend must deploy this route before the frontend: it verifies assigned
coordinator access and excludes that event's own bookings and holds. Venue
Staff continue to use `/api/venues/availability`. No schema migration is needed.

## Venue booking requests (SPM-179)

The event's venue section (`/events/[eventId]`, step 3 "Venue & layout")
lists the event's venue bookings for the assigned coordinator and the
supervising Lead, from `GET /api/events/:id/venue-bookings`. When the
backend's `canRequestVenueBookings` is true (assigned coordinator, event in
`PLANNING`), "Request venue bookings" and each venue card's "Request booking"
open the request form in a popup:

- Event details are read-only; the first venue section starts with the
  coordinator's suggestion or the organiser's first choice (or the card's venue).
- One section per venue (up to 10): venue, label, start and end (SGT),
  attendance and layout are required; facilities, accessibility needs and
  special requirements (including catering) are optional. With several venues
  and no primary venue yet, one is marked primary; `isPrimary` is sent only
  then (a single venue becomes primary by itself, and an event with a primary
  keeps it). Venues already booked for the event, chosen in another section or
  without setup/turnaround times are listed but cannot be chosen.
- Checks before sending are instant feedback only. Each section's
  availability and operating-hours warning come from
  `GET /api/events/:id/venue-availability` (the SPM-74 period check); layout,
  facility and accessibility warnings never block.
- `POST /api/events/:id/venue-bookings` sends an `Idempotency-Key` that is
  reused while the body is unchanged, so a retry cannot book twice. Refusals
  are shown in their venue section and every value is kept. Closing a changed
  form asks before discarding it. After a request the event, its readiness and
  its history are loaded again (the request moves `arrangement_version`, not
  the event version).

The backend route needs the SPM-179 migrations and `VENUE_LOCK_DATABASE_URL`;
until then it answers `503`, which the form shows as a retryable error.

## Venue blocks and restoration (SPM-195)

Venue Staff only. No new route: the screens extend existing pages.

- **`/venues/[venueId]`, step 4 "Operational blocks"**
  (`components/venue-staff/venue-management/venue-blocks.tsx`): lists the
  venue's current and upcoming blocks from `GET /api/venues/:venueId/blocks`,
  each with the bookings and holds it affects. "Record a block" asks for a
  reason, start and end (SGT) and a note (`POST .../blocks`, with an
  `Idempotency-Key` reused while the form is unchanged). Active blocks can be
  shortened (`PUT .../blocks/:blockId` with the loaded `version`; a longer
  block is refused in the form with "Record a new block for additional time.")
  or lifted after a confirmation (`POST .../lift`).
- **Restore booking** (`components/venues/booking-incident.tsx`): enabled only
  when the backend's `canBeRestored` is `true`, then confirmed in a dialog and
  sent to `POST /api/venues/incidents/:incidentId/restore` with its own
  `Idempotency-Key`. A refusal (for example `INCIDENT_STILL_BLOCKED`, with the
  blocks still in the way) keeps the dialog open. Available on the venue page
  and on the Venue Staff event view (`/events/[eventId]?booking=`), where an
  affected booking also shows an "Open" incident chip.
- **Coordinator venue section:** an affected booking shows its incident card
  (reason, period, note, whether the venue is free again) and the backend's
  options: restore (waiting for Venue Staff), replace (not available yet,
  SPM-172) and cancel (shown unavailable until the event cancellation workflow
  is integrated). The supervising
  Lead sees the card read-only, without the options. The organiser view is
  SPM-199's and is unchanged.

- **Closed incidents:** the backend closes an incident when its booking or the
  event ends. The card then reads "Venue incident closed" with the backend's
  resolution label (for example "Booking released") and no restore action; a
  restored one reads "Venue available again". A long block list that the
  backend cut short (`hasMore`) says that later blocks are not shown.

Every change is shown after the backend commits it, then the list reloads. The
backend needs migrations `20261029130000`, `20261029140000`, `20261029150000`
and `20261029160000`.


SPM-195 block creation cannot be dismissed while sending. An uncertain command
retains its exact input and idempotency key in per-user, per-venue sessionStorage;
reopening after a reload or automatic session expiry retries that command with
its original key. Its inputs stay locked until a definitive result is received.
Success clears recovery, and explicit logout uses the existing recovery cleanup.
Cancellation remains an integration dependency owned by
[SPM-176 — Cancel Event - Coordinator](https://yvery.atlassian.net/browse/SPM-176),
which was To Do when checked on 30 October 2026. No coordinator cancellation
endpoint exists in the inspected backend. This frontend does not add that API
or claim cancellation is available. Jira SPM-195 AC7 still assumes an existing
cancel action; completing or explicitly deferring that dependency requires a
scope decision. The unavailable label alone does not complete AC7.
