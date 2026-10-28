# Database permission model

Sabha's browser client never connects to Supabase directly; every request goes
through FastAPI. Database access is therefore split by **effective Postgres
privilege**, not by table naming or by which credential a process happens to
hold. This document is the operator reference for that split and for the
inventory command that proves it.

## Identities

| Identity | Used by | Must be able to |
| --- | --- | --- |
| `anon`, `authenticated` | Browser-facing Supabase roles (unused by Sabha today) | Nothing in `public` or `replay` |
| Unprivileged new role | Any future role that inherits normal defaults | Nothing in `public` or `replay` |
| `service_role` | Live backend (`SUPABASE_SERVICE_KEY`) | Read/write live tables, execute backend RPCs |
| `sabha_replay_reader` | Replay runtime (through a dedicated login role) | `USAGE` + `SELECT` on published replay objects only |
| `sabha_replay_provisioner` | Offline package publisher | Create/version replay objects and read source assets; no live reads |

Every role inherits `PUBLIC`. Granting a new reader "only a few tables" does not
subtract the historical `GRANT SELECT ... TO PUBLIC`; the grant must be revoked
and replaced with explicit backend grants. `public` is a schema; `PUBLIC` is
the pseudo-role every role belongs to.

## Observed starting state (before isolation)

Measured with the inventory command against the full checked-in history through
migration `029_internal_table_rls`, with a `sabha_probe` role that holds no
explicit grants:

| Object family | anon / authenticated / new role | service_role |
| --- | --- | --- |
| `meetings`, `ai_participants`, `messages`, `disagreements`, `consensus` | **SELECT allowed via `PUBLIC`**; writes denied by RLS | read/write |
| `personas`, `prompt_versions`, `knowledge_stacks`, `persona_knowledge_stacks` | **SELECT allowed via `PUBLIC`**; writes denied by RLS | read/write |
| `documents`, `inference_events`, `pending_vector_cleanup`, `system_ai_settings`, `schema_migrations` | denied (migration 025/028/029) | read/write |
| Live RPCs | `EXECUTE` denied by migrations 013+ | `EXECUTE` allowed |
| Schema `public` | `USAGE` allowed | `USAGE` allowed |

The nine readable families are exactly the tables that migration
`009_tighten_rls_to_backend_writes` and `013_persona_prompt_locks` granted to
`PUBLIC`. The RLS policy on each is `FOR SELECT USING (true)`, so a role with
only inherited privileges can read every live row.

## Isolated state after migration 030

`030_database_read_isolation` closes that inheritance for fresh installs and
for upgrades in one forward step:

- `PUBLIC`, `anon` and `authenticated` lose `USAGE` and `CREATE` on `public`,
  and lose all table, sequence and function privileges in it.
- The nine `FOR SELECT USING (true)` policies are dropped; RLS stays enabled,
  so a later accidental table grant still exposes no rows.
- `service_role` receives the live backend capability explicitly: schema
  `USAGE`, table `SELECT/INSERT/UPDATE/DELETE`, sequence `USAGE/SELECT`, and
  function `EXECUTE`.
- Default privileges are set for the migration owner in `public`: `PUBLIC`,
  `anon` and `authenticated` stay closed for future tables, sequences and
  functions; `service_role` keeps the backend capability. Function `EXECUTE`
  is also revoked from `PUBLIC` globally, because schema defaults are additive
  to the global default.
- The knowledge/settings/internal protections from `025`–`029` are re-asserted
  by the same revokes, not weakened.

The tests prove this on a fresh chain and by applying `030` to a populated
pre-isolation database. The live backend now requires `SUPABASE_SERVICE_KEY`;
`app/platform/database.py` raises `DatabaseConfigurationError` instead of
falling back to the anon key.

## Target state

| Capability | `anon` / `authenticated` / new role | Replay reader | Live backend | Provisioner |
| --- | --- | --- | --- | --- |
| `USAGE` on `public` | no | no | yes | no |
| Live table read/write | no / no | no / no | yes / yes | no / no |
| Live RPC execute | no | no | yes (explicit list) | no |
| `USAGE` on `replay` | no | yes | no (not needed) | yes |
| Published replay table read | no | yes | no (not needed) | yes |
| Replay writes / DDL | no | no | no | yes |
| Replay assets | no | published package only | no | stage/publish only |

The actual replay schema and package tables arrive in Spec 17. Spec 12 proves
the role and default-privilege contract with a disposable replay table; Spec 17
re-runs the same matrix against the real objects.

## Provisioning the replay roles

Role creation is cluster-level, so it is an idempotent operator command rather
than a migration. Run it with the administrator `DATABASE_URL`:

```powershell
cd backend
python -m scripts.replay_roles --reader-login sabha_replay_login
python -m scripts.replay_roles --reader-login sabha_replay_login --check
```

The script creates two NOLOGIN group roles (`sabha_replay_reader`,
`sabha_replay_provisioner`), the `replay` schema, and safe default privileges.
It refuses to put either role in `service_role`, `authenticator`, `anon`,
`authenticated`, `postgres` or `supabase_admin`, and it removes any live
`public` access from them. Re-running preserves explicit reader grants on
published replay objects and revokes only browser-facing access.

`--reader-login` optionally creates a LOGIN role that is a member of the reader
group. The password is set by the operator; the script never handles one.
`--check` reports violations and exits non-zero. Spec 17's publish tooling is
the only code that grants the reader `SELECT` on a published replay object.

Do **not** create the replay roles with `service_role` membership or
`BYPASSRLS`, and do not reuse the live database role.

## Reader connection contract

The strict replay runtime uses a dedicated PostgreSQL connection, selected
over a custom-role JWT because the effective login identity is directly
verifiable:

```text
REPLAY_DATABASE_URL=postgresql://sabha_replay_login:<password>@<host>:5432/postgres
```

Use a session/direct connection, not the transaction pooler: the adapter sets
`default_transaction_read_only`-equivalent session state. `backend/app/platform/replay_database.py`
is the only supported entry point. `connect_replay_reader()`:

- refuses an empty or non-PostgreSQL URL and never consults `DATABASE_URL` or
  `SUPABASE_SERVICE_KEY`;
- rejects a superuser, `BYPASSRLS`, `service_role`-member or live `public`-USAGE
  identity before yielding the connection;
- forces the session read-only after verifying the identity.

The URL is server-only. Never send it to the browser, log it, or place it in a
frontend environment file. Rotation: create a new login role and grant it the
reader group, update the secret and restart the replay runtime, then drop the
old login. `--check` and the inventory command must pass after rotation.

Replay asset/Storage access is not part of this connection; it is provisioned
and verified with the real package in Spec 17.

## Inventory command

The audit is read-only (the session is forced into a read-only transaction) and
prints either Markdown or JSON:

```powershell
cd backend
python -m scripts.inventory_permissions --format markdown
python -m scripts.inventory_permissions --format json --output permissions.json
```

It reports role attributes and memberships, schema/relation/function ACLs, RLS
policies, default privileges, and the effective `has_*_privilege` answer for
`anon`, `authenticated`, `service_role`, both replay roles, and any role passed
with `--role`. Use it before and after deploying the isolation migration, and
again on the hosted project. A correct post-030 snapshot shows no readable live
relation or executable live function for `anon`, `authenticated`, a plain new
role, or either replay role, while `service_role` keeps its live capability.

## Outstanding hosted checks

- Applying `030` to the configured hosted database is a separate,
  operator-authorized deployment step; no test or local command touches it.
- Hosted Supabase grants defaults to `anon`, `authenticated` and `service_role`
  on new `public` objects. The migration sets `ALTER DEFAULT PRIVILEGES` for its
  owner; a hosted inventory must confirm a test object created by that same
  owner is closed to browser roles and readable by `service_role`.
- Role/schema creation on hosted Supabase requires operator authorization.
  Confirm the migration connection is allowed to create the reader schema, or
  run the provisioning script as the project owner and record the result.
- Storage policies and replay asset access are provisioned and verified with
  the real replay package in Spec 17.
- The hosted connection topology for `REPLAY_DATABASE_URL` must be confirmed
  (direct/session connection, TLS, password rotation). Local tests prove the
  role contract, not hosted network policy.
