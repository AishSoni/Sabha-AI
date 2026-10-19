# Spec 04 (Phase 2): Backend Composition and Atomic Transactions

## Purpose and prerequisites

Route one accepted use case through real dependency injection and atomic persistence before broad module migration.

- [Foundations](spec-03-foundations-and-contracts.md) accepted, with runnable architecture, regression, and real-adapter harnesses.
- Record the transaction strategy: narrow Postgres RPCs through Supabase, or an explicitly configured direct Postgres transaction adapter. A Python unit-of-work name cannot make sequential SDK calls atomic.
- Inspect backend credential roles, grants, RLS, and function execution rights on a disposable copy. Preserve no-sign-in shared-workspace access in hosted and local demos; do not silently replace credentials or add owner filtering or a visitor authentication gate.
- Adopt [dependency/persistence contracts](reference-architecture-contracts.md#dependency-and-persistence-contracts) and the [backend target layout](reference-architecture-contracts.md#backend-target-layout).

## Scope and file movement

Introduce `backend/app/bootstrap.py`, thin `backend/main.py`, shared presentation assembly/dependencies/errors, the first owning module's domain/application contracts, and its `infrastructure/supabase.py`. Start with a bounded atomic use case such as prompt activation; migrate its real HTTP caller, not only a test-only path.

Current mixed responsibilities are in `backend/app/core/database.py`, `backend/app/api/personas.py`, `backend/app/services/persona_manager.py`, and `backend/app/services/meeting_manager.py`. Keep unmigrated routes working until their own vertical slice is accepted. Do not relocate every schema or create empty modules.

## Tests to write first

- Same activation contract against a fake and real database: nonexistent target preserves old active selection; injected failure rolls back; concurrent operations serialize and retain at most one active version.
- Real atomic creation/assignment contracts: participant insert or mapping failure leaves no partial meeting or replacement. Validate uniqueness and invalid targets with actual constraints.
- Domain/application use case runs with injected fakes and no SDK construction. Presentation maps typed outcomes to safe HTTP errors instead of leaking SQL/provider details.
- Real-role permissions reject direct browser/anonymous function/table bypass while intended backend credentials work. Anonymous visitors still use the API normally; re-run hosted/local no-sign-in and trusted-origin tests. The SQL `anon`/`authenticated` roles below are database roles, not a visitor sign-in requirement.
- Additive operation/idempotency/order persistence has conditional claims and version/fence guards; test the primitive here, full queue behavior in its later spec.

## Code example: atomic prompt activation at the database seam

Proposed migration fragment for the existing `public.personas`/`public.prompt_versions` tables from `backend/migrations/002_personas.sql`. Choose names/signatures in the real migration history; this is a focused atomic persistence operation, not the whole persona service:

```sql
create function public.activate_persona_prompt(p_persona uuid, p_prompt uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1 from public.personas where id = p_persona for update;
  if not found then
    raise exception 'persona_not_found';
  end if;
  perform 1 from public.prompt_versions
    where id = p_prompt and persona_id = p_persona;
  if not found then
    raise exception 'prompt_not_found';
  end if;
  update public.prompt_versions set is_active = false
    where persona_id = p_persona and is_active;
  update public.prompt_versions set is_active = true
    where id = p_prompt and persona_id = p_persona;
end;
$$;
revoke all on function public.activate_persona_prompt(uuid, uuid)
  from public, anon, authenticated;
```

Before use, explicitly grant execution to the **verified backend role** and test its table/RLS permissions; do not deploy an unusable function or an anonymous bypass. Inspect nonstandard role names before applying role-specific statements. Add an at-most-one-active partial unique index only after checking/repairing existing conflicts. All prompt writers, including version allocation/save and deletion where relevant, must follow the same persona-lock protocol; this fragment alone cannot protect an uncoordinated competing writer. Separate deactivation/activation statements are safe here only because one function call is one real transaction and failures roll back.

See [Supabase function transactions and permissions](https://supabase.com/docs/guides/database/functions). Keep SQL focused on atomic persistence/constraints, not a duplicate application workflow.

## Green and refactor

- Implement narrow ports and typed business errors in the owning module. Composition constructs adapters once with safe lifecycle; HTTP dependencies retrieve injected use cases.
- Run the real caller through the new use case. Mappings/SDK details stay in infrastructure; no domain imports of HTTP DTOs, FastAPI, Supabase, Qdrant, or provider adapters.
- Add the transaction contracts for meeting creation, assignment replacement, and operation claims incrementally as those seams become real; retain Phase 1 tests at each migrated caller.
- Keep database claims/transactions short. No lock spans inference, embeddings, vector calls, parsing, or source transfer. Durable checkpoints/cleanup handle cross-system work later.

## Exit gate

The first production use case uses the new composition path, real rollback/concurrency/permission tests pass, and all defined primitive atomic contracts are established. Existing local startup and supported routes still work. Empty ports and fake-only tests do not satisfy this gate.

Next: [Frontend transport and state](spec-05-frontend-transport-and-state.md), then [Persona catalog and participants](spec-06-persona-catalog-and-participants.md).

## Implemented (spec-04 exit gate, recorded 2026-10)

Thirteen local commits from `27ee559` through this exit-gate commit (all committed locally, nothing pushed). Tests were written red and landed red before their implementations at every seam.

- Strategy recorded before any adapter work (`27ee559`): the transaction-strategy decision gate in the [use-case inventory](reference-api-use-case-inventory.md) now reads DECIDED — **narrow Postgres RPC functions reached through Supabase** — with the explicitly configured direct-Postgres transaction adapter kept on record as the escape hatch at later seams. A Python unit-of-work name was rejected as not making sequential SDK calls atomic.
- Permission audit on a disposable copy (scratch script, findings mirrored here): all seven pre-existing RPC functions (`activate_prompt_version`, `create_prompt_version`, `replace_persona_stacks`, `create_meeting_transaction`, `commit_meeting_ending`, `record_inference_cost`, `increment_meeting_cost`) carried the default `EXECUTE`-to-`PUBLIC` proacl; all were `SECURITY INVOKER` with no `search_path` pin. The persona family (`personas`, `prompt_versions`, `persona_knowledge_stacks`, `knowledge_stacks`) had **RLS disabled** — on hosted Supabase default privileges, anonymous browser credentials could have written these tables directly. No nonstandard backend role names exist; the hosted backend credential is the standard `service_role` (`BYPASSRLS`).
- Red contract first (`c972c82`), then migration `013_persona_prompt_locks.sql` (`92f1cc6`, full chain + upgrade-chain green): both prompt functions hardened with `SECURITY INVOKER` + `SET search_path = ''` and the **persona-lock protocol** (`PERFORM … FOR UPDATE` on the persona row; unknown persona/version answered with `FALSE`/exception, never silent writes); `EXECUTE` revoked from `PUBLIC`, `anon`, `authenticated` and granted to `service_role` for all RPC functions present in each chain (upgrade-safe `DO` block joining `pg_proc` with identity arguments); the persona family put behind RLS with a SELECT-only public policy mirroring migration 009. Shared-workspace reads stay open (no-sign-in doctrine preserved).
- The race contract caught a real latent bug before commit (`dd1dc0f`): activation as one bulk flip `SET is_active = (version = p_version)` transiently violates the partial at-most-one-active unique index when `create_prompt_version` and `activate_prompt_version` interleave — heap order flips the older row active before the newer row flips inactive, and the constraint aborts the winner. Migration 013 landed the spec's own two-step flip (deactivate others whose version differs, then activate the target) and the concurrent create+activate contract proves exactly one active version survives every interleaving.
- Shared activation contract (`0dad68f`): eight behaviors written once and executed against every world in `_WORLDS` — unknown-persona and unknown-version activations refuse while preserving the previous selection; successful activation replaces; a failed revision creation rolls the whole write back (content `NOT NULL` as the injection vehicle); unknown-persona creation persists nothing; successful creation appends and activates; concurrent activations retain at most one active; concurrent create+activate leaves exactly one active. Two worlds: the real disposable Postgres reached through the supabase-stub SQL translation, and the in-memory lock-serialized fake port that joins `_WORLDS` in the same file when the module lands (`a315bf4`). Contract functions import no app code.
- Operations primitive pinned red (`faf80f3`), then migration `014_operations_primitive.sql` (`2cbe78f`): an `operations` table (`request_key` unique, claimant, `pending|processing|done`, `fence_version`, admission sequence number, timestamps) with `claim_operation` (conditional `INSERT … ON CONFLICT DO NOTHING`; only the same claimant in `processing` state can renew and each renew bumps the fence; anything else answers `NULL`) and `publish_operation` (publish only with the current fence and while `processing`). Table grants deny `public`/`anon`/`authenticated` and RLS is enabled **with no policy by design**: internal state reachable only through the backend credential. Function `EXECUTE` follows the same guarded grant posture as 013. Five pinned behaviors: renew keeps the operation and increments the fence; competing claims produce one winner and one refusal; a stale-owner publish is rejected while the live fence succeeds; a completed operation refuses further claims; admission order grows across distinct operations. The queue behavior that consumes this primitive stays with its own later spec, exactly as the spec directs.
- First composed module (`a315bf4` → `bef2018`): `app/modules/persona_catalog` carries the slice — `domain/activations.py` (frozen outcome dataclasses; business refusals are values), `application/contracts.py` (`PromptCatalogPort` Protocol + `PromptCatalogUnavailable`), `application/use_cases.py` (`ActivatePromptVersion` mapping the port's boolean to typed outcomes), `infrastructure/supabase.py` (lazy client accessor; supabase `APIError`/transport failures translated to the typed unavailable error, never to business refusals), `presentation/http.py` (2026 route: 200 message shape preserved, refusal → 404 safe detail). `app/bootstrap.py` composes the app once: frozen `Container` (`production()` wires `SupabasePromptCatalog(get_supabase)` lazily), `create_app()` preserving FastAPI metadata, CORS, the demo guard, and the recovery startup lifespan verbatim; `app/presentation/{router,dependencies,errors}.py` mount the legacy routers plus the module router and register the central 503 handler that never leaks SQL/provider detail; `main.py` shrinks to `app = create_app()` keeping `uvicorn main:app` and all startup behavior.
- SDK isolation proven (`0bc14ae`): the persona_catalog application/domain use case executes inside a subprocess where `supabase`, `qdrant_client`, `openai`, `cohere`, `anthropic` **and `fastapi`** are raising stubs wired before import; outcome types and the fake port flow work end-to-end and the final sweep proves no stub was replaced by a real module. Composition route behaviors are pinned first (`3324fae`, red via `app.bootstrap` import) and stay green through the cutover.
- Cutover (`ee81f07`): `POST /api/personas/{persona_id}/prompts/{version}/activate` now answers exclusively through the module composition (dependency retrieves the injected use case from `app.state.container`); the legacy duplicate handler in `app/api/personas.py` was deleted in the same commit. All other persona routes stay legacy until their own vertical slice (spec-06); `PersonaManager` remains for them. Baseline regression and characterization suites required no behavioral repairs.
- Sweep evolution, recorded as a decision (`ee81f07`): the no-sign-in source scan no longer treats a bare `Depends(` as authentication proof — composition legitimately introduces plain FastAPI dependency injection for use cases. Auth-shape detection is now by callable-name fragments (`auth`, `user`, `token`, `jwt`, `credential`, `session`, `security`, `permission`) plus absolute `Security(`; the planted probe keeps the sweep non-vacuous, and the real visitor read/write flows are untouched and green.

Commands and results: backend full suite `venv\Scripts\python.exe -m pytest -q` → **231 passed** in 4:33 (embedded disposable Postgres only; 63 warnings, all pre-existing pydantic class-Config / utcnow / supabase-client / pyiceberg-pyparsing deprecations); focused composite run (contract + application + architecture) → **39 passed**; frontend confirm-untouched `npm run test` → **79 passed / 17 files**, `npm run test:architecture` → **7 passed**.

### Limitations (recorded honestly; never claimed as executed)

- The hosted Supabase cluster was never contacted: real-database contracts run on embedded disposable Postgres through the supabase-stub SQL translation, and permission probes run under local `anon`/`authenticated`/`service_role` stand-ins mirroring the hosted roles. No paid inference and no external network calls.
- `PersonaManager` and the adapter still issue synchronous supabase calls inside async handlers — compatibility posture from the legacy tree; latency restructuring is queued to the orchestrator decomposition slices (spec-07/08), not this seam.
- Meeting-creation/assignment-replacement transaction contracts are deliberately not exercised here beyond the retained Phase 1 regression tests: the spec directs adding those contracts as each seam becomes real (spec-07/08). The operation-claims primitive is established at this seam instead.
- The `operations` table has no queue consumer yet; its primitive contracts are the deliverable of this spec.
- RLS for `documents`, `inference_events`, and `pending_vector_cleanup` remains deferred to spec-09 (recorded in the audit); the persona family was this spec's scope.
- History retained: migration 013 carries duplicated section header comments from its evolution; they are cosmetic and were committed as-is deliberately.
