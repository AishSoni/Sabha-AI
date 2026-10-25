-- System AI configuration (spec-10).
--
-- Authoritative app-level generation defaults are server state. The row is a
-- singleton keyed by 'default'; the backend writes it through the settings
-- mutation with the service role. No provider key or other secret is stored
-- here: browser BYOK material stays in the encrypted local vault, and
-- environment keys remain deployment configuration.
CREATE TABLE IF NOT EXISTS public.system_ai_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    provider TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    temperature DOUBLE PRECISION NOT NULL,
    max_tokens INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT system_ai_settings_singleton CHECK (id = 'default'),
    CONSTRAINT system_ai_settings_temperature CHECK (temperature >= 0 AND temperature <= 1),
    CONSTRAINT system_ai_settings_max_tokens CHECK (max_tokens >= 256 AND max_tokens <= 16000)
);

ALTER TABLE public.system_ai_settings ENABLE ROW LEVEL SECURITY;

-- The backend is the only writer and reads through the service role. Browser
-- clients never read or write this table directly, so no RLS policy is added.
REVOKE ALL ON TABLE public.system_ai_settings FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.system_ai_settings FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.system_ai_settings FROM authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT ALL ON TABLE public.system_ai_settings TO service_role';
    END IF;
END
$$;
