# Completed-ticket repair baseline

Branch: `fix/main-completed-ticket-baseline`, based on frontend `229e56d` and
backend `a3f51c6`. Jira ACs were rechecked on 18 October 2026. Local main and
existing stashes were preserved.

The detailed scope, integration provenance, removal manifest and per-AC
verification are in the companion backend's `docs/main-repair-baseline.md`.

## Repairs

- One publishable/anon-compatible Supabase client and shared login/profile
  guard; organiser, coordinator, venue staff, technical support and attendee
  destinations; normalised return-path validation and protected route scoping.
- Backend session revocation on logout, history revalidation and business-call
  401 handling; same-user draft recovery after reauthentication.
- `/events/create`, required step validation, venue/layout choices through the
  minimal organiser-only API, API statusLabel and safe unknown-state styling.
- Distinct Next/Submit controls; one atomic final draft submission; explicit
  null clearing and preservation of saved requirements; serialised autosave and
  manual saves; first POST ID retained for later PUTs; 30-second input idle.
- One-shot success notices and My Drafts grouping; unavailable editor states;
  field-to-step server errors; in-app dirty dialog, Back/Forward protection and
  native refresh/tab-close warning.

## Pending-feature isolation

Removed runtime screens/components for queue assignment, reassignment and
calendar: `app/events/page.tsx`, `app/assignments/page.tsx`,
`app/calendar/page.tsx`, `components/assignments/availability-matrix.tsx`,
`components/calendar/calendar-view.tsx`, `components/layout/coordinator-shell.tsx`,
`components/shared/status-chip.tsx` and `lib/api/events.ts`.

Root now uses the shared login. Shared CSS/design tokens and auth compatibility
were retained. Backend coordinator workflows default to unavailable unless
explicitly enabled with ENABLE_COORDINATOR_WORKFLOWS; coordinator's own scoped
read remains available for SPM-32. Applied database history was not deleted.
This isolates the user-selected baseline; open PR state alone does not prove
an accidental push. SPM-174/SPM-177 are Jira Done with open PRs, and SPM-180 is
Reviewing. Their remaining fixes belong in their feature work.

## Evidence and limits

- `npm test`: 8 helper/validation regressions passed.
- `npm run lint`: passed without warnings.
- `npm run build`: production compilation, TypeScript and prerendering passed.
- `npm run test:e2e`: 28/28 passed; see final result in `test-results/browser-results.json`.
  Three focused checks also passed against the development server (login,
  redirect-back and draft clear/save). The suite covers every requested role, blank/invalid login, safe return URLs,
  logout/Back, attendee denial, explicit submission, draft clear/resume, idle
  reset/timing, save races, stale drafts, server error steps, 401 recovery and
  refresh cancellation. Its network is mocked for deterministic edge cases.
- `npm run test:live`: real seed logins/logout and server token revocation for
  organiser, coordinator, venue staff, technical support and attendee passed.
  Real request fields, one venue preference, receipt notification, draft
  save/resume/clear/submit and autosave POST/PUT persistence were checked.
  Each live run removed all three of its temporary event rows. Existing seed
  users and their append-only audit history were preserved.
- Companion backend: 342 unit tests passed. The formerly blocked complete
  integration run now passes all 81 tests across auth, signup, event/draft and
  reassignment suites. The test-only PostgreSQL connection uses the shared
  development project's session pooler with Supabase CA and hostname
  verification. All run fixtures were removed and no manifests remain.
  This verifies the deployed database; fresh migration reconstruction was
  not tested. Pending coordinator workflows remain disabled by default.
- SPM-123 frontend signup remains outside the agreed backend-only repair scope.
  Staff role landing pages do not implement future venue/technical operations.
- No push, merge or shared database schema changes were made.
