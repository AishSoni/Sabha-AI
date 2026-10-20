# Spec 06 (Phase 2): Persona Catalog and Independent Participants

## Purpose and prerequisites

Separate reusable templates from meeting-owned instances, and make generation inheritance explicit.

- [Backend composition/atomic seams](spec-04-backend-composition-and-transactions.md) and [frontend foundation](spec-05-frontend-transport-and-state.md) accepted.
- Phase 1 snapshot, stack-update, generation-copy, prompt-atomicity, and editor-active-state regressions remain green. Implement `persona_instances`, `persona_history`, `knowledge_boundaries`, and provider configuration spies.
- Agree on field-level inheritance representation and legacy migration rules. An empty/default marker is not evidence of a past effective value; unknown historical assignments remain unknown.
- Read [snapshot/default contracts](reference-architecture-contracts.md#participant-snapshots-and-per-turn-inheritance), [Persona Catalog ownership](reference-architecture-contracts.md#persona-catalog), and target public-interface/import rules.

## Bounded scope and paths

Move template CRUD, prompt history/activation, template settings, and stack assignment replacement from `backend/app/services/persona_manager.py` and persona routes into `modules/persona_catalog/{domain,application,infrastructure,presentation}/` with `public.py` exposing coherent creation snapshots.

Move participant construction into Meetings use cases/adapter, not a live catalog lookup during inference. Supporting settings resolution belongs to `capabilities/configuration/`. Migrate roster/history/settings interactions into `features/persona-catalog/` and the relevant Settings feature APIs without changing URLs.

## Tests to write first

- Create participant A from template revision A. Edit identity/prompt/explicit overrides/stack A→B; create participant B. After reload, A uses its own copied values and A bindings, B the new values/B bindings. Delete template: surviving instance bindings remain.
- A queued turn with inherited fields uses defaults at execution start, not enqueue/creation. Change defaults mid-tool-loop: running settings remain fixed, next turn resolves the new revision. Explicit values, including temperature zero, never become inheritance accidentally.
- Resolve provider before compatible model/parameters; invalid combinations fail visibly without silently calling another paid provider. Record effective settings/provenance with no credential bytes.
- Fail/concurrently run prompt saves/activation and mapping replacement against real constraints; preserve prior valid state on failure. UI has one canonical active row; later unsaved edits stay dirty after an earlier save completes.
- Upgrade legacy participants without inventing missing assignments/settings. Live stack contents and actual source deletion follow the Knowledge policy, not immutable-content claims.

## Code example: immutable data, explicit policy

Proposed data fragment for `modules/meetings/domain/models.py`, not a replacement for existing complete schemas. The fields intentionally distinguish saved template overrides from operation-effective values. Validation, persistence, and serialization must be added at the owning boundary:

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class GenerationPolicy:
    provider_override: str | None
    model_override: str | None
    temperature_override: float | None
    max_tokens_override: int | None

@dataclass(frozen=True)
class ParticipantSnapshot:
    template_id: str | None
    prompt_text: str
    stack_ids: tuple[str, ...]
    generation: GenerationPolicy

def resolve_temperature(policy: GenerationPolicy, inherited: float) -> float:
    value = policy.temperature_override
    return inherited if value is None else value

def test_zero_is_an_explicit_temperature():
    policy = GenerationPolicy(None, None, 0.0, None)
    assert resolve_temperature(policy, 0.7) == 0.0
```

Persist identity/role/color and prompt/base-prompt revision or equivalent text too; those required fields are omitted from this **policy-focused** fragment. Template IDs are provenance only. Use a coherent snapshot transaction/interface rather than independently reading a prompt and assignments that can change between calls. Full settings resolution must validate provider/model and freeze one effective configuration per operation, not repeatedly call this helper throughout a tool loop.

## Green and refactor

- Implement one catalog edit/snapshot → meeting creation → turn settings vertical slice, then migrate remaining catalog callers. Module public interfaces expose use cases/contracts, never raw repositories or eager SDK clients.
- Persist explicit/inherit policy and participant-owned stack bindings; preserve template deletion semantics and historical rows through additive migrations.
- Resolve/store effective configuration at execution start via injected configuration contracts, with non-secret credential references only. Voting resolves each participant policy; summary System AI gets its own configuration path in the closing spec.
- Use feature Query state for canonical history/configuration, React for draft/edit revision, and scoped mutations that cannot overwrite a later edit or activation.

## Exit gate

Unit, database, API, component, and upgrade cases establish independent A/B instances, coherent snapshots, valid defaults/overrides, prompt atomicity, correct editor state, and template deletion with surviving assignments. No live template configuration lookup remains in the migrated execution path. Secrets are absent from DTOs/audits/cache. Explicit template adoption is not introduced.

## Implemented (spec-06 exit gate, recorded 2026-10)

Sixteen local commits from `9d6a807` through `c75351f` (all committed locally, nothing pushed), plus this exit-gate record. Tests were written red and landed red before their implementations at every seam; each commit subject names the behavior or boundary it sets.

- Independent-participant fixtures first (`9d6a807`): the persona instance fixture contract was extended so participant A (created from template revision A, then edited) and participant B (created after the edit) can be proven independent — A keeps its own copied values and bindings after reload, and deleting the template leaves surviving instance bindings intact.
- Template catalog contract, then module (`2f329f6` red → `9661b44`): `app/modules/persona_catalog` now owns template CRUD, prompt history/activation, and stack-assignment replacement behind transactional snapshot RPCs (migration `015_persona_catalog_transactions.sql`) — creation is one atomic coherent-snapshot call, updates are guarded (omitted fields change nothing; explicit nulls clear), and business refusals are typed values while transport/SDK failures surface as a typed unavailable error, never as fake business outcomes.
- Participant construction from coherent snapshots (`02e10b8`): meeting creation builds participants by copying template identity/prompt/overrides/bindings through the catalog snapshot interface, so a template edit between two creations cannot leak into an earlier participant, and inference never performs a live catalog lookup.
- Explicit-only generation policy (`272c448` red → `d6742bf`): additive migration `016_participant_generation_policy.sql` adds `ai_participants.generation_policy` JSONB with the frozen `GenerationPolicy` semantics — `None` = inherit, a recorded value = explicit (temperature `0.0` is explicit, never accidental inheritance). Legacy participant rows keep their `provider_config` verbatim: no policy content is derived and nothing is backfilled; unknown historical assignments remain unknown.
- Frozen effective settings (`c8ec417` red → `3732a00`): `resolve_effective_settings` combines the participant policy with injectable `GenerationDefaultsSource` defaults once per turn start. Inherit markers resolve visibly (an empty-string provider/model inherits; the model falls out of `settings.<provider>_default_model`), provider is resolved before compatible model/parameters, and invalid combinations fail visibly instead of silently calling another provider. The resolved value is frozen for the whole turn — mid-tool-loop default changes affect only later turns.
- Effective record persisted (`1ac4acf` red → `f93f6bb`): migration `017_message_effective_generation.sql` adds `messages.effective_generation` JSONB, written on the turn's final assistant message as the eight-key record `{provider, model, temperature, max_tokens, base_url, credential_reference, provenance}` — provenance without secrets; credential bytes never enter DTOs, audits, or persisted records.
- Execution path cutover (`6158645` red → `936d22d`): the orchestrator resolves effective settings once at turn start and assembles the participant's knowledge scope through `MeetingManager.ensure_participant_knowledge_scope`; `provider_api_key` continues to be passed unconditionally to `get_provider` (legacy semantics — server-key self-fallback lives inside the transports). An architecture test (`backend/tests/architecture/test_execution_path_persona_isolation.py`) pins that the execution path reads no template tables.
- Route cutover (`24b7124` red → `47be0cc`): every persona template route is served by `app/modules/persona_catalog/presentation/http.py` through the composition container's `persona_catalog` port; the legacy `app/api/personas.py` router and `app/services/persona_manager.py` were deleted in the same commit. `openapi.json` and `generated.ts` were regenerated (31 paths; drift tests green).
- Frontend boundary and screens (`1bd9139` red → `c75351f`): a checker rule (`RULE_ROSTER_SCREEN_LEGACY_IMPORT`) holds `src/app/roster/**` to the persona-catalog feature, and fixing it exposed a pre-existing checker bug — the live scan rooted at `src/`, so every `src/...`-prefixed rule was dead code on the real tree (only bare-SDK imports ever fired); the live scan now roots at the project root and genuinely enforces all rules. The roster, persona editor, and new-persona screens moved into `features/persona-catalog/ui/` as thin route mounts; the feature client gained full CRUD plus prompt-version create/activate with strict decoders (per-field nullable `provider_config`: `null` = inherit); the knowledge feature gained `stackClient.list` behind its root barrel; `CreateMeetingRoomDialog` reads the roster through `personaClient`. The prompt-controls regression (single active revision, dirty-state discipline) moved with the screen (89% rename) and stays green.

Commands and results: backend full suite `venv\Scripts\python.exe -m pytest -q --no-header -p no:warnings` → **328 passed** in 6:04 (embedded disposable Postgres; migrations 015–017 ride the normal upgrade chain in `SCHEMA_FILES`); frontend full suite `npm run test` → **162 passed / 28 files**; `npx tsc --noEmit` shows exactly the pre-existing baseline errors (two stale `.next` validator misses, legacy store-selector and store-test typings, settings-store persist-migrate typing) — no new TypeScript debt from this spec.

### Limitations (recorded honestly; never claimed as executed)

- No separate `persona_instances`/`persona_history` tables were introduced: participants remain `ai_participants` rows carrying copied values plus the additive `generation_policy` column, and prompt history remains `prompt_versions`. The transactional snapshot RPCs (015) provide the coherent-creation seam the spec asks for; a physical instance-table split was not part of this slice set.
- Effective generation settings are persisted only on the turn's final assistant message; intermediate streaming events and tool-loop steps do not carry the record.
- Omitting `provider_config` on persona CREATE now yields an all-inherit carrier (documented behavioral change); recorded numbers stay explicit, and clearing requires explicit nulls.
- Legacy `personas.provider_config` rows with empty-string provider/model markers inherit at execution start; nothing backfills historical rows into policy form, so past effective values remain unknown by design.
- The roster screens still load through `useEffect` + feature-client calls (behavior-preserving move); adopting `usePersonaList`/Query ownership for the roster list and editor reads is left for the later UI slices.
- One carried-over `react-hooks/exhaustive-deps` warning remains on the editor screen's load effect (pre-existing pattern, left as-is); `tsc` is not a gated check in this repo.
- No hosted Supabase cluster, paid inference, or external network was contacted: database contracts run on embedded disposable Postgres through the supabase-stub SQL translation.
- Template adoption (turning a participant back into a template) was deliberately not introduced, per spec.

Next: [Durable turn queue and unified inference](spec-07-durable-turn-queue-and-inference.md).
