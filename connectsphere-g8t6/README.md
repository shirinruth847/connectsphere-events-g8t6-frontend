# ConnectSphere frontend

The organiser-facing Next.js App Router application for creating and tracking
campus event requests.

## Requirements

- Node.js 22 or newer
- The ConnectSphere backend running locally, unless configured to use another
  API host
- A Supabase project with an active organiser profile

## Setup

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and provide the Supabase URL and
   publishable key. Set `NEXT_PUBLIC_BACKEND_URL` if the API is not at
   `http://localhost:8000`.
3. Start the app with `npm run dev` and open `http://localhost:3000`.

Do not commit `.env.local` or other files containing credentials.

## Checks

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
