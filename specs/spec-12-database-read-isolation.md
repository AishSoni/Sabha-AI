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

## Completion record

Recorded 2026-10-28 at commit `76fffe6` (implementation commits `502002d`,
`1cd8a90`, `00a4b2a`, `8f27b36`, `1214f7f`, `a7297eb`, `38d008f`, `df36f84`,
`76fffe6`). Every result below was produced by a command run against the
checked-out tree; no hosted database was contacted.

### Verdict

Spec 12 exits for the checked-in/local evidence. The effective live matrix,
the forward upgrade, the replay reader/provisioner contract and the reader
adapter boundary are proven on real disposable PostgreSQL.

Hosted acceptance remains conditional and is recorded rather than implied:

- Migration `030` has **not** been applied to the configured hosted Supabase
  project. That requires separate operational authorization.
- Hosted default ACLs, role/schema creation permissions, the reader network
  path/TLS and Storage policies must be confirmed with the operator inventory.
  Local tests prove the role model, not the managed project's behavior.
- Replay package tables and asset/Storage authorization arrive in Spec 17; the
  local tests exercise a representative published table and a `storage`
  schema stub.

### Executed evidence

| Command | Working directory | Result |
| --- | --- | --- |
| `pytest -q` | `backend/` | **611 passed**, 27 warnings |
| `pytest tests/integration/test_database_permissions.py -q` | `backend/` | **10 passed** |
| `pytest tests/integration/test_prompt_function_permissions.py -q` | `backend/` | **5 passed** |
| `pytest tests/integration/test_replay_reader_permissions.py -q` | `backend/` | **8 passed** |
| `pytest tests/integration/test_permission_inventory.py -q` | `backend/` | **2 passed** |
| `pytest tests/unit/test_database_client.py tests/unit/test_replay_database_client.py -q` | `backend/` | **6 passed** |
| `pytest tests/acceptance/test_spec11_cutover.py tests/acceptance/test_spec11_fresh_checkout.py -q` | `backend/` | **7 passed** |

The full suite ran alone against a fresh disposable cluster
(`SABHA_TEST_PG_HOME=C:\conda_tmp\opencode\sabha-test-pg-spec12d`), because the
shared acceptance cluster can retain processes between runs. Warnings are
third-party (`pyiceberg`, `supabase`) plus the existing pydantic class-config
deprecation; Sabha code adds none.

What the tests prove:

1. **Pre-isolation reproduction.** A role with no explicit table grants reads
   live `meetings` through the historical `PUBLIC` grant on the chain before
   `030`; `documents` is already denied. The inventory records the nine open
   families.
2. **Fresh full chain.** `anon`, `authenticated` and a new unprivileged role
   have no live schema usage, table read/write, sequence or RPC capability.
   Direct reads, writes, truncates, internal-table reads and `CREATE TABLE`
   fail under the real role.
3. **Populated upgrade.** Applying `030` to the pre-isolation schema preserves
   meeting/persona/stack IDs and values and the live backend's reads, updates
   and `increment_meeting_cost`.
4. **Future objects.** A table, view, sequence and function created by the real
   migration owner inherit safe defaults: browser/unprivileged roles are
   denied, `service_role` reads/writes/executes.
5. **Replay roles.** `scripts/replay_roles.py` is idempotent and `--check`
   reports no violations. The reader selects only its explicitly published
   object, cannot read unpublished replay objects, live tables, a live view,
   the `storage` schema stub, or execute live RPCs, and cannot write, truncate,
   create objects or create schemas. The provisioner can publish replay objects
   but cannot read live data.
6. **Real reader identity.** A dedicated LOGIN member of
   `sabha_replay_reader` connects through
   `app/platform/replay_database.py`; the adapter verifies the effective
   identity, rejects superuser/`BYPASSRLS`/live identities, forces a read-only
   session, and fails clearly when `REPLAY_DATABASE_URL` is missing without
   consulting `DATABASE_URL` or the service key.

### Deliberate scope and manual rollback

- No historical migration was rewritten. The historical `009`-in-isolation and
  `013`-in-isolation tests remain as evidence of their original behavior.
- The live backend now requires `SUPABASE_SERVICE_KEY`; the anon fallback is
  gone. The frontend never used a Supabase client, so no browser surface lost a
  capability it relied on.
- `030` has no down migration. Manual rollback would re-grant live reads and
  recreate the old policies, which is not a supported security state; restore a
  verified backup instead.
- Replay roles/schema are operator-provisioned, not migration history, because
  role creation is cluster-level and hosted needs operator authorization.

### Outstanding hosted gates

- Apply `030` through the normal migration runner with an operator-approved
  backup and maintenance window; then run
  `python -m scripts.inventory_permissions --format markdown` against the
  hosted project.
- Confirm the migration owner's `ALTER DEFAULT PRIVILEGES` entries in
  `pg_default_acl` and test a new object created by that owner.
- Provision or authorize `sabha_replay_reader`, `sabha_replay_provisioner` and
  the `replay` schema on hosted; set the reader password and server-only
  `REPLAY_DATABASE_URL` through the secret manager, not source control.
- Confirm the chosen direct/session connection path, TLS, rotation and
  `--check` behavior against the hosted topology.
- Spec 17 must re-run the matrix for real replay package tables, views and
  Storage assets, including signed-asset access limited to replay.
