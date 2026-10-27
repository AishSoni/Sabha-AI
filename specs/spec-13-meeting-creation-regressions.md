# Spec 13 (Phase 3): Meeting Creation Regressions

## Purpose and prerequisites

Fix two reproduced vanilla frontend bugs before introducing replay. [Spec 12](spec-12-database-read-isolation.md) is accepted. These fixes apply to ordinary live creation; they are not demo workarounds or permission to replace creation with canned responses.

## Current code and scope

`frontend/src/features/meetings/hooks/use-meeting-creation.ts` retains a created meeting ID and per-file upload receipts, but `runPendingUploads` returns when no files need uploading before reaching navigation. A temporary probe used the real hook and a successful create response: the ID existed, there was no creation error, and the router was never called.

`frontend/src/app/meetings/new/page.tsx` rebuilds participant selection with every item selected when catalog data changes. A probe deselected the roster, changed the same persona's metadata, and observed it selected again. This is a changed-data case; unchanged refetches can retain their reference through structural sharing.

Touch the real hook/page and maintained tests, not a separate replay creation implementation. Preserve existing per-file resume, draft validation, participant snapshots, and API contracts.

## Decisions

- Successful creation navigates exactly once when every staged upload has an accepted durable receipt, including the empty-file case. A receipt is not indexing readiness; the document UI continues observing processing.
- Failed uploads preserve the meeting ID, successfully admitted files, and only the failed/unaccepted work for retry. Repeated actions do not create another meeting or repeat accepted uploads.
- Reconcile catalog selections by persona identity. Existing personas retain their selected/deselected state through metadata/order changes; removed personas leave the submission; newly added personas start unselected after initial catalog hydration. Initial hydration retains the current all-selected default.
- Catalog errors/refetches do not clear title/context or silently change the chosen participant set. Submission uses current valid identities and metadata, not stale removed records.

## Tests to write first

Extend `use-meeting-creation.test.tsx` using the real hook/router boundary:

1. No staged files: one successful create, retained meeting ID, one navigation to that meeting, no upload request.
2. Create failure: no navigation; retry succeeds without hiding the original failure.
3. Files accepted: navigate without waiting for indexing; mixed failed/accepted files retain identity and retry only remaining work.
4. Repeated submit/retry and an empty remaining-work set: no duplicate create/upload/navigation and no stuck screen.

Extend real-page tests rather than only mocking `useMeetingCreation`:

5. Deselect one/all, update a persona's actual metadata, and verify selection is preserved while visible metadata changes.
6. Add/remove/reorder catalog entries; verify the explicit policy above and payload identities.
7. Catalog error/recovery and existing drafts; required-field/empty-roster validation remains intact.

Keep `frontend/src/app/meetings/new/meeting-creation-resume.test.tsx` coverage, but its mocked creation hook alone cannot prove real no-file navigation. Bring the externally reproduced assertions into maintained tests without a production dependency on scratch files.

## Small implementation slices

First capture both intended failing assertions. Fix navigation independently of upload-target count while preserving the receipt gate. Then reconcile catalog state by identity instead of recreating all selections. Run creation hook/page suites, meeting list/room integration suites, the broader frontend suite, and type checking.

Do not require a fake `File` to get navigation, force users to upload, suppress catalog refresh, or treat an incomplete upload as ready. Do not change backend contracts solely to repair frontend control flow.

## Exit gate

Both new regressions fail for the demonstrated reason before the fix and pass afterwards. Ordinary no-file creation reaches the actual meeting route. Upload resume and changed-catalog selection are proven with maintained tests. Record executed evidence, not just static inspection.

Next: [Live and replay composition](spec-14-live-and-replay-composition.md).
