-- Migration: 20261109000004_product_images_nullable_file_id.sql
-- Remediates DB-009 / BUG-021: Allow externally-hosted / URL-only product photography without fabricated fileIds
-- Allows shared imagekit_file_id across duplicated products (BUG-022)

ALTER TABLE product_images ALTER COLUMN imagekit_file_id DROP NOT NULL;
ALTER TABLE product_images DROP CONSTRAINT IF EXISTS product_images_imagekit_file_id_key;

CREATE INDEX IF NOT EXISTS idx_product_images_file_id ON product_images (imagekit_file_id);

-- Clean up any legacy fabricated identifiers matching pattern ^img-[0-9]+-[0-9a-z]+$
UPDATE product_images
SET imagekit_file_id = NULL
WHERE imagekit_file_id ~ '^img-[0-9]+-[0-9a-z]+$';
