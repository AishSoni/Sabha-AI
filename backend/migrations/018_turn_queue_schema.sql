-- Durable turn queue schema (spec 07).
--
-- Additive over the spec-04 operations primitive (migration 014). The legacy
-- claim_operation/publish_operation functions keep working unchanged; the
-- turn queue adds meeting/participant identity, admission payloads, leases,
-- captured conversation boundaries, provider attempts, durable events and
-- deduplicated communication effects.
--
-- Ordering rules:
-- - operations.admission is the FIFO admission order; per-meeting order is
--   the subsequence of that global order.
-- - messages.sequence is the committed conversation order. The turn claim
--   captures MAX(sequence) for the meeting as its context boundary.
-- - operation_events.sequence is the observation order. Event identity is
--   the event UUID; sequence is the replay cursor.
--
-- Nothing here is destructive. Existing rows keep NULL in the new columns and
-- continue to be governed by migration 014 semantics.

-- --------------------------------------------------------------------------
-- 1) Operations: queue identity, admission payload, lease and outcome state.
-- --------------------------------------------------------------------------

ALTER TABLE public.operations
    DROP CONSTRAINT IF EXISTS operations_status_check;

ALTER TABLE public.operations
    ADD CONSTRAINT operations_status_check
    CHECK (status IN (
        'pending', 'processing', 'done',
        'failed', 'interrupted', 'cancelled'
    ));

ALTER TABLE public.operations
    ADD COLUMN IF NOT EXISTS meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS participant_id UUID REFERENCES public.ai_participants(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'turn',
    ADD COLUMN IF NOT EXISTS payload_hash TEXT,
    ADD COLUMN IF NOT EXISTS payload JSONB,
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS execution_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS context_boundary BIGINT,
    ADD COLUMN IF NOT EXISTS effective_settings JSONB,
    ADD COLUMN IF NOT EXISTS final_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS error_code TEXT,
    ADD COLUMN IF NOT EXISTS error_message TEXT,
    ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

-- At most one executing turn per meeting, across every worker and process.
CREATE UNIQUE INDEX IF NOT EXISTS one_executing_turn_per_meeting
    ON public.operations (meeting_id)
    WHERE status = 'processing' AND meeting_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS turn_queue_meeting_order
    ON public.operations (meeting_id, status, admission);

CREATE INDEX IF NOT EXISTS turn_queue_lease_expiry
    ON public.operations (lease_expires_at)
    WHERE status = 'processing' AND meeting_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- 2) Messages: committed conversation sequence and turn identity.
-- --------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.messages_sequence_seq;

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS sequence BIGINT,
    ADD COLUMN IF NOT EXISTS operation_id UUID REFERENCES public.operations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS request_key TEXT;

-- Backfill historic rows in their existing creation order. New rows use the
-- sequence default so sequence is monotonic even when timestamps tie.
WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
    FROM public.messages
)
UPDATE public.messages AS m
SET sequence = ordered.rn
FROM ordered
WHERE m.id = ordered.id
  AND m.sequence IS NULL;

SELECT setval(
    'public.messages_sequence_seq',
    COALESCE((SELECT MAX(sequence) FROM public.messages), 0) + 1,
    false
);

ALTER TABLE public.messages
    ALTER COLUMN sequence SET DEFAULT nextval('public.messages_sequence_seq'),
    ALTER COLUMN sequence SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_meeting_sequence
    ON public.messages (meeting_id, sequence);

-- Exactly one final assistant message per logical turn.
CREATE UNIQUE INDEX IF NOT EXISTS one_final_message_per_turn
    ON public.messages (operation_id)
    WHERE operation_id IS NOT NULL;

-- Duplicate user-message submission protection, independent of turn ops.
CREATE UNIQUE INDEX IF NOT EXISTS one_user_message_per_request_key
    ON public.messages (meeting_id, request_key)
    WHERE request_key IS NOT NULL;

-- --------------------------------------------------------------------------
-- 3) Provider attempts: stable identity before every paid call.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.operation_attempts (
    id UUID PRIMARY KEY,
    operation_id UUID NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    claimant TEXT NOT NULL,
    fence_version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'started'
        CHECK (status IN ('started', 'completed', 'failed', 'unknown')),
    provider TEXT,
    model TEXT,
    usage JSONB,
    estimated_cost DECIMAL(10, 6) NOT NULL DEFAULT 0.0,
    provider_request_id TEXT,
    error_code TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE (operation_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_operation_attempts_operation
    ON public.operation_attempts (operation_id, attempt_number);

-- --------------------------------------------------------------------------
-- 4) Durable observation events.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.operation_events (
    id UUID PRIMARY KEY,
    operation_id UUID NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
    meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    sequence BIGINT GENERATED ALWAYS AS IDENTITY,
    type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operation_events_replay
    ON public.operation_events (operation_id, sequence);

-- --------------------------------------------------------------------------
-- 5) Communication effects: dedupe by operation + invocation + call.
-- --------------------------------------------------------------------------

ALTER TABLE public.disagreements
    ADD COLUMN IF NOT EXISTS operation_id UUID REFERENCES public.operations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS invocation_id TEXT,
    ADD COLUMN IF NOT EXISTS call_id TEXT;

ALTER TABLE public.consensus
    ADD COLUMN IF NOT EXISTS operation_id UUID REFERENCES public.operations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS invocation_id TEXT,
    ADD COLUMN IF NOT EXISTS call_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS one_disagreement_per_tool_call
    ON public.disagreements (operation_id, invocation_id, call_id)
    WHERE operation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS one_consensus_per_tool_call
    ON public.consensus (operation_id, invocation_id, call_id)
    WHERE operation_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- 6) Inference ledger linkage (attempt id remains the ledger primary key).
-- --------------------------------------------------------------------------

ALTER TABLE public.inference_events
    ADD COLUMN IF NOT EXISTS operation_id UUID REFERENCES public.operations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS usage JSONB;

-- --------------------------------------------------------------------------
-- 7) Internal state: backend-only tables and sequences.
-- --------------------------------------------------------------------------

ALTER TABLE public.operation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_events ENABLE ROW LEVEL SECURITY;

DO $$
declare
    seq record;
begin
    for seq in
        select c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'S'
          and c.relname in (
              'messages_sequence_seq',
              'operation_events_sequence_seq',
              'operations_admission_seq'
          )
    loop
        execute format('revoke all on sequence public.%I from public', seq.relname);
        if exists (select from pg_roles where rolname = 'anon') then
            execute format('revoke all on sequence public.%I from anon', seq.relname);
        end if;
        if exists (select from pg_roles where rolname = 'authenticated') then
            execute format('revoke all on sequence public.%I from authenticated', seq.relname);
        end if;
        if exists (select from pg_roles where rolname = 'service_role') then
            execute format('grant usage, select on sequence public.%I to service_role', seq.relname);
        end if;
    end loop;
end $$;

DO $$ begin
    execute 'revoke all on public.operation_attempts from public';
    execute 'revoke all on public.operation_events from public';
    if exists (select from pg_roles where rolname = 'anon') then
        execute 'revoke all on public.operation_attempts from anon';
        execute 'revoke all on public.operation_events from anon';
    end if;
    if exists (select from pg_roles where rolname = 'authenticated') then
        execute 'revoke all on public.operation_attempts from authenticated';
        execute 'revoke all on public.operation_events from authenticated';
    end if;
end $$;
