# Spec 06 (Phase 2): Persona Catalog and Independent Participants

## Purpose and prerequisites

Separate reusable templates from meeting-owned instances, and make generation inheritance explicit.

- [Backend composition/atomic seams](spec-04-backend-composition-and-transactions.md) and [frontend foundation](spec-05-frontend-transport-and-state.md) accepted.
- Phase 1 snapshot, stack-update, generation-copy, prompt-atomicity, and editor-active-state regressions remain green. Implement `persona_instances`, `persona_history`, `knowledge_boundaries`, and provider configuration spies.
- Agree on field-level inheritance representation and legacy migration rules. An empty/default marker is not evidence of a past effective value; unknown historical assignments remain unknown.
- Read [snapshot/default contracts](reference-architecture-contracts.md#participant-snapshots-and-per-turn-inheritance), [Persona Catalog ownership](reference-architecture-contracts.md#persona-catalog), and target public-interface/import rules.
- Preserve the [runtime/credential contract](reference-runtime-modes-and-credentials.md): participant/shared policy never owns a visitor's plaintext key. Hosted live credentials are transient and independent of snapshots; replay reads fixed catalog/participant records and cannot edit them.

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

Unit, database, API, component, and upgrade cases establish independent A/B instances, coherent snapshots, defaults/overrides, prompt atomicity, editor state, and template deletion with surviving assignments. No live template lookup remains. Persisted snapshots, response DTOs, audits, and caches contain no secrets; only dedicated transient handoff requests may carry visitor credentials. Explicit template adoption is not introduced; replay cannot mutate templates/instances.

Next: [Durable turn queue and unified inference](spec-07-durable-turn-queue-and-inference.md).
