# Specification Implementation Order

Start with **Spec 01**, then implement each spec in ascending order through **Spec 27**. The number is the global implementation order, not a finding identifier or commit prefix. Complete the current spec's prerequisites and test-backed exit gate before advancing; use small red-green-refactor changes within each spec. Earlier completion records remain historical; planned assignments are not proof of implementation. Spec 20 opens Phase 4 and is a cross-cutting repair of the live and replay data-access paths, not another replay feature. Spec 21 opens Phase 5 and adds one shared in-app evidence-preview system for live meetings and the guided demo. Spec 22 opens Phase 6 and replaces public live access with a single-operator login while preserving public replay. Specs 23–27 open Phase 7 and expand that existing demo without replacing its guided HDFC journey.

All documents live directly in this folder. Files starting with `spec-` are implementation assignments. Files starting with `roadmap-` or `reference-` are supporting documents, not additional implementation steps.

**Current target runtime decision:** Operator-only live use and no-sign-in guided replay coexist in the same hosted app. Replay uses the real UI/core with an isolated server-bound read graph and preprovisioned no-write data. No live calls, Auth bootstrap, credential prompts, vault access, or persistent demo effects. [Spec 22](spec-22-operator-only-live-access.md) introduces one manually provisioned Supabase Auth identity and server-verified operator authorization over every live API, including reads, streams and private bytes; it does not add multi-user ownership. It supersedes earlier no-sign-in-live/no-Auth requirements, not their historical completion records. Hosted provider credentials still use the encrypted browser vault; its passphrase and derived key never persist, and login does not unlock it. Auth session storage is a separate, explicitly documented policy. Keep infrastructure credentials server-only and preserve trusted local provider configuration. See the [runtime and credential contract](reference-runtime-modes-and-credentials.md). This is the implementation target, not a claim that Spec 22 or hosted verification is complete.

**Phase 7 expansion decision:** [Spec 23](spec-23-expand-existing-demo-workspace.md)
adds navigation and bounded browser-memory practice edits around the existing
demo. Specs 24–26 add prompt-version exploration, knowledge stacks, an approved
sample-only picker, simulated document management and additional coherent
recorded choices/chapters. The original guide, URLs, evidence and canonical
closing/archive path remain supported. Local edits do not generate recorded
answers; refresh/full reset discards them. This narrowly supersedes guide-only
navigation and non-editable-UI restrictions, not server read-only isolation,
no-Auth replay, immutable published versions or earlier outstanding gates.
Specs 23–27 are implemented in this workspace; Spec 27 records conditional
local acceptance. Hosted acceptance remains outstanding.

## Ordered specs

| Order | Implementation spec | Phase |
| --- | --- | --- |
| 01 | [Core correctness and access](spec-01-core-correctness-and-access.md) | Fix existing issues |
| 02 | [Recovery and data safety](spec-02-recovery-and-data-safety.md) | Fix existing issues |
| 03 | [Foundations and executable contracts](spec-03-foundations-and-contracts.md) | Architecture |
| 04 | [Backend composition and atomic transactions](spec-04-backend-composition-and-transactions.md) | Architecture |
| 05 | [Frontend transport, state, and credential vault](spec-05-frontend-transport-and-state.md) | Architecture |
| 06 | [Persona catalog and independent participants](spec-06-persona-catalog-and-participants.md) | Architecture |
| 07 | [Durable turn queue and unified inference](spec-07-durable-turn-queue-and-inference.md) | Architecture |
| 08 | [Closing, summaries, and accounting](spec-08-closing-summaries-and-accounting.md) | Architecture |
| 09 | [Durable knowledge and deletion-aware evidence](spec-09-durable-knowledge-and-redaction.md) | Architecture |
| 10 | [Feature cutover and legacy ownership removal](spec-10-feature-cutover-and-legacy-removal.md) | Architecture |
| 11 | [Upgrade rehearsal and architecture acceptance](spec-11-upgrade-and-architecture-acceptance.md) | Architecture |
| 12 | [Database read isolation](spec-12-database-read-isolation.md) | Hosted guided replay |
| 13 | [Meeting creation regressions](spec-13-meeting-creation-regressions.md) | Hosted guided replay |
| 14 | [Live and replay composition](spec-14-live-and-replay-composition.md) | Hosted guided replay |
| 15 | [Closing UI integration](spec-15-closing-ui-integration.md) | Hosted guided replay |
| 16 | [PDF extraction quality](spec-16-pdf-extraction-quality.md) | Hosted guided replay |
| 17 | [Replay package and streaming](spec-17-replay-package-and-streaming.md) | Hosted guided replay |
| 18 | [One guided bond journey](spec-18-guided-bond-journey.md) | Hosted guided replay |
| 19 | [Replay release acceptance](spec-19-replay-release-acceptance.md) | Hosted guided replay |
| 20 | [Backend data-access latency and event-loop responsiveness](spec-20-backend-data-access-latency.md) | Production latency |
| 21 | [In-app evidence previews](spec-21-in-app-evidence-previews.md) | Evidence previews |
| 22 | [Operator-only live access](spec-22-operator-only-live-access.md) | Private operator access |
| 23 | [Expand the existing demo workspace and navigation](spec-23-expand-existing-demo-workspace.md) | Expanded existing demo |
| 24 | [Demo personas and prompt-version exploration](spec-24-demo-personas-and-prompt-versions.md) | Expanded existing demo |
| 25 | [Demo knowledge stacks and restricted sample documents](spec-25-demo-knowledge-and-sample-documents.md) | Expanded existing demo |
| 26 | [Expanded recorded-meeting exploration](spec-26-expand-recorded-meeting-exploration.md) | Expanded existing demo |
| 27 | [Expanded-demo acceptance](spec-27-expanded-demo-acceptance.md) | Expanded existing demo |

Phase 4 currently contains only Spec 20. Its measurement method, baseline and
budgets live in the spec itself, so no separate roadmap document is introduced.

Phase 5 currently contains only Spec 21. Its preview architecture, safety
constraints, acceptance tests, and rollout slices live in the spec itself.

Phase 6 currently contains only Spec 22. Its operator authorization, public
replay boundaries, session lifecycle and hosted acceptance live in the spec itself.

Phase 7 contains Specs 23–27. Implement the integrated workspace foundation,
persona revisions, knowledge/sample workflows and prepared meeting exploration
in that order, then execute cross-feature and original-journey acceptance.
No separate replacement-demo implementation or roadmap is introduced.

## Supporting documents

- [Phase 1 roadmap](roadmap-phase-1-existing-issues.md): shared prerequisites and acceptance for Spec 01–02.
- [Phase 2 roadmap](roadmap-phase-2-domain-architecture-and-frontend-resilience.md): shared decisions and acceptance for Spec 03–11.
- [Phase 3 roadmap](roadmap-phase-3-hosted-guided-replay.md): build order, evidence, boundaries and ownership for Spec 12–19.
- [Review evidence and fixtures](reference-review-evidence-and-fixtures.md): full findings, source anchors, fixtures, and regression cases used by Spec 01–02.
- [Architecture contracts and target file structure](reference-architecture-contracts.md): shared behavior, module ownership, directory layout, migration rules, and acceptance contracts used by Spec 03–11.
- [Runtime modes and browser credentials](reference-runtime-modes-and-credentials.md): dedicated no-write guided replay, hosted live BYOK, encrypted local vault, transient credential handoff, tests, and implementation ownership across the sequence.
- [Replay package and playback](reference-replay-package-and-playback.md): immutable swappable data, prepared retrieval, server SSE, coherent checkpoint reads, ephemeral playback and offline provisioning.
- [API use-case inventory](reference-api-use-case-inventory.md): actual shipped routes and contracts; proposed replay routes enter it when implemented.

The sequence does not bypass decision gates. Spec 09's source-store decision is recorded as Supabase Storage; Spec 16 must resolve extraction/deployment constraints before advertising scanned-PDF support. Spec 10 deferred replay, now owned by Spec 12–19. Spec 11's conditional hosted checks are not erased by this plan. Numbering does not mean implementation or tests have already been completed. Keep commit names descriptive and unnumbered.
