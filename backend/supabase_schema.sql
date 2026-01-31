-- Sabha Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- MEETINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    agenda TEXT DEFAULT '',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    total_cost DECIMAL(10, 6) DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AI PARTICIPANTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ai_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    system_prompt TEXT NOT NULL,
    provider_config JSONB DEFAULT '{"provider": "openrouter", "model": "anthropic/claude-sonnet-4-20250514", "temperature": 0.7}'::jsonb,
    color VARCHAR(20) DEFAULT '#6366f1',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Policies for meetings (allow all for now, can restrict later)
CREATE POLICY "Allow all for meetings" ON meetings FOR ALL USING (true);
CREATE POLICY "Allow all for ai_participants" ON ai_participants FOR ALL USING (true);
CREATE POLICY "Allow all for messages" ON messages FOR ALL USING (true);
CREATE POLICY "Allow all for disagreements" ON disagreements FOR ALL USING (true);
CREATE POLICY "Allow all for consensus" ON consensus FOR ALL USING (true);
