# Spec 40: Live Navigation and Truthful Meeting State

Status: working draft. Inherits [Spec 33](spec-33-application-experience.md).
Prerequisites: Specs 34–39. Owns T10, T27–T29 and D06; owns P09, contributes P12/P14.
Source anchors: [technical register](reference-project-polish-audit.md#technical-defect-register).

## Scope and D06

Hide persistent live global navigation by default; expose a discoverable
keyboard/touch-accessible way to navigate when needed. Its visible label is
**Live**, not Operator, and it has no Recorded demo link. Resolve D06's trigger
and layout before implementing that interaction. This is not permission to remove
homepage operator sign-in or rename internal operator authorization concepts.

## Requirements

1. Keep Meetings, Personas, Knowledge stacks, Settings, appearance, and sign-out
   reachable, with local screen actions in context. Navigation must not reset
   drafts, evidence, queue observation, streaming, or viewport ownership. Integrate
   Spec 39's dirty-navigation policy rather than bypass it with new chrome.
2. T10: distinguish list loading, empty, query failure, mutation failure, and
   unavailable access. Preserve useful data and recovery context; failed archive,
   unarchive, or deletion cannot silently dismiss as successful. Ended meetings
   are not Active unless the grouping is explicitly and truthfully qualified.
   Keep backend ended/archived semantics distinct; unarchive does not reopen.
3. T27: failed/unknown closing observation is not a confirmed absence of a closing
   process. Show retry/unknown state and avoid falsely advertising fresh admission.
   Recover by observing the existing process, not starting another close. Preserve
   server admission guards and handle a closing process starting while open.
4. T28: summary generation eligibility must match backend meeting lifecycle.
   Ended/archived meetings retain readable saved summaries, but do not offer an
   action the server necessarily rejects. Reconcile status changes while the
   panel is open; a disabled control must explain its meaningful restriction.
5. T29: do not label all messages plus all participant prompts against a fixed
   128,000 denominator as actual model context usage. Either present an honest
   scoped rough transcript estimate, or measure the execution-aligned participant/
   model budget including actual context selection. Do not produce misleading
   capacity warnings/percentages; retain useful counts as secondary details.
6. More generally, a failed read is not an empty meeting record or evidence that
   no action is in progress. Retain safe prior content, mark staleness/uncertainty,
   and offer scoped recovery without inventing completion or changing domain rules.

## Local acceptance

- Record D06; verify discoverability, keyboard/touch opening, focus/return, and
  reachable settings/sign-out without a permanent header consuming room height.
- Navigate with drafts, open evidence, and active/queued work: no loss, remount,
  paid resubmission, or broken guard. Check both appearances and zoom.
- Query and archive/unarchive/delete failures do not become empty/success states;
  ended and archived records are grouped and labeled truthfully.
- Fail the initial closing GET, recover an existing process, and race a new close:
  no false absent state or second closing admission.
- Ended/archived summary generation is unavailable but history remains readable;
  transitions while open are reflected in controls and command guards.
- Context display's named scope/capacity matches its tested calculation, including
  different participants/models. Re-measure Spec 31 discussion-height constraints.

## Implementation record (2026-11-09)

Status remains a working draft: local implementation and verification are
complete; hosted acceptance remains outstanding.

### D06 disposition - on-demand Live navigation

The persistent operator header was removed. Global navigation now lives behind a
small **Live** trigger fixed to the left viewport edge at mid-height. The trigger
is a native button with a visible label, a 44 CSS px target (48 on coarse
pointers), and opens a modal dialog titled **Live**. The dialog contains real
anchors for Meeting space, AI roster, Knowledge stacks, and Settings, plus the
appearance menu and sign out. It has no Recorded demo link.

The trigger consumes no layout height, so the route keeps the full dynamic
viewport and the room retains its existing single height/scroll owner. Escape,
the close control, and route changes dismiss the dialog; focus returns to the
trigger. Navigation uses real `<Link>` anchors rather than programmatic routing,
so Spec 39's capture-phase dirty-navigation guard still intercepts a departure
with unsaved work. Homepage operator sign-in and internal operator authorization
concepts are unchanged.

### Dispositions

- **Requirement 1 - navigation without resetting work.** Meetings, Personas,
  Knowledge stacks, Settings, appearance, and sign out remain reachable in both
  appearances. The Live dialog overlays the current route, so opening or closing
  it does not remount the room, reset drafts, discard evidence, or interrupt
  queue observation or streaming. Route changes still go through the existing
  dirty-navigation policy. The mixed operator E2E covers keyboard opening, focus
  return, route-change dismissal, no Recorded demo link, dark appearance, and a
  320 CSS px viewport.
- **Requirement 2 / T10 - truthful list and action states.** The meeting list
  distinguishes an initial read failure (unavailable alert with retry) from a
  background read failure (stale notice while the last loaded grid remains) and
  from a successful empty read. Failed archive, unarchive, and delete actions
  keep the meeting and report a scoped message; a failed delete keeps its
  confirmation dialog open. Failures trigger a list refetch and detail
  invalidation instead of pretending success. Active now contains only active
  and voting meetings; ended and archived meetings have separate truthful tabs.
  Unarchive still restores the backend lifecycle state and does not reopen an
  ended meeting, and the copy says so.
- **Requirement 3 / T27 - unknown closing state is not absence.** The closing
  panel suppresses vote/force admission while the initial observation is
  pending or failed. It shows **Checking closing status** or **Closing state
  unknown** with an observation-only retry; the start handler also refuses to
  submit while unknown. The room dock similarly replaces the composer with a
  checking or unknown notice and a retry action until the read is confirmed.
  An idle live room re-observes every ten seconds so a close started elsewhere
  becomes visible; a 409 from a raced start or retry refreshes the canonical
  closing read. No client path starts a second close, and the server admission
  guards are unchanged.
- **Requirement 4 / T28 - summary eligibility matches lifecycle.** The summary
  panel receives the effective closed state (ended, archived, or a confirmed
  completed close), disables generation with an explanation, and keeps saved
  summaries readable. The inactive state also explains an empty transcript. A
  lifecycle change cached while the panel is open updates the control and its
  restriction through the existing meeting and closing reconciliation paths.
- **Requirement 5 / T29 - honest token estimate.** The details dialog replaces
  the fixed 128,000 denominator, percentage, and danger/warning capacity bar
  with **Saved-text token estimate**: a rough count of saved messages, persona
  prompts, and agenda, explicitly not model context usage or a context-window
  capacity. Message and participant counts remain as secondary detail, with the
  breakdown when available. The backend and replay package still carry the
  legacy `max_tokens` field for recorded compatibility, but the UI no longer
  presents it as capacity.
- **Requirement 6 - failed reads are not empty records or actions.** A
  background meeting refetch failure with cached data keeps the room, draft,
  evidence, and streaming state mounted under a stale-read notice with retry; a
  full-page failure is used only when no meeting data exists. Failed
  disagreement and consensus reads keep the record rail available, show
  scoped retry notices, suppress false empty copy, and annotate counts as last
  loaded. A closing read failure is never treated as proof that no close is in
  progress.

### Verification performed

- Frontend full `npm test`: 130 files, 808 tests passed.
- `npx tsc --noEmit` passed; `npm run lint` passed with 0 errors and the same 13
  pre-existing warnings; `npm run build` passed with Next.js 16.1.4 and 20 static
  pages.
- Focused coverage includes Live trigger/dialog behavior and focus return,
  meeting-space read/mutation/grouping states, closing observation and room
  admission gating, idle closing observation policy, closed-summary gating,
  saved-text estimate rendering, and room/record retention across failed reads.
- Playwright mixed operator run: 3 passed (31.5s), covering keyboard Live
  navigation, both appearances, a 320 CSS px viewport, failed-list recovery, and
  operator/demo isolation.
- Spec 31 geometry was rechecked structurally: removing the persistent header
  returns the full dynamic viewport to the route, and the fixed Live trigger
  adds no layout height or scroll owner.
- Known limits: hosted acceptance remains outstanding. The idle closing check is
  a ten-second observation (not a submission); after a closing read error,
  recovery is an explicit observation retry. Browser zoom uses the same CSS
  pixel reflow exercised by the 320 CSS px check; no separate zoom automation was
  added.

### Commits

`658c73a` Live navigation; `9354699` list read failures; `a8902c4` action
feedback; `54c0865` ended grouping; `3626238` closing observation gate;
`89be6c6` room closing unknown state; `36c3fcf` closed summary gating; `eacbb3e`
saved-text estimate; `e460b8c` room content retention; `e7ab8fe` mixed E2E;
`77af7df` appearance and narrow viewport; `8ffaa22` idle closing observation.

