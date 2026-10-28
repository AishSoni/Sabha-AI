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
again on the hosted project.

## Outstanding hosted checks

- Hosted Supabase grants default privileges to `anon`, `authenticated` and
  `service_role` on new `public` objects. The isolation migration sets
  `ALTER DEFAULT PRIVILEGES` for the migration owner; a hosted inventory after
  the next migration must confirm the setting applies there.
- Storage policies and replay asset access are provisioned and verified with
  the real replay package in Spec 17.
- Role/schema creation on hosted Supabase requires operator authorization; the
  checked-in provisioning script is idempotent and does not run as part of the
  migration history.
