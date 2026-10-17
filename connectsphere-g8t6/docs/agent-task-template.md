# Agent task boundaries

Attach this file to your coding agent, or start with:

```text
Read docs/agent-task-template.md and follow it for ticket SPM-XXX.
Ticket link: <Jira URL>
Task: <what you want implemented>
```

Replace the ticket and task in that message; keep this shared file unchanged.
Use the user's actual ticket, not the example placeholder. This file is an
instruction agreement, not a technical permission barrier. Required checks
and shared-component review must also be enforced in the repository.

Infer the relevant roles, folders and dependencies from the ticket and existing
code. Any member may work in any role folder; these are feature boundaries,
not personal assignments. A cross-role ticket may update several role folders.
Ask only for missing requirements or API agreements that cannot be established
from the ticket, linked PRs or repository.

## Before editing

1. Read `AGENTS.md`, `docs/team-ui-workflow.md` and `COMMIT_MESSAGES.md`.
   Follow the installed Next.js documentation required by `AGENTS.md`.
2. Read the ticket's acceptance criteria and relevant PR review comments.
   If they are inaccessible, report what is missing and do not invent ACs.
3. Check the branch and working tree. Preserve existing changes and stashes.
   Work on a feature branch; do not edit main directly.
4. Identify the files needed for this ticket and its integration dependencies.
   If shared baseline components are missing, report the missing baseline
   rather than creating competing implementations.

## UI boundaries

- Use `DashboardWorkspace` and `PageContent` for new protected pages.
  Apply the workspace once, in the route layout or page, never both.
- Put feature components in the relevant role folders listed in the team
  guide. Keep `components/auth/role-dashboard.tsx` as a dispatcher, not a
  shared file for every member's feature logic. URL entrypoints live in `app/`.
- Reuse `components/shared/primitives.tsx` for buttons, inputs, cards,
  alerts, loading/empty states and status chips.
- Use the shared `DashboardShell`. Do not create or copy another sidebar,
  mobile navigation, profile panel or logout implementation.
- Configure role tabs in `lib/navigation.ts`. Keep canonical routes and
  exact role values in `lib/auth.ts`; update active-tab and login-return
  rules when adding a route.
- Keep feature styling in CSS Modules or component utilities.
- Keep `app/globals.css` limited to shared tokens, fonts and base styles.
  Do not introduce global `nav`, `label`, `button`, heading or generic
  `.page-header` selectors, or replace shared design tokens for one feature.
- Preserve the agreed organiser layout from `shree`, including responsive
  sidebar/content placement. Roles may have different permitted tabs.

## Authentication and data boundaries

- Reuse `lib/supabase.ts`, `lib/session.ts` and `apiRequest` in `lib/api.ts`.
  Do not create a second client or independent login/session flow.
- Preserve role restrictions, safe return URLs, expired-session handling,
  logout and resource ownership/organisation scoping.
- Read the trusted backend profile through `useSessionUser`. Do not derive
  role access from an email address or client-editable user metadata.
- Hidden navigation is not backend authorization. APIs must enforce access.
- Do not rename API fields, statuses or routes without coordinating the
  corresponding frontend/backend changes and documenting the contract.
- Do not expose or commit credentials. Never place privileged database or
  service-role credentials in browser code or public environment variables.
- Do not modify real users or apply shared database migrations without
  explicit authorization. Use reviewed migrations for authorized changes.
- Tests may create and remove their own namespaced fixtures only in the
  authorized environment. Verify cleanup and report any remaining fixtures.

## Scope boundaries

- Implement this ticket and necessary supporting changes only.
- Do not overwrite shared layouts, discard others' work or import unrelated
  pending features to make tests pass.
- For necessary changes to shared auth, navigation, layout, tokens or API
  contracts, explain the impact and flag the files for shared-component
  review. Prepare the authorized implementation and validation for review.
- Do not weaken assertions, disable access controls or suppress hydration
  diagnostics to hide failures.
- Do not push, merge, publish or change repository settings unless instructed.

## Before completing

1. Verify every ticket AC, including relevant error, empty and loading states.
2. Run lint, relevant tests and browser journeys. The frontend browser suite
   includes the production build/type checks. For docs-only changes, review
   links and the diff; application tests need not be rerun.
3. For UI changes, check desktop/mobile placement and capture both views.
   For navigation/auth changes, check permitted and denied roles, direct
   URLs, login destination, active tab, expired session and logout.
4. Preserve draft/save/submission behaviour when touching event workflows.
5. Review the diff for unrelated changes and secrets. Follow
   `COMMIT_MESSAGES.md` when committing.
6. Report changed files, checks passed, checks not run, remaining issues and
   any shared-component review or cross-repository integration needed.
