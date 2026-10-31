# SPM-39 frontend: approve submitted event request

## Scope and contract

Extends the existing assigned-coordinator event workspace at `/events/:eventId`.
The existing DashboardWorkspace, sidebar, request details and history are reused;
no shared auth, navigation, shell or design-token changes are needed.

Jira SPM-39 was initially read on 27 October 2026. At that time no backend PR
existed for the matching feature branch. The current backend counterpart is
[PR #33](https://github.com/shirinruth847/connectsphere-events-g8t6-backend/pull/33).

The Master and existing backend test plan supersede stale Jira expectations:
approval moves UNDER_REVIEW to PLANNING (organiser: Approved & Planning), never
APPROVED. REJECTED and CANCELLED remain distinct. A venue preference is not a
booking, and approval does not confirm resources or the event.

POST `/api/events/:id/accept-feasibility`, body `{ version }`, header
`Idempotency-Key`; use the existing apiRequest/session handling. Success uses
the returned event and refreshes history. The backend owns atomic notification,
audit and mandatory-field validation, including organiser contact information.
The assigned coordinator's event-detail contract exposes organiser name and
email. Other viewers retain their existing contact-data restrictions; no phone
field or new API contract is introduced by this approval interface.

## Acceptance coverage

- Existing request details remain available before approval.
- Under-review requests offer Approve request and a cancellable confirmation.
- Mandatory-field refusals show the backend message and individual field errors;
  they do not show success or change the event locally.
- Only backend-confirmed success shows the status notice and next planning step.
- Rejected/cancelled requests show a banner and disabled approval action.
- Backend is responsible for organiser notification and approval audit; refreshed
  history uses its persisted records. This UI does not send notifications itself.
- Uncertain responses preserve the command key in sessionStorage, scoped to
  assigned coordinator, event and version, across reload/automatic expiry.
  Existing explicit logout clears recovery keys. No personal request data is stored.

## Checks

- `npm run lint`: zero errors; existing unused historyIcon warning.
- `npm test`: 146 passed.
- `npm run test:e2e -- tests/e2e/lifecycle.spec.mjs tests/e2e/event-workspace.spec.mjs`:
  21 passed, including production build/type checking, desktop/mobile screenshots,
  confirmation/cancel, required fields, terminal states, reload/retry and existing
  lifecycle/access-scope journeys.
- `npm run test:e2e -- tests/e2e/lifecycle.spec.mjs -g SPM-39`: 8 passed,
  including organiser denial and expired-session redirect with command recovery.
- Browser journeys mock Auth and Express. They do not prove live notifications,
  database audit persistence, hosted concurrency or migration deployment.
- No shared database writes, migration application, commits or pushes.

## Edge-case regression verification — 29 October 2026

Approval stays blocked while Edit details is open, including validation errors,
failed saves and saves in flight. Save successfully or Cancel to re-enable it.
Title, purpose and description reject blank edits; inputs are read-only while
saving so text typed after submission cannot be silently lost.

Maintained browser coverage now includes failed/network saves and keyed retry,
repeated confirmation, cancellation/rejection while confirmation is open,
reassignment, and reauthentication with the retained approval key. Full frontend
checks passed: lint (existing unused historyIcon warning), 146 unit tests and
353 browser tests, including production build/type checks.

Real localhost:3000 → :8000 journeys with namespaced synthetic fixtures verified:

- Blank mandatory edits and failed-save recovery keep approval blocked.
- Terminal-state and assignment changes while confirmation is open are refused,
  with no approval audit effects. These changes were simulated on run-owned
  fixture rows; this does not test another ticket's cancellation/reassignment UI.
- Repeated confirmation sends one command. A fault-injected lost response after
  an actual committed approval recovers by reload with one audit entry.
- An injected 401 followed by real sign-in/approval retains the key and creates
  one approval. This tests recovery, not waiting for a real token to expire.
- Two independent browser sessions confirming concurrently receive 200/409,
  with one approval audit entry and one organiser notification.

All final live runs completed verified fixture cleanup and had no browser
runtime errors. Backend/API contracts and schema were not changed by these fixes.

## Main integration — 31 October 2026

Integrated frontend `origin/main` at `37ccd62` into the SPM-39 branch. The
`LifecyclePanel` conflict retains both `approvalBlockedReason` and `refreshKey`:
editing blocks approval, while arrangement changes reload readiness even when
the event version is unchanged. The parent retains both corresponding props.
The generated tracked Playwright report uses main's version; new execution
evidence is retained separately from that historical report.

The SPM-179 booking regression now checks that the displayed readiness blocker
changes after requesting a booking, with the event version fixed at 3, and that
submitting for safety review remains disabled while approval is pending. The
SPM-39 desktop/mobile journeys assert the backend's approval success message
instead of accepting the unrelated safety-review message from the old mock.

This integration uses mocked Auth/API browser journeys and isolated local
database fixtures. No hosted fixture tests, shared database writes, migration
application, Jira edits or remote publication are part of this verification.

Verification performed on the combined source:

| Command | Result |
| --- | --- |
| `npm ci --ignore-scripts` | Locked frontend dependencies installed; no manifest or lockfile changes |
| `npm run lint` | Passed, no warnings |
| `npm test` | 176 passed |
| `npm run test:unit` | 5 passed across 4 files |
| `npm run test:e2e -- --workers=2` | 452 passed, none failed, skipped or flaky; includes production build/type checks and all 19 SPM-39 journeys |
| Backend `npm test -- --runInBand`, with dummy Supabase settings | 2,196 passed across 83 suites on the clean combined main/SPM-39 backend tree `6957ae9` |
| Backend `node --test tests/database/spm39Feasibility.test.cjs tests/database/spm173Readiness.test.cjs tests/database/spm72IdempotencyUpgrade.test.cjs` | 37 passed in isolated PGlite |

The browser run covers approval, venue requests/decisions/holds/blocks,
readiness, clarification, notifications, registration, drafts, role navigation
and authentication recovery. Desktop/mobile approval screenshots were captured.
The final run uses zero retries. An initial run found two incorrect exact-text
locators in the new banner assertions; they were corrected to assert the actual
status banner, and the complete suite was rerun successfully.

Logs, the final JSON results and the browser report are retained in
`/private/tmp/spm39-integration.PTK5Hg/`. Those are local execution artifacts,
not a claim of hosted end-to-end or separate-client concurrency verification.


## Missing venue preference guard — 31 October 2026

Confirmed a frontend defect: an UNDER_REVIEW request with an empty
venuePreferences array could open approval confirmation. The deployed
accept_event_feasibility function already refuses this case with
FEASIBILITY_REQUIREMENTS_MISSING and leaves the event unchanged; inspection
found the expected migration deployed. A confirmed booking is not required
at this stage: SPM-39 requires a venue preference, and bookings follow in planning.

LifecyclePanel now disables both Approve request and Confirm approval when
there is no venue preference and displays the missing requirement. Its action
handler also refuses the command. Existing unsaved-edit blocking retains priority.
The backend remains authoritative for stale data and direct API requests.

Corrected lifecycle happy-path mocks to contain a venue preference. Added
explicit desktop/mobile empty-preference regressions: both failed before the
fix and pass afterwards; no POST or confirmation dialog is produced.

Checks performed for this fix:

- npm run lint: passed.
- npm test: 176 passed.
- npm run test:e2e -- tests/e2e/lifecycle.spec.mjs: 30 passed, including
  production build/type checks and desktop/mobile screenshots.
- Backend node --test tests/database/spm39Feasibility.test.cjs: 23 passed,
  including missing venue preference refusal without business/audit/notice/key effects.
- git diff --check: passed.

Browser tests use mocked API/Auth; database tests use isolated PGlite. Hosted
function inspection was read-only. No shared database writes or migration
changes were performed for this fix. Logs: /tmp/spm39-missing-venue-before.log,
/tmp/spm39-missing-venue-after.log and /tmp/spm39-approval-sql.log.
