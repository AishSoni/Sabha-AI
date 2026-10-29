# Spec 21 (Phase 5): In-App Evidence Previews

## Purpose and prerequisites

Deliver one in-app evidence-preview system for both live meetings and the guided
replay. Every ready live document and every replay package asset must be
readable without leaving Sabha, and every resolvable document citation must open
the exact retained source revision or replay asset that supports it.

Live and replay must share the preview contract, file/citation actions, dialog,
format renderers, loading/error states, accessibility behavior, and tests for
those shared behaviors. Only evidence resolution and byte transport differ:
live reads an authorized private document revision through the backend, while
replay reads a package-declared immutable public asset. Do not build separate
live and replay viewer implementations or defer one runtime behind the other.

Specs 09, 14, and 17–19 are prerequisites. Preserve the live knowledge ownership
and deletion rules, the immutable replay package, and Spec 20's event-loop and
latency budgets. This spec adds read-only preview behavior; it does not add
accounts, make the live source bucket public, or permit replay to call live
knowledge services.

## Grounding

- `MeetingRoom.tsx` is shared by live and replay and already mounts
  `CitationsBlock.tsx` plus a runtime-specific document panel. This is the
  correct integration seam for one preview host and one set of citation actions.
- `frontend/src/features/knowledge/components/DocumentPanel.tsx` lists live
  documents with `id`, `revision_id`, type, size, and ingestion status, but only
  supports upload/retry/delete. Replay's `recorded-documents-panel.tsx` lists
  checkpoint document metadata and explicitly has no preview action.
- Replay's approved package contains seven public-demo Markdown assets and
  C1–C13 validated claims. `manifest.json` maps every claim to an
  `evidence_asset_id`, locator, and excerpt, but `ReplaySession` currently
  exposes assets without claims. Committed replay citations carry `claim_id`
  and `locator`; the frontend streaming event/projection path drops them.
- Live `DocumentResponse` already exposes `revision_id`. `DocumentRevision`
  persists `source_key`, `source_sha256`, `source_size_bytes`, file type, and
  revision state. `SourceStore.download()` can retrieve original bytes with a
  byte ceiling, but the Knowledge HTTP surface has no content route.
- Live retrieval already returns authoritative `document_id`, `revision_id`,
  `chunk_id`, `chunk_index`, `page_number`, file name, and passage text. The
  meeting `Citation` model and provider `StreamEvent` do not carry those source
  identities, so the UI cannot safely resolve a live citation to a revision.
- Live accepts PDF, DOCX, XLSX, CSV, TXT, and MD up to 50 MiB. Existing parsing
  already produces bounded plain text for DOCX/XLSX and other formats. Replay
  currently needs Markdown and its asset store also permits plain text, JSON,
  and PDF.
- The frontend already has the Radix Dialog primitive and
  `react-markdown`/`remark-gfm`. It has no shared binary/document preview
  transport or PDF viewer. JSON/multipart transport alone is insufficient.

## Requirements

### 1. Establish one shared preview contract and viewer

Add an evidence-preview API to the meetings runtime and implement it in both
runtime compositions. Its exact TypeScript names may follow existing style, but
it must support:

- listing evidence available to the current scope/run;
- resolving a citation to one typed preview descriptor;
- loading a descriptor into a typed text or PDF preview with an `AbortSignal`;
- exposing excerpt, locator, provenance, and external-source metadata separately
  from the load operation.

Use a shared descriptor containing a stable evidence ID, title, media type,
size, readiness, provenance, and optional content hash. Use a shared content
union such as Markdown, plain text, CSV, JSON, derived document text, or PDF.
Runtime-specific claim, document, revision, asset, and storage types must not
leak into the shared dialog or renderers.

Build one room-level preview host and reusable file/citation triggers. Live and
replay inventory panels may retain their different upload/delete/read-only
behavior, but their preview action, dialog, loading/error presentation, and
format renderers must be the same components. Add an architecture test that
prevents a second runtime-specific viewer from being introduced.

### 2. Expose replay's validated evidence graph

Add a typed claims collection to the pinned replay session response containing
at least `claim_id`, `kind`, `evidence_asset_id`, `locator`, `excerpt`,
`source_url`, and `source_title`. Values come only from the published manifest;
there is no live query or second mapping source.

Expose preview availability for a replay session with previewable assets,
including the initial checkpoint. Do not derive it from
`capabilities.documents`, whose checkpoint reads neither cover every asset nor
become available at the same time. Update the OpenAPI fixture, API inventory,
generated frontend types, and strict replay decoders together.

The replay runtime resolves citations only through:

`claim_id` → validated `evidence_asset_id` → session asset.

Do not resolve by filename, citation title, URL, array position, or hard-coded
HDFC IDs. Missing or malformed claims/assets fail the session contract; an
unresolvable individual citation gets an honest unavailable state rather than a
fallback to another file.

### 3. Add authorized live revision-content reads

Add a Knowledge application use case and a route equivalent to:

`GET /api/documents/{document_id}/revisions/{revision_id}/content?representation=original|text`

The route must:

- resolve the persisted document and exact revision, verify that the revision
  belongs to the document, and apply the Knowledge module's ownership/scope and
  eligibility rules rather than trusting a caller-provided storage key;
- serve only a retained ready, non-revoked revision; pending, failed, revoked,
  deleted, unavailable, mismatched, or missing revisions return a typed
  not-found/unavailable response and never fall back to the latest revision;
- read the revision's recorded `source_key` through `SourceStore.download()`
  with the established source-byte ceiling, off the event loop;
- enforce the recorded size and verify the recorded SHA-256 before returning
  content, treating missing/oversized/corrupt objects as unavailable;
- use an allowlisted MIME type derived from the persisted file type, never an
  uploaded arbitrary HTML/active content type;
- return `X-Content-Type-Options: nosniff`, safe inline disposition with a
  sanitized filename, and `Cache-Control: private, no-store`;
- keep private Storage private: no public bucket change, persistent signed URL,
  arbitrary key/path proxy, or storage credential in the browser;
- preserve Spec 20 behavior by offloading blocking Storage, hashing, and Office
  parsing work and bounding execution/memory.

`representation=original` supports PDF, TXT, MD, and CSV. For DOCX and XLSX,
`representation=text` uses the established parser to return bounded safe plain
text rather than active Office content. The UI labels this as a derived text
preview, not a pixel-perfect original, and discloses extraction truncation when
it occurs. Do not execute macros, resolve external workbook relationships, or
return embedded Office HTML/scripts.

Add the route and representation contract to OpenAPI and the API inventory.
Extend the frontend transport with binary/text response support that preserves
existing credential, API-error, timeout, and abort behavior; do not bypass it
with an unrelated ad-hoc request path.

### 4. Make live citations revision-addressable

Extend the live citation contract, provider stream event, durable turn event,
final message schema, frontend decoders, and transient projection with optional
`document_id`, `revision_id`, `chunk_id`, `chunk_index`, and `page_number` as
applicable. Keep `claim_id`/`locator` for replay and existing source/title/url/
snippet behavior for external citations.

Knowledge-derived citations must be constructed from server-validated
`RetrievedPassage` records. Do not trust a model-echoed document/revision ID or
let a provider citation select an arbitrary Storage object. Preserve the same
source identity through tool execution, streamed citation events, final message
persistence, reload, and the frontend streaming projection.

A live citation with document and revision IDs resolves to that exact revision.
If it has been revoked/deleted or is otherwise unavailable, show the citation
and an honest unavailable state; never substitute a newer revision or fetch its
URL as a preview. External/web citations without document identity retain their
current external-link/text behavior.

### 5. Use the same Files experience in both runtimes

For replay, the Documents tab becomes a read-only **Files** inventory backed by
all package assets, not just recorded shared-document reads. It lists all seven
current assets, including the source register and three participant inputs, and
is available at the initial checkpoint.

For live, retain the existing document upload/status/retry/delete panel and add
the shared preview action to every ready document. Pending, indexing, failed,
revoked, deleted, and unavailable documents do not get a dead preview action.
The shared meeting inventory must not silently mix participant/stack documents
into the shared list; a server-authorized citation can still open such a source
in the same viewer with its scope/provenance shown.

Do not expose raw storage keys or credentials. Replay's `private/*` demo inputs
are `public_demo: true`; label them as demo-authored participant inputs, not as
protected customer data. Live and replay lists may have different surrounding
controls, but not different preview implementations.

### 6. Wire committed and streaming citations to the same host

For every resolvable document citation, show a clear **Preview evidence** action
next to the citation label. The dialog displays the cited excerpt and locator,
then the retained content. Both committed messages and the streaming bubble
must carry the required replay claim or live revision identity and open the
same target before and after commit.

A citation without resolvable evidence keeps its current label/external-link
behavior. Keep an original source URL as a secondary explicit action only; it is
never the in-app preview transport and is never fetched automatically when an
asset/revision fails.

Tighten replay package validation so streamed citation identity, including
`claim_id` and `locator`, is compared with the final message along with source,
title, URL, and snippet. Add equivalent live streamed-vs-final identity tests.

### 7. Render every supported format safely

Use shared format renderers with these behaviors:

- **Markdown:** read-only `react-markdown` + `remark-gfm`; raw HTML disabled,
  safe link schemes only, safe external-link `rel` attributes, and no automatic
  remote image loads.
- **TXT/JSON/derived DOCX/XLSX text:** bounded preformatted text with preserved
  line breaks and honest derived-text/truncation labels where applicable.
- **CSV:** a bounded read-only table or plain-text fallback; treat every cell as
  text, never a formula, and cap rows/columns/cell size before rendering.
- **PDF:** verify the bytes, create a local blob object URL, and use the native
  browser viewer inside the dialog with an unavailable/download-free fallback.
  Do not send the document to Google Viewer or another third-party service.

Publication/package validation must reject a replay asset whose media type has
no supported preview renderer. Live's six accepted upload formats must all have
a working preview path before this spec exits. Native high-fidelity DOCX/XLSX
layout is not required; safe readable text is required.

### 8. Share bounded loading, cancellation, and cleanup

The common loader owns size/type checks, loading/error states, retry, timeout,
and object-URL cleanup. Runtime adapters supply the actual request:

- **Replay:** fetch only the asset's recorded immutable `public_url`, bounded by
  recorded size, with matching MIME and SHA-256 verification before rendering.
  If deployed Storage CORS prevents this, a same-origin fallback may serve only
  the current pinned session's declared public asset with the recorded URL,
  approved origin, size, hash, and MIME. It must never proxy an arbitrary URL or
  expose a Storage credential.
- **Live:** request the exact same-origin revision-content route through the
  authenticated/configured frontend transport. Enforce response size and MIME
  again in the browser; never convert the response into a public/signed URL.

Every load is linked to dialog lifetime and the current runtime/session epoch.
Close, meeting change, checkpoint switch, back/restart, and runtime teardown
abort work and ignore late results. Revoke every blob URL on replacement/close.
Offline, CORS, HTTP, wrong-type, oversize, integrity, parser, and unsupported
errors remain distinguishable and retryable where appropriate. No failure falls
back to `citation.url`.

### 9. Keep provenance and package integrity honest

For live original-byte views, identify the file as an uploaded document and show
its revision identity/status as useful. For derived DOCX/XLSX views, state that
formatting, formulas, embedded objects, and macros are not represented.

For replay, show the recorded source, capture date, rights, and extraction
metadata. Non-authored assets must be labelled as retained source material that
may be an excerpt or transcription rather than the complete original. Authored
assets must be labelled as prepared for the replay, not original historical
documents. The two excluded local PDFs remain excluded unless separately
approved and packaged.

This feature requires no replay package edit: claims and assets already exist,
and the complete asset inventory avoids a document-to-asset mapping. Do not
mutate the approved v1 package bytes or content hash. Any later package schema
or content change requires a new immutable version and release approval.

### 10. Use one accessible preview host

Both Files inventories and all citation actions open the same reusable dialog;
do not mount one dialog per row or message. It must have an accessible title and
description, focus trap/restoration, Escape and visible close actions, keyboard
operation, narrow-screen scrolling, reduced-motion behavior, and clear loading,
empty, unsupported, offline, integrity, and retry states.

The default layout is source/provenance header, cited excerpt/locator when
present, content, and an optional secondary original-source link. Previewing
adds no write, upload, delete, message, or turn capability.

## Tests to write first

### Shared contract and component tests

- Both runtime compositions provide the same preview API and use the same dialog,
  citation trigger, file-preview action, loaders, and format renderers. An
  architecture test rejects runtime-specific duplicate viewers.
- Resolver tests cover replay `claim_id → evidence_asset_id` and live
  `document_id + revision_id`; neither uses filename, title, URL, array order,
  or a hard-coded asset/document ID.
- Format tests cover Markdown/GFM, TXT, JSON, CSV, PDF, and derived DOCX/XLSX
  text. Prove raw HTML/scripts do not execute, dangerous links and remote images
  do not load, CSV formulas remain text, and blob URLs are revoked.
- Loader tests run against both adapters for correct request identity, abort on
  close/epoch end, timeout, HTTP/CORS/offline failure, size overflow, wrong MIME,
  hash mismatch, retry, and stale-response suppression.
- Dialog tests cover accessible naming, keyboard open/close, focus restoration,
  narrow screens, reduced motion, error states, and no stale content after a
  meeting/checkpoint change.

### Live backend and integration

- The content route returns the exact ready revision with safe headers and no
  public/signed Storage URL. Wrong document/revision pairs, caller-supplied
  keys, pending/failed/revoked/deleted/unavailable sources, missing objects,
  oversized objects, and hash mismatches cannot return bytes or substitute a
  newer revision.
- Ownership/scope tests cover shared, participant, and stack sources, including
  a cited non-shared source, without widening the shared document inventory.
- Storage reads, hashing, and DOCX/XLSX parsing run off the event loop and obey
  byte/time budgets. Original PDF/TXT/MD/CSV and derived DOCX/XLSX responses have
  the expected MIME and cannot serve active HTML, macros, or external workbook
  relationships.
- Knowledge citations created from validated retrieval preserve document,
  revision, chunk, page/locator, and snippet through stream, final persistence,
  reload, and frontend projection. Model-provided source IDs cannot select an
  arbitrary revision. Revocation after citation makes preview unavailable.
- Existing upload, retry, deletion/redaction, retrieval eligibility, credential,
  and Spec 20 latency tests stay green.

### Replay backend and integration

- The real session exposes every validated manifest claim and every package
  asset with unchanged package/checkpoint identity. Preview is available at the
  initial checkpoint and the approved package hash remains unchanged.
- Every claim evidence link resolves to one session asset; dangling, duplicate,
  or malformed links fail validation/decoding. Streamed `claim_id`/`locator`
  mismatches with the final message fail validation.
- The Files inventory lists all seven assets, including source-register and all
  three participant inputs, with honest authored/retained/public-demo labels.
- No replay preview path invokes live Knowledge APIs, provider/vault/embedding/
  vector services, storage mutation, or an arbitrary citation URL.

### End-to-end acceptance

- In a live meeting, upload small representative PDF, DOCX, XLSX, CSV, TXT, and
  MD fixtures, wait for ready, and preview all six from the same Files/dialog
  experience. PDF renders locally; DOCX/XLSX show readable derived text and the
  correct disclosure; CSV/TXT/MD remain safe and readable.
- Run a live knowledge-grounded turn and open its citation during streaming and
  after commit/reload. Both open the exact document revision, excerpt, and
  locator. Revoke/delete the source and verify an honest unavailable state with
  no newer-revision or external-URL fallback.
- Using the approved replay package, open all seven Files entries and
  representative CRISIL, HDFC, and participant-input citations. Verify correct
  content, excerpt/locator, and transcription/authored provenance, including a
  streaming citation and back/restart during loading.
- Browser/network evidence shows live bytes only from the same-origin revision
  route and replay bytes only from the declared public asset (or constrained
  same-origin replay route). There is no third-party document viewer, arbitrary
  original-URL fetch, exposed Storage credential, or replay-to-live call.
- Existing live meeting and Spec 19 replay acceptance suites remain green.

## Small implementation slices

1. Add the shared preview descriptor/content contracts and failing architecture/
   renderer/dialog tests, without runtime-specific UI forks.
2. Add the live exact-revision content use case/route, binary transport, and
   security/ownership/event-loop tests.
3. Add live retrieval-backed citation identity through stream, persistence, and
   frontend projection.
4. Add replay session claims, preview availability, strict decoders, and the
   immutable public-asset adapter.
5. Implement the shared bounded loader and all required format renderers against
   mocked live and replay responses.
6. Connect both Files panels and committed/streaming citations to the single
   room-level preview host.
7. Run the six-format live journey and seven-asset replay journey, then record
   accessibility, network, revocation, cancellation, and regression evidence.

## Exit gate

Live and replay previews ship together through one shared viewer and rendering
system. Every ready live document in all six accepted formats and every one of
the seven replay assets can be previewed in-app. Every resolvable knowledge or
replay citation opens its exact validated revision/asset during streaming and
after commit, with honest provenance and no silent fallback. Live private
Storage remains private, revoked content stays unavailable, replay makes no live
calls, source HTML/Office active content never executes, and all cancellation,
accessibility, package-integrity, latency, and existing regression gates pass.
