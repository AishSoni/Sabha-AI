# Spec 11 (Phase 2): Upgrade Rehearsal and Architecture Acceptance

## Purpose and prerequisites

Prove fresh setup, existing-data migration, recovery, and deployment against the final architecture—not just new databases or aggregate test counts.

- All prior feature gates, including [legacy removal](spec-10-feature-cutover-and-legacy-removal.md), pass on disposable environments with executed results.
- Final API/use-case inventory, generated contracts, target imports/entry points, supported dependency versions, selected source store, and local/worker startup instructions are recorded.
- Prepare a disposable Phase 1 data snapshot with existing IDs/history/costs, explicit and empty configuration, unknown assignments, documents with/without originals, real source bytes, summaries, and deleted-source tombstones. Never use production secrets/personal data as fixtures.
- Have a coordinated frontend/backend deployment plan, additive/backfill/cutover/removal steps, restore material, and explicit rollback versus forward-recovery limits. Read [migration policy](reference-architecture-contracts.md#api-schema-and-migration-policy) and [completion criteria](reference-architecture-contracts.md#completion-criteria).
- Provision the validated production replay package/dedicated workspace and read-only deployment permissions reproducibly. Record server-bound runtime selection, denied mutation/outbound dependencies, encrypted-vault envelope/KDF policy, transient handoff topology/expiry, credential recovery, and explicit local-versus-hosted policy from the [runtime contract](reference-runtime-modes-and-credentials.md).

## Bounded scope

Write deployment/upgrade/restore acceptance tests before final scripts. Rehearse the actual ordered `backend/migrations/` history and final HTTP/worker entry points, frontend generation/build/startup, source-store backup, and tombstone/redaction reconciliation.

Do not add new features or revive old branch implementations here. Transitional columns/adapters may be removed only after validated data migration and an explicit removal decision; preserve accepted behavior, URLs, IDs, and source-backed audit facts.

## Tests to write first

- Empty installation and Phase 1 upgrade yield valid consistent schemas, grants, APIs, and final target package imports. Reject incompatible configurations visibly, without silently changing provider or truncating data.
- Existing IDs/messages/summaries/costs/explicit settings survive. Missing assignments/effective history/original bytes remain honestly unknown/unavailable, never inferred as fabricated snapshots or successful reconstruction.
- Back up and restore SQL **and actual original bytes**, then reconcile deletion/redaction before reopening retrieval. Old backups must not resurrect deleted knowledge or retained raw passages.
- Fresh checkout can install/generate/test/build/start HTTP/worker and provision the versioned replay manifest/assets without author-local caches, test-package imports, or ignored source/seed files. Legitimate live document bytes use the selected source store; a missing replay asset produces an explicit error, not inference fallback.
- Two fresh demo visitors run the same fixed user-paced guide through actual base-app routes/components/core with no sign-in, credential prompt/vault access, live workspace read, application writes, or live calls. Attempt forged runtime/workspace IDs, direct mutations/uploads, off-script steps, rapid/back/restart/navigation, and late events against the deployed HTTP/read-only-role boundary. Inspect all declared stores and outbound transports, including queue/jobs/usage/evidence/progress/session/analytics; not just the meeting table.
- Actual secure-context browser crypto proves encrypted localStorage, locked reload, wrong passphrase/tampering, lock/forget/change/cross-tab behavior, and plaintext-settings migration. Inspect every persisted browser store and captured server/network logs: no passphrase, derived key, plaintext credential, or hidden unlock surrogate. Document XSS/unlocked-origin limits honestly.
- Two hosted live visitors use distinguishable synthetic service keys without cross-operation leakage, public handoff reuse, global-client mutation, server persistence, or operator-paid fallback. Lose credentials during queued turn/tool/vote/summary/ingestion, restart, then re-provide to the same operation; no repeated completed paid step or duplicate upload. Unknown paid attempts remain explicit. Test trusted local environment/Ollama separately; replay/hosted cannot enable that fallback by client flag.
- Direct database, resource/destination/private-knowledge guards still apply. Provider/worker/cleanup failures remain recoverable without required paid inference; no account or Auth bootstrap is needed for these tests.
- Rehearse deployment compatibility or declared maintenance window and recovery after a mid-cutover failure. Irreversible redaction cannot be undone by promising an unsafe restore.

## Code example: upgrade preserves known values without inventing missing ones

Proposed integration contract for `backend/tests/integration/`; implement `upgrade_dataset` with the actual old schema, versioned migrations, source adapter, and final repository/API reads. The names below are harness contracts, not existing methods:

```python
async def test_upgrade_preserves_recorded_history(upgrade_dataset):
    h = upgrade_dataset
    before = await h.seed_phase_one_data()
    await h.apply_target_migrations()
    after = await h.read_preserved_history()
    assert after.meeting_ids == before.meeting_ids
    assert after.messages == before.messages
    assert after.legacy_costs == before.legacy_costs
    assert after.explicit_overrides == before.explicit_overrides
    assert await h.unknown_legacy_assignments_are_marked_unknown()
    assert await h.missing_originals_are_marked_unavailable()
```

Test migration reruns according to the actual migration policy, rejected malformed legacy records, and failure before/after cutover. These equality checks cannot prove byte backup, permission correctness, or deletion safety by themselves.

## Code example: restored data must honor later deletion

Separate proposed restore test, with declared tombstone retention/recovery sources provided by the same harness:

```python
async def test_restore_cannot_reenable_deleted_knowledge(upgrade_dataset):
    h = upgrade_dataset
    source = await h.seed_ready_source()
    backup = await h.backup_sql_and_source_bytes()
    await h.delete_source_and_retain_revocation(source)
    await h.restore_and_reconcile(backup)
    assert await h.search_source(source) == []
    assert await h.retained_raw_passages(source) == []
```

The required later revocation metadata must actually survive the restore boundary. Define where it is retained and how restore remains closed until reconciliation completes; do not let a convenience fake conceal that operational prerequisite.

## Green and refactor

- Run fresh, upgrade, restart, backup/restore, API/SSE/client/import, hosted/local strict replay, real-browser vault, private BYOK handoff/recovery, and trusted local integration scenarios with selected real adapters and controlled provider transports. No paid calls are required to prove isolation or correct key routing.
- Execute the deployment rehearsal in its actual order, validate backfills before switching readers/writers, and retain one workflow owner through compatibility windows. Do not drop data because a new class no longer reads it.
- Publish actual commands/results, versions, setup/startup, package provisioning, read-only replay policy, crypto/KDF and lock/forget guidance, transient credential loss/re-provision, source-store/backup procedures, worker recovery, and limitations. Neither passphrase nor derived key is backed up/persisted; forgetting one requires credential re-entry, not server recovery. Lint/types/build supplement behavioral tests.

## Final exit gate

Every [shared completion criterion](reference-architecture-contracts.md#completion-criteria), [runtime/credential contract](reference-runtime-modes-and-credentials.md), and prior exit has executed evidence. Phase 1 regressions, real adapters/concurrency/restart/deletion, migration/imports/frontend ownership, same-UI/core guided replay, zero-write/zero-live-effect deployment, browser encryption, and private BYOK recovery pass. Required tests do not depend on paid calls; real-provider smoke tests are separately opt-in and require the intended visitor's credentials.

Skipped/proposed checks, historical test counts, empty scaffolding, source inspection, or successful builds do not establish architecture acceptance. Stop and record an unresolved gate rather than labelling the migration complete.
