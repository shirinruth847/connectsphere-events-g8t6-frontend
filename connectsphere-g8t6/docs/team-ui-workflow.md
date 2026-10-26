# Shared UI and navigation agreement

Implementation branch: `fix/main-completed-ticket-baseline`. This agreement
becomes the team baseline when the repair PR is reviewed and merged. Do not
merge this branch into an unrelated feature branch without reviewing its full
repair scope. After integration, update feature branches from the agreed main.

For coding agents, attach [agent-task-template.md](agent-task-template.md) or
ask the agent to read it with your ticket ID and Jira link. `AGENTS.md` also
points to it for agents that load repository instructions automatically.

## Shared files and responsibilities

| File | Responsibility |
| --- | --- |
| `components/layout/dashboard-shell.tsx` | One sidebar, brand, profile, logout, mobile menu and content frame for every role |
| `components/layout/dashboard-workspace.tsx` | Authenticated page wrapper, with an optional exact role restriction |
| `components/layout/page-content.tsx` | Standard page heading, actions and content spacing |
| `components/shared/primitives.tsx` | Buttons, inputs, cards, alerts, status chips, loading and empty states |
| `lib/navigation.ts` | Role-specific navigation items and active-tab selection |
| `lib/auth.ts` | Exact role values, labels, route constants and safe login destinations |
| `lib/api.ts`, `lib/session.ts`, `lib/supabase.ts` | Shared API calls, session checks and Supabase browser client |
| `app/globals.css` | Shared tokens, font and base styles only |

The organiser sidebar from `shree` is the visual reference: 225px desktop
sidebar, the same purple, the same brand/profile/logout placement and a
1280px maximum content width. Staff and attendees use that same component.
Only the navigation and page content vary by role. The organiser keeps its
existing search/filter header; new standard pages use `PageContent`.

`OrganiserShell`, `OrganiserWorkspace` and `StaffShell` remain compatibility
entrypoints for existing feature branches. They delegate to the shared frame.
Do not copy their previous implementations into new pages.

## Where each member codes

Folders belong to roles, not individual members. Anyone can work on any ticket;
choose the folders for the roles that ticket affects. Cross-role workflows may
touch several folders and share a backend contract. Prefer separate feature
components over adding all ticket logic to the role's dashboard file.

| Role | Dashboard entrypoint | Feature folder |
| --- | --- | --- |
| Organiser | `components/organiser/dashboard.tsx` | `components/organiser/`; existing event forms/details remain in `components/events/` |
| Coordinator | `components/coordinator/dashboard.tsx` | `components/coordinator/` |
| Coordinator Lead | `components/coordinator-lead/dashboard.tsx` | `components/coordinator-lead/` |
| Venue Staff | `components/venue-staff/dashboard.tsx` | `components/venue-staff/` |
| Technical Support | `components/tech-support/dashboard.tsx` | `components/tech-support/` |
| Attendee | `components/attendee/registrations.tsx` | `components/attendee/` |

`components/auth/role-dashboard.tsx` dispatches the trusted profile to a role's
dashboard; feature logic belongs in that role's folder. Most roles keep the
`/dashboard` URL while rendering different components. Attendees retain
`/my-registrations`. New feature URLs belong under `app/`, with their view
components in the role folder. Do not create another sidebar for a role.
Staff/lead landing files are extension points for their tickets, not a claim
that pending venue, technical or assignment workflows are implemented.

The agent should establish these details from the ticket and repository:

- Ticket ID/link and its current acceptance criteria.
- Affected roles and feature folders from the table above.
- Agreed URL, permitted roles and expected navigation destination.
- Backend endpoints, request/response examples, errors and linked backend PR.
- Existing screen or visual reference, including mobile behaviour.
- Task scope, dependencies and any unfinished feature to keep excluded.
- Expected validation and the shared files that require an integration review.

Private test-account credentials are provided separately through the team's
password manager. The shared baseline must be integrated before these files
are available to other members; attaching the prompt alone does not add them.

## Roles and destinations

| Role value | Display label | Home | Current main navigation |
| --- | --- | --- | --- |
| `ORGANISER` | Event Organiser | `/dashboard` | Dashboard, My Requests, My Drafts |
| `COORDINATOR` | Event Coordinator | `/dashboard` | Assigned Events |
| `COORDINATOR_LEAD` | Event Coordinator Lead | `/dashboard` | Dashboard |
| `VENUE_STAFF` | Venue Staff | `/dashboard` | Dashboard |
| `TECH_SUPPORT` | Technical Support | `/dashboard` | Dashboard |
| `ATTENDEE` | Attendee | `/my-registrations` | My Registrations |

Unavailable items have no `href` and appear disabled. Add links only when
their page and access rules are implemented. Pending assignment/calendar
workflows are not enabled by this shared-shell change.

Navigation is presentation, not authorization. The backend verifies the user
and resource scope. A hidden tab does not protect an endpoint. The frontend
reads the trusted profile through `useSessionUser`; do not infer roles from
an email address, display label or client-editable Auth metadata.

## Starter page

Create a route page using the shared wrapper. Apply it once: either in the
route's layout or in the page, never in both. A client feature component can
fetch its scoped data with `apiRequest` inside this frame.

```tsx
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";
import { PageContent } from "@/components/layout/page-content";
import { SectionCard } from "@/components/shared/primitives";

export default function FeaturePage() {
  return (
    <DashboardWorkspace role="COORDINATOR">
      <PageContent title="Feature title" eyebrow="Event Coordinator">
        <SectionCard>Replace with your feature component.</SectionCard>
      </PageContent>
    </DashboardWorkspace>
  );
}
```

Omit `role` only for a page intentionally shared by all signed-in roles.
Use existing shared primitives and tokens such as `bg-primary`,
`text-on-surface`, `rounded-panel` and `shadow-elevation-1`. Use a feature's
`*.module.css` for custom styling. `--warning` (`#f2b705`, `bg-warning`) marks
unseen event-history entries; it has low contrast on white, so always pair it
with a text label. Do not add global `nav`, `label`, `button`,
`h1` or `.page-header` rules: they can override other members' layouts.
Avoid another `main` element inside the shell's existing `main` element.

## Adding a tab or route

1. Agree the ticket ACs, URL, allowed roles and API request/response contract
   with the frontend/backend owners before parallel work starts.
2. Add its canonical URL to `ROUTES` in `lib/auth.ts`. Update `canViewPath`
   for valid login return paths. Keep `/events/create` as the existing alias.
3. Add the item only to appropriate roles in `lib/navigation.ts`. Give it a
   stable ID, label and icon. Update `activeNavigationId` so exactly one tab
   is current, including query-driven tabs such as My Drafts.
4. Implement the guarded page with `DashboardWorkspace` and its API with
   backend role/resource checks. Reuse the existing login and API client.
5. Extend the journey test for its destination, denied roles, direct URL,
   expired session and mobile navigation. Cover the ticket's save/submit
   behaviour when applicable.

Do not rename an API property or workflow status in the UI alone. Document
an agreed contract change and link the corresponding backend PR. Database
changes go in reviewed migrations; no ad hoc changes to the shared database.

## Review and checks

Feature owners work in their feature components and page files. Assign a
shared UI/auth reviewer for changes to the shared files listed above. This
is a team review agreement; no GitHub account names have been invented for
CODEOWNERS and no remote branch-protection settings were changed.

Before merging, run from `connectsphere-g8t6`:

```sh
npm ci
npm run lint
npm test
npm run test:e2e
```

The browser command includes the production build/type checks and tests on
port 3100. Its Auth/API mocks need no private Supabase credentials. It checks
all six role destinations, the common sidebar, role-specific links, active
tabs, mobile menu, logout and the completed event/draft workflows. Capture
desktop and mobile screenshots for visual changes; current automation tests
geometry and journeys, not pixel-by-pixel screenshot approval.

The prepared `Frontend checks / UI and journeys` GitHub workflow runs these
checks on PRs after it is pushed. It has not run on GitHub yet. The repository
owner should require that status check and a shared-component review before
merging, and prevent direct pushes to main. Those remote settings remain a
separate owner action.

For real manual checks, run the backend on port 8000 and one frontend on
`http://localhost:3000`. Its origin must match backend `FRONTEND_ORIGIN`.
Use the private seed credentials through the team password manager. Do not
share `.env` files, database passwords or service-role keys in chat or PRs.

## Message to share with the team

We have a shared UI baseline on `fix/main-completed-ticket-baseline`, pending
review and merge. Please use the common `DashboardWorkspace` and `PageContent`
for new protected pages. The sidebar, mobile menu, profile and logout are
shared across roles; role tabs live in `lib/navigation.ts`, and URLs/roles live
in `lib/auth.ts`. Please keep feature CSS scoped and avoid global element
selectors. Coordinate route/API changes with the relevant frontend/backend
owner, and request shared UI review when changing the shell or auth helpers.
Before merging, run lint, unit tests and browser tests, and attach desktop/mobile
screenshots for visual changes. After the repair is merged, update your feature
branch from the agreed main. Follow `docs/team-ui-workflow.md` for the starter
page and integration steps.
