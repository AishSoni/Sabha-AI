# Spec 36: Document Progress and Creation Recovery

Status: working draft. Inherits [Spec 33](spec-33-application-experience.md).
Prerequisites: Specs 34–35. Owns T01–T04; contributes P12/P14.
Source anchors: [technical register](reference-project-polish-audit.md#technical-defect-register).

## Scope

Truthful document status and safe recovery after partially successful creation
or upload. Demo sample integration is Spec 43, not a second live upload path.

## Requirements

### Canonical progress and distinct retries — T01/T02

The live adapter must observe the canonical document operation and inject progress
and read-error state into pure presentation. The receipt, progress banner, and
document row must converge; one operation cannot remain Queued beside Ready.
Accepted admission is not indexed readiness. Preserve queued, indexing, ready,
failed, revoked, unavailable, and observation-error distinctions across remounts.

A failed status GET retries observation. Restarting actual failed ingestion is a
separate command. Pending does not imply failure or justify another processing
attempt. Preserve backend leases/idempotency; this finding is not proof that
duplicate workers currently execute. Retain receipt identity and useful prior
state while refreshing, including late events and access loss.

### Partial creation and upload batches — T03

Represent “meeting created, uploads incomplete” explicitly. Either freeze the
committed title/context/participants or implement their real update semantics;
never accept visible edits and silently reuse the old meeting configuration.
Retain created identity, draft context, receipts, and actionable failures.

Stabilize the admitted upload batch. Files added mid-flight must not remain
unaccounted while navigation reports success. Removing an uploading file cannot
pretend to cancel already admitted server work. Define staged versus admitted
removal/cancellation, disable or reconcile mutations accordingly, and navigate
only when all intended work is accounted for. Navigation may follow accepted
receipts rather than wait for indexing; expose that distinction honestly.

### Ambiguous successful admission — T04

Atomic row creation does not prevent duplicates after a committed response is
lost. Use stable authorized submission identity with retention, conflict handling,
and reconciliation across retries. Do not deduplicate by meeting title/content.
Apply the same analysis to an upload whose successful receipt/operation ID never
reached the browser: do not blindly create another document by re-uploading bytes.
Preserve intentional separate uploads and the existing operation retry contract.

## Local acceptance

- Ready rows/receipts never coexist with a stale default Queued banner. Observe
  processing through completion, read failure/recovery, retry, revoke, and remount.
- GET failure invokes refetch only; failed-ingestion retry invokes the correct
  command; a pending row is not presented as a failed operation.
- One upload fails after meeting creation: retry reuses the meeting and committed
  configuration; attempted edits are blocked or actually persisted.
- Add/remove during an upload and receive late success/failure/reset: no lost
  intended file, fake cancellation, ignored edits, or premature success navigation.
- Commit/lost-response/retry for meeting creation and lost upload receipt admits
  once per intent, with truthful unknown-outcome recovery and separate new intents.
- Preserve shared presentation boundaries, private access, and existing ingestion
  safety. Update tests that currently encode retry of merely queued work.

## Implementation record (2026-11-09)

Status remains a working draft: T01–T04 are implemented and covered by focused,
integration, and regression tests. Spec 46 still owns integrated acceptance.

### Dispositions

- **T01 canonical progress.** The live document adapter now watches
  `useDocumentOperation` for the retained receipt operation and injects the
  canonical progress, read-error, and refresh state into the pure presentation.
  The banner and the matching document row merge the observed state, so a stale
  list read cannot show Queued beside a ready receipt. Receipt identity and
  file name are retained in session storage across remounts; a pending receipt
  with no stored response is reconciled through the owner-scoped request key
  before any bytes are uploaded again. Observation failure is rendered as
  `Status unavailable` with a refetch-only action, preserving prior useful
  state; terminal success/failure/revocation invalidates the document list.
- **T02 distinct retries.** `GET /documents/operations/{id}` remains the
  observation read. `POST /documents/operations/{id}/retry` now returns the
  retained receipt idempotently for a ready operation, rejects queued,
  processing, revoked, and unavailable operations with `409`, and schedules a
  new worker attempt only for `failed`. The document row offers retry only for
  failed rows; pending rows are never presented as failures. The progress banner
  separates `Refresh status` from `Retry ingestion`, so a failed GET can no
  longer restart ingestion.
- **T03 partial creation.** Meeting creation freezes the first submitted
  title/context/participant intent. While a meeting may exist the visible
  configuration is read-only, so retries reuse the committed request rather than
  silently applying edits. The screen states “Meeting created — X of Y files
  accepted, N need attention”, retains the created identity, receipts, and
  actionable failures, and blocks automatic navigation while any intended file
  is pending. Files added mid-flight join the same pump and are accounted for
  before navigation. Only never-submitted (`pending`) rows are removable;
  uploading, accepted, and failed rows cannot pretend to cancel admitted server
  work. `Continue to meeting` is available only when nothing is in flight, and
  navigation follows accepted receipts rather than indexing readiness.
- **T04 ambiguous admission.** Meeting creation sends a stable `request_key`
  with a canonical payload fingerprint. Migration `039_meeting_request_identity.sql`
  retains the key and fingerprint, makes a same-key replay return the original
  meeting and participants, and returns a conflict for a different payload;
  deduplication never uses the meeting title or content. Uploads send a stable
  per-file `request_key`. Migration `040_upload_request_identity.sql` retains it
  with a unique partial index, makes a same-key/same-payload replay return the
  existing document operation, and returns a conflict when the owner or bytes
  differ. The browser looks up the retained receipt by key before re-uploading,
  while a deliberate new file receives a new key and the existing operation
  retry contract is preserved.

### Verification performed
