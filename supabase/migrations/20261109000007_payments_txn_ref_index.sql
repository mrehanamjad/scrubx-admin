-- ==============================================================================
-- Migration: 20261109000007_payments_txn_ref_index.sql
-- DB-013: Supporting index for payment method + transaction reference lookups
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_payments_method_txn
  ON payments (payment_method_id, transaction_reference)
  WHERE transaction_reference IS NOT NULL AND transaction_reference <> '';
