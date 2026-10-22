-- Closing, summary checkpoints, and honest usage accounting (spec 08).
--
-- Three additive concerns live here:
--
-- 1. Archive is an overlay. ``meetings.status`` stays the lifecycle
--    (active -> voting -> ended); ``archived_at`` marks the archive
--    presentation. Pre-existing rows whose status was the legacy
--    ``archived`` value are resolved to a lifecycle state once: ended
--    when an ending marker exists, otherwise active. The legacy value
--    stays accepted by the CHECK constraint so old clients/rows do not
--    fail on contact, but new writes never use it.
--
-- 2. ``meeting_closings`` is the durable close operation: one row per
--    request key, one open operation per meeting, one completed
--    operation per meeting. ``closing_votes`` holds one checkpointed
--    ballot per participant per closing.
--
-- 3. The inference ledger gains usage/price honesty columns. Every
--    completed provider attempt keeps its stable attempt id as the
--    ledger primary key; a rejected closing never erases usage.
--
-- Rollback (manual):
--   DROP TABLE IF EXISTS public.closing_votes;
--   DROP TABLE IF EXISTS public.meeting_closings;
--   ALTER TABLE public.inference_events DROP COLUMN IF EXISTS reported_cost;
--   ALTER TABLE public.inference_events DROP COLUMN IF EXISTS price_kind;
--   ALTER TABLE public.inference_events DROP COLUMN IF EXISTS usage_kind;
--   ALTER TABLE public.meetings DROP COLUMN IF EXISTS archived_at;

-- --------------------------------------------------------------------------
-- 1) Archive overlay + legacy row upgrade.
-- --------------------------------------------------------------------------

ALTER TABLE public.meetings
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_meetings_archived_at
    ON public.meetings (archived_at)
    WHERE archived_at IS NOT NULL;

UPDATE public.meetings AS m
SET archived_at = COALESCE(m.created_at, NOW())
WHERE m.status = 'archived'
  AND m.archived_at IS NULL;

UPDATE public.meetings AS m
SET status = CASE
    WHEN EXISTS (
        SELECT 1
        FROM public.messages AS msg
        WHERE msg.meeting_id = m.id
          AND msg.sender_type = 'system'
          AND msg.content LIKE '📋 **MEETING ENDED**%'
    ) THEN 'ended'
    ELSE 'active'
END
WHERE m.status = 'archived';

-- --------------------------------------------------------------------------
-- 2) Durable closing operation and its checkpoints.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.meeting_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    request_key TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('vote', 'force')),
    stage TEXT NOT NULL CHECK (stage IN (
        'draining', 'voting', 'summarizing',
        'failed', 'rejected', 'aborted', 'completed'
    )),
    failed_from_stage TEXT CHECK (
        failed_from_stage IS NULL
        OR failed_from_stage IN ('draining', 'voting', 'summarizing')
    ),
    from_status TEXT NOT NULL CHECK (from_status IN ('active', 'voting')),
    summary_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary_attempt_id UUID,
    summary_attempt_number INTEGER,
    summary_attempt_lease_expires_at TIMESTAMPTZ,
    summary_text TEXT,
    summary_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE (meeting_id, request_key)
);

-- A meeting may retry after failure/rejection/abort, but it can never
-- have two live closing operations or two committed endings.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_closing_per_meeting
    ON public.meeting_closings (meeting_id)
    WHERE stage IN ('draining', 'voting', 'summarizing', 'failed');

CREATE UNIQUE INDEX IF NOT EXISTS one_completed_closing_per_meeting
    ON public.meeting_closings (meeting_id)
    WHERE stage = 'completed';

CREATE INDEX IF NOT EXISTS idx_meeting_closings_meeting
    ON public.meeting_closings (meeting_id, created_at);

CREATE TABLE IF NOT EXISTS public.closing_votes (
    closing_id UUID NOT NULL REFERENCES public.meeting_closings(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES public.ai_participants(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'completed', 'failed', 'unknown')
    ),
    attempt_id UUID,
    attempt_number INTEGER NOT NULL DEFAULT 0,
    attempt_lease_expires_at TIMESTAMPTZ,
    provider TEXT,
    model TEXT,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    vote BOOLEAN,
    reason TEXT,
    usage JSONB,
    usage_kind TEXT CHECK (usage_kind IN ('reported', 'estimated', 'unknown')),
    price_kind TEXT CHECK (price_kind IN ('metered', 'zero_local', 'unpriced')),
    estimated_cost DECIMAL(10, 6) NOT NULL DEFAULT 0.0,
    reported_cost DECIMAL(10, 6),
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (closing_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_closing_votes_status
    ON public.closing_votes (closing_id, status);

-- --------------------------------------------------------------------------
-- 3) Ledger honesty: an attempt's usage is reported, estimated, or unknown.
-- --------------------------------------------------------------------------

ALTER TABLE public.inference_events
    ADD COLUMN IF NOT EXISTS usage_kind TEXT,
    ADD COLUMN IF NOT EXISTS price_kind TEXT,
    ADD COLUMN IF NOT EXISTS reported_cost DECIMAL(10, 6);

UPDATE public.inference_events
SET usage_kind = CASE
        WHEN usage IS NULL OR usage = '{}'::jsonb THEN 'unknown'
        ELSE 'reported'
    END
WHERE usage_kind IS NULL;

UPDATE public.inference_events
SET price_kind = CASE
        WHEN estimated_cost > 0 THEN 'metered'
        WHEN provider = 'ollama' THEN 'zero_local'
        ELSE 'unpriced'
    END
WHERE price_kind IS NULL;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.inference_events'::regclass
          AND conname = 'inference_events_usage_kind_check'
    ) THEN
        ALTER TABLE public.inference_events
            ADD CONSTRAINT inference_events_usage_kind_check
            CHECK (usage_kind IN ('reported', 'estimated', 'unknown'));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.inference_events'::regclass
          AND conname = 'inference_events_price_kind_check'
    ) THEN
        ALTER TABLE public.inference_events
            ADD CONSTRAINT inference_events_price_kind_check
            CHECK (price_kind IN ('metered', 'zero_local', 'unpriced'));
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- 4) Internal state: backend-only tables.
-- --------------------------------------------------------------------------

ALTER TABLE public.meeting_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closing_votes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    EXECUTE 'REVOKE ALL ON public.meeting_closings FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON public.closing_votes FROM PUBLIC';
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON public.meeting_closings FROM anon';
        EXECUTE 'REVOKE ALL ON public.closing_votes FROM anon';
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON public.meeting_closings FROM authenticated';
        EXECUTE 'REVOKE ALL ON public.closing_votes FROM authenticated';
    END IF;
END $$;
