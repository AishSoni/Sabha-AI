-- Spec-11 Phase 1 upgrade dataset.
--
-- Deterministic rows that existed before durable migration tracking: explicit
-- and empty participant configuration, unknown/legacy stack snapshots,
-- conversations with citations and accounting, both flavours of legacy
-- archive, and documents whose original bytes were never retained.
--
-- Applied after the Phase 1 schema (baseline + 002..013) and before adopting
-- 014..028. No row here carries a post-Phase-1 column.

BEGIN;

INSERT INTO personas (id, name, subtitle, color, provider_config, is_default, user_id, created_at, updated_at)
VALUES
    ('f1000000-0000-4000-8000-000000000001', 'The Investor', 'Skeptical finance lead', '#22c55e',
     '{"provider": "", "model": "", "temperature": 0.7, "max_tokens": 2000}'::jsonb,
     TRUE, NULL, '2025-01-02T09:00:00Z', '2025-01-02T09:00:00Z'),
    ('f1000000-0000-4000-8000-000000000002', 'The CTO', 'Pragmatic technical lead', '#f97316',
     '{"provider": "gemini", "model": "gemini-2.0-flash", "temperature": 0.4, "max_tokens": 1000}'::jsonb,
     TRUE, NULL, '2025-01-02T09:01:00Z', '2025-01-02T09:01:00Z');

INSERT INTO prompt_versions (id, persona_id, version, content, is_active, created_at)
VALUES
    ('f1100000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
     1, 'You are The Investor. Ask about CAC, LTV, and moats.', TRUE, '2025-01-02T09:02:00Z'),
    ('f1100000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002',
     1, 'You are The CTO. Ask whether it is buildable and secure.', TRUE, '2025-01-02T09:02:00Z');

INSERT INTO knowledge_stacks (id, name, description, created_at, updated_at, user_id)
VALUES
    ('f2000000-0000-4000-8000-000000000001', 'Market evidence', 'Pricing and market notes',
     '2025-01-03T09:00:00Z', '2025-01-03T09:00:00Z', NULL),
    ('f2000000-0000-4000-8000-000000000002', 'Technical due diligence', 'Architecture evidence',
     '2025-01-03T09:01:00Z', '2025-01-03T09:01:00Z', NULL);

INSERT INTO persona_knowledge_stacks (persona_id, stack_id, created_at)
VALUES
    ('f1000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000001', '2025-01-03T09:02:00Z'),
    ('f1000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000002', '2025-01-03T09:02:00Z');

INSERT INTO meetings (id, user_id, name, agenda, status, total_cost, created_at)
VALUES
    ('f3000000-0000-4000-8000-000000000001', NULL, 'Active legacy board',
     'Decide whether to fund the pilot.', 'active', 0.012345, '2025-02-01T10:00:00Z'),
    ('f3000000-0000-4000-8000-000000000002', NULL, 'Ended legacy board',
     'Review the completed diligence.', 'ended', 0.500000, '2025-02-02T10:00:00Z'),
    ('f3000000-0000-4000-8000-000000000003', NULL, 'Archived with ending',
     'A legacy archived meeting with an ending marker.', 'archived', 0.010000, '2025-02-03T10:00:00Z'),
    ('f3000000-0000-4000-8000-000000000004', NULL, 'Archived without ending',
     'A legacy archived meeting with no ending marker.', 'archived', 0.000000, '2025-02-04T10:00:00Z');

INSERT INTO ai_participants
    (id, meeting_id, name, role, system_prompt, provider_config, color, created_at, persona_id, stack_ids)
VALUES
    ('f3100000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001',
     'The Investor', 'Investor', 'Legacy investor prompt', 
     '{"provider": "openrouter", "model": "anthropic/claude-sonnet-4-20250514", "temperature": 0.0, "max_tokens": 1024}'::jsonb,
     '#22c55e', '2025-02-01T10:01:00Z', 'f1000000-0000-4000-8000-000000000001', NULL),
    ('f3100000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000001',
     'The CTO', 'CTO', 'Legacy CTO prompt',
     '{}'::jsonb, '#f97316', '2025-02-01T10:01:00Z', NULL, '[]'::jsonb),
    ('f3100000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000002',
     'The Analyst', 'Analyst', 'Legacy analyst prompt',
     '{"provider": "gemini", "model": "gemini-2.0-flash", "temperature": 0.4, "max_tokens": 1000}'::jsonb,
     '#3b82f6', '2025-02-02T10:01:00Z', 'f1000000-0000-4000-8000-000000000002',
     '["f2000000-0000-4000-8000-000000000002"]'::jsonb),
    ('f3100000-0000-4000-8000-000000000004', 'f3000000-0000-4000-8000-000000000003',
     'The Investor', 'Investor', 'Legacy archived investor prompt',
     '{"provider": "openrouter", "model": "anthropic/claude-sonnet-4-20250514", "temperature": 0.7, "max_tokens": 2048}'::jsonb,
     '#22c55e', '2025-02-03T10:01:00Z', 'f1000000-0000-4000-8000-000000000001', NULL);

INSERT INTO messages
    (id, meeting_id, sender_type, sender_id, sender_name, content, citations, tool_artifacts,
     thinking_content, estimated_cost, created_at)
VALUES
    ('f3200000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001',
     'user', NULL, 'User', 'What is the CAC for the pilot?', '[]'::jsonb, NULL, NULL, 0.0,
     '2025-02-01T10:02:00Z'),
    ('f3200000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000001',
     'ai', 'f3100000-0000-4000-8000-000000000001', 'The Investor',
     'The pilot CAC is 420, with an LTV of 1,800.',
     '[{"source": "market-deck.pdf", "title": "Pricing", "snippet": "CAC 420"}]'::jsonb,
     '{"search_knowledge_base": [{"query": "pilot CAC"}]}'::jsonb,
     'Checked the market deck before answering.', 0.012345, '2025-02-01T10:03:00Z'),
    ('f3200000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000001',
     'system', NULL, 'System', '📋 **MEETING SUMMARY**\nThe board reviewed the pilot economics.',
     '[]'::jsonb, NULL, NULL, 0.0, '2025-02-01T10:04:00Z'),
    ('f3200000-0000-4000-8000-000000000004', 'f3000000-0000-4000-8000-000000000002',
     'user', NULL, 'User', 'Summarize the diligence.', '[]'::jsonb, NULL, NULL, 0.0,
     '2025-02-02T10:02:00Z'),
    ('f3200000-0000-4000-8000-000000000005', 'f3000000-0000-4000-8000-000000000002',
     'ai', 'f3100000-0000-4000-8000-000000000003', 'The Analyst',
     'The diligence supports a measured launch.',
     '[{"source": "diligence.xlsx", "title": "Findings", "snippet": "measured launch"}]'::jsonb,
     NULL, NULL, 0.500000, '2025-02-02T10:03:00Z'),
    ('f3200000-0000-4000-8000-000000000006', 'f3000000-0000-4000-8000-000000000002',
     'system', NULL, 'System', '📋 **MEETING ENDED**\nThe board closed the diligence.',
     '[]'::jsonb, NULL, NULL, 0.0, '2025-02-02T10:04:00Z'),
    ('f3200000-0000-4000-8000-000000000007', 'f3000000-0000-4000-8000-000000000003',
     'system', NULL, 'System', '📋 **MEETING ENDED**\nArchived after the board closed.',
     '[]'::jsonb, NULL, NULL, 0.0, '2025-02-03T10:02:00Z'),
    ('f3200000-0000-4000-8000-000000000008', 'f3000000-0000-4000-8000-000000000004',
     'user', NULL, 'User', 'Archived without a closing marker.', '[]'::jsonb, NULL, NULL, 0.0,
     '2025-02-04T10:02:00Z');

INSERT INTO disagreements
    (id, meeting_id, source_ai_id, target_name, topic, reasoning, severity, status, created_at)
VALUES
    ('f3500000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001',
     'f3100000-0000-4000-8000-000000000001', 'The CTO', 'Pilot timeline',
     'The pilot cannot ship before the security review.', 4, 'open', '2025-02-01T10:05:00Z');

INSERT INTO consensus
    (id, meeting_id, participants, topic, strength, created_at)
VALUES
    ('f3600000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001',
     '["The Investor", "The CTO"]'::jsonb, 'Proceed with a bounded pilot', 5, '2025-02-01T10:06:00Z');

INSERT INTO documents
    (id, meeting_id, persona_id, stack_id, file_name, file_type, file_size_bytes, chunk_count,
     qdrant_collection, status, error_message, created_at)
VALUES
    ('f3300000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', NULL, NULL,
     'market-deck.pdf', 'pdf', 12345, 7, 'meeting_f3000000-0000-4000-8000-000000000001_shared',
     'indexed', NULL, '2025-02-01T09:00:00Z'),
    ('f3300000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000001', NULL, NULL,
     'notes.docx', 'docx', 456, 0, NULL, 'processing', NULL, '2025-02-01T09:01:00Z'),
    ('f3300000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000001', NULL, NULL,
     'broken.xlsx', 'xlsx', 789, 0, NULL, 'failed', 'Legacy parser rejected the workbook',
     '2025-02-01T09:02:00Z'),
    ('f3300000-0000-4000-8000-000000000004', NULL, NULL, 'f2000000-0000-4000-8000-000000000001',
     'research.txt', 'txt', 100, 2, 'stack_f2000000-0000-4000-8000-000000000001_knowledge',
     'indexed', NULL, '2025-02-01T09:03:00Z'),
    ('f3300000-0000-4000-8000-000000000005', NULL, 'f1000000-0000-4000-8000-000000000001', NULL,
     'investor-notes.txt', 'txt', 321, 1, 'persona_f1000000-0000-4000-8000-000000000001_knowledge',
     'indexed', NULL, '2025-02-01T09:04:00Z');

INSERT INTO inference_events
    (id, meeting_id, purpose, provider, model, estimated_cost, created_at)
VALUES
    ('f3400000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001',
     'turn', 'openrouter', 'anthropic/claude-sonnet-4-20250514', 0.012345, '2025-02-01T10:03:00Z'),
    ('f3400000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000002',
     'vote', 'ollama', 'llama3.2', 0.000000, '2025-02-02T10:03:00Z'),
    ('f3400000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000003',
     'summary', 'gemini', 'gemini-2.0-flash', 0.010000, '2025-02-03T10:03:00Z');

INSERT INTO pending_vector_cleanup
    (id, collection_name, target_kind, target_id, attempts, last_error, created_at, resolved_at)
VALUES
    ('f3700000-0000-4000-8000-000000000001',
     'meeting_f3000000-0000-4000-8000-000000000099_shared', 'meeting',
     'f3000000-0000-4000-8000-000000000099', 0, NULL, '2025-02-04T09:00:00Z', NULL);

COMMIT;
