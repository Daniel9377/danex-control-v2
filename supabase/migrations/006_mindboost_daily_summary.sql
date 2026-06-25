-- Migration 006: mindboost_daily_summary for daily conversation + financial reports.
CREATE TABLE IF NOT EXISTS mindboost_daily_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  summary_date DATE NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, summary_date)
);

-- The old mindboost_conversation_summary table is deprecated in favor of
-- mindboost_daily_summary. Existing data in mindboost_conversation_summary
-- is NOT migrated — the old mechanism was a fake summary (raw message prefix)
-- and its data has no value for the new daily-summary system.
-- The table is kept for backward compatibility but is no longer written to.
