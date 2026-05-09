-- Task 7: Add availability column to accounts table
-- Run this in Supabase > SQL Editor

ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'immediate'
CHECK (availability IN ('immediate', 'close', 'distant', 'blocked'));

-- Update existing records: default everything to 'immediate'
UPDATE accounts SET availability = 'immediate' WHERE availability IS NULL;
