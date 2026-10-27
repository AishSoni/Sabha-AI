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
