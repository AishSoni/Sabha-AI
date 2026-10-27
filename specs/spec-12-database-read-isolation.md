# Spec 12 (Phase 3): Database Read Isolation

## Purpose and prerequisites

Make backend-only live database access and genuinely read-only replay access enforceable through effective privileges, not table naming. This is the first Phase 3 safety gate. Read the [roadmap](roadmap-phase-3-hosted-guided-replay.md) and [runtime contract](reference-runtime-modes-and-credentials.md). Do not add authentication or change the shared live HTTP access model.

## Current code and verified caveat

- `backend/migrations/009_tighten_rls_to_backend_writes.sql` grants unrestricted core reads to `PUBLIC`; `013_persona_prompt_locks.sql` does the same for persona/prompt/stack families.
- `025` knowledge, `028` settings, and `029_internal_table_rls.sql` harden other families. Do not undo those protections or claim every table is open.
- `backend/scripts/migrate.py` applies the baseline and numeric migrations in order. A disposable full-chain probe confirmed that a new role granted only demo-table access still inherited live meeting/persona reads from `PUBLIC`.
- `backend/app/platform/database.py` prefers the server service credential. That client is not a read-only replay capability.

Checked-in migration behavior is evidence about reproducible schemas, not an audit of the deployed database. Inventory actual deployed permissions separately before release.

## Bounded scope

Add a forward migration; never rewrite historical migrations or erase records. Inventory live tables, views/materialized views, sequences, functions/RPCs, schemas, role memberships, RLS policies, default privileges, and Storage access. Include existing and future objects created by the actual migration owner. Audit `SECURITY DEFINER`, search paths, ownership, and default `EXECUTE TO PUBLIC` as possible bypasses.

The required permission matrix is:

| Principal | Live application objects | Published replay package/assets | Runtime writes |
| --- | --- | --- | --- |
| Browser-facing `anon`/`authenticated` and an otherwise unprivileged role | No direct live data reads, writes, or internal RPC execution | Only explicitly approved public assets, if any; no database authority implied | None |
| Replay reader | No live reads, writes, or live/internal RPC execution | `USAGE` plus `SELECT` on approved replay objects; asset reads limited to replay | None, including evidence/progress/session/usage |
| Live backend | Required existing live reads, guarded writes and RPCs | Not used to serve replay | Existing live permissions only |
| Offline provisioner | No unnecessary live authority | Validate/publish/version replay data and assets | Provisioning only, never a runtime credential |

Every PostgreSQL role inherits `PUBLIC`. Merely granting less to a new reader does not subtract those privileges. Revoke obsolete public live grants/policies and replace them with explicit backend grants. Do not grant a reader membership in privileged roles or use `BYPASSRLS` to simplify it. The `public` schema name is not the `PUBLIC` role.

The actual replay schema/tables arrive in Spec 17. Establish the role/default-grant contract now and exercise a representative disposable replay table; Spec 17 must re-run the same matrix against real package objects. At this gate select and document the supported connection/authentication mechanism for the reader in the deployed Supabase topology. Test the resulting effective identity, not just a role created in SQL. Keep all credentials server-only and never mutate a shared client's role per request.

## Tests to write first

1. Fresh schema plus full migration chain: seed live sentinels as an administrator, then prove direct reads/writes/internal RPC calls fail under `anon`, `authenticated`, the replay reader, and a new unprivileged role inheriting only normal defaults.
2. Upgrade from the pre-hardening schema with populated meetings/personas/stacks and existing RLS: preserve IDs/values/backend behavior while removing inherited read bypasses.
3. Reader can select its package sentinel but cannot insert/update/delete/truncate, create objects, execute writing functions, read live views, or reach live Storage objects. Include a forbidden function/view path, not tables alone.
4. Create a future table/function as the real migration owner and verify safe default privileges; prove required backend RPCs still work.
5. Exercise the selected real reader connection through the adapter boundary, with no live service-role fallback. Missing reader configuration fails clearly.

Use real disposable PostgreSQL. Extend `backend/tests/integration/test_database_permissions.py` and `test_prompt_function_permissions.py`. Change **full-chain current** expectations that intentionally permit public reads; retain historical tests proving what migration 009 did in isolation. Do not rewrite migration history to make those tests agree artificially.

## Implementation slices

1. Record effective object/role matrix and reproduce the public-read failure.
2. Add the forward migration and explicit backend grants; run fresh and upgrade tests.
3. Establish reader/provisioner role creation and safe default-privilege operations, using a disposable replay object until Spec 17.
4. Test the chosen deployed credential mechanism, document configuration/rotation and inventory queries. Do not apply migrations to a configured hosted database without separate operational authorization.

Review managed Supabase role/Storage constraints using current official documentation. Avoid broad revocations against unrelated managed schemas; scope changes to application-owned objects and intended entry points.

## Exit gate

Real fresh/upgrade tests prove the effective matrix and preserved live backend behavior. Existing knowledge/settings/internal-table protections remain intact. Operational instructions distinguish local evidence from outstanding hosted checks. No new role is advertised as isolated merely because its explicit grants look small.

Next: [Meeting creation regressions](spec-13-meeting-creation-regressions.md).
