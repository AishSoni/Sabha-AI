# Specification Implementation Order

Start with **Spec 01**, then implement each spec in ascending order through **Spec 11**. The number is the global implementation order, not a finding identifier or commit prefix. Complete the current spec's prerequisites and test-backed exit gate before advancing; use small red-green-refactor changes within each spec.

All documents live directly in this folder. Files starting with `spec-` are implementation assignments. Files starting with `roadmap-` or `reference-` are supporting documents, not additional implementation steps.

**Access decision for every spec:** The demo is completely no-sign-in, both hosted and local. Visitors use one shared workspace without accounts, login/signup screens, user-auth tokens, or a required Supabase Auth session (including anonymous sign-in). This supersedes the earlier mandatory authentication gate. Keep database/provider credentials server-side, direct database permissions restricted, server-side operation/resource limits, and participant-private knowledge boundaries; none requires visitor authentication. Adding authentication is outside this implementation sequence.

## Ordered specs

| Order | Implementation spec | Phase |
| --- | --- | --- |
| 01 | [Core correctness and access](spec-01-core-correctness-and-access.md) | Fix existing issues |
| 02 | [Recovery and data safety](spec-02-recovery-and-data-safety.md) | Fix existing issues |
| 03 | [Foundations and executable contracts](spec-03-foundations-and-contracts.md) | Architecture |
| 04 | [Backend composition and atomic transactions](spec-04-backend-composition-and-transactions.md) | Architecture |
| 05 | [Frontend transport and state](spec-05-frontend-transport-and-state.md) | Architecture |
| 06 | [Persona catalog and independent participants](spec-06-persona-catalog-and-participants.md) | Architecture |
| 07 | [Durable turn queue and unified inference](spec-07-durable-turn-queue-and-inference.md) | Architecture |
| 08 | [Closing, summaries, and accounting](spec-08-closing-summaries-and-accounting.md) | Architecture |
| 09 | [Durable knowledge and deletion-aware evidence](spec-09-durable-knowledge-and-redaction.md) | Architecture |
| 10 | [Feature cutover and legacy removal](spec-10-feature-cutover-and-legacy-removal.md) | Architecture |
| 11 | [Upgrade rehearsal and architecture acceptance](spec-11-upgrade-and-architecture-acceptance.md) | Architecture |

## Supporting documents

- [Phase 1 roadmap](roadmap-phase-1-existing-issues.md): shared prerequisites and acceptance for Spec 01–02.
- [Phase 2 roadmap](roadmap-phase-2-domain-architecture-and-frontend-resilience.md): shared decisions and acceptance for Spec 03–11.
- [Review evidence and fixtures](reference-review-evidence-and-fixtures.md): full findings, source anchors, fixtures, and regression cases used by Spec 01–02.
- [Architecture contracts and target file structure](reference-architecture-contracts.md): shared behavior, module ownership, directory layout, migration rules, and acceptance contracts used by Spec 03–11.

The sequence does not bypass decision gates: in particular, Spec 09 requires an explicit original-file storage, retention, and backup decision. Numbering does not mean implementation or tests have already been completed. Keep commit names descriptive and unnumbered.
