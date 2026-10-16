# Knowledge workflows evidence — authorized retrieval, durable ingestion, tombstone deletion

> **Current scope correction (2026-10-16):** This is historical execution evidence, not a source of new requirements. Authentication/identity/access-control work is outside scope and B-05 is withdrawn; past tests or future-phase assignments here do not reinstate it. Research now needs only the demo-grade check in DEMO-JOURNEY.md, not formal financial verification or sign-off. No implementation or test rerun is implied by this annotation.

## Spec revision and decisions

- Spec: `specs/phases/06-knowledge-workflows.md`; contracts
  `specs/CONTRACTS.md` section 7; requirements R-10, R-12, R-15
  (continued R-03/R-05); defects B-02, B-03, B-10; tasks T01–T08.
- Retrieval is authorized server-side: `app/modules/knowledge/policy.py`
  resolves shared + persona-private scope from snapshot assignments
  intersected with current grants, minus tombstones; collection names are
  never caller-controlled (`UnauthorizedScope` before any vector call).
- Citations carry stable `document_id` source IDs; orphan hits and rows
  absent from current state are filtered, never labeled "Unknown"
  (`app/modules/meetings/knowledge.py`, engine cites `document_id`).
- Ingestion is durable: `migrations/006_knowledge_durability.sql` adds
  ingestion-job + cleanup-outbox tables and tombstone columns;
  `app/modules/knowledge/ingestion.py` enqueues replayable jobs and an
  idempotent worker; upload bytes persist under `storage/documents/<id>/`
  so restarts replay from disk. Uploads stream with a pre-buffer size cap
  and verify meeting/persona/stack ownership (404 on unknown IDs).
- Deletion is tombstone-first: status flips to `deleting` (excluded from
  retrieval) before vector work; cleanup persists to
  `vector_cleanup_outbox` with idempotent retry; the row is hard-deleted
  only after vectors confirm. Meeting and stack deletes tombstone child
  documents and drop their collections even with zero document rows.
- Race guard: a worker that finds its document tombstoned mid-processing
  skips indexing (no resurrection) and leaves cleanup to the outbox.
- `web_search` stays allowlisted for prompt compatibility but returns a
  disabled-by-policy message; knowledge answers come from cited documents.
- Legacy repair: `backend/scripts/repair_knowledge.py` audits stuck
  jobs/pending cleanups (default) and `--fix` recreates missing job rows
  from durable bytes plus replays cleanups. Never deletes data.

## Owned bugs: red/green evidence

- B-03 red: `client.search` missing on qdrant-client 1.7.0 surface used by
  `vector_store.py`, random uuid4 point IDs. Green: injectable client,
  `query_points`-preferred shim with explicit search fallback, stable
  uuid5 point IDs, pinned `qdrant-client>=1.7,<2`; isolated contract
  `backend/tests/integration/test_qdrant_contract.py` (in-memory client,
  dimensions, missing-collection/empty behavior, idempotent retry).
  Ledger `test_b03_*` marker removed, now pins the contract + properties.
- B-10 red: deletes skipped vector cleanup, orphan points retrievable.
  Green: tombstone-first domain (`lifecycle.py` in-memory + persisted
  outbox jobs), routes/manager tombstone before physical cleanup,
  collection drop belt-and-braces, idempotent retry surviving parent
  cascade. Ledger `test_b10_*` marker removed, passes.
- B-02: Phase 02 boundary had no grant/tombstone recheck and Unknown
  sources. Green in this phase: policy scope + live-state citation
  filter (`test_knowledge_policy`, `test_knowledge_citations`) and
  ledger `test_b02_*` passes unmarked.

## Commands, environment, results

- Env: Windows, Python 3.11, qdrant-client 1.7.0, autoload disabled
  (`PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`: broken `langsmith` plugin in
  system site-packages).
- `python -m pytest tests/unit tests/application tests/regression
  tests/api -m "not integration"` →
  **105 passed, 14 skipped** (skips pre-existing).
- `python -m pytest tests/regression/test_ledger.py` →
  **11 passed, 0 xfailed** (B-03/B-10 markers removed by owning phase).
- `python -m pytest tests/integration` →
  **6 passed, 1 failed**: `test_fake_embedding_dimension_contract`
  hardcodes 768 while the local `.env` sets `EMBEDDING_DIMENSION=1024`
  (qwen3-embedding). Pre-existing environmental mismatch in a Phase 01
  fixture test; untouched by this phase (default marker run deselects
  integration). Qdrant contract tests pass.

## Migration / rollback

- Additive migration `006_knowledge_durability.sql` (new tables/columns/
  indexes, `IF NOT EXISTS` throughout). Old readers ignore new tables;
  pending jobs/cleanups are retained for reconciliation, never discarded.
  Rollback = application rollback; replay endpoints
  (`POST /api/documents/jobs/replay-pending`,
  `POST /api/documents/cleanup/replay-pending`) re-drive survivors.
