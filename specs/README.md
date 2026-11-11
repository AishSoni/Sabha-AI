# Specification Implementation Order

Start with **Spec 01**, then follow the sequence through **Spec 46**. The number
is the global implementation order, not a finding identifier or commit prefix.
Complete prerequisites and test-backed exit gates before advancing; use small
red-green-refactor changes. Historical completion records are not current proof.
Specs 20–22 introduce data-access repairs, shared evidence previews, and private
operator authorization with public Demo isolation. Specs 23–30 evolve that demo;
31–32 establish the visual baseline. Spec 33 is the polish roadmap/shared rules;
Specs 34–45 are small scoped assignments and Spec 46 is integrated acceptance.

All documents live directly in this folder. Files starting with `spec-` are implementation assignments. Files starting with `roadmap-` or `reference-` are supporting documents, not additional implementation steps.

**Current target runtime decision:** **Live** is operator-authorized; **Demo** is
public and needs no sign-in. Technical replay composition uses the real UI/core
with an isolated server-bound read graph and preprovisioned no-write data. Demo
has no live calls, Auth bootstrap, credential prompts, vault access, or persistent
effects. [Spec 22](spec-22-operator-only-live-access.md) retains one manually
provisioned Supabase Auth identity and server-verified authorization over every
live API, including reads, streams, and private bytes; no multi-user ownership.
This supersedes earlier no-sign-in-live/no-Auth requirements, not their historical
records. The encrypted browser vault's passphrase/derived key never persist;
login does not unlock it. Auth session storage is a separate documented policy.
Infrastructure credentials remain server-only; trusted local configuration stays
protected. See the [runtime/credential contract](reference-runtime-modes-and-credentials.md).
This is a target boundary, not a claim of completed hosted verification.

**Historical Phase 7 expansion decision:** [Spec 23](spec-23-expand-existing-demo-workspace.md)
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

**Current polish plan:** [Spec 33](spec-33-application-experience.md) replaces the
intentionally deleted large consolidation with a short roadmap and explicit
ownership. Specs 34–46 preserve its decisions, requirements, and acceptance in
manageable slices. The [audit reference](reference-project-polish-audit.md)
retains every copy-fix family/source anchor and T01–T31; it is not another
implementation assignment. Conflicting old visible aliases, separate Practice
configuration, and journey rules are superseded only in the stated new scope.
Keep the latest approved Specs 31/32 design and historical evidence. Specs 34-45
carry their own scoped implementation and executed-check records; Spec 46 is the
integrated local acceptance record, with hosted rollout still conditional.

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
| 28 | [Demo journey simplification](spec-28-demo-journey-simplification.md) | Demo journey |
| 29 | [Contextual demo tutorial](spec-29-contextual-demo-tutorial.md) | Demo journey |
| 30 | [Demo tutorial acceptance](spec-30-demo-tutorial-acceptance.md) | Demo journey |
| 31 | [Design system and motion](spec-31-design-system-and-motion.md) | Visual baseline |
| 32 | [Constellation homepage](spec-32-constellation-homepage.md) | Visual baseline |
| 33 | [Project polish roadmap and shared rules](spec-33-application-experience.md) | Polish coordination |
| 34 | [Domain language and Demo copy](spec-34-domain-language-and-demo-copy.md) | Project polish |
| 35 | [Live turn and message reliability](spec-35-live-turn-and-message-reliability.md) | Project polish |
| 36 | [Document progress and creation recovery](spec-36-document-and-creation-recovery.md) | Project polish |
| 37 | [Credentials and effective generation policy](spec-37-credentials-and-generation-policy.md) | Project polish |
| 38 | [Settings and capability diagnostics](spec-38-settings-and-capability-diagnostics.md) | Project polish |
| 39 | [Personas, editor, and visual identity](spec-39-personas-editor-and-identity.md) | Project polish |
| 40 | [Live navigation and truthful meeting state](spec-40-live-navigation-and-meeting-state.md) | Project polish |
| 41 | [Demo introduction and screen guidance](spec-41-demo-introduction-and-guidance.md) | Project polish |
| 42 | [Demo progression, dock, and outcome](spec-42-demo-progression-and-outcome.md) | Project polish |
| 43 | [Main-journey demo documents and flow simplification](spec-43-demo-shared-documents.md) | Project polish |
| 44 | [Homepage copy and lifecycle polish](spec-44-homepage-polish-and-lifecycle.md) | Project polish |
| 45 | [Evidence preview completeness](spec-45-evidence-preview-completeness.md) | Project polish |
| 46 | [Project polish acceptance and rollout](spec-46-project-polish-acceptance.md) | Polish acceptance |

Phase 4 currently contains only Spec 20. Its measurement method, baseline and
budgets live in the spec itself, so no separate roadmap document is introduced.

Phase 5 currently contains only Spec 21. Its preview architecture, safety
constraints, acceptance tests, and rollout slices live in the spec itself.

Phase 6 currently contains only Spec 22. Its operator authorization, public
replay boundaries, session lifecycle and hosted acceptance live in the spec itself.

The historical Phase 7 assignment contains Specs 23–27: integrated foundation,
persona revisions, knowledge/sample workflows and prepared meeting exploration
in that order, followed by cross-feature and original-journey acceptance.
The polish sequence retains Demo isolation while replacing the separate setup
branch and its journey/copy requirements as explicitly assigned in Specs 34–46.

## Supporting documents

- [Project polish audit](reference-project-polish-audit.md): exhaustive copy inventory, package/generator/test anchors, exclusions, and single-owner T01–T31 register for Specs 34–46.
- [Phase 1 roadmap](roadmap-phase-1-existing-issues.md): shared prerequisites and acceptance for Spec 01–02.
- [Phase 2 roadmap](roadmap-phase-2-domain-architecture-and-frontend-resilience.md): shared decisions and acceptance for Spec 03–11.
- [Phase 3 roadmap](roadmap-phase-3-hosted-guided-replay.md): build order, evidence, boundaries and ownership for Spec 12–19.
- [Review evidence and fixtures](reference-review-evidence-and-fixtures.md): full findings, source anchors, fixtures, and regression cases used by Spec 01–02.
- [Architecture contracts and target file structure](reference-architecture-contracts.md): shared behavior, module ownership, directory layout, migration rules, and acceptance contracts used by Spec 03–11.
- [Runtime modes and browser credentials](reference-runtime-modes-and-credentials.md): no-write Demo isolation, live BYOK, encrypted vault, transient handoff, tests, and ownership; technical replay names remain valid.
- [Replay package and playback](reference-replay-package-and-playback.md): immutable swappable data, prepared retrieval, server SSE, coherent checkpoint reads, ephemeral playback and offline provisioning.
- [API use-case inventory](reference-api-use-case-inventory.md): actual shipped routes and contracts; proposed replay routes enter it when implemented.

The sequence does not bypass decision gates. Spec 09's source-store decision is recorded as Supabase Storage; Spec 16 must resolve extraction/deployment constraints before advertising scanned-PDF support. Spec 10 deferred replay, now owned by Spec 12–19. Spec 11's conditional hosted checks are not erased by this plan. Numbering does not mean implementation or tests have already been completed. Keep commit names descriptive and unnumbered.
