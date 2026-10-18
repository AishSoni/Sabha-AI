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

Next: [Feature cutover and legacy removal](spec-10-feature-cutover-and-legacy-removal.md).
