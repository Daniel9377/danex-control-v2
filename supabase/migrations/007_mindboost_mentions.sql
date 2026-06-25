-- Migration 007: mindboost_mentions for casual client/prospect notes.
-- Completely separate from the official clients/orders tables.
CREATE TABLE IF NOT EXISTS mindboost_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  person_name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
