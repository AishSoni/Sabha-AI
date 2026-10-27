# Phase 1 Roadmap: Fixing Existing Project Issues

## Implementation roadmap

Implement **Spec 01, then Spec 02**, one small work package at a time. Neither document requires a single commit or a single implementation session. Architecture restructuring belongs to [Phase 2](roadmap-phase-2-domain-architecture-and-frontend-resilience.md), not these bug fixes. See the [ordered index](README.md) for the full sequence.

| Implementation spec | Prerequisites | Exit required before advancing |
| --- | --- | --- |
| [Spec 01: Core correctness and access](spec-01-core-correctness-and-access.md) | Reproducible local setup; synthetic provider/embedding transports; test runners; disposable database/Qdrant; inspect existing credential roles before changing access | Its 17 findings have failing-before/passing-after regression evidence, including real adapter checks and preserved local behavior |
| [Spec 02: Recovery and data safety](spec-02-recovery-and-data-safety.md) | Core correctness accepted, especially valid states, tool/config contracts, and compatible retrieval; deterministic concurrency/restart harnesses | Its 12 findings and three qualified operational risks have the required failure-path tests and recorded results |

The [review evidence and fixture reference](reference-review-evidence-and-fixtures.md) preserves all 29 findings, three separately qualified risks, source anchors, full acceptance cases, and shared fixture definitions. It is a lookup document, not a third implementation phase. Each implementation spec explicitly lists the findings it owns and links their detailed evidence.

## Prerequisites shared by both specs

- Inventory real source and test files; cached bytecode and empty directories do not establish a runnable suite. Select/configure backend and frontend test runners and required async/component plugins before using the example tests.
- Establish isolated, resettable Postgres/Supabase and Qdrant resources. Never run destructive fixtures or permission migrations against existing personal/shared data.
- Capture supported local startup and API behavior with characterization tests, without freezing the bugs under review. Record dependency versions and actual commands; this roadmap does not assert a passing baseline.
- Read the [constraints](reference-review-evidence-and-fixtures.md#constraints-that-every-fix-must-preserve), [fixture contracts](reference-review-evidence-and-fixtures.md#shared-test-fixture-definitions), and [runtime/credential contract](reference-runtime-modes-and-credentials.md). The no-sign-in demo is dedicated no-write replay, not the writable live workspace. Keep trusted local Ollama, participant-private knowledge, and independent participant snapshots.
- Resolve database roles and credential usage before permission changes. Before exposure, test demo isolation/write denial, restricted direct database access, infrastructure-secret non-disclosure, live BYOK isolation, trusted origins, and server-side limits. No login gate is required. Full guided replay was deferred from Spec 10 and is now owned by [Spec 12–19](roadmap-phase-3-hosted-guided-replay.md); do not expose unfinished demo paths or count the written plan as replay acceptance.

## TDD and examples

For each issue: write and run the intended failing regression, make the smallest safe fix, then refactor while relevant tests remain green. Execute real adapter/concurrency/migration tests where fakes cannot establish the property. Record commands and red/green results; skipped or merely proposed tests do not count as acceptance.

Code blocks in the implementation specs are **proposed, focused fragments** anchored to current files. They are not full patches, pre-existing helpers, or executed tests. A snippet using a fixture requires implementing that fixture first. Never infer atomicity, authorization, or production readiness from a fragment alone.

## Completion and handoff

Both specs' exit gates must pass, including ordinary and failure paths, fresh/upgrade schemas, replay write/isolation guards, hosted live encrypted BYOK, and configured local integrations. Retain the regression tests as the baseline for Phase 2; full tutorial delivery remains a later gate. Use descriptive change/commit names, without finding indexes or numbered prefixes.
