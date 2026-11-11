# Spec 45: Evidence Preview Completeness

Status: working draft. Inherits [Spec 33](spec-33-application-experience.md).
Prerequisites: Specs 34–44. Owns T30; contributes P14.
Source anchors: [technical register](reference-project-polish-audit.md#technical-defect-register).

## Scope

Make bounded source previews honest about omitted material. Keep the existing
shared evidence viewer, exact-revision contract, and robust request/disposal
guards; do not introduce another preview implementation or newest-file fallback.

## Requirements

1. Carry the loader's truncation metadata through every relevant renderer.
   Markdown currently receives only text and drops the truncation flag, unlike
   other formats. A clipped source must not look like the complete document.
2. Provide a visible, accessible, concise completeness/truncation indication for
   Markdown, plain text, CSV, and other bounded previews as appropriate. Distinguish
   limits from read/format/integrity failure. Do not announce truncation when no
   content was actually omitted at an exact boundary.
3. Preserve bounded parsing/rendering and source identity, locator, retained
   revision, provenance/rights, safe external source access, and meaningful retry.
   Do not remove byte/type/hash checks to display a large document.
4. Preserve cancellation, stale-response rejection, object-URL/resource disposal,
   focus restoration, access-loss cleanup, and live/demo adapter separation.
   Showing a complete source externally must not bypass private-byte access.

## Local acceptance

- Complete, exact-boundary, and over-limit Markdown previews have correct content
  and accessible completeness indication. Repeat boundary checks for other formats.
- Large inputs remain bounded; loading, unavailable, revoked, integrity failure,
  retry, and cancellation retain truthful states and exact citation identity.
- Rapid source switching, close/unmount, late results, theme changes, and access
  loss do not leak bytes, leave stale content, or steal focus.
- Verify a real browser preview and supported-source controls; do not claim
  measured large-document performance from source inspection alone.

## Implementation record

T30 is resolved. `EvidenceContentRenderer` now passes the loader's `truncated`
flag to Markdown, so a clipped Markdown source no longer renders as complete.
Markdown and preformatted previews share `boundPreviewText()` and the
`EVIDENCE_RENDER_TEXT_LIMIT` of 400,000 characters declared beside the loader
limits in `contract.ts`. The helper clips the visible text and reports omission
only when the loader clipped the source or the visible text is shorter than the
loaded text. A document of exactly 400,000 characters is therefore unmarked,
while 400,001 characters is clipped and marked.

Every bounded preview now uses one non-error `PreviewCompletenessNotice` with
`role="status"`, neutral surface styling, and the default copy "Preview
truncated; the retained source may contain more." The notice sits above the
rendered content for Markdown, plain text, JSON, derived text, and CSV, so it
remains visible with long content. Read, format, integrity, revoked, and
unavailable failures continue to use the existing alert presentation; truncation
is never announced as a failure.

The CSV parser now reports row, column, and cell limits separately instead of
claiming all three whenever any limit is reached. Exactly 200 rows, exactly 20
columns, and exactly 500-character cells remain unmarked; a trailing newline
after the 200th row does not count as omitted content. The table notice names
only the limits that actually applied, and adds "The retained source may contain
more." when the loader also clipped the source. The existing plain-text fallback
for CSV input over 200,000 characters is unchanged.

Both adapters already computed their text-limit flag correctly; they now have
direct boundary coverage. Live and replay text of exactly 2,000,000 characters
remains complete, while 2,000,001 characters is clamped to 2,000,000 and marked
truncated. Replay fixtures use matching manifest size and SHA-256 values, so the
boundary tests do not bypass integrity checks.

The synthetic browser test rewrites a recorded Markdown asset in the replay
session to a source larger than the loader limit, serves it through the normal
recorded-asset route, and opens the Crisil annexure from Files. It observes the
accessible completeness notice, the rendered heading, no alert, and Escape
closing the dialog. This exercises the production preview path rather than the
renderer in isolation.

No backend, package, contract-shape, or data changes were required. Exact
revision identity, locator, provenance/rights, MIME/byte/hash validation, PDF
object-URL disposal, retry, cancellation, stale-response rejection, focus
restoration, access-loss cleanup, and the separation between live and replay
adapters are unchanged. The provider already satisfied the request and disposal
requirements and was not modified, and the external-source link remains
secondary to the private-byte preview.

The 400,000-character cap is a bounded-rendering decision, not a measurement of
large-document performance. A complete source between 400,000 and 2,000,000
characters is clipped for display and marked as truncated even though the loader
did not clamp it; this keeps Markdown parsing consistent with the other bounded
previews.

## Executed checks

- `npx tsc --noEmit`: passed after each implementation stage.
- `npx vitest run`: 143 files, 903 tests passed, including 23 renderer tests,
  3 bounded-text tests, and 32 live/replay adapter tests.
- `npm run test:architecture`: 7 files, 52 tests passed.
- `npm run lint`: 0 errors (13 pre-existing warnings).
- `npm run build`: passed (Next.js 16.1.4, 20 static pages generated).
- `npx playwright test e2e/evidence-preview.spec.ts`: 4 tests passed in
  Chromium, covering the seven-file recorded preview, synthetic truncated
  Markdown, committed citation, and narrow/reduced-motion/focus paths.
- No hosted deployment, throttled trace, screen-reader session, physical-device
  review, or measured large-document performance result was produced. The
  truncation evidence is functional and source-level; unbounded rendering cost
  was not benchmarked.
