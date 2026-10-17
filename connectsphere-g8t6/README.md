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
2. Create `.env.local` in `connectsphere-g8t6/` with the variables below. Set
   `NEXT_PUBLIC_BACKEND_URL` if the API is not at `http://localhost:8000`.
3. Start the app with `npm run dev` and open `http://localhost:3000`.

Do not commit `.env.local` or other files containing credentials.

```dotenv
BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://rvwiflsedoujspmzfrbq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon/publishable key from the Supabase dashboard>
```

| Variable | Read by | Notes |
| --- | --- | --- |
| `BACKEND_URL` | `lib/api/events.ts` | Fallback when `NEXT_PUBLIC_BACKEND_URL` is unset |
| `NEXT_PUBLIC_BACKEND_URL` | `lib/api/client.ts`, `lib/api.ts`, `lib/api/events.ts` (browser) | Express backend base URL, no trailing slash |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/auth/session.ts`, `lib/supabase.ts`, `lib/supabase/browser.ts` | Supabase Auth only; business data goes through the backend |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as above | Public anon key (`lib/supabase.ts` also accepts `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Never put the service-role key here |

`NEXT_PUBLIC_*` values are inlined at build time, so rebuild or restart after changing them.

## Authentication (SPM-32)

- `/login` signs in with Supabase Auth in the browser, then calls `GET /api/auth/me`; the backend's `role` and `home_path` decide where the user lands. A valid same-origin `?next=` takes priority.
- Every route under `app/(portal)/` is protected by `components/layout/PortalGate.tsx`, which renders nothing protected until `/api/auth/me` succeeds and redirects to `/login?next=…` otherwise.
- `/dashboard` renders one component per role (`components/dashboard/DashboardView.tsx`); organisers get the event request dashboard from `components/events`.
- Logout calls `POST /api/auth/logout`, then `supabase.auth.signOut({ scope: "local" })`.
- Code layout: `lib/api` (single backend client), `lib/auth` (session, provider, guard, `next=` handling), `lib/permissions` (presentation-only role helpers), `lib/validation`, `components/dashboard` (one replaceable component per role).

## Checks

- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

Event request list and detail data comes from the backend API. The browser
authenticates directly with Supabase Auth; organiser role and profile checks
are performed by the backend.

See [COMMIT_MESSAGES.md](COMMIT_MESSAGES.md) for the repository's commit format.
