# PDF extraction decision record (Spec 16)

Status: **selected for the native acceptance worker**, with a mandatory startup
probe on every other host. This record is the decision-gate output required by
Spec 16; it is not a claim that every deployment has already run the probe.

## Problem

The inherited parser called `pypdf`'s `page.extract_text()` and published
whatever it returned. An image-only PDF therefore became a `ready` revision
with zero chunks, and a PDF with a letter-spaced text layer produced one token
per character. Neither outcome is useful retrieval material.

## Selected approach

1. Extract both the plain and layout text layers with `pypdf`.
2. Normalize only known extraction artifacts (Unicode form, control characters,
   ligatures, non-breaking spaces, and long runs of single-character tokens
   separated by wider gaps).
3. Score each page for usable text. Prefer plain text, then layout text.
4. When neither text layer is usable, render that page in memory with
   `pypdfium2` at 200 DPI and run the bundled PP-OCRv6 small model through
   `rapidocr`/`onnxruntime`.
5. Fail the revision with an actionable error when a non-blank page still has
   no usable text. Never publish an empty or silently degraded revision.

OCR runs only for pages that need it. A PDF with a usable text layer is
processed without loading the OCR engine, so a missing OCR dependency does not
break ordinary text PDFs.

## Candidates considered

| Candidate | Result |
| --- | --- |
| `pypdf` plain/layout only | Selected for text pages. Layout mode recovered a real 5-page intimation whose plain text was 96-99% single-character tokens. Zero new runtime dependency for this part. |
| `rapidocr` + `onnxruntime` + `pypdfium2` | Selected fallback. Pure pip wheels, Apache-2.0, models ship inside the wheel, no network and no system package. |
| Tesseract CLI | Rejected. Measured 1.47 s/page and mean word confidence 88.9 on the real image-only page, but it requires a system package and a separately installed language data directory. This conflicts with the deployment constraint. |
| Cloud OCR | Rejected by Spec 16. |

## Executed measurements

All commands below were run from `backend` with the project virtualenv
(Python 3.12.10). The synthetic fixtures are committed under
`tests/fixtures/pdf/`. The real-page evidence used the developer-only
`untracked-bond-research/` files and is therefore evidence, not a test
dependency.

### Text layer

| Fixture/page | Plain chars | Layout chars | Usable after normalization |
| --- | ---: | ---: | --- |
| `text.pdf` p1 | 166 | 166 | yes, plain |
| `text.pdf` p2 | 125 | 125 | yes, plain |
| `letter-spaced.pdf` p1 | 91 raw glyph tokens -> 107 chars | 110 | yes, plain after letter-spacing repair |
| `mixed.pdf` p1/p3 | 40 / 47 | 40 / 47 | yes, plain |
| `image-only.pdf` p1 | 0 | 0 | no text layer; OCR path |
| `non-latin.pdf` p1 | 0 | 0 | no text layer; OCR path, then rejected |

The letter-spaced fixture originally produced 91 tokens with a single-character
ratio of 1.0, zero word-like tokens. After normalization it produced 17 tokens,
13 word-like, single-character ratio 0.118, and preserved `HDFC SERIES V-007`,
`HOUSING DEVELOPMENT FINANCE CORPORATION LIMITED`, and the numeric values.

On the real `SE-V007-intimation-150719.pdf`, plain extraction produced
2,253/4,174/4,255/3,723/1,815 characters per page with 96-99% single-character
tokens. `extraction_mode="layout"` on page 1 produced 1,927 characters and 172
tokens with 8 single-character tokens, including readable addresses, telephone
numbers, and the corporate identity number. This is why layout is evaluated as
a second text-layer candidate rather than immediately escalating to OCR.

### OCR fallback

| Measurement | Result |
| --- | --- |
| Model load (lazy, first OCR page) | ~0.02 s initialization; first page includes model load |
| Synthetic image-only page (200 DPI) | 109 chars, 96 non-space, 12 word-like, mean score 0.993, ~0.8-1.5 s |
| Real `TS-V-007.pdf` page 1 (200 DPI) | 1,924 chars, 1,618 non-space, 306 tokens, mean score 0.961, 2.86 s including model load |
| RSS after first OCR | 181.7 MB; subsequent pages observed at low incremental RSS |
| Network | HTTP(S) proxies pointed at a closed local port during the run; logs showed local model files and no download |

The real image-only page produced recognizable phrases including
`Term Sheet (Series V-007 dated 15th July, 2019)`,
`HDFC SERIES V-007 18th July, 2022`,
`Housing Development Finance Corporation Limited`,
`Secured Redeemable Non-Convertible Debentures`, `Rs. 2,000 crore`, and
`7.87% p.a.`. It also produced header noise and a few stray symbols. That is why
the gate combines confidence with character-shape metrics instead of trusting
the OCR score alone.

`non-latin.pdf` demonstrates the honest failure path: OCR scored 0.869 but
returned only 17 non-space characters and 2 word-like tokens, so the page is
not accepted. The revision will fail with an actionable extraction error rather
than publishing Cyrillic source as Latin garbage.

## Supported language boundary

The accepted extraction contract is **English/Latin-script text**. The OCR
model is multilingual, but the quality gate requires a primarily Latin
alphabet page (at least 85% Latin alphabetic characters) and rejects pages that
do not meet it. Sabha therefore does not advertise general multilingual PDF
support in this spec. A non-Latin page fails explicitly rather than publishing
unreviewed transcription; adding a language policy is a separate decision.

## Dependency and licensing record

| Package | Version | License | Notes |
| --- | --- | --- | --- |
| `rapidocr` | 3.10.0 | Apache-2.0 | Wheel (~27 MB) contains `PP-OCRv6_det_small.onnx` (9.47 MB), `PP-OCRv6_rec_small.onnx` (20.25 MB), and `ch_ppocr_mobile_v2.0_cls_mobile.onnx` (0.56 MB), plus `MODEL_LICENSES.md`. |
| `onnxruntime` | 1.31.1 | MIT | CPU inference; no GPU required. |
| `pypdfium2` | 5.x | Apache-2.0 / BSD-3-Clause (PDFium) | Renders pages in memory. |
| `Pillow` | 13.x | HPND | Image bridge for rendering and OCR input. |
| `psutil` | 7.x | BSD-3-Clause | Child RSS watchdog. |

No model file is downloaded at runtime and no model artifact is committed to
this repository. `requirements.txt` pins `rapidocr` and `onnxruntime` exactly;
upgrading either requires re-running the benchmark and the probe.

## Installation and startup probe

```powershell
cd backend
venv\Scripts\python.exe -m pip install -r requirements.txt
venv\Scripts\python.exe scripts\pdf_extraction_benchmark.py --json
venv\Scripts\python.exe scripts\pdf_extraction_probe.py
```

The benchmark is a decision/re-benchmark tool. The probe is the deployment
check: it imports the selected packages, verifies that the three bundled model
files exist, renders and OCRs a tiny in-memory image, and exits non-zero with
the reason on failure. The application does not silently download models. If
the probe fails, scanned-PDF support must not be advertised and image-only
pages fail with an explicit dependency error while ordinary text PDFs continue
to work.

## Resource and failure budgets

| Limit | Value |
| --- | --- |
| Upload size | existing 50 MiB source limit |
| PDF pages | 200 |
| OCR pages per document | 30 |
| OCR render resolution | 200 DPI, long edge capped at 3,500 px (8 MP budget) |
| OCR page timeout | 20 s |
| Document extraction deadline | 90 s (below the 120 s ingestion lease) |
| OCR concurrent documents | existing ingestion parse slots (2) |
| OCR child RSS cap | 1 GiB |
| Extracted characters | existing 2,000,000 cap |

Failure semantics:

- Encrypted PDFs: empty user password is attempted; otherwise fail as
  encrypted/unsupported.
- Malformed or truncated PDFs: fail as malformed input.
- Page/page-budget/timeout/RSS exhaustion: fail with a bounded, actionable
  error and clean up the child process.
- Missing OCR package/model: text PDFs still succeed; a page that genuinely
  needs OCR fails with a dependency error.
- Unsupported script or unusable page: fail the revision. No partial vectors
  are published and the revision is not marked `ready`.
- Retries use the existing durable operation/revision contract; extraction is
  deterministic for the same bytes and options.

## Operational notes

- Extraction runs off the async event loop and inside a spawned child process
  with a deadline, terminate/kill/reap, and a `psutil` RSS watchdog.
- `OMP_NUM_THREADS`, `OPENBLAS_NUM_THREADS`, `MKL_NUM_THREADS`, and ONNX
  intra/inter-op threads are pinned to 1 so one extraction cannot consume all
  worker cores.
- The source bytes remain immutable. The database records the extraction
  method/version and source page locators; extracted text is not a replacement
  for the original document.
- Replay must never construct this parser or run OCR. Replay consumes persisted
  messages/evidence only.
- Successful extraction does not approve any financial claim in the document.
  Claim-level review remains Spec 18 work.
