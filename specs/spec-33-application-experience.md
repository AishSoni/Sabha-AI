# Spec 33: Project Polish Roadmap

Status: working draft, split on 2026-11-08. No implementation or acceptance is
claimed. This replaces the intentionally deleted, 1,309-line consolidation;
its requirements are assigned below, not discarded or implicitly approved.

## Purpose and precedence

Sand off the project's product, language, interaction, and reliability rough
edges through small assignments. This is not a new brand, framework migration,
API-casing exercise, or general ban on technical language.

Inherit the latest approved visual/execution decisions in Specs 31 and 32.
Specs 34–46 supersede conflicting earlier product copy, demo journey, separate
configuration branch, and interaction requirements only in their stated scope.
Historical completion evidence remains historical. In particular, do not bring
back removed motion controls or redesign the approved homepage choreography.

Each child spec inherits these rules. **Settled** means an explicit product
decision; **required repair** means a source-backed defect, not implementation;
**proposed** means a recommendation; **decision gate** must be resolved before
implementing the affected behavior. Examples are not approved final copy/names.

## Shared boundaries

1. Demo remains public and isolated: no live inference, Auth bootstrap, vault
   access, operator API calls, server writes, arbitrary uploads, or new persistent
   demo effects. Preserve bounded browser-memory state and its reset semantics.
2. Preserve pure shared presentation versus live/demo adapters. Do not fix a
   view by importing live transport, credentials, or feature state into it.
3. Published packages are immutable. Author and validate a new version; preserve
   hashes, exact revision identity, source rights, and retained-version policy.
   Never substitute the newest document when an exact cited revision is absent.
4. Login does not unlock the vault. Passphrase, derived key, and plaintext
   credentials do not persist or enter diagnostics, cache identities, or packages.
   Preserve server authorization, private-byte access, and trusted endpoints.
5. Theme changes and navigation must not remount the runtime, refetch/restart
   paid work, reset drafts, lose evidence state, or change domain completion.
6. Accepted domain results own progress. Timers, animations, rendering, and intro
   acknowledgements are not meeting/turn completion. No hidden live fallback.
7. Keep single viewport ownership, discussion-first room geometry, keyboard and
   touch access, both appearances, reduced motion, truthful states, and readable
   solid working surfaces from Spec 31. Measure rather than assume compliance.

## Scoped assignments and defect ownership

Numbers remain the global implementation sequence. Complete each assignment's
local gate; Spec 46 verifies the integrated result, not a second implementation.

| Spec | Assignment | Defects owned | Decision gates |
| --- | --- | --- | --- |
| [34](spec-34-domain-language-and-demo-copy.md) | Domain vocabulary and Demo copy | Copy inventory A | — |
| [35](spec-35-live-turn-and-message-reliability.md) | Live turn observation and message delivery | T22, T23, T24, T31 | — |
| [36](spec-36-document-and-creation-recovery.md) | Document progress and creation recovery | T01, T02, T03, T04 | — |
| [37](spec-37-credentials-and-generation-policy.md) | Vault and effective generation credentials | T11, T12, T25, T26 | — |
| [38](spec-38-settings-and-capability-diagnostics.md) | Settings and configuration diagnostics | T06, T13, T14, T15 | D07 |
| [39](spec-39-personas-editor-and-identity.md) | Persona cards, editor, and visual identity | T05, T16, T17 | D05 |
| [40](spec-40-live-navigation-and-meeting-state.md) | Live navigation and truthful meeting state | T10, T27, T28, T29 | D06 |
| [41](spec-41-demo-introduction-and-guidance.md) | Demo introduction and screen guidance | T09 | D01 |
| [42](spec-42-demo-progression-and-outcome.md) | Demo speaker progression, dock, and outcome | T07 | D03, D04 |
| [43](spec-43-demo-shared-documents.md) | Main-journey samples and obsolete-flow removal | T08, T18 | D02 |
| [44](spec-44-homepage-polish-and-lifecycle.md) | Homepage copy and interaction hardening | T19, T20, T21 | — |
| [45](spec-45-evidence-preview-completeness.md) | Evidence preview completeness | T30 | — |
| [46](spec-46-project-polish-acceptance.md) | Cross-feature verification and package rollout | Integration only | All resolved |

Read only the shared rules, your assignment, and its relevant audit rows when
implementing a slice. The [audit reference](reference-project-polish-audit.md)
preserves source anchors and the exhaustive copy inventory; it is evidence and
a fix checklist, not an additional implementation spec.

## Decision ownership

| ID | Unresolved choice | Owner |
| --- | --- | --- |
| D01 | Intro count/final copy; revisit, refresh, full-reset re-entry | 41 |
| D02 | Sample insertion point, whether required, reset/late-operation policy | 43 |
| D03 | Completed-step threshold, repeat counting, phases, follow-up availability | 42 |
| D04 | Finale trigger and archive's optional/required role | 42 |
| D05 | Actual friendly names for the authored demo participants | 39 |
| D06 | Discoverable on-demand live navigation trigger/layout | 40 |
| D07 | Final settings sections and editable versus diagnostic-only fields | 38 |

## Acceptance ownership

P01–P14 retain the original gate identities; definitions and evidence checklist
live in [Spec 46](spec-46-project-polish-acceptance.md). Local owners are P01/P02:
34; P03: 41; P04: 43; P05: 42; P06: 41/42; P07/P08: 39; P09: 40;
P10: 37/38; P11: 37/38; P12: 35/36/40/41; P13: 44; P14: all, including 45.
The final gate cannot pass merely because the files exist or unit hooks pass.

## Evidence and change discipline

The original and follow-up audits were source-level, not browser reproductions.
Source line numbers will move. Reconfirm behavior before editing; record changed,
removed, or deliberately retained copy with a reason. Preserve unfamiliar user
work. Remove obsolete owners only after useful behavior and isolation/recovery
coverage have a destination. Append decisions, executed checks, skips, and limits
to each scoped spec; do not import later implementation claims from Git history.
