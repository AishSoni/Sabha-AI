-- AI Roster Schema Migration
-- Run this in Supabase SQL Editor

-- ============================================
-- PERSONAS TABLE
-- Reusable AI persona templates
-- ============================================
CREATE TABLE IF NOT EXISTS personas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    subtitle VARCHAR(200),
    color VARCHAR(7) DEFAULT '#6366f1',
    avatar_url TEXT,
    provider_config JSONB DEFAULT '{"provider": "", "model": "", "temperature": 0.7, "max_tokens": 2000}'::jsonb,
    is_default BOOLEAN DEFAULT FALSE,
    user_id TEXT,  -- NULL for system defaults
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user queries
CREATE INDEX IF NOT EXISTS idx_personas_user_id ON personas(user_id);
CREATE INDEX IF NOT EXISTS idx_personas_is_default ON personas(is_default);


-- ============================================
-- PROMPT VERSIONS TABLE
-- Versioned system prompts for each persona
-- ============================================
CREATE TABLE IF NOT EXISTS prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    version INT NOT NULL,
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(persona_id, version)
);

-- Index for active prompt lookup
CREATE INDEX IF NOT EXISTS idx_prompt_versions_active ON prompt_versions(persona_id, is_active) WHERE is_active = TRUE;


-- ============================================
-- SEED DEFAULT PERSONAS (Optional)
-- ============================================
-- Uncomment to seed default personas

-- INSERT INTO personas (id, name, subtitle, color, is_default) VALUES
--     (gen_random_uuid(), 'Investor', 'Strategic Finance Expert', '#22c55e', TRUE),
--     (gen_random_uuid(), 'Analyst', 'Critical Research Specialist', '#3b82f6', TRUE),
--     (gen_random_uuid(), 'CTO', 'Technical Architecture Lead', '#f97316', TRUE);


-- ============================================
-- ENABLE ROW LEVEL SECURITY (Optional)
-- ============================================
-- ALTER TABLE personas ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Users can view default and own personas" ON personas
--     FOR SELECT USING (is_default = TRUE OR user_id = auth.uid()::text);

-- CREATE POLICY "Users can manage own personas" ON personas
--     FOR ALL USING (user_id = auth.uid()::text);
