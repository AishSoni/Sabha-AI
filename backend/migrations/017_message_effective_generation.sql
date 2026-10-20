-- Effective generation provenance on messages (spec 06).
--
-- The turn's *effective* configuration — the provider, model and
-- sampling parameters the inference actually ran with, captured at
-- execution start before any paid call — is persisted on the FINAL
-- assistant message of the turn.
--
-- Additive and idempotent; NO backfill: honesty requires that every
-- message which did not run an inference stays NULL on this column —
-- user and system messages, in-flight turns, and every historic row
-- whose settings were never recorded. Downstream consumers must treat
-- NULL as "not recorded", never as an effective value.
--
-- The persisted record carries configuration provenance only.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS effective_generation JSONB;
