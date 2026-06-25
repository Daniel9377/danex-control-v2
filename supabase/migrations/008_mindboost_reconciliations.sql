-- Migration 008: mindboost_reconciliations — track the gap between
-- what Daniel says verbally and what's actually in the app.
-- NEVER writes to official clients/orders/debts tables.
CREATE TABLE IF NOT EXISTS mindboost_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('debt', 'order', 'new_entity')),
  entity_id UUID,          -- null for new_entity
  person_name TEXT NOT NULL,
  claim_text TEXT NOT NULL,    -- Daniel's verbatim message
  snapshot JSONB,              -- relevant Supabase fields at claim time (null for new_entity)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'app_updated', 'defaulted_to_app')),
  escalation_day INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reminded_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  UNIQUE (user_id, entity_type, person_name, status) -- one active claim per person+type
);
