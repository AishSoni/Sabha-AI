-- Meeting status lifecycle expansion
-- The application uses four meeting states (see MeetingStatus in
-- app/models/schemas.py): active (in progress), voting (end-vote phase),
-- ended (closed normally), archived. The original schema only allowed
-- 'active' and 'archived', so ending a meeting through the normal flow
-- violated the CHECK constraint on deployed database as well.
--
-- Applies to long-lived databases. Fresh installs get the same constraint
-- directly from supabase_schema.sql, so re-running this migration there is
-- a no-op by design.

ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_status_check;

ALTER TABLE meetings ADD CONSTRAINT meetings_status_check
    CHECK (status IN ('active', 'voting', 'ended', 'archived'));
