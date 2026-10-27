# Spec 15 (Phase 3): Closing UI Integration

## Purpose and prerequisites

Make the real closing workflow reachable and coherent in the ordinary meeting room, after [runtime composition](spec-14-live-and-replay-composition.md). Provide a small shared presentation seam for recorded generated closing text; do not build a second closing engine or a new live summary execution system just for replay.

## Current behavior and boundaries

`frontend/src/features/meetings/components/ClosingPanel.tsx` implements request/progress/retry/abort UI and has standalone tests, but `MeetingRoom.tsx` does not mount it. Its summary tab renders a separate on-demand `SummaryPanel`. Generating an interim summary is not closing a meeting.

`backend/app/modules/meetings/presentation/http.py` exposes closing commands and a read-only observation route. The current GET observes; do not revive an old description in which polling drives inference. The application closing service drains active work, votes, summarizes and commits through durable checkpoints. Reuse it unchanged unless a newly tested integration defect requires a bounded correction.

## Required shared-product behavior

- Mount the real panel in the real room through an accessible, discoverable close action. Use existing feature hooks/public exports and the composed command capability. No duplicate route-level workflow.
- Preserve vote/force modes and stages: draining, voting, summarizing, completed, rejected, aborted, failed. Only show commands valid for the actual stage. Failed/rejected/aborted outcomes explain admission state and available recovery without inventing a success.
- Pending turns cancel and the executing turn drains according to existing backend policy. Navigation detaches observation; it does not abort closing. Retry/abort remain explicit commands and cannot repeat already checkpointed paid work.
- Ballots answer **whether the meeting should end**, not whether to buy the security. Render vote errors/unknown usage honestly and preserve strict-majority policy, including ties/failures.
- On completion reconcile canonical meeting status and final summary exactly once. Keep interim summaries separate. Archive is an overlay; unarchiving an ended meeting does not reopen it.
- Place essential controls/status in responsive, keyboard-accessible content, not only the desktop sidebar. Honor reduced motion and avoid scroll-stealing during generated text.

## Generated-text presentation seam

Live closing currently polls snapshots containing whole vote explanations/summary text. Preserve that behavior. Extract a narrow view/projection interface so the same panel can also render provisional recorded text followed by canonical completed content.

Spec 17 will supply typed **closing** SSE envelopes for vote explanations and final summary. Do not impersonate a participant turn, misuse its operation identity, add a fake message, or claim live closing now streams if it does not. The seam must distinguish closing ID, ballot/summary item ID, sequence, provisional text, terminal result, and source provenance. The package reference defines ordering/checkpoint rules; final wire schemas and transport belong to Spec 17.

Every generated text item in replay must arrive through that backend stream. Do not reveal full reasons or the final brief in an initial polling response and then animate them cosmetically. Recordings use honest replay copy rather than “newly committed”/“live” claims. No recorded usage enters the live accounting ledger.

## Tests to write first

1. Mount the real room with real feature hooks and a deterministic HTTP-contract backend: close entry is reachable, request uses the actual command, progress appears, and completed data reconciles. A standalone mocked panel render is insufficient.
2. Drain/vote/summary transitions, rejected/tied votes, failed stage/retry, abort, force-close, duplicate clicks, navigation/remount, and stale responses. Integrate existing backend closing contracts instead of duplicating its policy in the browser.
3. Completed/archived meetings remain read-only; unarchive preserves ended state. Interim summary generation does not mark a meeting ended.
4. Shared text renderer can accept a scoped provisional closing item and replace it once with the canonical item; duplicate/late events or a different closing ID cannot contaminate it. Full SSE is tested in Spec 17.
5. Live credential handoff remains live-only. Replay rendering/intent capability never reveals a key, submits a closing command, or starts polling live data.
6. Keyboard focus, status announcements and small-screen reachability. Stable guide anchors are semantic IDs on real controls, not selectors derived from visible prose.

## Small slices and exit gate

First reproduce the missing room integration with a failing route/feature test. Mount the existing panel and reconcile ordinary live completion. Add failure/recovery tests, then extract the minimal generated-text presentation seam with characterization coverage. Do not add an unrelated live SSE queue or rewrite vote policy.

Exit when the vanilla room reaches and completes the real workflow, existing closing/accounting tests stay green, and the scoped text seam is ready for Spec 17. Update inventory/generated artifacts only if a real API contract changed. Record browser integration evidence separately from component evidence.

Next: [PDF extraction quality](spec-16-pdf-extraction-quality.md).
