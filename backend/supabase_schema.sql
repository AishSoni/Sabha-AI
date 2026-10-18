-- Sabha Database Schema
-- Run this in Supabase SQL Editor
-- Uses the PostgreSQL built-in gen_random_uuid() (PG13+ / standard on Supabase)
-- so the same schema also applies to plain disposable Postgres test instances.

-- ============================================
-- MEETINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    agenda TEXT DEFAULT '',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'voting', 'ended', 'archived')),
    total_cost DECIMAL(10, 6) DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AI PARTICIPANTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ai_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(200) NOT NULL,
    system_prompt TEXT NOT NULL,
    provider_config JSONB DEFAULT '{"provider": "openrouter", "model": "anthropic/claude-sonnet-4-20250514", "temperature": 0.7}'::jsonb,
    color VARCHAR(20) DEFAULT '#6366f1',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'ai', 'system')),
    sender_id UUID REFERENCES ai_participants(id) ON DELETE SET NULL,
    sender_name VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    citations JSONB DEFAULT '[]'::jsonb,
    tool_artifacts JSONB,
    thinking_content TEXT,
    estimated_cost DECIMAL(10, 6) DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DISAGREEMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS disagreements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    source_ai_id UUID NOT NULL REFERENCES ai_participants(id) ON DELETE CASCADE,
    target_name VARCHAR(100) NOT NULL,
    topic VARCHAR(255) NOT NULL,
    reasoning TEXT NOT NULL,
    severity INTEGER DEFAULT 3 CHECK (severity >= 1 AND severity <= 5),
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'conceded')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CONSENSUS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS consensus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    participants JSONB NOT NULL,
    topic VARCHAR(255) NOT NULL,
    strength INTEGER DEFAULT 3 CHECK (strength >= 1 AND strength <= 5),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_messages_meeting_id ON messages(meeting_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_participants_meeting_id ON ai_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_disagreements_meeting_id ON disagreements(meeting_id);
CREATE INDEX IF NOT EXISTS idx_consensus_meeting_id ON consensus(meeting_id);

-- ============================================
-- DOCUMENTS TABLE (for RAG pipeline)
-- ============================================
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
    persona_id UUID,  -- References personas table if exists
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    chunk_count INTEGER DEFAULT 0,
    qdrant_collection VARCHAR(255),
    status VARCHAR(50) DEFAULT 'processing' CHECK (status IN ('processing', 'indexed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Either meeting_id OR persona_id should be set, not both
    CONSTRAINT document_owner_check CHECK (
        (meeting_id IS NOT NULL AND persona_id IS NULL) OR
        (meeting_id IS NULL AND persona_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_documents_meeting_id ON documents(meeting_id);
CREATE INDEX IF NOT EXISTS idx_documents_persona_id ON documents(persona_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to increment meeting cost
CREATE OR REPLACE FUNCTION increment_meeting_cost(meeting_id UUID, cost_delta DECIMAL)
RETURNS VOID AS $$
BEGIN
    UPDATE meetings 
    SET total_cost = total_cost + cost_delta 
    WHERE id = meeting_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE disagreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE consensus ENABLE ROW LEVEL SECURITY;

-- Policies: public clients may read (no-auth read world), but writes are
-- reserved for the backend's service role, which bypasses RLS. No FOR ALL or
-- mutation policies exist anymore — RLS default-deny + missing grants block
-- non-backend writes, even for roles WITH table privileges.
CREATE POLICY "Backend managed writes" ON meetings FOR SELECT USING (true);
CREATE POLICY "Backend managed writes" ON ai_participants FOR SELECT USING (true);
CREATE POLICY "Backend managed writes" ON messages FOR SELECT USING (true);
CREATE POLICY "Backend managed writes" ON disagreements FOR SELECT USING (true);
CREATE POLICY "Backend managed writes" ON consensus FOR SELECT USING (true);

-- Table-level read grants so non-owner roles relying on the policies above
-- can actually read. No INSERT/UPDATE/DELETE grants are issued here.
GRANT SELECT ON meetings TO PUBLIC;
GRANT SELECT ON ai_participants TO PUBLIC;
GRANT SELECT ON messages TO PUBLIC;
GRANT SELECT ON disagreements TO PUBLIC;
GRANT SELECT ON consensus TO PUBLIC;
