# SPM-38 submitted support needs

The user confirmed support needs are provided by the organiser at submission,
separate from formal Planning arrangements. The wizard now captures optional
`technicalSupportNeeds` text (up to 2,000 characters), preserves it across draft
save/resume and submission, and displays it in organiser/coordinator details.
The owner may amend it during an open clarification. The existing shared shell,
API/authentication helpers and significant-field permissions are retained.

Also fixes long contact-email wrapping and organiser history labels while
retaining main's safety, arrangement-version and unread-history behavior.

Requires the backend's `20261028120000_spm38_submitted_support_needs.sql` before
backend/frontend deployment. It is prepared locally, NOT applied to shared
Supabase. See the backend `docs/test-plans/spm-38.md` for rollout, rollback and
SQL validation boundaries. Reverting the UI does not require dropping stored
support needs.

Run `npm run lint`, `npm test`, and `npm run test:e2e`. Focused browser command:
`npm run test:e2e -- --grep SPM-38`. These are mocked API journeys, with production
build/type checks; they do not establish hosted integration. Browser screenshots
cover maximum-length email/support needs at 390px and 1440px. Actual execution
results are reported separately from these instructions.

## Execution record — 28 October 2026

- Locked Next.js 16.4.2 dependencies installed in the isolated worktree.
- `npm run lint`: passed, no warnings. `npm test`: 149 passed.
- `npm run test:e2e -- --grep SPM-38`: all 10 focused journeys passed.
- `npm run test:e2e`: all 371 journeys passed, including production build/types.
- Desktop/mobile screenshots inspected: long email wraps, and support text is
  fully displayed. A subsequent test-fixture-only cleanup supplies the venue
  endpoint for the empty-preference screenshots; affected journeys are rerun.
- No hosted fixture writes, database migration application, push or Jira update.

Final follow-up: after the venue-mock-only screenshot cleanup, the affected
workspace/draft files passed 20 cases and hit one timeout in the existing
SPM-37 autosave test. The trace shows its business assertions completed and the
screenshot capture timed out. A focused rerun of all SPM-38 cases plus that
unchanged autosave test passed 11/11. No timeout, retry or assertion was weakened.
The earlier full 371-case passing report and final focused report are preserved
outside the source repositories. The generated tracked HTML report was restored.

## Full backend rerun — 29 October 2026

The previous MongoDB exclusions are resolved for this execution: all 65 suites
and all 1,756 tests passed in 30.595 seconds, with no suites excluded.

The default cached MongoDB 7.0.24 executable was truncated: 26,220,544 bytes,
while its Mach-O headers require 165,343,616 bytes. This causes macOS error 88,
"Malformed Mach-O file". A separate MongoDB 7.0.24 download was verified against
the published archive checksum and extracted to an isolated temporary cache.
The original damaged cache was not modified. Hosted MongoDB accessibility does
not control these local test processes.

Three tests import the Supabase client without contacting it, so the isolated
worktree also needs dummy Supabase configuration. The successful command was:

```sh
SUPABASE_URL=https://supabase.example.test \
SUPABASE_SERVICE_ROLE_KEY=spm38-local-test-key \
MONGOMS_SYSTEM_BINARY=/private/tmp/spm38-mongo-rerun.J7emoc/mongod-arm64-darwin-7.0.24 \
MONGOMS_SYSTEM_BINARY_VERSION_CHECK=true \
npm test -- --runInBand
```

No real Supabase credentials or hosted MongoDB fixtures were used. This is the
complete `npm test` command, not the opt-in hosted integration suite. The earlier
SQL and frontend results remain prior execution records; they were not rerun in
this backend-only check. Application code and shared data were unchanged.

## Hosted dependency check — 29 October 2026

Read-only checks against the actual configured Supabase project and MongoDB
Atlas succeeded. Supabase event/contact model reads work, but migration
`20261028120000_spm38_submitted_support_needs.sql` is not applied: the support
column and its updated write functions are missing. Apply that reviewed
migration before deploying these fixes or testing support-needs persistence
against shared development. MongoDB Atlas schema validators match the code,
all six MongoDB migrations are recorded, and sampled model reads succeed.
No hosted data, Auth, or schema changes were made. The backend SPM-38 test plan
contains the detailed findings and verification boundaries.

## Publication checks — 29 October 2026

Frontend lint passed and all 149 unit tests passed. The focused browser command
`npm run test:e2e -- tests/e2e/event-workspace.spec.mjs tests/e2e/spm-37.spec.mjs`
passed all 21 cases in 47.2 seconds, including the production build/type checks,
mobile/desktop captures, support-needs draft/resume/submission, denied access,
history labels and the existing autosave regression. The earlier 371-case full
browser run remains a prior execution record; it was not rerun for publication.
