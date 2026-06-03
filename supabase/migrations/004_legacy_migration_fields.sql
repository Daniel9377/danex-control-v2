-- Migration 004: Add legacy reclassification tracking fields to transactions
-- These fields allow tracking which legacy transactions have been reviewed
-- and what migration decision was made, without touching financial data.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS migration_status TEXT
    CHECK (migration_status IN ('pending_review', 'reviewed', 'archived', 'ignored_modern_reports')),
  ADD COLUMN IF NOT EXISTS legacy_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS legacy_review_note TEXT;

-- Index for fast filtering of unreviewed legacy transactions
CREATE INDEX IF NOT EXISTS idx_transactions_migration_status
  ON transactions (user_id, migration_status)
  WHERE sub_type IS NULL;
