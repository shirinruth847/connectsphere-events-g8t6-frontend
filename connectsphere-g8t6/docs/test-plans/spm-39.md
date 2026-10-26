# SPM-39 frontend: approve submitted event request

## Scope and contract

Extends the existing assigned-coordinator event workspace at `/events/:eventId`.
The existing DashboardWorkspace, sidebar, request details and history are reused;
no shared auth, navigation, shell or design-token changes are needed.

Jira SPM-39 was read on 27 October 2026. It has no comments or linked PRs;
no backend PR exists for the matching local feature branch. The backend working
tree already contains SPM-39 changes, which this frontend work preserves.

The Master and existing backend test plan supersede stale Jira expectations:
approval moves UNDER_REVIEW to PLANNING (organiser: Approved & Planning), never
APPROVED. REJECTED and CANCELLED remain distinct. A venue preference is not a
booking, and approval does not confirm resources or the event.

POST `/api/events/:id/accept-feasibility`, body `{ version }`, header
`Idempotency-Key`; use the existing apiRequest/session handling. Success uses
the returned event and refreshes history. The backend owns atomic notification,
audit and mandatory-field validation, including organiser contact information.
The current event-detail contract exposes organiser name, not email/phone;
this frontend does not invent contact fields or change that API contract.

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
