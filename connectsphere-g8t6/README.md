This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, navigate into the project directory and install the dependencies:

```bash
cd connectsphere-g8t6
npm install
```

Create `.env.local` in `connectsphere-g8t6/` (never commit it):

```dotenv
BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://rvwiflsedoujspmzfrbq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon/publishable key from the Supabase dashboard>
```

| Variable | Read by | Notes |
| --- | --- | --- |
| `BACKEND_URL` | `api/events.tsx` (server) | Health check on `/` |
| `NEXT_PUBLIC_BACKEND_URL` | `lib/api/client.ts` (browser) | Express backend base URL, no trailing slash |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/auth/session.ts` | Supabase Auth only; business data goes through the backend |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/auth/session.ts` | Public anon key. Never put the service-role key here |

`NEXT_PUBLIC_*` values are inlined at build time, so rebuild or restart after changing them.

## Authentication (SPM-32)

- `/login` signs in with Supabase Auth in the browser, then calls `GET /api/auth/me`; the backend's `role` and `home_path` decide where the user lands. A valid same-origin `?next=` takes priority.
- Every route under `app/(portal)/` is protected by `components/layout/PortalGate.tsx`, which renders nothing protected until `/api/auth/me` succeeds and redirects to `/login?next=…` otherwise.
- Logout calls `POST /api/auth/logout`, then `supabase.auth.signOut({ scope: "local" })`.
- `/signup` (SPM-123) lets visitors register as an Attendee or Event Organiser only (`SIGNUP_ACCOUNT_TYPES` in `lib/validation/signup.ts`). It calls `POST /api/auth/signup`, which returns no session, then signs in through the same `useAuth().signIn` flow as `/login`, so the landing page comes from `/api/auth/me`. Email verification is deferred.
- Code layout: `lib/api` (single backend client), `lib/auth` (session, provider, guard, `next=` handling), `lib/permissions` (presentation-only role helpers), `lib/validation`, `components/dashboard` (one replaceable component per role).

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## ✅ Commit Message Format

This project follows a structured commit message format for consistency.

Please refer to the COMMIT_MESSAGES.md file in the root directory for details.

## 📁 Current connectsphere-g8t6 File Structure

```bash
connectsphere-g8t6/
├── .next/
├── app/
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── node_modules/
├── public/
├── .gitignore
├── AGENTS.md
├── CLAUDE.md
├── COMMIT_MESSAGES.md
├── eslint.config.mjs
├── next-env.d.ts
├── next.config.ts
├── package-lock.json
├── package.json
├── postcss.config.mjs
├── README.md
└── tsconfig.json
```

## 📁 Proposed connectsphere-g8t6 File Structure

```bash
connectsphere-g8t6/
├── public/                         # Static assets (images, icons, etc.)
│   ├── favicon.ico
│   └── logo.png
├── src/
│   ├── app/                        # App Router entry point
│   │   ├── layout.tsx              # Global layout (shared across all pages)
│   │   ├── page.tsx                # Home page (route: /)
│   │   ├── page1/                  # About page
│   │   │   └── page.tsx            # (route: /about)
│   │   ├── page2/                  # Contact page
│   │   │   └── page.tsx            # (route: /contact)
│   │   ├── page3/                  # Protected page example
│   │   │   └── page.tsx            # (route: /dashboard)
│   │   ├── api/                    # API routes (optional)
│   │   │   └── auth/
│   │   │       └── route.ts        # (GET /api/hello)
│   ├── components/                 # Reusable React components
│   ├── styles/                     # Global and module styles
│   └── lib/                        # Utility functions and API clients
├── .env.local                      # Frontend-specific env vars (not committed)
├── next.config.ts                  # Next.js configuration
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript config (if using TS)
└── README.md                       # Frontend documentation
```

## 🌿 Branching Strategy & Standard Operating Procedure (SOP)

To maintain clean repository history and smooth collaboration, follow these branching rules:

### Branch Naming Convention

Format: `<type>/<ticket-id>-<short-description>` or `<type>/<short-description>`

- **`feature/`**: For new features or updates (e.g., `feature/SPM-54-react-boilerplate` or `feature/user-authentication`)
- **`fix/`** or **`bugfix/`**: For bug fixes (e.g., `fix/SPM-58-cors-issue` or `fix/header-overflow`)
- **`refactor/`**: For code refactoring without behavior changes (e.g., `refactor/api-routes`)
- **`docs/`**: For documentation updates (e.g., `docs/update-readme`)
- **`chore/`**: For maintenance, dependency updates, or config changes (e.g., `chore/bump-nextjs`)

### Branching Workflow (SOP)

1. **Pull the latest changes** from the main development branch before creating a new branch:
   ```bash
   git checkout main
   git pull origin main
   ```
