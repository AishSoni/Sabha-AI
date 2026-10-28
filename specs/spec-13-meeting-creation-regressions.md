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

## Completion record

Recorded 2026-10-28 at commit `513e437` (red-test commits `2bf7452` and
`e3ae419`; fixes `42cae2e` and `b22cfd6`; test-boundary move `513e437`). Every
result below comes from a command run against this checked-out tree; no backend
or hosted service was contacted. The red commits intentionally carry failing
tests so the reproduction remains part of the history.

### Verdict

Spec 13 exits for the checked-in/local evidence. Both regressions were captured
as failing maintained assertions before their fixes and pass afterwards:

- The no-file reproduction failed with `expected "spy" to be called 1 times,
  but got 0 times`, while the meeting ID was already retained and no creation
  error existed.
- The catalog reproduction failed with `expected 1 selected`, receiving
  `Select which AI advisors should participate (2 selected)` after only the
  persona metadata changed.

Ordinary no-file creation now reaches `/meetings/meeting-new-1` (the ID returned
by the create response) with no upload request. Upload resume, catalog
reconciliation, and the existing mocked-page coverage all remain green.

This is frontend control-flow acceptance only. It does not claim a hosted
create/upload run; see [Outstanding gates](#outstanding-gates).

### Executed evidence

| Command | Working directory | Result |
| --- | --- | --- |
| `npx vitest run src/features/meetings/hooks/use-meeting-creation.test.tsx src/app/meetings/new/meeting-creation-resume.test.tsx` | `frontend/` | Baseline: **2 files / 8 tests passed**, 4.10 s, 14:03 |
| `npx vitest run src/features/meetings/hooks/use-meeting-creation.test.tsx -t "no files were staged"` | `frontend/` | Red: **1 failed / 4 skipped**; expected push once, received 0, 14:10 |
| `npx vitest run src/app/meetings/new/meeting-creation-catalog.test.tsx` | `frontend/` | Red: **1 failed**; expected `1 selected`, received `2 selected`, 14:11 |
| `npx vitest run src/features/meetings/hooks/use-meeting-creation.test.tsx src/app/meetings/new/meeting-creation-resume.test.tsx src/app/meetings/new/meeting-creation-catalog.test.tsx` | `frontend/` | **3 files / 17 tests passed**, 3.62 s, 14:14 |
| `npx vitest run tests/integration/meetings-list-screen.test.tsx tests/integration/meeting-room.test.tsx` | `frontend/` | **2 files / 9 tests passed**, 3.38 s, 14:14 |
| `npx vitest run` (first run) | `frontend/` | **1 failed / 37 passed files; 1 failed / 223 passed tests**; architecture `test_import_in_route` rejected a route test importing `tests/fixtures` |
| `npx vitest run` (final) | `frontend/` | **38 files / 224 tests passed**, 8.74 s, 14:15 |
| `npx tsc --noEmit` | `frontend/` | exit 0, no diagnostics |
| `npx eslint` | `frontend/` | exit 0, **0 errors / 15 warnings**, all pre-existing in unrelated files |

The first full run failed because the new real-page suite lived under
`src/app` and imported the shared scripted transport from `tests/`, which the
architecture rule forbids. The suite was moved to
`tests/integration/meeting-creation-catalog.test.tsx` rather than weakening the
rule or duplicating the fixture. The final full run includes the architecture
suite. The focused suite's only stderr is the expected `console.error` from the
failed-creation case; the integration suite's only warnings are pre-existing
Radix `act()` warnings.

What the tests prove:

1. **No-file navigation.** A real create with zero staged files produces one
   meeting request, stores the returned ID, navigates once to that meeting, and
   sends no upload request. Navigation no longer depends on an upload target
   existing.
2. **Receipts are acceptance, not indexing.** A `state: 'pending'` upload
   receipt is treated as accepted: the flow navigates without waiting for
   `ready`, while indexing status remains observable elsewhere.
3. **Resume preserves admitted work.** A mixed success/failure run keeps the
   meeting ID and the accepted file, exposes the failed file's error, and
   retries only the failed file. The meeting is created once across both phases.
4. **Repeated actions are safe.** Re-submitting after completion and calling
   `retryUploads` with no remaining work create nothing, upload nothing, and do
   not push again. A second submit that lands before the first render is
   coalesced by refs, not by a render-timing coincidence.
5. **Failure remains honest.** A failed create does not navigate, surfaces its
   own error, and a retry succeeds without having hidden the original failure.
6. **Selection survives changed metadata.** Deselecting a persona and refreshing
   the catalog with a new subtitle and color leaves the selection count and
   checkbox unchanged while the new metadata is displayed. The initial
   hydration is still all-selected, and one checkbox click toggles exactly once.
7. **Identity policy on catalog edits.** New personas start unselected, removed
   personas disappear from the roster and from the submitted body, and reordered
   personas keep their selected state and follow catalog order. Submission uses
   `persona_ids` of current selected identities only.
8. **Catalog failures do not erase drafts.** A 500 followed by recovery keeps
   the agenda, context, roster, and chosen participant set. An empty roster and
   a missing agenda both keep submission disabled; a valid agenda re-enables it
   when a persona is selected.
9. **Existing page coverage stays intact.** The mocked
   `meeting-creation-resume.test.tsx` suite still passes unchanged, preserving
   its staging, retry, removal, and busy-state checks.

### Deliberate scope and manual rollback

- Frontend only. No backend endpoint, payload, schema, migration, or
  configuration changed. The meeting create body uses the existing
  `persona_ids` wire field.
- The no-file path is not simulated with a fake `File`, users are not forced to
  upload, catalog refresh is not suppressed, and an incomplete upload is never
  treated as ready. The page still refetches and reconciles by identity.
- Catalog selection is a positive set of selected IDs. The set is hydrated on
  the first successful catalog response and pruned when an identity disappears;
  an identity that is removed and later re-added is therefore treated as newly
  added and starts unselected.
- The real-page suite lives in `tests/integration` so route-owned code is not
  tested by a file that imports the test-only transport fixture. Production
  behavior is unchanged by that location.
- Manual rollback: revert `b22cfd6` and then `42cae2e`, reverting the associated
  tests with them, or restore `e243562`. There is no data or hosted state to
  unwind.
- `HOSTED_STORAGE_VERIFICATION.md` remains an unrelated pre-existing untracked
  file and was not modified.

### Outstanding gates

- Hosted end-to-end creation (real meeting service, real document upload, real
  router transition) was not executed; the suites use a real hook/page with a
  scripted HTTP transport and a router-boundary spy.
- Repository-level lint still reports 15 pre-existing warnings in unrelated
  files. The changed hook, page, and tests contribute none.
- Spec 14, live and replay composition, is the next consumer of this baseline
  and has not started.
