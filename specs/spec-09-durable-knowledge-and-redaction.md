# Spec 09 (Phase 2): Durable Knowledge and Deletion-Aware Evidence

## Purpose and prerequisites

Make upload readiness, live retrieval, deletion, redaction, and recovery one coherent Knowledge lifecycle.

- Prior [participant](spec-06-persona-catalog-and-participants.md), [queue/inference](spec-07-durable-turn-queue-and-inference.md), and [closing](spec-08-closing-summaries-and-accounting.md) slices accepted. Source-linked evidence must integrate with operation/tool/context persistence, not exist in a disconnected test store.
- **Blocking decision:** choose original-byte storage after comparing Supabase Storage and persistent local filesystem behind a narrow source-store port. Record local startup, durable acknowledgement, size/storage keys, staging/finalization, deletion, restart recovery, retention, and coordinated SQL/bytes backup/restore. Supabase records do not imply a storage choice; do not silently implement both adapters.
- Define SQL eligibility/publication, revision/chunk identity, embedding model/dimensions/purpose, cleanup ownership, source-linked evidence locations, and redaction/restore policy before writing ingestion adapters.
- Have real isolated source-store/Qdrant/Postgres adapters plus deterministic indexing/query/context-dispatch barriers and restartable workers. Read [knowledge contracts](reference-architecture-contracts.md#durable-knowledge-publication-and-deletion), [Knowledge ownership](reference-architecture-contracts.md#knowledge), and Phase 1 ingestion/deletion regressions.

## Scope and paths

Split current `backend/app/api/documents.py`, `knowledge_stacks.py`, `services/document_processor.py`, `vector_store.py`, and embedding responsibilities into Knowledge `application/{ingestion,retrieval,deletion,commands,queries}.py`, focused ports, `infrastructure/{supabase,qdrant,parsers,source_store}.py`, and presentation DTOs. Provider-specific embedding adapters belong in `platform/providers/embeddings.py`.

Migrate stack/document/upload UI to `features/knowledge/`, exported through its public interface. Meetings consumes document/upload interfaces and requests parent cleanup without editing Knowledge internals. Implement only the selected source-store adapter.

## Tests to write first

- Acknowledgement-to-restart: source and job survive before pending receipt. Interrupt after staging/ack, during parsing, around upsert and SQL publication. Reconcile orphan stages, avoid duplicate chunks, and expose honest missing-source failures.
- Bound upload reads and expanded pages/rows/chunks; parse off-loop under concurrency limits. Real supported formats, query/document embedding purpose, dimensions, first-collection race, and adapter compatibility remain covered.
- Pending/unpublished/failed/revoked data is never eligible even if vectors exist. Ready means successful complete vector publication plus committed SQL eligibility, not submission or a processing acknowledgement.
- Participant fixed bindings see eligible live revisions, never unassigned stacks. Record actual source/revision/chunk/hash and raw passage evidence with operation/call identity; do not claim exact historical replay or a global immutable stack snapshot.
- Delete document and parent with no ingestion, during indexing/query, and before context dispatch. Revalidate authoritative eligibility, reject stale reuse, and retry cleanup; no late write/restart can resurrect eligibility.
- Redact source-linked raw passages across tool artifacts, evidence/citation snippets, and persisted assembled-context copies. Existing conversation text remains unchanged. Restore an old backup and reconcile tombstones/redaction before retrieval resumes.
- UI retains the same document/operation/meeting ID through pending receipt, remount, failed file retry, and late concurrent completion. Pending is not completed success.

## Code example: distinguish acknowledgement from readiness

Proposed shared API union to generate/validate against backend schemas. This is an upload response fragment; the complete API also needs processing/failure/status/error DTOs:

```typescript
type UploadReceipt =
  | { state: "pending"; documentId: string; operationId: string }
  | { state: "ready"; documentId: string; revisionId: string };

export function uploadNotice(receipt: UploadReceipt): string {
  return receipt.state === "ready"
    ? "Document is ready for retrieval"
    : "Upload accepted; processing is still pending";
}
```

On pending, observe/read status for `operationId`; do not resubmit bytes on query refetch or remount. The backend must already have durable source/job recovery before returning that receipt. A ready notification requires the authoritative ready state, not a client timer.

## Code example: revocation and passage redaction acceptance

Proposed integration test contract for `live_knowledge_and_redaction`. Implement the harness with actual declared evidence stores and isolated SQL/vector/source adapters; a single fake result list does not establish the policy:

```python
async def test_delete_redacts_evidence_not_conversation(live_knowledge_and_redaction):
    h = live_knowledge_and_redaction
    source = await h.seed_ready_source("PRIVATE_PASSAGE_SENTINEL")
    await h.retrieve_and_record_evidence(source)
    message_id = await h.save_conversation("User discussed the source")
    before = await h.read_message(message_id)
    await h.delete_source(source)
    assert await h.retrieve(source) == []
    assert await h.retained_raw_passages(source) == []
    assert await h.read_message(message_id) == before
```

Add barriers before vector publication, before search result return, and before not-yet-dispatched context is sent. Bytes already dispatched to a provider cannot be recalled; record that limitation and stop future reuse. Logs must not become an unredactable extra passage store.

## Green and refactor

- Implement the source port/selected adapter contract first, then durable staged upload/job admission, bounded extraction, idempotent indexing and confirmed readiness; keep each vertical slice independently green.
- SQL is eligibility authority; Qdrant is a derived projection. A stale payload cannot override a tombstone. Deterministic revision/chunk IDs and compatible embedding metadata make retries safe.
- Persist cleanup/redaction intent with deletion, exclude immediately, and reconcile physical failures. Coordinate SQL/bytes/vector operations without pretending they form one distributed transaction or holding locks across them.
- Integrate structured evidence and deletion with existing operation persistence. Keep permitted IDs/hashes/deletion markers, not raw passage copies disguised as logs. Backups require retention and restore reconciliation, not unsafe rollback promises.
- Migrate actual meeting/stack parent-deletion and upload callers together; retain created meeting and per-file operation identity on partial failure.

## Exit gate

Real source/Qdrant/database and restart/race tests establish readiness, fixed-scope live retrieval, source revocation/redaction, bounded/off-loop processing, and durable retry cleanup without resurrection. Local operation and configured providers still pass. Original bytes are actually backed up; legacy missing originals are marked unavailable/re-upload, not fabricated. Pending progress and canonical ready/failure UI survive reload without duplicate uploads.

## Implemented (spec-09 exit gate, recorded 2026-10)

Fifteen implementation, test, and documentation commits from `2ec8614` through `1a310ac`, plus this exit-gate record. Each slice stayed independently green and was committed before the next one started. Nothing was pushed.

- Decision and provider boundary (`2ec8614`, `59bb465`): recorded Supabase Storage as the original-byte store behind a narrow source-store port (no local-filesystem adapter), with staging/finalization, durability-before-ack, retention, and coordinated backup/restore rules. Embedding adapters moved to `app/platform/providers/embeddings.py`; `document_processor` moved behind the Knowledge parser port with a compatibility shim.
- Source adapter (`0bfce46`): `SupabaseSourceStore` uses the real `storage3` client, bounded spooling with SHA-256, private-bucket creation, idempotent move/delete, size-checked downloads, and typed failures. It is tested against an in-memory HTTP double that speaks the Storage API; no hosted or Docker storage was contacted.
- Durable schema and domain (`452d184`): migration `025` adds revisions, ingestions, chunk metadata, retained passage evidence, cleanup intents, and an append-only deletion/redaction manifest. SQL owns eligibility; Qdrant payloads are derived projections. Deterministic UUID5 revision/ingestion/chunk identities make retries safe, and legacy `indexed` rows become `unavailable` with an honest re-upload message.
- Upload admission (`1217d48`): one bounded pass validates, stages, hashes, and moves the source before SQL admission. A successful request returns a durable pending receipt (`documentId`, `operationId`) or a ready receipt; admission failure deletes the finalized object. Pending is not presented as success.
- Restartable indexing (`c84399e`): migration `025` lease/claim RPCs drive an ingestion worker that downloads bounded source, parses off-loop under a concurrency limit, upserts deterministic chunks, and publishes only after complete vector confirmation and a non-revoked SQL conditional. Missing source is an honest failure; retries do not duplicate chunks.
- Eligible retrieval and evidence (`866ad49`): search resolves only SQL-eligible revisions in the meeting-shared scope plus the participant's saved stacks, filters Qdrant by revision, revalidates candidates against SQL, and records source/revision/chunk/hash plus raw passage with operation, tool-call, participant, and message identity. No eligible revision means no vector call.
- Revocation and redaction (`78a9789`): migration `026` adds cleanup-resolution RPCs. Deleting a document revokes SQL immediately, persists retryable source/vector/evidence cleanup intents, and redacts retained raw passages, structured tool results, and citation snippets while leaving authored conversation `content` untouched. Late publishes and restarts cannot resurrect eligibility.
- Parent cleanup (`621d4e9`): migration `027` revokes owned documents and records a parent collection cleanup intent before meeting or stack rows cascade. Routes fail closed with `503` when Knowledge is unavailable and never delete the parent first.
- Knowledge HTTP ownership (`5d0943a`): `/api/documents` now comes from `modules/knowledge/presentation`, keeps the URL prefix, returns `202` pending or `200` ready receipts, exposes operation status/retry, document list/get/delete, and scoped search. `/api/knowledge_stacks` keeps its contract. Startup recovers ingestions and drains cleanup intents without blocking.
- Frontend feature (`1732058`): `features/knowledge` owns receipt/status/document/stack decoders, TanStack Query keys/queries/mutations, `DocumentPanel`, `UploadProgress`, `StackList`, `StackEditor`, and `useDocumentUpload`. Knowledge-stack pages, `SharedDocumentsTab`, and meeting creation use the feature barrel. Pending counts as accepted, not ready; failed retries reuse the same operation identity; remounts/refetches never re-upload bytes. The OpenAPI snapshot and generated types were refreshed.
- Turn integration (`897ad1b`): the durable turn path calls `KnowledgeLifecycle.search` with the meeting scope and fixed participant stack IDs, records evidence, attaches the final message ID after publication, and revalidates revisions before each provider dispatch. A revoked source interrupts the turn instead of reusing stale context.
- Restart, race, and acceptance coverage (`57c10de`): staging objects are swept on startup; acceptance tests cover acknowledgement-to-restart recovery, missing-source honesty, delete-during-indexing, delete-during-query, redaction without conversation erasure, and backup replay before retrieval resumes.
- Backup rehearsal and characterization (`1a310ac`, `29886aa`): the restore test snapshots SQL rows and source bytes, restores them, replays newer manifest tombstones, and drains cleanup before retrieval. The no-sign-in sweep reads documents through the Knowledge lifecycle.

Commands and results: backend **512 passed**, run in directory chunks to avoid harness restarts: regression **217**, application + architecture **66**, unit + contract **124**, integration **73**, acceptance + API + characterization + doubles **32**. Frontend **229 passed / 40 files**; architecture **13 passed**; `npm run sync:openapi` drift is green. ESLint reports **6 pre-existing errors** outside the knowledge/meeting changes (meetings/new page effect, ThinkingBlock effect, closing-observation ref access, a test `useState` wrapper, and two `require()` imports in a store test) plus 30 warnings; no knowledge feature file is implicated.

### Limitations (recorded honestly; never claimed as executed)

- Supabase Storage is the selected adapter, but hosted storage was not verified locally: Docker is unavailable. Contract tests exercise the real `storage3` client against an in-memory HTTP double; hosted/local-stack verification steps remain in the untracked `HOSTED_STORAGE_VERIFICATION.md` note.
- Qdrant tests use the real in-memory client; no networked Qdrant cluster or paid embedding provider was contacted. Embedding behavior is deterministic in tests.
- Bytes already dispatched to an inference provider cannot be recalled. Deletion stops future reuse and redacts retained passages, but provider-side copies are outside this system's control.
- Legacy documents without retained originals are marked `unavailable` with a re-upload instruction; no original bytes are fabricated.
- Backup restore is a logical rehearsal (SQL rows plus source objects plus manifest replay), not a hosted PITR drill. A restored system must run manifest replay and cleanup before serving retrieval.

Next: [Feature cutover and legacy removal](spec-10-feature-cutover-and-legacy-removal.md).
