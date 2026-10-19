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
- `npm run test:e2e`: 29/29 passed; see final result in `test-results/browser-results.json`.
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

## Local login follow-up

A leftover production verification server occupied port 3000, so a subsequent
development server automatically moved to 3001. Direct Supabase sign-in
succeeded for all five requested seed accounts, but browser profile requests
from 3001 failed the backend's configured 3000 CORS origin. The development
command now specifies port 3000 explicitly, preventing silent fallback. The
leftover server was stopped and development restarted on the configured port.
All five supplied accounts then passed real development-browser login,
role-specific dashboard heading and logout checks on localhost:3000. Login
had no console errors. A second development launch failed with EADDRINUSE
on 3000 instead of switching ports, and all 8 helper tests still passed.
Local browser evidence is in ignored `test-results/login-diagnostics.json`.

The browser logs a separate 403 from Supabase's logout endpoint after the
backend has already revoked the session. The SDK explicitly accepts 403
during sign-out and removes the local session; the logout redirect passed.
This existing duplicate-revocation response is separate from login and the
hydration warning. No logout implementation changes were made here.

The reported hydration diff contained `data-scribe-recorder-ready` on the root
HTML element. This is absent from application code and the clean browser;
disable the injecting Scribe extension for localhost. Application hydration
warnings remain enabled.

## Organiser layout parity with shree

Restore the `shree` global stylesheet foundation, retaining the existing
Next.js Hanken Grotesk font loader. Retired coordinator styling had introduced
unscoped `nav`, `label` and `.page-header` rules: sidebar navigation became a
horizontal row wider than its panel, and the status filter lost its alignment.
Those unused feature styles are no longer loaded. Shared original colours,
spacing tokens, panel styling and Tailwind utilities remain available.

Desktop verification at 1440px restores vertical navigation within the 225px
sidebar and an inline status filter. Mobile verification at 390px confirms
the opened menu, draft navigation and absence of horizontal page overflow.
All 29 browser tests pass, including the new layout regression; production
build/type checks and lint pass. Real seed-account dashboard captures also
passed on the existing development server, which was left running untouched.
Login, draft persistence, submission and role routing implementations are
unchanged by this styling repair. Future feature styling belongs in scoped
CSS modules or component utilities rather than global element selectors.

## Shared workspace for the team

All six roles now render the same `DashboardShell`, extracted from the
restored organiser sidebar. `lib/navigation.ts` supplies each role's tabs;
`lib/auth.ts` owns role labels, route constants and login-return policy.
The organiser-only create shortcut is hidden for other roles. My Drafts
correctly becomes the active item when its query filter is selected.

New protected pages use `DashboardWorkspace` and `PageContent`. Existing
organiser/staff shell imports remain compatibility aliases; there is no
second sidebar implementation. Staff/attendee pages use the common heading
and content spacing. Existing role restrictions and API scoping remain intact.

All 29 browser tests pass, now checking common desktop sidebar geometry,
role-specific navigation, active items, mobile menu/Escape and logout for
every role, alongside existing event/draft journeys. Eight helper tests,
lint and production build/type checks also pass. The team guide and starter
page are in `docs/team-ui-workflow.md`, accompanied by a PR template and a
prepared GitHub checks workflow. Its YAML parses locally; it has not run on
GitHub, and required checks/reviewer settings have not been enabled remotely.

## Final role-folder and branch review

Role-owned views now live under `components/organiser/`, `coordinator/`,
`coordinator-lead/`, `venue-staff/`, `tech-support/` and `attendee/`.
`components/auth/role-dashboard.tsx` is a typed dispatcher only. The former
auth registration entrypoint delegates to the attendee component to preserve
existing imports. These small compatibility exports are intentional.

The final role split passes all 29 browser journeys, production compilation,
type checks, lint and 8 helper tests. Backend unit checks were rerun with
local-port access: all 342 pass. The earlier live 81-test integration run
remains the database evidence; no backend runtime changed in this final pass.
The prepared workflow YAML also parses successfully.

Remove inherited conflict markers from the root `.gitignore`. Branch review
found no tracked private environment files, dependency/build directories or
browser reports, and no configured private values in the repair diffs.
Retain existing design/reference images, project specifications and required
migration history. Generated local evidence stays ignored. The team guide
lets any member choose the role folders relevant to their ticket.
