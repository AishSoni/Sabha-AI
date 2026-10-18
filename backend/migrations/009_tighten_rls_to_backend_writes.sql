-- Tighten direct database permissions: replace the legacy 'Allow all for ...'
-- RLS policies (FOR ALL USING (true)) with public read-only access. Writes
-- are reserved for the backend's service role (bypasses RLS on Supabase);
-- rows created by the backend remain visible to any client because the read
-- world stays open (no-auth API contract).
--
-- Safe to re-run (fresh databases in 001 already carry the final state).

DROP POLICY IF EXISTS "Allow all for meetings" ON meetings;
DROP POLICY IF EXISTS "Allow all for ai_participants" ON ai_participants;
DROP POLICY IF EXISTS "Allow all for messages" ON messages;
DROP POLICY IF EXISTS "Allow all for disagreements" ON disagreements;
DROP POLICY IF EXISTS "Allow all for consensus" ON consensus;
DROP POLICY IF EXISTS "Backend managed writes" ON meetings;
DROP POLICY IF EXISTS "Backend managed writes" ON ai_participants;
DROP POLICY IF EXISTS "Backend managed writes" ON messages;
DROP POLICY IF EXISTS "Backend managed writes" ON disagreements;
DROP POLICY IF EXISTS "Backend managed writes" ON consensus;

CREATE POLICY "Backend managed writes" ON meetings FOR SELECT USING (true);
CREATE POLICY "Backend managed writes" ON ai_participants FOR SELECT USING (true);
CREATE POLICY "Backend managed writes" ON messages FOR SELECT USING (true);
CREATE POLICY "Backend managed writes" ON disagreements FOR SELECT USING (true);
CREATE POLICY "Backend managed writes" ON consensus FOR SELECT USING (true);

GRANT SELECT ON meetings TO PUBLIC;
GRANT SELECT ON ai_participants TO PUBLIC;
GRANT SELECT ON messages TO PUBLIC;
GRANT SELECT ON disagreements TO PUBLIC;
GRANT SELECT ON consensus TO PUBLIC;
