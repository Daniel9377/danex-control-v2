-- ============================================================================
-- DANEX Control - schema de base de donnees de TEST uniquement
-- ============================================================================
-- A coller seulement dans le SQL Editor du projet Supabase:
--   danex-control-test
--
-- Ne jamais executer ce fichier sur la base de production.
-- Source reconstruite depuis:
--   1. supabase/schema.sql
--   2. supabase/accounts_availability.sql
--   3. supabase/migrations/*.sql
--   4. src/lib/supabase/types.ts
--   5. usages Mindboost dans src/lib/mindboost/*
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. Utilisateurs applicatifs
-- ============================================================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  preferred_language TEXT NOT NULL DEFAULT 'fr',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. Referentiels et comptes
-- ============================================================================

CREATE TABLE IF NOT EXISTS currencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL DEFAULT '',
  rate_to_usd NUMERIC NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT currencies_user_code_unique UNIQUE (user_id, code)
);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'personal',
  currency TEXT NOT NULL DEFAULT 'USD',
  balance NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  availability TEXT NOT NULL DEFAULT 'immediate',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT accounts_type_check CHECK (type IN (
    'personnel',
    'professionnel',
    'epargne',
    'investissement',
    'ecole',
    'risque',
    'personal',
    'business',
    'client',
    'savings',
    'investment',
    'emergency',
    'school',
    'debt',
    'held',
    'other'
  )),
  CONSTRAINT accounts_availability_check CHECK (availability IN (
    'immediate',
    'close',
    'distant',
    'blocked'
  ))
);

-- ============================================================================
-- 3. Clients et commandes
-- ============================================================================

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  country TEXT,
  city TEXT,
  trust_level TEXT NOT NULL DEFAULT 'standard',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clients_trust_level_check CHECK (trust_level IN (
    'standard',
    'vip',
    'risky'
  ))
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  tracking_code TEXT,
  client_price NUMERIC,
  supplier_price NUMERIC,
  currency TEXT NOT NULL DEFAULT 'USD',
  advance_received NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  last_update DATE,
  next_action TEXT,
  note TEXT,
  description TEXT,
  real_profit_amount NUMERIC,
  real_profit_currency TEXT,
  profit_validated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orders_status_check CHECK (status IN (
    'new',
    'sourcing',
    'ordered',
    'shipped',
    'delivered',
    'paid',
    'cancelled'
  ))
);

-- ============================================================================
-- 4. Transactions et mouvements financiers
-- ============================================================================

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  category TEXT,
  note TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  accounting_type TEXT,
  balance_after NUMERIC,
  affects_physical_balance BOOLEAN NOT NULL DEFAULT TRUE,
  sub_type TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  idempotency_key TEXT,
  exchange_rate NUMERIC,
  amount_base NUMERIC,
  base_currency TEXT,
  migration_status TEXT,
  legacy_reviewed_at TIMESTAMPTZ,
  legacy_review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transactions_type_check CHECK (type IN (
    'income',
    'expense'
  )),
  CONSTRAINT transactions_accounting_type_check CHECK (
    accounting_type IS NULL OR accounting_type IN (
      'real_income',
      'non_income_inflow',
      'real_expense',
      'non_expense_outflow',
      'adjustment'
    )
  ),
  CONSTRAINT transactions_sub_type_check CHECK (
    sub_type IS NULL OR sub_type IN (
      'personal_income',
      'personal_expense',
      'business_income',
      'business_expense',
      'client_money_received',
      'client_product_purchase',
      'client_shipping_fee',
      'shared_client_fee',
      'client_refund',
      'profit_validated',
      'debt_received',
      'debt_repayment',
      'receivable_created',
      'receivable_repaid',
      'balance_correction',
      'transfer_in',
      'transfer_out'
    )
  ),
  CONSTRAINT transactions_migration_status_check CHECK (
    migration_status IS NULL OR migration_status IN (
      'pending_review',
      'reviewed',
      'archived',
      'ignored_modern_reports'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS transactions_idempotency_user_idx
  ON transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_migration_status
  ON transactions (user_id, migration_status)
  WHERE sub_type IS NULL;

CREATE TABLE IF NOT EXISTS transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  from_account_id UUID NOT NULL REFERENCES accounts(id),
  to_account_id UUID NOT NULL REFERENCES accounts(id),
  from_amount NUMERIC NOT NULL,
  to_amount NUMERIC NOT NULL,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  exchange_rate NUMERIC NOT NULL DEFAULT 1,
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. Dettes, paiements et frais partages
-- ============================================================================

CREATE TABLE IF NOT EXISTS debts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'unpaid',
  due_date DATE,
  note TEXT,
  linked_account_id UUID REFERENCES accounts(id),
  affects_balance BOOLEAN NOT NULL DEFAULT FALSE,
  creation_tx_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT debts_direction_check CHECK (direction IN (
    'i_owe',
    'owes_me'
  )),
  CONSTRAINT debts_status_check CHECK (status IN (
    'unpaid',
    'partial',
    'paid'
  ))
);

CREATE TABLE IF NOT EXISTS debt_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id),
  amount NUMERIC NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  settlement_method TEXT NOT NULL DEFAULT 'real_payment',
  linked_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT debt_payments_settlement_method_check CHECK (settlement_method IN (
    'real_payment',
    'compensation',
    'linked_transaction'
  ))
);

CREATE TABLE IF NOT EXISTS shared_fee_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  allocated_amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  allocation_method TEXT NOT NULL DEFAULT 'equal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shared_fee_method_check CHECK (allocation_method IN (
    'equal',
    'manual'
  ))
);

-- ============================================================================
-- 6. Alertes applicatives
-- ============================================================================

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT alerts_type_check CHECK (type IN (
    'budget',
    'debt_due',
    'negative_balance',
    'custom'
  ))
);

-- ============================================================================
-- 7. Mindboost
-- ============================================================================
-- Ces tables sont inferees depuis src/lib/mindboost/* car aucune migration SQL
-- Mindboost n'est presente dans le depot.

CREATE TABLE IF NOT EXISTS mindboost_memory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL,
  content TEXT NOT NULL,
  relevance_score NUMERIC NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mindboost_memory_user_type_unique UNIQUE (user_id, memory_type)
);

CREATE TABLE IF NOT EXISTS mindboost_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mindboost_tasks_status_check CHECK (status IN (
    'pending',
    'done',
    'cancelled'
  ))
);

CREATE TABLE IF NOT EXISTS mindboost_decision_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  decision_type TEXT NOT NULL DEFAULT 'general',
  input_message TEXT,
  decision TEXT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mindboost_escalations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trigger_message TEXT NOT NULL,
  level INTEGER NOT NULL,
  reason TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mindboost_escalations_level_check CHECK (level BETWEEN 1 AND 4)
);

CREATE TABLE IF NOT EXISTS mindboost_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  report_date DATE NOT NULL,
  content TEXT NOT NULL,
  transaction_count INTEGER,
  real_expense_count INTEGER,
  total_expenses JSONB,
  urgent_purchases_count INTEGER,
  active_debts_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mindboost_reports_type_check CHECK (report_type IN (
    'daily',
    'weekly',
    'monthly'
  ))
);

CREATE TABLE IF NOT EXISTS mindboost_client_intake (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'collecting',
  data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mindboost_client_intake_session_unique UNIQUE (session_id),
  CONSTRAINT mindboost_client_intake_status_check CHECK (status IN (
    'collecting',
    'confirmed',
    'cancelled'
  ))
);

CREATE TABLE IF NOT EXISTS mindboost_conversation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mindboost_conversation_role_check CHECK (role IN (
    'user',
    'assistant'
  ))
);

CREATE TABLE IF NOT EXISTS mindboost_conversation_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mindboost_memory_user_type
  ON mindboost_memory (user_id, memory_type);

CREATE INDEX IF NOT EXISTS idx_mindboost_tasks_user_status
  ON mindboost_tasks (user_id, status);

CREATE INDEX IF NOT EXISTS idx_mindboost_client_intake_user_status
  ON mindboost_client_intake (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mindboost_conversation_user_created
  ON mindboost_conversation (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mindboost_conversation_summary_user_created
  ON mindboost_conversation_summary (user_id, created_at DESC);

-- ============================================================================
-- 8. Row Level Security
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_fee_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mindboost_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE mindboost_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE mindboost_decision_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mindboost_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mindboost_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE mindboost_client_intake ENABLE ROW LEVEL SECURITY;
ALTER TABLE mindboost_conversation ENABLE ROW LEVEL SECURITY;
ALTER TABLE mindboost_conversation_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_profiles ON profiles;
CREATE POLICY owner_profiles ON profiles
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS owner_currencies ON currencies;
CREATE POLICY owner_currencies ON currencies
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS owner_accounts ON accounts;
CREATE POLICY owner_accounts ON accounts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS owner_clients ON clients;
CREATE POLICY owner_clients ON clients
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS owner_orders ON orders;
CREATE POLICY owner_orders ON orders
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS owner_transactions ON transactions;
CREATE POLICY owner_transactions ON transactions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS owner_transfers ON transfers;
CREATE POLICY owner_transfers ON transfers
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS owner_debts ON debts;
CREATE POLICY owner_debts ON debts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS owner_debt_payments ON debt_payments;
CREATE POLICY owner_debt_payments ON debt_payments
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS owner_shared_fee_allocations ON shared_fee_allocations;
CREATE POLICY owner_shared_fee_allocations ON shared_fee_allocations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS owner_alerts ON alerts;
CREATE POLICY owner_alerts ON alerts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS owner_mindboost_memory ON mindboost_memory;
CREATE POLICY owner_mindboost_memory ON mindboost_memory
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS owner_mindboost_tasks ON mindboost_tasks;
CREATE POLICY owner_mindboost_tasks ON mindboost_tasks
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS owner_mindboost_decision_logs ON mindboost_decision_logs;
CREATE POLICY owner_mindboost_decision_logs ON mindboost_decision_logs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS owner_mindboost_escalations ON mindboost_escalations;
CREATE POLICY owner_mindboost_escalations ON mindboost_escalations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS owner_mindboost_reports ON mindboost_reports;
CREATE POLICY owner_mindboost_reports ON mindboost_reports
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS owner_mindboost_client_intake ON mindboost_client_intake;
CREATE POLICY owner_mindboost_client_intake ON mindboost_client_intake
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS owner_mindboost_conversation ON mindboost_conversation;
CREATE POLICY owner_mindboost_conversation ON mindboost_conversation
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS owner_mindboost_conversation_summary ON mindboost_conversation_summary;
CREATE POLICY owner_mindboost_conversation_summary ON mindboost_conversation_summary
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 9. Trigger de profil utilisateur
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

COMMIT;

-- ============================================================================
-- // À VÉRIFIER MANUELLEMENT
-- ============================================================================
-- 1. Les tables financieres principales sont confirmees par supabase/schema.sql,
--    supabase/accounts_availability.sql, supabase/migrations/*.sql et
--    src/lib/supabase/types.ts.
-- 2. Les politiques RLS financieres reproduisent celles visibles dans
--    supabase/schema.sql et la migration shared_fee_allocations.
-- 3. Aucune migration SQL Mindboost n'existe dans le depot. Les tables
--    mindboost_memory, mindboost_tasks, mindboost_escalations,
--    mindboost_reports, mindboost_client_intake, mindboost_conversation et
--    mindboost_conversation_summary sont inferees depuis les usages du code.
-- 4. mindboost_decision_logs est demande par le cahier des charges, mais aucun
--    usage direct ni migration n'a ete trouve dans le depot. Sa structure est
--    donc une proposition minimale a verifier dans Supabase si la table existe
--    deja ailleurs.
-- 5. A verifier dans le dashboard Supabase de production, si disponible:
--    triggers supplementaires, fonctions RPC, index non documentes, policies
--    RLS Mindboost exactes et toute valeur par defaut creee manuellement.
