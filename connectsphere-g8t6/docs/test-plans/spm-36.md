# SPM-36 frontend test cases — submitting event requests

Status: core submission implemented and verified in the browser; dependent cross-role and notification integrations remain outstanding.
See the execution record below for verified coverage and its limits.

## References and agreed behavior

- [SPM-36 — Submitting Event Requests](https://yvery.atlassian.net/browse/SPM-36).
- [Master](../../ConnectSphere-Master.md), sections 3.5, 5.2, 5.8 and 8.
- [Backend companion plan](../../../../connectsphere-events-g8t6-backend/docs/test-plans/spm-36.md).
- Original scenario references `TC-01`–`TC-18` and `NT-01`–`NT-06` match the planning discussion; `FE-*` identifies frontend cases. `E2E-*` is shared cross-role coverage, listed only here.

Use the Master flow and the user's confirmed setup of one Coordinator Lead:

`DRAFT → submit → SUBMITTED (unassigned) → Lead assigns → UNDER_REVIEW`

The Organiser sees a submission confirmation identifying the existing request
and its `Submitted` status. Coordinator displays as `Unassigned` until the one
Lead assigns a Coordinator. Submission must not claim a Coordinator has already
been assigned. The supervising Lead is recorded on assignment, not submission.

SPM-36's automatic-assignment wording in SUB-01, SUB-02, SUB-06 and SUB-08 is
superseded for this plan by the agreed flow. This document does not edit Jira.
Use SPM-33's read-only behavior after submission. Clarification responses and
change requests are separate workflows.

## Fixtures and execution approach

- A: active Organiser who owns complete saved draft E. B: a different Organiser, including a same-organisation variant.
- L: the one Coordinator Lead. C1/C2: separate Coordinator accounts.
- Test no session, expired session and non-Organiser roles as denied actors.
- Valid event values use a fixed clock, explicit timezone offsets and at least the current shared 48-hour lead time. No real user data or credentials in test artifacts.
- Component/browser tests may mock established auth/API contracts to exercise interface states. Backend authorization, transactions and notification creation are proved in the backend plan, not by browser mocks.
- Reuse the shared authentication/session/API helpers and shared workspace. This plan proposes no new page layout, navigation or UI redesign.
- When implementing UI later, satisfy the repository design-reference gate and check the existing organiser layout on desktop and mobile.
- Run real cross-role journeys only with authorized synthetic accounts and test fixtures; enable Coordinator workflow routes and record cleanup.

## Core frontend cases

| ID | Original scenario / AC | Preconditions and action | Expected result | Level |
| --- | --- | --- | --- | --- |
| FE-01 | TC-01 / SUB-01 | A opens owned saved draft E. | Saved values prefilled; draft status and Submit action shown; no implication of an existing Coordinator assignment. | Browser |
| FE-02 | TC-02 / SUB-01 | A changes valid fields in E, then submits. | Request targets E's existing ID and includes the final accepted edits; no second create-event request; existing draft-save behavior preserved. | Browser + API interception |
| FE-03 | TC-03 / SUB-02 | Backend returns successful submission. | Clear success confirmation includes request identifier and `Submitted`; displayed Coordinator is `Unassigned` and any next-step guidance describes Lead assignment. | Component/browser |
| FE-04 | TC-03 / SUB-01, SUB-02 | Reload or reopen E after success; inspect request and draft lists. | E still shows `Submitted` and unassigned Coordinator, appears in the applicable submitted-request view, and is no longer presented as an editable draft. | Browser |
| FE-05 | TC-06 / SUB-03 | Clear each mandatory field; use whitespace-only text; submit with several missing fields. | Descriptive errors beside all affected fields; entered valid values retained; no success state or client-validated submission sent. | Validation + browser |
| FE-06 | TC-07, TC-08 / SUB-04 | Enter past/too-soon start, invalid dates, equal/reversed end, then valid times. | Field-specific correction guidance; exactly the shared 48-hour threshold is accepted using a fixed clock; browser timezone conversion preserves the intended instant. Backend remains authoritative. | Validation + browser |
| FE-07 | TC-07 / SUB-04 | Enter attendance 0, negative, decimal or nonnumeric; correct to a positive whole number. | Appropriate attendance error; other fields retained; corrected valid value can be submitted. | Validation + browser |
| FE-08 | TC-09 / SUB-04 | Use invalid layout/requirements and enabled registration without valid capacity; also simulate backend field errors for options that became invalid. | Shared validation guidance and backend errors appear at the corresponding inputs; no false success; retained form values can be corrected. | Component/browser |
| FE-09 | TC-06, TC-07 / SUB-03, SUB-04 | Backend returns multiple field validation errors even though client checks passed. | Each relevant error displayed; form remains editable with all user input; backend status is not optimistically shown as submitted. | Component/browser |
| FE-10 | TC-13 / SUB-06 | Delay submission response; click Submit repeatedly and try keyboard submission while pending. | Visible pending state; repeated submission disabled/guarded; one in-flight submit request; final state follows the response. | Browser + API interception |
| FE-11 | TC-17 / SUB-08 | Backend reports a definite save failure. | Explanatory error, no success confirmation; entered values retained; retry becomes available; server draft is not shown as successfully submitted. | Component/browser |
| FE-12 | TC-14 / SUB-06, SUB-08 | Submission commits but response is lost; repeat attempt returns `EVENT_NOT_DRAFT`; retrieve E. | Recover by retrieving authoritative state; display actual submission result without creating another event. On uncertain outcome, do not assert the server is still a draft. | Browser |
| FE-13 | TC-15 / SUB-06 | Retry from an old draft tab after L assigned C1; retrieve current E. | Display current C1 and `Under Review`; no status regression, duplicate event or claim of a new submission. | Browser |
| FE-14 | TC-16 / SUB-05 | A opens submitted E and attempts to reach editing through Back, refresh or an old draft URL. | Submitted inputs read-only; no working Submit or direct-save action; permitted change-request guidance uses the existing integration without building that workflow. | Browser |
| FE-15 | TC-16 / SUB-05 | An old editable tab receives an API denial because E has already submitted. | Denial explained and current state can be reloaded; no fabricated save success or overwrite. | Component/browser |
| FE-16 | TC-10 / SUB-07 | Open protected draft without a session; expire session while the form is open and attempt submission. | Existing auth/session flow handles login or expiry safely; no false submission success or private draft disclosure. | Browser |
| FE-17 | TC-11 / SUB-07 | B or a non-Organiser role opens A's private draft URL. | No private draft values or usable Submit action; existing access-denied/not-found behavior shown. Direct API enforcement is covered in backend BE-12. | Browser |
| FE-18 | TC-05 / SUB-08 amended | Submit successfully while no Coordinator is available. | Normal submission confirmation and `Unassigned`; no message claiming submission failed because no Coordinator exists. | Component/browser |
| FE-19 | TC-17 / SUB-08 | Correct errors after a failed attempt and retry successfully. | Corrections retained and sent against E; pending/error states resolve; one final success confirmation. | Browser |
| FE-20 | TC-03, TC-06, TC-17 / SUB-02–04, SUB-08 | Exercise success, errors and loading at desktop and mobile widths, using keyboard navigation. | Existing organiser shell preserved; submit/error content reachable without overlap or horizontal clipping; fields have accessible labels, errors associated with inputs and pending/result feedback perceivable. | Browser + manual accessibility review |
| FE-21 | SUB-06, SUB-07 / recovery regression | Commit a fresh creation but lose its response; expire the session either on POST replay or on the subsequent event GET; sign in and reload before retrying. Also reload an unresolved creation after 31 minutes. | Original key/payload survives reauthentication and the normal form-recovery expiry. A known event ID is persisted before GET; recovery reads that ID without another create or submit. Exactly one simulated event/receipt; no draft save. Actual database deduplication remains backend coverage. | Browser + API interception |

## Notification frontend boundary

SPM-36 owns the immediate submission confirmation. The durable notification
trigger is tested in the backend plan. Inbox UI, unread indicators and notification
navigation belong to SPM-191, with Organiser updates under SPM-192 and Coordinator
assignment updates under SPM-193. These cases are integration expectations, not
instructions to build those features inside SPM-36.

| ID | Original scenario | Action | Expected result | Dependency |
| --- | --- | --- | --- | --- |
| FE-N01 | NT-01 | A submits E; A and L refresh their notification views. | Relevant submission update for each; L sees the need to assign; C1/C2 see no assignment notification yet. | SPM-191 + SPM-192 + Lead submission-alert integration |
| FE-N02 | NT-03 | Repeat submission/recover after response loss, then refresh notifications. | One visible submission update per recipient; repeated refresh does not duplicate it. Backend proves deduplication. | SPM-191 + backend BE-N03 |
| FE-N03 | NT-06 | A and L follow their submission notification action. | A reaches the permitted event view; L reaches the permitted queue/assignment action. Do not assume L can use the Organiser's generic event-detail route. | SPM-191 + SPM-174 |
| FE-N04 | NT-06 | An unrelated user views Updates or attempts a copied notification/event target. | No other user's notification or private draft information displayed; normal access controls apply. | SPM-191 + backend BE-N06 |

## Shared end-to-end journeys

| ID | Related cases | Steps | Expected result | Integration dependency |
| --- | --- | --- | --- | --- |
| E2E-01 | TC-01–04; BE-01–04; FE-01–04 | A opens E, makes final valid edits, submits, reloads; L opens the queue. | Same request and values persisted as `SUBMITTED`; Coordinator unassigned; E appears once for the one Lead. | SPM-36 + SPM-174 |
| E2E-02 | TC-18; BE-20 | After E2E-01, L assigns C1; A and C1 open their permitted event views; L refreshes the queue. | `UNDER_REVIEW`; C1 shown as Coordinator; L recorded as supervising Lead; E absent from unassigned queue. | SPM-177 + SPM-33 |
| E2E-03 | NT-01, NT-03, NT-06; BE-N01, BE-N03, BE-N06, BE-N07 | Submit and retry; inspect A/L updates; assign C1; inspect A/C1 updates and follow permitted links. | Submission updates go to A/L once, assignment updates to A/C1 once; authorized destinations work; no premature C1/C2 notification. | SPM-31, SPM-191–193, SPM-174, SPM-177; Lead alert gap |
| E2E-04 | TC-06, TC-16, TC-17 | Submit invalid E, correct it, simulate a definite failure, retry successfully, then attempt a direct edit. | Input survives errors; successful retry submits the same E; post-submission direct edits are denied by UI and API. | SPM-36 + SPM-33 |

## Dependencies and existing coverage

- SPM-191, SPM-192 and SPM-193 were To Do when reviewed on 19 October 2026. No dedicated Lead submission-alert story was identified; track that required audience under SPM-31.
- Notification-dependent cases remain planned/pending until those contracts and implementations are available. A browser mock is not evidence of durable notification delivery.
- Existing starting points: `tests/events.test.mjs`, `tests/spm-35-event-creation.test.mjs`, `tests/spm-37-event-drafts.test.mjs`, `tests/e2e/spm-35.spec.mjs` and `tests/e2e/spm-37.spec.mjs`. Reuse existing draft submission coverage where appropriate; no assertion here that these planned scenarios already pass.
- Current backend submission route accepts final edits and returns `{ message, event }`; a repeat can return 409 `EVENT_NOT_DRAFT`. Recover using a current event read rather than assuming successful replay.
- Do not independently rename status values or invent submission timestamp/API properties; coordinate any required response additions with the backend owner.

## Execution record — 19 October 2026

| Check | Result and scope |
| --- | --- |
| Lint and frontend unit tests | `npm run lint` passed; `npm test` passed 14/14, including shared validation, payload and authentication boundaries. |
| Full browser suite | After the review repairs, `npm run test:e2e` passed 56/56, including production build/type checks, existing SPM-35/SPM-37/auth journeys and 13 SPM-36 cases. |
| New SPM-36 browser coverage | Same draft ID/final edits, request-specific confirmation, persisted read-only display, timestamp/Unassigned display at 1440px and 390px, accessible backend field errors, repeated-submit guard, failed-save retry, lost-response recovery, current Coordinator/status after stale submission, submitted/missing draft denial, stable new-event creation key/payload across a 31-minute delay and reload, and final edits retained through submission-time session expiry and reauthentication. Two new regressions cover lost creation responses followed by 401 on POST replay or event GET, then login/reload/retry without duplicate simulated events/receipts. Both failed before the repair and pass afterwards. |
| Visual reference/evidence | Existing organiser wizard/details and shared shell. Desktop/mobile screenshot attachments `SPM-36-submitted-1440` and `SPM-36-submitted-390` were captured and visually reviewed; no horizontal page overflow. |
| Real startup check | Environment check and real synthetic Attendee login/logout/token revocation passed before implementation. Starting frontend commit `2459119`, backend `917d590`. |
| Hosted SPM-36 journeys | E2E-01–04 remain pending backend migration application and an authorized test environment. Browser mocks do not establish shared database, Lead queue or delivery correctness. |
| Notifications | FE-N01–04 remain pending SPM-191–193 and Lead alert presentation. This work adds the durable backend submission trigger/audience, not a competing inbox. |

Current branch: `feature/SPM-36-submit-event-requests` in both repositories.
The latest full run includes all 13 SPM-36 cases. Browser reports and screenshot
attachments are in ignored `test-results/browser-results.json`
and `playwright-report/`. No shared database migration or event fixtures were
applied/created. The separate PostgreSQL migration suite and backend execution
limits are documented in the companion plan.

Review repairs preserve unresolved submission keys/payloads even when a later
request returns a client error. Returned IDs are persisted immediately and
recovered through GET. Ordinary unsaved-form recovery still expires after 30
minutes; unresolved submissions retain their identity until resolved or explicit
logout clears recovery. The backend package files now match main, and its normal
unit-test command passes. No live Supabase MCP connection was available during
the review/repair session; live schema, permissions and migration history remain
unverified.

Shared-component/API review: `lib/events.ts` and `lib/api/event-workspace.ts`
add optional `submittedAt`/`coordinatorName` response fields. Existing feature
components change confirmation/recovery and display; shared shell, navigation,
global styling and authentication clients are unchanged. The existing live-check
script's success assertion now verifies the request ID and Submitted status too.
