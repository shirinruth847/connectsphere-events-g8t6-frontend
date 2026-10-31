# SPM-40: reject submitted request

The assigned coordinator's existing `/events/:eventId` workspace now has a
Reject request dialog for UNDER_REVIEW requests. No new route, sidebar, global
styles, auth or navigation changes. Reuses shared Dialog/primitives, apiRequest
and the trusted session user. Unsaved identity edits block rejection.

## API and deployment

Coordinated endpoint: POST `/api/events/:id/reject`, `{ version, reason }` with
Idempotency-Key. Notes require 10–2,000 trimmed Unicode characters. 200 returns
`{ message, event }`; only then does the page display success and refresh history.
400 carries field errors; 401 triggers existing reauthentication; unrelated
resources are 404; 409 carries state/version/key conflicts. The backend writes
REJECTED, EVENT_REJECTED history and owner notification with notes atomically.

Requires backend migration `20261030022851_spm40_reject_submitted_event.sql`
and the API deployed first. The migration was applied to development project rvwiflsedoujspmzfrbq on 30 October 2026.
See the backend SPM-40 test plan for rollback and broader lifecycle scope.
Endpoint and consumer changes require coordinated frontend/backend review.

An uncertain request retains reason/version/key in per-user, per-event session
storage. Notes stay read-only until the pending result is resolved. Cancel
before submission sends no request; cancel/Escape cannot dismiss an in-flight
command. Existing explicit logout clears recovery; automatic expiry preserves it.

## Verification

- npm run lint: passed, no errors/warnings.
- npm test: 170 passed.
- npm run test:e2e -- tests/e2e/lifecycle.spec.mjs tests/e2e/spm-40.spec.mjs:
  45 passed with production
  build/type checks; happy path and screenshots at desktop/mobile, blank and
  9/10-character boundaries, cancel, invalid unsaved edits, uncertain response
  plus reload, denied organiser and terminal states, stale versions, expiry,
  and in-flight duplicate prevention.
- SPM-39 is merged locally, preserving its approval edit guard and the SPM-179
  readiness refresh. Approval/rejection coexist in the same coordinator view.
- Browser tests mock Auth and Express; no hosted notification, audit persistence
  or concurrency claim. Those business effects have isolated backend SQL tests.
- SPM-39 is on `main` and merged into this branch. The SPM-40 work is committed
  on `feature/SPM-40-reject-submitted-event-request`. No business data writes.
  The explicitly authorised SPM-40 schema migration was applied.

## Rejection reason and history follow-up

The rejection audit entry existed, but the UI needed explicit rejection wording,
a persisted reason in the organiser event view, and refresh for previously open
tabs. GET event now includes optional rejectionReason for REJECTED events,
read only after visibility checks from the latest ORGANISER_SAFE EVENT_REJECTED
entry. Staff-only notes are excluded. History labels the action and displays
its reason separately. Event/history refresh on focus/visible-tab changes.
These shared refresh hooks and the additive response field need integration review.
Backend 1,851 tests, frontend 170 unit tests, lint and 45 browser journeys passed.
Hosted verification read only confirmed the saved reason; no event was mutated.

## Expanded edge-case verification

- Rejection SQL suite: 27 passed, adding exactly 2,000 characters, Unicode,
  trimmed boundary notes, missing key/version and nonexistent event checks.
- SPM-40 production browser suite: 19 passed. The broader run also passed 71
  related approval, event-workspace and clarification journeys. A failing race
  regression was fixed and the entire 19-test SPM-40 suite rerun successfully.
- Found and fixed: a background GET started before rejection could overwrite
  the committed event returned by the mutation. The event-view hook now
  invalidates older pending reads whenever a mutation replaces the event.
- Markup-like notes are rendered as plain text; long notes fit mobile width.
- Frontend lint and 170 unit tests passed. No shared data writes in this audit.
- Prepared `tests/integration/eventRejection.integration.test.js` in the backend
  for live Auth/API/detail/history/notification and two-connection races. It is
  skipped unless SPM40_LIVE_TESTS=authorized, and checks both database URLs for
  the authorised development project before fixture creation. It has NOT run;
  explicit shared-fixture permission is pending. It creates namespaced fixtures
  and uses existing cleanup manifests. This is not production test evidence.

## Background refresh failure regression

Background network/server failures retain the loaded event workspace and open
rejection notes, with a refresh warning and retry action. Confirmed 403/404
responses still remove event access. This changes the shared event-loading hook
and workspace rendering and needs shared-component integration review.

Verified: lint, 170 unit tests, and 66 browser journeys across spm-40,
lifecycle and event-workspace suites, including production build/type checks.
Browser API/Auth responses are mocked; no hosted business writes were made.

## Review fixes (31 October 2026)

- Returning to a tab is handled by one shared hook, `useRefreshOnReturn`. A tab
  return usually fires both focus and visibilitychange; a second signal is
  ignored while the first refresh is still running, so one return sends one
  event read and one history read.
- Event history refreshes on return only where it opts in (`useEventHistory`);
  Venue Staff venue and booking histories keep their previous behaviour.
- A background history refresh adds newer entries in front of the loaded list
  (`mergeNewestPage` in `lib/event-history.ts`) instead of replacing it, so
  older pages loaded with "Show older changes" stay. It does not mark the
  history as viewed, so entries that arrived while away still count as new on
  the next visit. "Show older changes" now appends to the latest list.
- An organisation member viewing a rejected request sees the rejection reason
  and the member notice. The over-limit message matches the backend wording.
- Verified: `npm run lint` clean; `npx tsc --noEmit` clean; `npm test` 193
  passed; `npm run test:unit` 43 passed; Playwright spm-40, lifecycle,
  event-workspace, venue-management and venue-booking-review: 120 passed
  (production build, mocked Auth/API).
