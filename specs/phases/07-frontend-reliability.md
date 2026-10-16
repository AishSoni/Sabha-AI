# Phase 07 — Core frontend reliability and reusable controls

Status: draft. Depends on: Phases 00-06. Requirements: R-06, R-07, R-08, R-09, R-14; reusable UI foundations for Phase 10. Defects: B-09, frontend completion of B-08; tool/citation rendering gaps.

## Objective and outcome

Fix core asynchronous UI behavior, then refactor reusable stores/components so they accurately reflect server-owned execution across navigation, refresh and reconnect. Users can manage pending messages and review persona changes. Guided onboarding, bond-specific presentation and exploration are implemented together in Phase 10.

## Current implementation and affected paths

`frontend/src/stores/meetingStore.ts` stores one global current meeting/stream; delayed loads and final events overwrite newer selections, and user-message resolutions append to whichever meeting is current. Tool results are matched by name rather than call identity. `frontend/src/lib/api.ts` manually parses fetch streams without a scoped cancellation/reconnection contract. Meeting page effects, ChatArea, ToolUseBlock, CitationsBlock, SummaryTab, sidebars and settings UI need coordinated updates.

Do not replace the entire frontend design system. Preserve current layout/components where they support the corrected core behavior; improve feedback, focus, loading and reusable queue controls as needed.

## Required behavior

- Separate selected-route identity from cached meeting data. Every async result carries captured session generation/meeting/turn/request identity before committing to the relevant store slice.
- Navigation unsubscribes/cancels stale reads; it does not cancel server execution. Returning fetches authoritative turn state and replays from the last accepted cursor or reloads the result if replay expired.
- UI distinguishes queued message, committed message, provisional stream, terminal result, connection loss and execution failure. EOF without terminal never implies completion.
- Tool UI pairs by execution identity; repeated tool names render independently. Duplicate replay does not duplicate text/effects/citations. Ending attempts use typed shared subscriptions/reducers for vote progress and incremental summary output, distinguished from participant turns; provisional text cannot imply committed completion.
- Queue controls show FIFO position and pending state, allow edit/remove with revision checks, and reconcile dispatch conflicts. An unsaved edit is not represented as already persisted.
- Disable next-speaker/ending controls while server eligibility says busy/queue barrier; still handle backend conflicts rather than trusting button state.
- Participant refresh presents a field diff and explicit apply action; stale/busy conflicts reload the proposal. Settings show saving/saved/failed and effective server values.
- Keep state/session-generation contracts reusable for Phase 08/10; exercise them with synthetic data. Do not implement J-steps, recruiter entry, scripted speaker actions, exploration or bond-specific disclosure/brief screens here.

## Ordered tasks

First write correct B-09 delayed-load/send/stream assertions and reproduce the remaining B-08 frontend failure with effective-settings assertions. Where Phase 05 already corrected a B-08 path, reference its original red/green evidence and retain the passing integration coverage. Fix the observed failures, then refactor stores/API/component boundaries with the regressions green. Preserve the same observable assertions across relocation; queue/accessibility enhancements also use TDD.

- **P07-T01 — Store identity:** introduce meeting-keyed data and request/turn/generation guards; fix stale load, user-send, nonstream and streaming completion races before broader UI work.
- **P07-T02 — API/stream client:** implement typed version-2 events, incremental decoding/frame parsing, abortable subscriptions, cursor replay, terminal reconciliation and safe error mapping.
- **P07-T03 — Turn presentation:** scope provisional segments/tool cards/citations by turn and identity; reconcile persisted final message without duplicate text; expose continuing/reconnecting/failed states.
- **P07-T04 — Queue UI:** add pending list, edit/save/remove, revision-conflict feedback, capacity/validation messages and dispatch announcements; do not add queued speaker requests.
- **P07-T05 — Persona/settings UI:** finish server-authoritative settings and reviewed refresh workflow; migrate stale local settings safely; display disabled demo capabilities explicitly.
- **P07-T06 — Reusable presentation:** finish generic incremental ending/summary and read-only state, source/tool rendering and session-generation invalidation hooks using synthetic fixtures. Expose stable anchors/components/types for the later overlay layer; do not create a standalone demo UI, alternate summary screen or authored guide/content here.
- **P07-T07 — Accessibility:** keyboard/focus review of core queue/refresh/meeting controls, labels/status live regions, reduced motion, responsive layout and readable source/tool output.
- **P07-T08 — Verification:** execute Vitest regression suite, type/lint/build checks and manual core navigation/reconnect/queue acceptance; record the component boundaries ready for Phase 10.

## Frontend state/API contract

Server data is authoritative for meeting state, queue content/revision and turn result. Build generation-scoped cache/invalidation interfaces against the agreed session contracts using test responses; Phase 08 supplies runtime sessions and Phase 10 binds the complete resume/reset experience. Client state cannot grant capabilities, and a generation change invalidates old requests/subscriptions. No authored scenario stage is implemented in this phase.

Keep API DTOs synchronized with CONTRACTS.md, preferably through generated or shared schema artifacts when practical. Do not introduce a second ad hoc stream schema in components. Use explicit discriminated message submission responses (committed versus queued).

## TDD cases

- **P07-TEST01:** Start load/turn in A, select B, resolve A late; B's data, scoreboard, input target and active-state display remain B. Repeat for ordinary message submission and context-stat fetch.
- **P07-TEST02:** Fragment UTF-8/SSE frames across byte chunks; parse CRLF/multiline data; deduplicate replay; unknown optional fields do not crash valid events.
- **P07-TEST03:** Disconnect without terminal; show reconnecting, query state, apply persisted completion once. Navigation abort affects subscription only, not cancellation endpoint.
- **P07-TEST04:** Same-name tools with distinct execution IDs render separate arguments/results; error result clears the correct spinner; terminal failure clears all relevant pending UI.
- **P07-TEST05:** Queue add/edit/remove success and stale revision/dispatch conflict; preserve user's unsaved draft for explicit retry/copy instead of silently overwriting delivered content.
- **P07-TEST06:** Editing queued text does not change current streamed answer context; queue drain updates transcript order without an automatic speaker request.
- **P07-TEST07:** Refresh preview/apply and settings persistence show exact server values; rejected save does not look effective; secrets do not enter persisted browser settings.
- **P07-TEST08:** Synthetic generation change/expired-session/failed-storage responses and duplicate events invalidate only the appropriate cache; old-generation work cannot mutate the selected meeting. This validates store contracts, not a recruiter reset journey.
- **P07-TEST09:** Generic ended/archived meeting and summary views are read-only, refresh from authoritative state and never implicitly reopen a meeting.
- **P07-TEST10:** Keyboard-only queue/refresh/core meeting controls have correct accessible names and focus; reduced-motion path avoids forced animation delays.
- **P07-TEST11:** Generic citation/tool rendering shows metadata/distinct execution IDs and handles missing/deleted evidence. Source navigation does not alter pinned demo content. Bond-specific demo/assumption labels remain Phase 10; no credential transport requirement applies.
- **P07-TEST12:** Generic ending-attempt events incrementally render public vote explanations/results and summary in the actual meeting UI; replay does not duplicate output, EOF is not success, failure leaves no completed summary, and old-attempt/generation events cannot overwrite newer state.

## Acceptance gate

- **P07-AC01:** B-09 is closed for every async entry point, not only stream `done` (TEST01-04).
- **P07-AC02:** Editable queue and persona/settings behavior matches server contracts, including conflicts (TEST05-07).
- **P07-AC03:** Core generation isolation, read-only states, reusable source/tool/incremental-ending rendering and accessibility pass (TEST08-12 plus manual core checks); no guided journey implementation is claimed. Phase 10 must reuse the normal screens rather than replace them with a demonstration UI.
- **P07-AC04:** Vitest, type check, lint and build pass or pre-existing unrelated failures are explicitly resolved/re-scoped before exit; no Playwright dependency was introduced.

## Rollout, rollback, exclusions and risks

Use versioned sessionStorage keys and schema validation. Do not silently migrate old live secrets into demo state. Retain a compatible API adapter during frontend/backend rollout skew. Rollback should disable incompatible new controls rather than sending old unscoped requests. No general visual redesign or browser-test-framework substitution. Biggest risk: UI-only fixes mask server races; cross-reference Phase 04 integration evidence as part of this exit.
