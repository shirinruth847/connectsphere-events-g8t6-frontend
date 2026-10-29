# Lead Dashboard home request visibility

User-reported correction, 28 October 2026, related to SPM-174's existing
submitted-unassigned request queue. The reported URL is `/dashboard`.

The Lead home previously rendered navigation links without fetching event
requests. It now embeds the existing `EventAssignmentQueue`, also used on
`/events`. The trusted role dispatcher, shared shell, Express APIs, loading,
error/retry, empty state, availability checks and explicit assignment
confirmation are reused. The queue contains submitted unassigned requests;
assigned events remain in their existing supervised-assignment scope.

Initial inspection found `ENABLE_COORDINATOR_WORKFLOWS` absent from the ignored
local backend `.env`; it was enabled as a temporary workaround for the old
backend. The user then requested testing without the rollout switch. The paired
backend candidate `fix/lead-workflow-availability` registers the existing Lead
routes unconditionally, preserving authentication and authorization. With that
backend, no workflow environment flag is needed. Older deployed backends still
require the flag until upgraded. Neither fix is merged into main yet.

## Evidence

- Both new request-visibility cases, at 1440px and 390px, failed on the original
  home page because no request heading was rendered.
- Read-only development PostgreSQL inspection found 17 submitted requests with
  no coordinator. No fixture or business data was changed.
- Local Express smoke requests to `/api/events/unassigned`,
  `/api/events/coordinator-availability` and `/api/events/assignments` returned
  `401 UNAUTHENTICATED` after enabling the setting, rather than gated `404`s.
  The application was imported without starting background jobs. These checks
  prove route registration and authentication, not authenticated workflow success.
- Playwright MCP with synthetic Auth/API responses showed the queue on home,
  one shared shell and no document overflow at desktop and mobile widths.
  Screenshots: `/private/tmp/lead-dashboard-desktop.png` and
  `/private/tmp/lead-dashboard-mobile.png`.

`tests/e2e/lead-dashboard.spec.mjs` covers both viewports, backend-confirmed
assignment and removal, an empty response, failure/retry without a false empty
state, backend denial, and expired-session login recovery. Browser requests are
mocked; no hosted fixture or concurrency checks were performed.

## Completed checks, 28 October 2026

- `npm run test:e2e -- --reporter=line --output=/private/tmp/lead-dashboard-after`:
  352 passed, including all seven new dashboard cases, production build and
  TypeScript checks. The two request-visibility cases failed before the fix.
- `npm test`: 147 passed; `npm run test:unit`: 3 passed.
- `npm run lint`: zero errors, one existing unused `historyIcon` warning.
- Desktop/mobile screenshots were visually checked. `git diff --check` passed.
- After the backend candidate removed the switch, an additional Playwright MCP
  journey used this production frontend with the real Express app over HTTP,
  with no browser API mocks and the flag unset. Synthetic identity/business
  model test doubles supplied all data. Dashboard loading, confirmed assignment,
  queue removal, Assignments navigation and confirmed reassignment after refresh
  passed. Missing authentication returned 401 and a Coordinator token returned
  403. No real Auth sessions or database writes were performed.

The backend candidate's full unit suite passed 1,749 tests across 65 suites,
including 44 route regressions with the flag unset or `false`. See its
`docs/test-plans/lead-workflow-availability.md` for exact commands and limitations.
