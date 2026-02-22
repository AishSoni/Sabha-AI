-- Knowledge Stacks Schema Migration
-- Run this in Supabase SQL Editor

-- ============================================
-- KNOWLEDGE STACKS TABLE
-- Collections of documents for RAG
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge_stacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    user_id TEXT  -- Nullable for shared stacks
);

-- Index for user queries
CREATE INDEX IF NOT EXISTS idx_knowledge_stacks_user_id ON knowledge_stacks(user_id);


-- ============================================
-- PERSONA KNOWLEDGE STACKS (Join Table)
-- Assigning multiple stacks to a persona
-- ============================================
CREATE TABLE IF NOT EXISTS persona_knowledge_stacks (
    persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
    stack_id UUID NOT NULL REFERENCES knowledge_stacks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (persona_id, stack_id)
);

CREATE INDEX IF NOT EXISTS idx_persona_knowledge_stacks_persona_id ON persona_knowledge_stacks(persona_id);
CREATE INDEX IF NOT EXISTS idx_persona_knowledge_stacks_stack_id ON persona_knowledge_stacks(stack_id);


-- ============================================
-- MODIFY DOCUMENTS TABLE
-- ============================================
-- Add stack_id to documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS stack_id UUID REFERENCES knowledge_stacks(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_documents_stack_id ON documents(stack_id);

-- Update document owner constraint
ALTER TABLE documents DROP CONSTRAINT IF EXISTS document_owner_check;
ALTER TABLE documents ADD CONSTRAINT document_owner_check CHECK (
    (meeting_id IS NOT NULL AND persona_id IS NULL AND stack_id IS NULL) OR
    (meeting_id IS NULL AND persona_id IS NOT NULL AND stack_id IS NULL) OR
    (meeting_id IS NULL AND persona_id IS NULL AND stack_id IS NOT NULL)
);

-- ============================================
-- MODIFY AI PARTICIPANTS TABLE
-- ============================================
ALTER TABLE ai_participants ADD COLUMN IF NOT EXISTS persona_id UUID REFERENCES personas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ai_participants_persona_id ON ai_participants(persona_id);
