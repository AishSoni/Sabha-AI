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
