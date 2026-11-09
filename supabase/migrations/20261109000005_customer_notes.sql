-- ==============================================================================
-- Migration: 20261109000005_customer_notes.sql
-- DB-011 / BUG-025: Dedicated table for staff customer notes with auditability
-- ==============================================================================

CREATE TABLE IF NOT EXISTS customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (trim(body) <> ''),
  created_by text REFERENCES ba_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for customer notes timeline in reverse chronological order
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer_created
  ON customer_notes (customer_id, created_at DESC);

-- Enable Row Level Security (admin-only backend access via service role/direct connection)
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;

-- One-time safe backfill from customers.notes
-- Splits any legacy delimiter-separated note blobs while preserving text intact
INSERT INTO customer_notes (customer_id, body, created_by, created_at)
SELECT
  c.id,
  trim(part),
  NULL,
  c.updated_at
FROM
  customers c,
  regexp_split_to_table(c.notes, E'\\n---\\n') AS part
WHERE
  c.notes IS NOT NULL
  AND trim(c.notes) <> ''
  AND trim(part) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM customer_notes n WHERE n.customer_id = c.id
  );
