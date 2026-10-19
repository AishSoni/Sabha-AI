-- Operations primitive: additive idempotency/order persistence (spec 04).
--
-- One table + two narrow RPC functions back the later queue/recovery
-- specs: request-keyed, conditionally-claimed operations with fence
-- version guards and a persisted admission order. Additive: no existing
-- workflow changes; current writers stay untouched.
--
-- Semantics pinned by tests/contract/test_operation_claims_contract.py:
-- - claim_operation inserts the row atomically on the unique request key
--   (first claimant wins with fence_version 1); a re-claim by the SAME
--   claimant while the operation is processing is a renewal and
--   increments the fence; a different claimant - or any call after
--   completion - gets NULL instead.
-- - publish_operation completes the row only for the claimant holding
--   the CURRENT fence (fence-version CAS against stale snapshots) and
--   reports FALSE otherwise, leaving the operation processing.
--
-- Posture mirrors migration 013:
-- - SECURITY INVOKER with search_path='' and schema-qualified names;
-- - function EXECUTE revoked from PUBLIC/anon/authenticated and granted
--   to the backend service role (dynamic DO block, upgrade-safe);
-- - the table is internal workflow state: RLS enabled with no policies
--   and no PUBLIC grants, so anonymous sessions cannot reach it; the
--   backend reaches it through the granted functions.

-- --------------------------------------------------------------------------
-- 1) Table + admission order.
-- --------------------------------------------------------------------------

create sequence if not exists public.operations_admission_seq;

create table if not exists public.operations (
    id uuid primary key default gen_random_uuid(),
    request_key text not null unique,
    claimant text,
    status text not null default 'pending'
        check (status in ('pending', 'processing', 'done')),
    fence_version integer not null default 0,
    admission integer not null
        default nextval('public.operations_admission_seq'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists operations_status_admission_idx
    on public.operations (status, admission);

-- --------------------------------------------------------------------------
-- 2) Conditional claim (create-or-renew on the request key).
-- --------------------------------------------------------------------------

create or replace function public.claim_operation(
    p_request_key text,
    p_claimant text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_row public.operations;
begin
    insert into public.operations
        (request_key, claimant, status, fence_version)
    values
        (p_request_key, p_claimant, 'processing', 1)
    on conflict (request_key) do nothing
    returning * into v_row;

    if not found then
        -- Row exists: renewal only for the incumbent claimant while the
        -- operation is processing. Competing claimants and completed
        -- operations refuse (NULL).
        update public.operations
        set fence_version = fence_version + 1,
            updated_at = now()
        where request_key = p_request_key
          and claimant = p_claimant
          and status = 'processing'
        returning * into v_row;
    end if;

    if not found then
        return null;
    end if;

    return to_jsonb(v_row);
end;
$$;

-- --------------------------------------------------------------------------
-- 3) Fence-guarded publish (the stale owner cannot finish the operation).
-- --------------------------------------------------------------------------

create or replace function public.publish_operation(
    p_operation_id uuid,
    p_expected_fence integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
    update public.operations
    set status = 'done',
        updated_at = now()
    where id = p_operation_id
      and fence_version = p_expected_fence
      and status = 'processing';

    if not found then
        return false;
    end if;

    return true;
end;
$$;

-- --------------------------------------------------------------------------
-- 4) Function execution: no anonymous/browser bypass of the primitives.
-- --------------------------------------------------------------------------

do $$
declare
    seq record;
    target text[] := ARRAY[
        'claim_operation',
        'publish_operation'
    ];
begin
    for seq in
        select p.proname, pg_get_function_identity_arguments(p.oid) as args
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any(target)
    loop
        execute format(
            'revoke all on function public.%I(%s) from public', seq.proname, seq.args
        );
        if exists (select from pg_roles where rolname = 'anon') then
            execute format(
                'revoke all on function public.%I(%s) from anon', seq.proname, seq.args
            );
        end if;
        if exists (select from pg_roles where rolname = 'authenticated') then
            execute format(
                'revoke all on function public.%I(%s) from authenticated', seq.proname, seq.args
            );
        end if;
        if exists (select from pg_roles where rolname = 'service_role') then
            execute format(
                'grant execute on function public.%I(%s) to service_role', seq.proname, seq.args
            );
        end if;
    end loop;
end $$;

-- --------------------------------------------------------------------------
-- 5) Table access: internal state; backend-only.
-- --------------------------------------------------------------------------

do $$ begin
    execute 'revoke all on public.operations from public';
    if exists (select from pg_roles where rolname = 'anon') then
        execute 'revoke all on public.operations from anon';
    end if;
    if exists (select from pg_roles where rolname = 'authenticated') then
        execute 'revoke all on public.operations from authenticated';
    end if;
end $$;

alter table public.operations enable row level security;
