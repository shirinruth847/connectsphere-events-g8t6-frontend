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
