-- Migration: 20261109000000_customers_email_unique.sql
-- DB-001: Enforce normalized email uniqueness on customers table

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_email_normalized
  ON customers (lower(trim(email)));
