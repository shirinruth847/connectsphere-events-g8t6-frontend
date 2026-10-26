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
  `E2E_ATTENDEE_PASSWORD`; the venue catalogue tests do not require these
  variables because they mock authentication and venue responses.
- `npm run build` uses Webpack and performs TypeScript checks.
- `npm run test:live` requires both real applications already running at
  localhost:3000/8000, the sibling backend repository and its existing synthetic
  `dev-*` seed accounts with SEED_ACCOUNT_PASSWORD. It does not reset or create
  users. It removes only this run's event data; audit entries remain under the
  existing seed users. LIVE_FRONTEND_URL/LIVE_BACKEND_URL may override hosts;
  LIVE_ROLES may select a comma-separated subset for focused checks.

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

Leads assign submitted unassigned requests on `/events` and reassign their
supervised or legacy unsupervised active events on `/assignments`. The shared
shell, trusted session profile and Express API helpers remain in use. Assignment
requires explicit confirmation; busy coordinators are disabled, the backend
checks availability again, and success is shown only after its response. Stale
or uncertain results require refreshing before another attempt. The calendar
uses half-open Singapore scheduling windows and clamps month-end navigation.

The backend must enable `ENABLE_COORDINATOR_WORKFLOWS=true` and deploy
`20261020075714_spm174_lead_assignment_conflict_guard.sql` before this frontend.
Existing legacy overlaps are preserved for Lead-controlled reassignment; the
guard prevents new conflicts while the full exclusion constraint remains
deferred. See the backend's `docs/test-plans/spm-174.md` for deployment,
rollback and real hosted/browser verification commands.

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
**Registration Closed**. Events without registration show no registration
wording or actions. Register/waitlist/notify buttons remain unavailable with
an explanatory note; SPM-44 does not implement registration writes. A detail
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
- Components are role-agnostic in `components/notifications/`. Other roles get
  the inbox by widening `canViewPath`, the page's `DashboardWorkspace` role and
  placing `NotificationsBell` on their pages (SPM-192/193).
- Read state and the unread count change only after the backend confirms them.
  The count refreshes on window focus, on tab visibility and after each read
  action; nothing promises instant delivery. After an action that writes a
  notification (e.g. a future registration), call
  `announceNotificationsChanged()` without a count and the badge fetches it again.
- **Go to Event** marks the notification read, then opens
  `/my-registrations?eventId=<id>&from=notification` (attendees) or
  `/events/<id>` (staff workspace, other roles later). On My Events that URL
  opens the event details dialog (frame `282:1271`) over the outlined card, labelled "Opened from your
  notification"; **View Event Details** on a card opens the same dialog
  without that label, and closing removes the parameters. A notification the
  backend no longer shows (404 `NOTIFICATION_NOT_FOUND`) is removed without
  navigating, and a background refresh drops any it no longer returns.
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
  details are being confirmed"), without promising a notification
  (`TODO(SPM-163)` marks the offer follow-up). The attendee's own place reads
  "On the waitlist"; Event Discovery uses "Full - Waitlist" for an event
  at capacity. My Events and notification links continue to open this dialog using
  the registration endpoint. SPM-44 also supports direct `/events/<id>` URLs
  through the attendee discovery endpoint; those URLs remain the role-specific
  workspace for staff.
- Accept Slot and Decline for waitlist offers belong to SPM-163; the
  notification shows the offer expiry, and the dialog keeps a footer slot.

See [the frontend test plan](docs/test-plans/spm-155.md). Focused browser
command: `npm run test:e2e -- --grep SPM-155`.
