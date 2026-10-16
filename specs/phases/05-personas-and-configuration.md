# Phase 05 — Persona snapshots, prompt integrity and effective settings

Status: draft. Depends on: Phases 00-04; D-09 must be approved. Requirements: R-08, R-09, R-11, R-12, R-16. Defects: B-06, B-07, B-08 backend authority, B-11.

## Objective and outcome

Persona edits are safe and predictable. Existing participants retain their settings until the user reviews and applies a refresh. Prompt activation is atomic. The configuration shown as effective is the one used for inference, while demo mode remains fixture-only.

## Current implementation and affected paths

- `services/persona_manager.py`: multi-step prompt activation/version creation and stack reassignment without transaction boundaries.
- `services/meeting_manager.py`: participant creation from persona omits provider configuration.
- `models/schemas.py` versus `models/persona_schemas.py`: divergent provider configuration shapes, including output-token settings.
- `api/settings.py`: caller-controlled model/test URLs; no authoritative settings-update path.
- `frontend/src/stores/settings-store.ts`: browser-only provider/default/System AI settings and persisted keys disconnected from backend inference.
- `llm/__init__.py` and adapters: global environment resolution bypasses browser preferences; summary selection previously used the first participant.

## Required behavior

Snapshot creation resolves persona preferences and approved defaults into effective non-secret settings. Save prompt version/provenance and knowledge assignments. Historical participant settings remain as recorded; unknown original prompt versions are labeled legacy/unknown rather than guessed from current persona content.

Prompt activation validates target existence before mutation and switches atomically. At most one active prompt is enforced by SQL; every usable persona must have an active prompt or an explicit not-ready state. Concurrent version allocation cannot depend on an unprotected max+1 query.

Refresh preview includes diffs/revisions/assignment changes. Apply is explicit/atomic and rejected during active work, queued messages or non-active meetings. Deleted/unassigned knowledge is excluded from future context; no identity/access policy is required.

Settings authority follows approved D-09: server-managed secrets, server-persisted non-secret preferences, explicit participant overrides and separate System AI settings. Remove false UI claims that a locally tested key automatically drives inference. No secret round-trips in normal settings responses/logs.

Live network destinations must be server-configured/trusted. A trusted local Ollama URL may be permitted for private local use; caller-supplied arbitrary URLs, redirect escapes and unsupported schemes are rejected before transport. Public demo disables network-sensitive settings operations entirely.

## Ordered tasks

Before refactoring, reproduce B-06/B-07/B-08/B-11 with correct denied-destination, inherited-config, effective-settings and preserved-active-prompt assertions. Record each intended red failure, implement its correction, then unify models/extract boundaries with those tests green. Atomic storage changes necessary to fix a defect are part of its correction; new refresh/settings behavior follows its own TDD cases. Generic config/persona work does not seed or implement the demo specialists/journey.

- **P05-T01 — Canonical config model:** unify validated fields and precedence; define unset/default semantics, model compatibility, temperature/output limits and provenance.
- **P05-T02 — Transactional prompt operations:** add active-version invariant, target validation, locked version allocation, revision checks and safe stack-assignment updates.
- **P05-T03 — Participant snapshot creation:** fix config inheritance, separate base instruction from persona extension and record resolved settings/assignments/version.
- **P05-T04 — Refresh use cases:** implement preview/apply with expected revisions, current assignment/document checks and meeting eligibility; return useful conflicts, without introducing user permissions.
- **P05-T05 — Authoritative preferences:** add scoped read/update API for non-secret settings; resolve System AI separately; expose effective settings and readiness without revealing keys.
- **P05-T06 — Restrict destinations:** remove arbitrary live URL behavior; pin approved endpoints, control redirects and validate before every request. Demo composition denies these routes regardless of supplied credentials.
- **P05-T07 — Frontend integration seam:** replace disconnected setters with validated server persistence/status, remove browser-secret persistence under D-09 and prepare review/diff UI for Phase 07.
- **P05-T08 — Legacy migration:** preserve existing prompt history/config, report multi-active/no-active personas, resolve with an approved deterministic mapping or explicit owner decision before constraints. Do not silently delete duplicates.

## Data/API changes

Add participant snapshot provenance/revisions/assignments, persona revisions and server-persisted settings. Provider API secrets stay in server configuration, not persona/message JSON; this is not user authentication. Add prompt-active uniqueness after resolving conflicts. Preview/apply follow CONTRACTS.md; settings distinguish effective/configured fields with typed errors.

Browser storage migration removes old stored keys from the app's persisted settings schema without sending them to a new endpoint. Preserve harmless preferences where meaningful, but do not present unpersisted choices as active server configuration. Explain the migration in release notes.

## TDD cases

- **P05-TEST01:** Activate nonexistent version; previous active version and history are unchanged. Concurrent valid activations leave exactly one active version.
- **P05-TEST02:** Concurrent new-version requests allocate distinct versions; transaction failure does not deactivate the old prompt or lose assignments.
- **P05-TEST03:** Create participants from personas with different providers/models/temperature/output limits; capture exact resolved adapter arguments.
- **P05-TEST04:** Edit persona/defaults; existing participant stays unchanged. Preview shows diff; confirmed apply changes only the intended participant at the expected revision.
- **P05-TEST05:** Stale preview, deleted persona, busy meeting, queued messages or mismatched participant/meeting relationships cannot apply refresh. Removed/deleted stack assignments are not resurrected. No cross-user access test is required.
- **P05-TEST06:** Summary uses System AI configuration, not first participant. Unknown model/provider combinations fail visibly rather than silently choosing another vendor.
- **P05-TEST07:** Arbitrary base URL, redirect to untrusted destination and client mode/provider override never reach forbidden transport. Demo key/model tests remain disabled.
- **P05-TEST08:** Settings save/read/reload produces the same effective config; secrets are absent from responses/logs/new local storage and legacy browser-key migration is safe.
- **P05-TEST09:** Legacy migration preserves prompt content/version IDs and participant configuration while reporting unknown provenance/active-version conflicts.

## Acceptance gate

- **P05-AC01:** B-07/B-11 pass with database-backed concurrency and adapter-argument evidence (TEST01-03, TEST09).
- **P05-AC02:** Snapshot refresh is explicit, conflict-safe and access-aware (TEST04-05).
- **P05-AC03:** B-08 backend authority is fixed, including System AI and meaningful UI persistence feedback (TEST06, TEST08).
- **P05-AC04:** B-06 is closed for live allowed destinations and demo route policy (TEST07).

## Rollout, rollback, exclusions and risks

Backfill before enforcing prompt constraints; stop on ambiguous data rather than choose a random version. Preserve old config columns during the compatibility interval. A rollback cannot safely restore insecure browser-key behavior or arbitrary URLs; disable the affected feature instead. Public BYOK, user credential vaults, automatic persona refresh and broad settings redesign are out of scope. Main risk: silent default precedence changes; snapshot provenance and exact adapter assertions make them visible.
