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
