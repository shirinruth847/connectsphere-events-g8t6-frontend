# SPM-44 — attendee event viewing

Story: [SPM-44](https://yvery.atlassian.net/browse/SPM-44).
Frontend PR: [19](https://github.com/shirinruth847/connectsphere-events-g8t6-frontend/pull/19).
Implementation reviewed: `d086e46`, including the merge of main `b050293`.

## Implemented behavior

- Attendees without a permitted login return URL land on `/events`. My Events
  (`/my-registrations`) and Notifications (`/notifications`) remain accessible.
- Cards open the shared event details dialog. Direct `/events/<id>` URLs show
  attendee discovery details. Attendees use `/api/events/discovery` and
  `/api/events/discovery/:id`, never the staff `/api/events/:id` endpoint.
- Express owns visibility. Master v1.4 §5.3 permits explicitly published events
  in `CONFIRMED` or `PREPARATION`; the current backend also excludes ended
  events. The frontend displays the returned page and its opaque `nextCursor`.
- Cards show attendee-facing title, schedule in SGT, location, description and
  registration availability. Labels remain `Registration Open`,
  `Full - Waitlist` and `Registration Closed`, with `Not Yet Open` and
  `Unavailable` added by SPM-134, which retired `NOT_ENABLED`. Every card,
  the details dialog and `/events/[eventId]` show one registration state:
  Register Now for `OPEN`, otherwise a disabled control (see
  `attendee-registration.spec.mjs`).
- A detail 404 removes the discovery card and hides its stale title and
  availability. Malformed direct IDs show the unavailable state. A 401 follows
  shared session recovery; 403 explains access; other failures offer retry.
- My Events and notification links keep the registration-backed dialog, which
  can show an attendee's own place and last-confirmed snapshots. They do not
  switch to discovery visibility rules. Staff workflows remain role-specific,
  including Venue Staff bookings and Safety Officer reviews.

## Acceptance criteria and requirement reconciliation

Jira was read on 25 October 2026; its last update was 23 October 2026.
The following records differences without claiming Jira has been changed.

| Criterion | Implementation and verification |
| --- | --- |
| AC1 — view confirmed events | Render each eligible API result as a card; load further cursor pages without duplicates. “All confirmed” is qualified by publication and the backend's end-time filter. |
| AC2 — hide non-confirmed events | Backend owns filtering. Jira's exact `CONFIRMED` rule conflicts with Master §5.3, which also permits published `PREPARATION`. A returned 404 is covered in the UI. |
| AC3 — event information | Browser tests cover card/detail fields, SGT, availability and registration-disabled events. Jira's “Registration Opened” and “Waitlisted” wording differs from retained SPM-34 labels. |
| AC4 — newly confirmed becomes visible | A fresh listing retrieves current backend results. A hosted confirmation-to-visible transition was not exercised in this review. |
| AC5 — no longer eligible becomes hidden | Fresh retrieval delegates eligibility to Express; detail 404 removes stale card data. A transition to `PREPARATION` remains eligible under the Master. Hosted transitions were not exercised. |
| AC6 — no events | Empty response shows “No events are available at the moment.”; errors are shown separately. |

The ticket embeds TC-EVENT-001–007 and TC-EVENT-009; TC-EVENT-008 is absent.
The ticket owner should align AC1, AC2, AC4, AC5 and TC-EVENT-009 with Master
publication/lifecycle rules, and AC3 with the agreed display labels. The frontend
README, workflow and Master surface section now describe the retained SPM-44
landing/detail behavior, superseding older dialog-only descriptions.

## Commands and coverage

Run from `connectsphere-g8t6`:

```sh
npm run lint
npm test
npm run test:unit
npm run test:e2e
```

Focused attendee journeys: `npm run test:e2e -- attendee-discovery.spec.mjs`.
The browser suite includes production build/type checking and serves port 3100.
It mocks Auth/API responses and covers pagination, details, empty/error/retry,
401/403/404 handling, login return paths, staff isolation and 390px mobile
layouts. The full suite also covers main's Safety Officer, clarification,
notification, organiser and venue workflows.

## Recorded validation, 25 October 2026

Before this documentation-only update, the resolved merge passed locally:
`npm run lint`, 110 Node tests, two Vitest tests and 252 browser tests, including
production build/type checking. The pushed commit `d086e46` also passed the
[Frontend checks / UI and journeys run](https://github.com/shirinruth847/connectsphere-events-g8t6-frontend/actions/runs/40205901474).
These are prior execution records, not new executions for this document edit.

Hosted lifecycle transitions, RLS/grants and deployed schema were not verified:
Supabase MCP was unavailable. No shared fixture writes were authorized or run.
`npm run test:live` creates/deletes fixtures elsewhere in the script and is not
a read-only substitute for the mocked tests. Hosted verification needs an
explicitly authorized environment, namespaced synthetic fixtures and cleanup.
