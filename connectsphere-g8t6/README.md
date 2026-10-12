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
