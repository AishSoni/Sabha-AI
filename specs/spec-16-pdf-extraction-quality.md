# Spec 16 (Phase 3): PDF Extraction Quality

## Purpose and prerequisites

Improve the shared live parser's handling of image-only and poor text-layer PDFs before claiming faithful document support in the journey. [Spec 15](spec-15-closing-ui-integration.md) is accepted. This is bounded parser work, not a general document-understanding service. Replay still serves offline-prepared results and never invokes OCR, embeddings, or ingestion at runtime.

## Current evidence

`backend/app/modules/knowledge/infrastructure/parsers.py` uses `PdfReader` and `page.extract_text()` without OCR. A direct parse of the retained local source PDFs found:

| Asset | Pages | Extracted stripped text | Implication |
| --- | --- | --- | --- |
| `TS-V-007.pdf` | 4 | 0 characters | Image-only/empty extraction requires an explicit supported fallback or honest failure |
| `SE-V007-intimation-150719.pdf` | 5 | 16,228 characters | Heavily letter-spaced output; nonempty is not proof of useful retrieval text |

An older research README incorrectly called both files textless. Do not adopt it as parser truth. These measurements did not independently validate the bond's coupon, ISIN, rating or other claims.

## Decision gate before implementation

Compare the smallest viable local extraction/normalization and OCR fallback approaches on representative text, image-only, letter-spaced and mixed-page fixtures. Select and record the implementation, licensing, supported languages, binaries/system packages, deployment image changes, CPU/memory/time limits and error semantics. No paid API dependency. Confirm installation and operation in the actual target worker environment, not only a developer workstation.

This gate must resolve before advertising scanned-PDF support. If a bounded approach cannot meet deployment constraints, stop with an explicit unresolved gate; do not silently degrade to empty-ready documents or pretend that fixture text proves production OCR. Do not introduce a cloud OCR service or broaden infrastructure scope without revisiting the decision.

## Bounded behavior

- Preserve the parser's application-owned interface and the knowledge ingestion lifecycle. Run blocking extraction/OCR off the async event loop under enforceable resource/deadline limits; cancellation/timeouts must terminate or reclaim work rather than leak processes.
- Assess quality per page, not only whole-document text length. Handle mixed text/image documents without duplicating, dropping, or reordering accepted page text. Preserve source/page locators used by chunks and citations.
- Normalize only justified extraction artifacts. Never remove all spaces indiscriminately; it destroys word boundaries and numbers. Poor-quality output must trigger the chosen bounded fallback or an actionable extraction failure, not automatic `ready` publication.
- Respect existing upload byte limits and add explicit page/render-resolution/work budgets. Bound decompression, subprocess arguments, temporary files and concurrency; untrusted filenames/content cannot become shell commands or unrestricted filesystem paths.
- Encrypted, malformed, empty, unsupported-language and resource-exhausting files fail safely. Retries use the same durable operation/revision contract; failure does not publish partial vectors or mark content ready incorrectly.
- Keep source bytes immutable and distinguish extracted/transcribed text from the original. Record extraction method/version and relevant source locators without inventing source assertions. Exact document-claim approval belongs to Spec 18.

## Tests to write first

Use small legally redistributable or generated fixtures available in a clean checkout; production/tests must not depend on `untracked-bond-research/`.

1. Existing normal text PDF remains readable and ordered; parser interface/metadata behavior is characterized.
2. Image-only page, poor letter-spaced text layer, and mixed pages take the intended path. Assert meaningful expected phrases/locators, not just nonzero character count.
3. No duplicate text when a page already has usable extraction. Quality normalization preserves words, amounts and dates.
4. Missing OCR binary/dependency, timeout, cancellation, malformed/encrypted PDF, oversize/page budget and exhausted concurrency fail predictably with cleanup. An OCR stub alone cannot prove deployment support.
5. Real selected extractor/fallback executes on a small disposable fixture in the supported runtime. Knowledge ingestion failure/ready publication and retry tests cover the integration.

## Implementation and exit gate

Characterize current text extraction, record the decision experiment, implement one bounded fallback path, then integrate quality gating and operational limits. Run parser, knowledge ingestion/lifecycle, architecture and relevant broader suites. Document installation, startup checks, resource budgets and failure recovery in operations/setup docs.

Exit when the selected approach is deployable and tested, poor/empty output cannot silently count as useful extraction, and existing text-document ingestion remains correct. The replay package will contain approved offline outputs; it must not construct this live parser during playback. Do not claim a whole source document or all financial claims reviewed merely because extraction succeeds.

Next: [Replay package and streaming](spec-17-replay-package-and-streaming.md).

## Completion record

### Verdict

Spec 16 is implemented for the native acceptance worker. PDF ingestion now
selects plain or layout text per page, repairs letter-spacing artifacts,
falls back to local RapidOCR only for pages without usable text, and refuses
to publish a revision when a non-blank page cannot be read. Extraction method,
version, page count, OCR page count and each chunk's 1-based page locator are
persisted through Postgres, Qdrant, retrieval and the search API.

The decision gate selected pure-pip `rapidocr` + `onnxruntime` + `pypdfium2`;
Tesseract and cloud OCR were rejected. Models are bundled in the RapidOCR wheel,
so there is no system package and no runtime model download. The accepted
language boundary is English/Latin-script text; non-Latin pages fail explicitly.
Full details and licensing are in [PDF_EXTRACTION.md](../docs/PDF_EXTRACTION.md).

Source bytes remain immutable. Extraction provenance is not a claim review, and
this record does not assert that any financial term in a source document is
correct.

### What changed

- `backend/app/modules/knowledge/infrastructure/pdf_extraction.py`: page-aware
  pypdf extraction, normalization, quality gate, RapidOCR fallback, page/render/
  character budgets, spawned child process with deadline and RSS watchdog.
- `parsers.py`: page-aware chunking and provenance; `LocalDocumentParser` now
  returns `ParsedDocument`.
- Ingestion: zero usable chunks fail as `EmptyExtraction` before
  `start_indexing`; identities and publication carry page and extraction
  metadata.
- Migration `031_pdf_extraction_provenance.sql`; Qdrant payload; retrieval
  passage; `page_number` in `POST /api/documents/search`; regenerated OpenAPI
  fixture (46 paths) and frontend types.
- `docs/OPERATIONS.md` covers installation, probe, budgets, failure recovery,
  replay isolation and the host-specific deployment gate.
- Generated fixtures and characterization tests remain independent of
  `untracked-bond-research/`.

Commits: `7a98feb` (characterization), `f828867` (decision record and probe),
`4dde8c9` (page locators, provenance, migration and API contract). Documentation
and this record follow in a separate commit.

### Executed evidence

| Command | Working directory | Result |
| --- | --- | --- |
| `venv\Scripts\python.exe -m pytest tests\regression\test_pdf_extraction.py -q` | `backend/` | **19 passed**, 1.36 s (includes bounded-child deadline cleanup) |
| `venv\Scripts\python.exe -m pytest tests\characterization\test_pdf_extraction_characterization.py -q` | `backend/` | **4 passed**, 0.38 s |
| `venv\Scripts\python.exe -m scripts.export_openapi --check` | `backend/` | OpenAPI matches fixture, 46 paths |
| `venv\Scripts\python.exe -m pytest tests\acceptance\test_spec11_upgrade.py tests\acceptance\test_spec11_cutover.py tests\application\test_knowledge_ingestion_worker.py tests\regression\test_document_search_scope.py tests\regression\test_offloop_ingestion.py tests\contract\test_durable_knowledge_schema.py -q` | `backend/` | **41 passed**, 47.31 s |
| `venv\Scripts\python.exe -m pytest tests\regression\test_knowledge_routes.py tests\regression\test_turn_knowledge_lifecycle.py -q` | `backend/` | **20 passed**, 3.12 s |
| `venv\Scripts\python.exe -m pytest tests\architecture -q` | `backend/` | **32 passed**, 5.87 s |
| `venv\Scripts\python.exe -m pytest tests\integration\test_replay_surface.py::test_replay_only_startup_never_constructs_the_live_composition -q` | `backend/` | **1 passed**, 1.04 s |
| `venv\Scripts\python.exe -m scripts.pdf_extraction_probe` | `backend/` | `"status": "ok"`; pypdf 6.6.2, pypdfium2 5.14.0, Pillow 13.0.0, rapidocr 3.10.0, onnxruntime 1.31.1, psutil 7.2.2; bundled models present; OCR probe score 1.0 |
| `venv\Scripts\python.exe scripts\pdf_extraction_benchmark.py` | `backend/` | `text.pdf` plain text, `letter-spaced.pdf` repaired to usable text, `image-only.pdf` OCR mean score 0.993, `mixed.pdf` text/OCR/text, `non-latin.pdf` rejected |
| `npx tsc --noEmit` | `frontend/` | exit 0 |
| `npm run lint` | `frontend/` | exit 0, 0 errors, 19 pre-existing warnings |

The real image-only `TS-V-007.pdf` page produced 1,924 characters at OCR mean
score 0.961 including the term-sheet header, issuer, instrument name, amount and
coupon. The real `SE-V007-intimation-150719.pdf` changed from 96-99%
single-character tokens in plain mode to readable layout text on page 1. These
developer-only files were used as evidence, never as test dependencies.

### Deliberate scope and outstanding gates

- The full 630-test backend suite was not re-run for this record; focused
  parser, ingestion, lifecycle, contract, migration, architecture and replay
  suites were run instead. The full suite remains an operator/CI gate.
- The probe and benchmark were executed on the native Windows acceptance host.
  A hosted worker must repeat both after installing the pinned wheels and record
  the result. This record does not claim hosted OCR throughput, memory headroom
  or process-policy compatibility.
- OCR is intentionally bounded to 30 pages and 90 seconds per document. Larger
  scanned documents fail with an actionable limit error rather than silently
  publishing partial text.
- The quality gate supports English/Latin-script text. Multilingual extraction
  requires a separate decision and benchmark.
- No Docker/CI deployment manifest exists in the repository, so no image-level
  install was exercised.
- Successful extraction is not document-claim approval; exact claim review
  remains Spec 18 work.
