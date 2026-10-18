<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## ConnectSphere shared UI agreement

Read `docs/team-ui-workflow.md` before changing protected pages, navigation,
authentication or shared styling. New protected pages use `DashboardWorkspace`
and `PageContent`; role tabs are configured in `lib/navigation.ts`. Preserve
the shared shell and existing authentication/API helpers. Keep feature CSS in
component utilities or CSS Modules, and global CSS limited to shared foundations.

For ticket implementation, also follow `docs/agent-task-template.md` using
the actual ticket and task supplied by the user. It defines scope, data and
verification boundaries and can be attached to agents that do not load this file.
