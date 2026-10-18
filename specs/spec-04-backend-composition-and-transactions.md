# Spec 04 (Phase 2): Backend Composition and Atomic Transactions

## Purpose and prerequisites

Route one accepted use case through real dependency injection and atomic persistence before broad module migration.

- [Foundations](spec-03-foundations-and-contracts.md) accepted, with runnable architecture, regression, and real-adapter harnesses.
- Record the transaction strategy: narrow Postgres RPCs through Supabase, or an explicitly configured direct Postgres transaction adapter. A Python unit-of-work name cannot make sequential SDK calls atomic.
- Inspect backend credential roles, grants, RLS, and function execution rights on a disposable copy. Preserve the shared-workspace gate and local operation; do not silently replace credentials or add owner filtering.
- Adopt [dependency/persistence contracts](reference-architecture-contracts.md#dependency-and-persistence-contracts) and the [backend target layout](reference-architecture-contracts.md#backend-target-layout).

## Scope and file movement

Introduce `backend/app/bootstrap.py`, thin `backend/main.py`, shared presentation assembly/dependencies/errors, the first owning module's domain/application contracts, and its `infrastructure/supabase.py`. Start with a bounded atomic use case such as prompt activation; migrate its real HTTP caller, not only a test-only path.

Current mixed responsibilities are in `backend/app/core/database.py`, `backend/app/api/personas.py`, `backend/app/services/persona_manager.py`, and `backend/app/services/meeting_manager.py`. Keep unmigrated routes working until their own vertical slice is accepted. Do not relocate every schema or create empty modules.

## Tests to write first

- Same activation contract against a fake and real database: nonexistent target preserves old active selection; injected failure rolls back; concurrent operations serialize and retain at most one active version.
- Real atomic creation/assignment contracts: participant insert or mapping failure leaves no partial meeting or replacement. Validate uniqueness and invalid targets with actual constraints.
- Domain/application use case runs with injected fakes and no SDK construction. Presentation maps typed outcomes to safe HTTP errors instead of leaking SQL/provider details.
- Real-role permissions reject anonymous function/table bypass while intended backend credentials work. Re-run local/authenticated shared-workspace and trusted-origin tests.
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
